/**
 * Error mapper for converting SDK errors to MCP-safe responses
 *
 * Maps @uluops/ops-sdk error hierarchy to sanitized MCP tool responses.
 * Strips actual credentials (API keys, bearer tokens) before exposure
 * while preserving field names, validation details, and actionable context.
 */

import {
  isOpsApiError,
  isNotFoundError,
  isRateLimitError,
  isValidationError,
  isNetworkError,
  isTimeoutError,
  UnauthorizedError,
  ForbiddenError,
  isConflictError,
  isUnprocessableError,
} from '@uluops/ops-sdk/errors';
import type { McpToolResponse } from '../types/index.js';

const MAX_ERROR_MESSAGE_LENGTH = 1000;

/**
 * Patterns that indicate actual credential values in error messages.
 * Only matches credential values, not field names that mention credentials.
 */
const CREDENTIAL_PATTERNS: RegExp[] = [
  // Actual key/token values (not field names)
  /(?:api[_-]?key|apiKey)\s*[:=]\s*\S+/i,
  /bearer\s+[a-zA-Z0-9_\-.]+/i,
  /authorization:\s*\S+/i,
  /ulr_[a-zA-Z0-9]{20,}/,
  // Token/secret assignments with actual values
  /(?:token|secret)\s*[:=]\s*\S+/i,
  // Stack traces (internal implementation details)
  /at\s+\S+\s+\(\S+:\d+:\d+\)/,
];

/**
 * Check if a message contains actual credential values
 */
function containsCredentials(message: string): boolean {
  return CREDENTIAL_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * Redact credential values from a message while preserving the rest.
 * Returns the original message with only credential values replaced.
 */
function redactCredentials(message: string): string {
  let redacted = message;
  for (const pattern of CREDENTIAL_PATTERNS) {
    redacted = redacted.replace(pattern, '[REDACTED]');
  }
  return redacted;
}

/**
 * Sanitize an error message for safe client exposure.
 * Redacts credentials and truncates if needed, but preserves all other context.
 */
function sanitizeErrorMessage(message: string): string {
  let safe = containsCredentials(message) ? redactCredentials(message) : message;
  if (safe.length > MAX_ERROR_MESSAGE_LENGTH) {
    safe = safe.slice(0, MAX_ERROR_MESSAGE_LENGTH) + '... (truncated)';
  }
  return safe;
}

/**
 * Extract HTTP status code from SDK errors when available
 */
function getStatusCode(error: unknown): number | undefined {
  if (error && typeof error === 'object' && 'statusCode' in error) {
    return (error as { statusCode: number }).statusCode;
  }
  return undefined;
}

/** Actionable suggestions per error type to help MCP clients self-correct. */
const ERROR_SUGGESTIONS: Record<string, string> = {
  NotFoundError: 'Verify the resource ID/name exists. Use a query or list tool to find valid identifiers.',
  RateLimitError: 'Wait for the retry_after_seconds period, then retry.',
  ValidationError: 'Check parameter types and required fields against the tool schema.',
  UnauthorizedError: 'Verify ULUOPS_API_KEY is set to a valid ulr_* key.',
  ForbiddenError: 'This operation requires elevated permissions or a different subscription tier.',
  NetworkError: 'The API server may be down. Check that the service is running.',
  TimeoutError: 'The request took too long. Try reducing payload size or increasing timeout.',
  ConflictError: 'The resource was modified concurrently. Refresh and retry.',
  UnprocessableError: 'The request is well-formed but cannot be processed. Check business logic constraints.',
  InputValidationError: 'SDK-level validation failed before reaching the API. Check input shapes.',
};

/**
 * Build a structured error response with context for MCP clients.
 */
function buildErrorResponse(
  message: string,
  metadata?: Record<string, unknown>,
): McpToolResponse {
  const payload: Record<string, unknown> = { error: message };
  if (metadata) {
    Object.assign(payload, metadata);
  }
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    isError: true,
  };
}

function getErrorTypeName(error: unknown): string {
  if (error instanceof Error) return error.constructor.name;
  return 'unknown';
}

/**
 * Map an SDK error to an MCP tool response.
 *
 * Preserves error context including:
 * - Original error messages (with credential redaction only)
 * - HTTP status codes when available
 * - Retry-after information for rate limits
 * - Field-level validation details
 */
