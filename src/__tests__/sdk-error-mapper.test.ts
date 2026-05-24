/**
 * SDK Error Mapper Tests
 *
 * Tests for credential redaction, error type mapping, and structured responses.
 * The mapper now preserves error context while only redacting actual credential values.
 */

import { describe, it, expect } from 'vitest';
import { mapSdkErrorToMcp, mapZodErrorToMcp } from '../client/sdk-error-mapper.js';
import {
  NotFoundError,
  RateLimitError,
  ValidationError,
  UnauthorizedError,
  ForbiddenError,
  ConflictError,
  UnprocessableError,
  NetworkError,
  TimeoutError,
} from '@uluops/ops-sdk/errors';
import { OpsApiError } from '@uluops/ops-sdk/errors';

function getErrorText(result: { content: Array<{ text: string }> }): string {
  return JSON.parse(result.content[0].text).error;
}

function getErrorPayload(result: { content: Array<{ text: string }> }): Record<string, unknown> {
  return JSON.parse(result.content[0].text);
}

describe('SDK Error Mapper', () => {
  describe('credential redaction', () => {
    it('should redact actual api_key values', () => {
      const error = new Error('Failed with api_key=sk_12345abcdef');
      const result = mapSdkErrorToMcp(error);
      expect(result.isError).toBe(true);
      expect(getErrorText(result)).toContain('[REDACTED]');
      expect(getErrorText(result)).not.toContain('sk_12345');
    });

    it('should redact bearer tokens', () => {
      const error = new Error('Auth failed: bearer abc123tokenvalue');
      const result = mapSdkErrorToMcp(error);
      expect(getErrorText(result)).toContain('[REDACTED]');
      expect(getErrorText(result)).not.toContain('abc123token');
    });

    it('should redact authorization headers', () => {
      const error = new Error('authorization: Bearer eyJ0eXAi.something');
      const result = mapSdkErrorToMcp(error);
      expect(getErrorText(result)).toContain('[REDACTED]');
      expect(getErrorText(result)).not.toContain('eyJ0eXAi');
    });

    it('should redact ulr_ API keys', () => {
      const error = new Error('Invalid key: ulr_abc123def456ghi789jkl012mno');
      const result = mapSdkErrorToMcp(error);
      expect(getErrorText(result)).toContain('[REDACTED]');
      expect(getErrorText(result)).not.toContain('ulr_abc123');
    });

    it('should redact stack traces', () => {
      const error = new Error('at Object.handler (/src/tools/query.ts:42:15)');
      const result = mapSdkErrorToMcp(error);
      expect(getErrorText(result)).toContain('[REDACTED]');
    });

    it('should NOT redact messages that merely mention field names', () => {
      // "password" as a field name, not a credential value
      const error = new Error('password mismatch for user admin');
      const result = mapSdkErrorToMcp(error);
      expect(getErrorText(result)).toBe('password mismatch for user admin');
    });

    it('should NOT redact messages mentioning "secret" without values', () => {
      const error = new Error('Client secret is invalid');
      const result = mapSdkErrorToMcp(error);
      expect(getErrorText(result)).toBe('Client secret is invalid');
    });

    it('should NOT redact messages mentioning "apiKey" without actual key values', () => {
      const error = new Error('Invalid apiKey format');
      const result = mapSdkErrorToMcp(error);
      expect(getErrorText(result)).toBe('Invalid apiKey format');
    });

    it('should redact token assignments with values', () => {
      const error = new Error('token = eyJhbGciOiJIUzI1NiJ9.abc.def');
      const result = mapSdkErrorToMcp(error);
      expect(getErrorText(result)).not.toContain('eyJhbGci');
    });

    it('should NOT sanitize safe error messages', () => {
      const error = new Error('Project not found: my-project');
      const result = mapSdkErrorToMcp(error);
      expect(getErrorText(result)).toBe('Project not found: my-project');
    });

    it('should truncate long error messages at 1000 chars', () => {
      const longMessage = 'A'.repeat(1200);
      const error = new Error(longMessage);
      const result = mapSdkErrorToMcp(error);
      const text = getErrorText(result);
      expect(text.length).toBeLessThan(1100);
      expect(text).toContain('... (truncated)');
    });
  });

  describe('SDK error type mapping', () => {
    it('should map NotFoundError with original message', () => {
      const error = new NotFoundError('Issue', 'abc');
      const result = mapSdkErrorToMcp(error);
      expect(result.isError).toBe(true);
      expect(getErrorText(result)).toContain('not found');
    });

    it('should map RateLimitError with retry info', () => {
      const error = new RateLimitError('Too many requests');
      const result = mapSdkErrorToMcp(error);
      expect(getErrorText(result)).toContain('Rate limit exceeded');
      const payload = getErrorPayload(result);
      expect(payload.status).toBe(429);
    });

    it('should map RateLimitError with retryAfter seconds', () => {
      const error = new RateLimitError(undefined, 30);
      const result = mapSdkErrorToMcp(error);
      const payload = getErrorPayload(result);
      expect(payload.retry_after_seconds).toBe(30);
      expect(getErrorText(result)).toContain('30 seconds');
    });

    it('should map ValidationError preserving message', () => {
      const error = new ValidationError('Invalid field value');
      const result = mapSdkErrorToMcp(error);
      expect(getErrorText(result)).toBe('Invalid field value');
    });

    it('should map ValidationError preserving apiKey field name context', () => {
      const error = new ValidationError('Invalid apiKey format');
      const result = mapSdkErrorToMcp(error);
      // Should preserve the message — "apiKey" is a field name, not a credential
      expect(getErrorText(result)).toBe('Invalid apiKey format');
    });

    it('should map UnauthorizedError to actionable auth message', () => {
      const error = new UnauthorizedError('Bad credentials');
      const result = mapSdkErrorToMcp(error);
      expect(getErrorText(result)).toBe('Authentication required. Verify ULUOPS_API_KEY is set to a valid ulr_* key.');
      expect(getErrorPayload(result).status).toBe(401);
    });

    it('should map ForbiddenError preserving original message', () => {
      const error = new ForbiddenError('Insufficient permissions');
      const result = mapSdkErrorToMcp(error);
      expect(getErrorText(result)).toBe('Insufficient permissions');
      expect(getErrorPayload(result).status).toBe(403);
    });

    it('should map ConflictError preserving message', () => {
      const error = new ConflictError('Resource already exists');
      const result = mapSdkErrorToMcp(error);
      expect(getErrorText(result)).toBe('Resource already exists');
    });

    it('should forward nextAvailable from ConflictError details', () => {
      const error = new ConflictError('Definition already exists', { nextAvailable: '1.0.3' });
      const result = mapSdkErrorToMcp(error);
      const payload = getErrorPayload(result);
      expect(payload.nextAvailable).toBe('1.0.3');
      expect(payload.status).toBe(409);
    });

    it('should map UnprocessableError preserving message', () => {
      const error = new UnprocessableError('Cannot process entity');
      const result = mapSdkErrorToMcp(error);
      expect(getErrorText(result)).toBe('Cannot process entity');
    });

    it('should map NetworkError with SDK message', () => {
      const error = new NetworkError('Failed to connect to http://localhost:3100: Verify the API server is running');
      const result = mapSdkErrorToMcp(error);
      expect(getErrorText(result)).toContain('Failed to connect');
    });

    it('should map TimeoutError with SDK message', () => {
      const error = new TimeoutError(30000);
      const result = mapSdkErrorToMcp(error);
      expect(getErrorText(result)).toContain('timed out');
    });

    it('should map generic OpsApiError redacting actual credentials', () => {
      const error = new OpsApiError(500, 'Server error with api_key=sk_leaked_value');
      const result = mapSdkErrorToMcp(error);
      expect(getErrorText(result)).toContain('[REDACTED]');
      expect(getErrorText(result)).not.toContain('sk_leaked');
    });

    it('should map generic OpsApiError preserving safe context', () => {
      const error = new OpsApiError(500, 'Server error with api-key field missing');
      const result = mapSdkErrorToMcp(error);
      // "api-key" as a field name reference (no value) should be preserved
      expect(getErrorText(result)).toBe('Server error with api-key field missing');
    });

    it('should map generic OpsApiError with safe content', () => {
      const error = new OpsApiError(500, 'Internal server error');
      const result = mapSdkErrorToMcp(error);
      expect(getErrorText(result)).toBe('Internal server error');
    });

    it('should include status codes in error payload', () => {
      const error = new OpsApiError(422, 'Validation failed');
      const result = mapSdkErrorToMcp(error);
      expect(getErrorPayload(result).status).toBe(422);
    });

    it('should handle unknown error types', () => {
      const result = mapSdkErrorToMcp('string error');
      expect(result.isError).toBe(true);
      expect(getErrorText(result)).toBe('An unexpected error occurred');
    });
  });

  describe('Zod error mapping', () => {
    it('should map ZodError with field details', () => {
      const error = Object.assign(new Error('Validation'), {
        errors: [
          { path: ['project'], message: 'Required' },
          { path: ['limit'], message: 'Expected number' },
        ],
      });
      const result = mapZodErrorToMcp(error);
      expect(result.isError).toBe(true);
      expect(getErrorText(result)).toContain('project: Required');
      expect(getErrorText(result)).toContain('limit: Expected number');
    });

    it('should show ALL Zod errors, not just first 3', () => {
      const error = Object.assign(new Error('Validation'), {
        errors: [
          { path: ['a'], message: 'err1' },
          { path: ['b'], message: 'err2' },
          { path: ['c'], message: 'err3' },
          { path: ['d'], message: 'err4' },
        ],
      });
      const result = mapZodErrorToMcp(error);
      const text = getErrorText(result);
      expect(text).toContain('4 errors');
      expect(text).toContain('a: err1');
      expect(text).toContain('d: err4');
    });

    it('should include error count in message', () => {
      const error = Object.assign(new Error('Validation'), {
        errors: [
          { path: ['x'], message: 'bad' },
        ],
      });
      const result = mapZodErrorToMcp(error);
      expect(getErrorText(result)).toContain('1 error');
    });

    it('should include status 400 in Zod error payload', () => {
      const error = Object.assign(new Error('Validation'), {
        errors: [{ path: ['x'], message: 'bad' }],
      });
      const result = mapZodErrorToMcp(error);
      expect(getErrorPayload(result).status).toBe(400);
    });

    it('should handle non-Error input gracefully', () => {
      const result = mapZodErrorToMcp('not an error');
      expect(getErrorText(result)).toBe('Invalid input parameters');
    });
  });
});
