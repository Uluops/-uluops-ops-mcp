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
      expect(getErrorText(result)).toBe('Authentication required. Verify ULUOPS_API_KEY is set to a valid ulr_* key. Manage keys at https://app.uluops.ai/settings/api-keys.');
      expect(getErrorPayload(result).status).toBe(401);
    });

    it('should map ForbiddenError preserving original message', () => {
      const error = new ForbiddenError('Insufficient permissions');
      const result = mapSdkErrorToMcp(error);
      expect(getErrorText(result)).toBe('Insufficient permissions');
      expect(getErrorPayload(result).status).toBe(403);
    });

    it('ForbiddenError suggestion points at id/org/scope, not a subscription tier', () => {
      // Regression: 403 is access/scope; genuine tier limits are 402. A 403 whose
      // suggestion blames a subscription tier misdirects debugging toward a paywall
      // that is not the cause (e.g. an unresolvable/foreign id from the tracker).
      const error = new ForbiddenError('Access denied');
      const suggestion = getErrorPayload(mapSdkErrorToMcp(error)).suggestion as string;
      expect(suggestion.toLowerCase()).not.toContain('subscription tier');
      expect(suggestion.toLowerCase()).toMatch(/id|org|scope|permission/);
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

    it('should attach a name-collision suggestion when details.reason=name_collision (F4)', () => {
      const error = new ConflictError('A project with this name already exists', { reason: 'name_collision', name: 'dup' });
      const suggestion = getErrorPayload(mapSdkErrorToMcp(error)).suggestion as string;
      expect(suggestion.toLowerCase()).toContain('name');
      expect(suggestion.toLowerCase()).not.toContain('modified concurrently');
    });

    it('should attach an idempotency suggestion when details.reason=idempotency_reuse (F4)', () => {
      const error = new ConflictError('idempotency_key reused with a different payload', { reason: 'idempotency_reuse' });
      const suggestion = getErrorPayload(mapSdkErrorToMcp(error)).suggestion as string;
      expect(suggestion.toLowerCase()).toContain('idempotency_key');
    });

    it('should fall back to a multi-cause conflict suggestion when no reason is present (F4)', () => {
      // Regression (heidegger run #9, OBTRUSIVE-2): a single-cause fallback
      // ("modified concurrently. Refresh and retry.") misdirects at untagged
      // conflict sites — idempotency reuse and tombstone conflicts are not
      // resolved by refreshing. The fallback must say the cause is unspecified
      // and enumerate the cause families instead of asserting one.
      const error = new ConflictError('Resource conflict');
      const suggestion = getErrorPayload(mapSdkErrorToMcp(error)).suggestion as string;
      expect(suggestion.toLowerCase()).toContain('did not specify a cause');
      expect(suggestion.toLowerCase()).toContain('concurrent modification');
      expect(suggestion.toLowerCase()).toContain('idempotency_key');
      expect(suggestion.toLowerCase()).toContain('soft-deleted');
      expect(suggestion.toLowerCase()).not.toContain('modified concurrently. refresh and retry');
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

  describe('402 Subscription Required tier-gating', () => {
    it('should map well-formed 402 with definitions, currentTier, upgradeUrl', () => {
      const error = new OpsApiError(402, 'Subscription required', undefined, {
        definitions: [
          { name: 'advanced-validator', requiredTier: 'pro' },
          { name: 'enterprise-only-tool', requiredTier: 'enterprise' },
        ],
        currentTier: 'free',
        upgradeUrl: 'https://uluops.ai/upgrade',
      });
      const result = mapSdkErrorToMcp(error);
      const payload = getErrorPayload(result);

      expect(result.isError).toBe(true);
      expect(payload.status).toBe(402);
      expect(payload.current_tier).toBe('free');
      expect(payload.rejected_definitions).toEqual([
        { name: 'advanced-validator', requiredTier: 'pro' },
        { name: 'enterprise-only-tool', requiredTier: 'enterprise' },
      ]);
      expect(payload.upgrade_url).toBe('https://uluops.ai/upgrade?source=mcp');

      const text = getErrorText(result);
      expect(text).toContain('Subscription required');
      expect(text).toContain('advanced-validator (requires pro)');
      expect(text).toContain('enterprise-only-tool (requires enterprise)');
      expect(text).toContain('Your current tier: free');
      expect(text).toContain('Upgrade: https://uluops.ai/upgrade?source=mcp');
    });

    it('should append ?source=mcp when upgradeUrl has no query params', () => {
      const error = new OpsApiError(402, 'Subscription required', undefined, {
        upgradeUrl: 'https://uluops.ai/pricing',
      });
      const payload = getErrorPayload(mapSdkErrorToMcp(error));
      expect(payload.upgrade_url).toBe('https://uluops.ai/pricing?source=mcp');
    });

    it('should append &source=mcp when upgradeUrl already has query params', () => {
      const error = new OpsApiError(402, 'Subscription required', undefined, {
        upgradeUrl: 'https://uluops.ai/pricing?ref=signup',
      });
      const payload = getErrorPayload(mapSdkErrorToMcp(error));
      expect(payload.upgrade_url).toBe('https://uluops.ai/pricing?ref=signup&source=mcp');
    });

    it('should degrade gracefully when details is missing', () => {
      const error = new OpsApiError(402, 'Subscription required');
      const result = mapSdkErrorToMcp(error);
      const payload = getErrorPayload(result);

      expect(payload.status).toBe(402);
      expect(payload.current_tier).toBeUndefined();
      expect(payload.rejected_definitions).toBeUndefined();
      expect(payload.upgrade_url).toBeUndefined();
      expect(getErrorText(result)).toContain('above-tier definitions');
    });

    it('should tolerate malformed definitions shape without crashing', () => {
      const error = new OpsApiError(402, 'Subscription required', undefined, {
        definitions: [
          { name: 'partial' },
          { requiredTier: 'pro' },
          { unrelated: 'field' },
        ],
        currentTier: 'free',
      });
      const text = getErrorText(mapSdkErrorToMcp(error));
      expect(text).toContain('partial (requires unknown)');
      expect(text).toContain('unknown (requires pro)');
      expect(text).toContain('unknown (requires unknown)');
    });

    it('should ignore non-array definitions and non-string fields', () => {
      const error = new OpsApiError(402, 'Subscription required', undefined, {
        definitions: 'not-an-array',
        currentTier: 42,
        upgradeUrl: { not: 'a string' },
      });
      const result = mapSdkErrorToMcp(error);
      const payload = getErrorPayload(result);

      expect(payload.status).toBe(402);
      expect(payload.current_tier).toBeUndefined();
      expect(payload.upgrade_url).toBeUndefined();
      expect(payload.rejected_definitions).toBeUndefined();
      expect(getErrorText(result)).toContain('above-tier definitions');
    });

    it('should redact credentials in 402 message text via sanitizeErrorMessage path', () => {
      // 402 path doesn't pass through sanitizeErrorMessage today, but verify the
      // structured message itself doesn't echo arbitrary error.message content
      const error = new OpsApiError(
        402,
        'Subscription required: api_key=ulr_should_not_appear',
        undefined,
        { currentTier: 'free' },
      );
      const text = getErrorText(mapSdkErrorToMcp(error));
      // The 402 branch builds a structured message and does not include error.message
      expect(text).not.toContain('ulr_should_not_appear');
      expect(text).not.toContain('api_key=');
    });
  });

  describe('402 project-limit (org cap)', () => {
    it('renders a distinct project-cap message with counts and a source-tagged upgrade url', () => {
      const error = new OpsApiError(
        402,
        'Organization has reached its project limit (3). Upgrade your plan to create more projects.',
        'PROJECT_LIMIT',
        {
          currentCount: 3,
          limit: 3,
          limitType: 'project',
          upgradeUrl: 'https://registry.uluops.ai/orgs/acme/settings/billing?source=api',
        },
      );
      const result = mapSdkErrorToMcp(error);
      const payload = getErrorPayload(result);
      const text = getErrorText(result);
      expect(text).toContain('Project limit reached');
      expect(text).toContain('3 of 3 projects');
      expect(text).toContain('source=mcp');
      expect(text).not.toContain('Subscription required');
      expect(payload.status).toBe(402);
      expect(payload.limit_type).toBe('project');
      expect(payload.current_count).toBe(3);
      expect(payload.project_limit).toBe(3);
      expect(payload.upgrade_url).toContain('source=mcp');
    });

    it('degrades gracefully when a PROJECT_LIMIT 402 carries no details', () => {
      const error = new OpsApiError(402, 'Project limit reached', 'PROJECT_LIMIT');
      const result = mapSdkErrorToMcp(error);
      const text = getErrorText(result);
      expect(text).toContain('Project limit reached');
      expect(text).not.toContain('Upgrade:');
      expect(text).not.toContain('Subscription required');
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