export function mapSdkErrorToMcp(error: unknown, toolName?: string): McpToolResponse {
  const statusCode = getStatusCode(error);
  const errorType = getErrorTypeName(error);
  const suggestion = ERROR_SUGGESTIONS[errorType];
  const context: Record<string, unknown> = {
    ...(statusCode ? { status: statusCode } : {}),
    error_type: errorType,
    ...(toolName ? { tool: toolName } : {}),
    ...(suggestion ? { suggestion } : {}),
  };

  if (isNotFoundError(error)) {
    return buildErrorResponse(
      sanitizeErrorMessage((error as Error).message || 'Resource not found'),
      context,
    );
  }

  if (isRateLimitError(error)) {
    const retryAfter = (error as { retryAfter?: number }).retryAfter;
    return buildErrorResponse(
      retryAfter
        ? `Rate limit exceeded. Retry after ${String(retryAfter)} seconds.`
        : 'Rate limit exceeded, please retry later.',
      { ...context, status: 429, ...(retryAfter ? { retry_after_seconds: retryAfter } : {}) },
    );
  }

  if (isValidationError(error)) {
    // Surface the API's per-field validation errors. The API error handler
    // (ops-uluops-api/src/middleware/error-handler.ts) emits a structured
    // `errors: [{path, message}]` array inside `details`; the SDK preserves
    // it on `error.details.errors`. Forwarding only `error.message` ("Validation
    // failed") forces clients into trial-and-error isolation to discover which
    // field tripped which rule. Extracting the array makes drift between
    // MCP-advertised schema and API-enforced schema immediately diagnosable.
    const baseMessage = sanitizeErrorMessage((error as Error).message || 'Invalid request parameters');
    const details = (error as { details?: Record<string, unknown> }).details;
    const fieldErrors = details && Array.isArray((details as { errors?: unknown }).errors)
      ? ((details as { errors: Array<{ path?: string; message?: string }> }).errors)
      : undefined;

    if (fieldErrors && fieldErrors.length > 0) {
      const formatted = fieldErrors
        .map((e) => `${e.path ?? '?'}: ${e.message ?? 'invalid'}`)
        .join('; ');
      return buildErrorResponse(
        `${baseMessage}: ${formatted}`,
        { ...context, field_errors: fieldErrors },
      );
    }

    return buildErrorResponse(baseMessage, context);
  }

  if (error instanceof UnauthorizedError) {
    return buildErrorResponse(
      'Authentication required. Verify ULUOPS_API_KEY is set to a valid ulr_* key.',
      { ...context, status: 401 },
    );
  }

  if (error instanceof ForbiddenError) {
    return buildErrorResponse(
      sanitizeErrorMessage((error as Error).message || 'Access denied'),
      { ...context, status: 403 },
    );
  }

  if (isNetworkError(error)) {
    return buildErrorResponse(
      sanitizeErrorMessage((error as Error).message || 'Network error: verify the API server is running'),
      context,
    );
  }

  if (isTimeoutError(error)) {
    return buildErrorResponse(
      sanitizeErrorMessage((error as Error).message || 'Request timed out. Consider increasing ULUOPS_TRACKER_TIMEOUT.'),
      context,
    );
  }

  // 402 Subscription Required — run submission tier gating (spec Section 9.2)
  if (statusCode === 402) {
    const rawDetails = (error as { details?: unknown }).details;
    const details: Record<string, unknown> =
      typeof rawDetails === 'object' && rawDetails !== null
        ? (rawDetails as Record<string, unknown>)
        : {};

    const defs = Array.isArray(details['definitions'])
      ? (details['definitions'] as unknown[]).filter(
          (d): d is Record<string, unknown> => typeof d === 'object' && d !== null,
        )
      : undefined;
    const currentTier =
      typeof details['currentTier'] === 'string' ? details['currentTier'] : undefined;
    const upgradeUrl =
      typeof details['upgradeUrl'] === 'string' ? details['upgradeUrl'] : undefined;

    const sep = upgradeUrl?.includes('?') ? '&' : '?';
    const trackedUrl = upgradeUrl ? `${upgradeUrl}${sep}source=mcp` : undefined;

    const defList =
      defs?.map(d => {
        const name = typeof d['name'] === 'string' ? d['name'] : 'unknown';
        const tier = typeof d['requiredTier'] === 'string' ? d['requiredTier'] : 'unknown';
        return `${name} (requires ${tier})`;
      }).join(', ') ?? 'above-tier definitions';

    return buildErrorResponse(
      `Subscription required. Run references: ${defList}.` +
      (currentTier ? ` Your current tier: ${currentTier}.` : '') +
      (trackedUrl ? ` Upgrade: ${trackedUrl}` : ''),
      {
        ...context,
        status: 402,
        ...(currentTier ? { current_tier: currentTier } : {}),
        ...(defs ? { rejected_definitions: defs } : {}),
        ...(trackedUrl ? { upgrade_url: trackedUrl } : {}),
      },
    );
  }

  if (isConflictError(error)) {
    return buildErrorResponse(
      sanitizeErrorMessage((error as Error).message || 'Resource conflict'),
      {
        ...context,
        status: error.statusCode,
        ...error.details,
      },
    );
  }

  if (isUnprocessableError(error)) {
    return buildErrorResponse(
      sanitizeErrorMessage((error as Error).message || 'Unprocessable request'),
      context,
    );
  }

  if (isOpsApiError(error)) {
    return buildErrorResponse(
      sanitizeErrorMessage((error as Error).message),
      context,
    );
  }

  if (error instanceof Error) {
    return buildErrorResponse(sanitizeErrorMessage(error.message), context);
  }

  return buildErrorResponse('An unexpected error occurred', context);
}

/**
 * Map a Zod validation error to an MCP tool response.
 * Shows all validation errors with field paths and expected values.
 */
export function mapZodErrorToMcp(error: unknown, toolName?: string): McpToolResponse {
  let message = 'Invalid input parameters';

  if (error instanceof Error) {
    const zodError = error as { errors?: Array<{ path: (string | number)[]; message: string }> };
    if (zodError.errors && Array.isArray(zodError.errors)) {
      const details = zodError.errors
        .map((e) => `${e.path.join('.')}: ${e.message}`)
        .join('; ');
      const count = zodError.errors.length;
      message = `Validation failed (${String(count)} error${count > 1 ? 's' : ''}): ${details}`;
    }
  }

  return buildErrorResponse(message, {
    status: 400,
    error_type: 'ZodValidationError',
    ...(toolName ? { tool: toolName } : {}),
    suggestion: 'Check parameter types and required fields against the tool schema.',
  });
}
