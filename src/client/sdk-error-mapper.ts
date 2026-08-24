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
  if (typeof error === 'object' && error !== null && 'statusCode' in error) {
    return (error as { statusCode: number }).statusCode;
  }
  return undefined;
}

/** Actionable suggestions per error type to help MCP clients self-correct. */
const ERROR_SUGGESTIONS: Record<string, string> = {
  NotFoundError: 'Verify the resource ID/name exists. Use a query or list tool to find valid identifiers.',
  RateLimitError: 'Wait for the retry_after_seconds period, then retry.',
  ValidationError: 'Check parameter types and required fields against the tool schema.',
  UnauthorizedError: 'Verify ULUOPS_API_KEY is set to a valid ulr_* key. Manage keys at https://app.uluops.ai/settings/api-keys.',
  // 403 is access/scope, NOT tier — genuine tier limits surface as 402 (see the
  // PROJECT_LIMIT / Subscription-Required branches below). A tier-flavored 403
  // message misdirects callers toward a paywall that isn't the cause.
  ForbiddenError: 'Access denied. The target may not exist, may belong to another org, or your key may lack the required scope/role — verify the id(s), the org context, and your key permissions before assuming a tier limit.',
  NetworkError: 'The API server may be down. Check that the service is running.',
  TimeoutError: 'The request took too long. Try reducing payload size or increasing timeout.',
  ConflictError:
    'Conflict — the API did not specify a cause. Possible causes: concurrent modification (refresh and retry), ' +
    'a name already in use (choose another, or target the existing resource), a soft-deleted resource holding ' +
    'the name (restore it instead of recreating), or an idempotency_key reused with a different payload (use a new key).',
  UnprocessableError: 'The request is well-formed but cannot be processed. Check business logic constraints.',
  // §3.9 skew alarm (ops-sdk ≥5.18.0). Fires AFTER the write landed — the
  // must-not-retry line is load-bearing: an orchestrator's default response to
  // a failed write tool is retry, which re-applies the write.
  AnalysisEchoMismatchError:
    'If reason is preview-mode-mismatch: NOTHING was written — the server does not speak the requested mode; stop and fix version skew. ' +
    'Otherwise the update WAS applied — do NOT retry (a retry re-applies the write). If you sent merge and the server echoed replace, ' +
    'records omitted from your payload MAY HAVE BEEN RETIRED. Note: retired (superseded) rows are INVISIBLE to get_run_analysis / ' +
    'get_run_details — those read live rows only; the dataset export with include_superseded: true is the surface that still shows them. ' +
    'Check API/SDK version alignment before writing again.',
  InputValidationError:
    "The request was rejected by client-side checks before reaching the API — fix the named field(s) to match the tool's input schema.",
};

/**
 * Cause-specific conflict guidance, keyed on the API-supplied ConflictError
 * `details.reason`. A ConflictError is one class serving many causes (name
 * collision, idempotency reuse, …). An absent or unknown reason falls back to
 * the generic ERROR_SUGGESTIONS.ConflictError string, which therefore
 * enumerates the cause families rather than asserting one — a single-cause
 * fallback ("modified concurrently") misdirects at exactly the conflict sites
 * the API does not tag (idempotency reuse and tombstone conflicts are not
 * resolved by refreshing).
 */
const CONFLICT_REASON_SUGGESTIONS: Record<string, string> = {
  name_collision: 'A project with this name already exists in this scope. Choose a different name, or target the existing project.',
  name_taken: 'A project with this name already exists in this scope. Choose a different name, or target the existing project.',
  soft_deleted_conflict: 'A soft-deleted project of this name exists. Restore it (restore_project) instead of recreating, or choose a different name.',
  idempotency_reuse: 'This idempotency_key was already used with a different payload. Use a new idempotency_key, or update the existing run via update_run.',
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
  // Prefer the `name` property over `constructor.name`: SDK error classes set
  // both to the same string, but `name` survives dual-package class-identity
  // splits (a nested sdk-core copy has different constructors, same names).
  if (error instanceof Error) {
    return error.name !== '' && error.name !== 'Error' ? error.name : error.constructor.name;
  }
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

/**
 * T7: name the discovery tool instead of "a query or list tool". The API's
 * NotFoundError message names the resource ("Project not found", "Run not
 * found") — key the remedy on it so a 404 carries an executable next step.
 */
const NOT_FOUND_DISCOVERY_TOOLS: Array<[RegExp, string]> = [
  [/\bproject\b/i, 'list_projects'],
  [/\brun\b/i, 'list_runs'],
  [/\bissue\b/i, 'query_issues'],
  [/\bagent\b/i, 'list_agents'],
];

function notFoundSuggestion(message: string): string {
  for (const [pattern, tool] of NOT_FOUND_DISCOVERY_TOOLS) {
    if (pattern.test(message)) {
      return `Verify the resource ID/name exists — call ${tool} to find valid identifiers.`;
    }
  }
  return ERROR_SUGGESTIONS['NotFoundError'] as string;
}

export function mapSdkErrorToMcp(error: unknown, toolName?: string): McpToolResponse {
  const statusCode = getStatusCode(error);
  const errorType = getErrorTypeName(error);
  // T7: 404 remedies are resource-keyed, naming the discovery tool.
  const suggestion = isNotFoundError(error)
    ? notFoundSuggestion((error as Error).message)
    : ERROR_SUGGESTIONS[errorType];
  // T20: pass the API's cause code through so clients can branch on cause,
  // not just HTTP status (CONFIRMATION_MISMATCH, UNDO_WINDOW_EXPIRED, ...).
  const causeCode = (error as { code?: string }).code;
  const context: Record<string, unknown> = {
    ...(statusCode !== undefined ? { status: statusCode } : {}),
    error_type: errorType,
    ...(typeof causeCode === 'string' ? { code: causeCode } : {}),
    ...(toolName != null ? { tool: toolName } : {}),
    ...(suggestion != null ? { suggestion } : {}),
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
      retryAfter != null
        ? `Rate limit exceeded. Retry after ${String(retryAfter)} seconds.`
        : 'Rate limit exceeded, please retry later.',
      { ...context, status: 429, ...(retryAfter != null ? { retry_after_seconds: retryAfter } : {}) },
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
      'Authentication required. Verify ULUOPS_API_KEY is set to a valid ulr_* key. Manage keys at https://app.uluops.ai/settings/api-keys.',
      { ...context, status: 401 },
    );
  }

  if (error instanceof ForbiddenError) {
    const fbCode = (error as { code?: string }).code;
    const rawFbDetails = (error as { details?: unknown }).details;
    const fbDetails: Record<string, unknown> =
      typeof rawFbDetails === 'object' && rawFbDetails !== null
        ? (rawFbDetails as Record<string, unknown>)
        : {};

    // TIER_REQUIRED — the server KNOWS this is an entitlement denial, so emit
    // the upgrade remedy instead of the generic access-denied suggestion that
    // argued against it ("...before assuming a tier limit" — RE-PROBE-02 N1).
    // Same shape as the 402 PROJECT_LIMIT branch below. Requires ops-sdk with
    // sdk-core >=0.17 (older SDKs strip 403 code/details, falling through to
    // the generic branch — degraded copy, not an error).
    if (fbCode === 'TIER_REQUIRED') {
      const required = typeof fbDetails['required'] === 'string' ? fbDetails['required'] : undefined;
      const current = typeof fbDetails['current'] === 'string' ? fbDetails['current'] : undefined;
      const feature = typeof fbDetails['feature'] === 'string' ? fbDetails['feature'] : undefined;
      const upgradeUrl = typeof fbDetails['upgradeUrl'] === 'string' ? fbDetails['upgradeUrl'] : undefined;
      const sep = upgradeUrl?.includes('?') === true ? '&' : '?';
      const trackedUrl = upgradeUrl != null ? `${upgradeUrl}${sep}source=mcp` : undefined;

      return buildErrorResponse(
        `This feature requires ${required ?? 'a higher'} tier.` +
          (current != null ? ` Your current tier: ${current}.` : '') +
          (trackedUrl != null ? ` Upgrade: ${trackedUrl}` : ''),
        {
          ...context,
          status: 403,
          suggestion:
            'This is a subscription-tier limit, not a permissions problem — the key and target are fine. ' +
            "Upgrade the org's plan to use this feature.",
          ...(required != null ? { required_tier: required } : {}),
          ...(current != null ? { current_tier: current } : {}),
          ...(feature != null ? { feature } : {}),
          ...(trackedUrl != null ? { upgrade_url: trackedUrl } : {}),
        },
      );
    }

    // INSUFFICIENT_SCOPE — a read-scope key attempting a write (per-key
    // scopes, platform authenticate middleware). Nothing about the target or
    // the org is wrong; only the key's scope is. Without this branch the
    // generic 403 remedy sends callers to audit ids and org context (T20).
    if (fbCode === 'INSUFFICIENT_SCOPE') {
      return buildErrorResponse(
        sanitizeErrorMessage((error as Error).message || 'This API key is read-only.'),
        {
          ...context,
          status: 403,
          suggestion:
            'This API key has read scope and the operation is a write. The target and org are fine — ' +
            'switch to a key minted with write scope (ulu auth api-keys create --scope write).',
        },
      );
    }

    // UNDO_WINDOW_EXPIRED — the status change is too old to undo. A business
    // rule, not a permissions problem (T20).
    if (fbCode === 'UNDO_WINDOW_EXPIRED') {
      const windowHours = typeof fbDetails['windowHours'] === 'number' ? fbDetails['windowHours'] : undefined;
      return buildErrorResponse(
        sanitizeErrorMessage((error as Error).message || 'The change is too old to undo.'),
        {
          ...context,
          status: 403,
          suggestion:
            'The status change is older than the undo window — undo is unavailable for it. ' +
            'Set the desired status directly with update_status instead.',
          ...(windowHours != null ? { window_hours: windowHours } : {}),
        },
      );
    }

    // ROLE_REQUIRED / INSUFFICIENT_ROLE — role-gated operation on a user key.
    if (fbCode === 'ROLE_REQUIRED' || fbCode === 'INSUFFICIENT_ROLE') {
      const required = typeof fbDetails['required'] === 'string' ? fbDetails['required'] : undefined;
      return buildErrorResponse(
        sanitizeErrorMessage((error as Error).message || 'Access denied'),
        {
          ...context,
          status: 403,
          suggestion:
            "This API key's role is below the required role. Role-gated operations are performed " +
            'by the UluOps runtime or an operator, not by user keys.',
          ...(required != null ? { required_role: required } : {}),
        },
      );
    }

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

  // 402 PROJECT_LIMIT — org project-cap reached (distinct from tier gating). The ops-api
  // nests {currentCount, limit, limitType, upgradeUrl} under error.details and sets
  // code=PROJECT_LIMIT (enforceProjectCap + error-handler enrichment), so these surface
  // cleanly on the SDK error. Must precede the generic 402 branch.
  if (statusCode === 402 && (error as { code?: string }).code === 'PROJECT_LIMIT') {
    const rawDetails = (error as { details?: unknown }).details;
    const details: Record<string, unknown> =
      typeof rawDetails === 'object' && rawDetails !== null
        ? (rawDetails as Record<string, unknown>)
        : {};

    const currentCount =
      typeof details['currentCount'] === 'number' ? details['currentCount'] : undefined;
    const limit = typeof details['limit'] === 'number' ? details['limit'] : undefined;
    const upgradeUrl =
      typeof details['upgradeUrl'] === 'string' ? details['upgradeUrl'] : undefined;

    const sep = upgradeUrl?.includes('?') === true ? '&' : '?';
    const trackedUrl = upgradeUrl != null ? `${upgradeUrl}${sep}source=mcp` : undefined;
    const countPhrase =
      currentCount != null && limit != null
        ? ` Your org has ${String(currentCount)} of ${String(limit)} projects.`
        : '';

    return buildErrorResponse(
      `Project limit reached.${countPhrase} Reuse an existing project name, or upgrade your plan to add more projects.` +
        (trackedUrl != null ? ` Upgrade: ${trackedUrl}` : ''),
      {
        ...context,
        status: 402,
        limit_type: 'project',
        ...(currentCount != null ? { current_count: currentCount } : {}),
        ...(limit != null ? { project_limit: limit } : {}),
        ...(trackedUrl != null ? { upgrade_url: trackedUrl } : {}),
      },
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

    const sep = upgradeUrl?.includes('?') === true ? '&' : '?';
    const trackedUrl = upgradeUrl != null ? `${upgradeUrl}${sep}source=mcp` : undefined;

    const defList =
      defs?.map(d => {
        const name = typeof d['name'] === 'string' ? d['name'] : 'unknown';
        const tier = typeof d['requiredTier'] === 'string' ? d['requiredTier'] : 'unknown';
        return `${name} (requires ${tier})`;
      }).join(', ') ?? 'above-tier definitions';

    return buildErrorResponse(
      `Subscription required. Run references: ${defList}.` +
      (currentTier != null ? ` Your current tier: ${currentTier}.` : '') +
      (trackedUrl != null ? ` Upgrade: ${trackedUrl}` : ''),
      {
        ...context,
        status: 402,
        ...(currentTier != null ? { current_tier: currentTier } : {}),
        ...(defs != null ? { rejected_definitions: defs } : {}),
        ...(trackedUrl != null ? { upgrade_url: trackedUrl } : {}),
      },
    );
  }

  if (isConflictError(error)) {
    // Refine the generic conflict suggestion by cause (details.reason), and
    // place it LAST so it overrides the type-level suggestion already in context.
    const reason = typeof error.details?.['reason'] === 'string' ? error.details['reason'] : undefined;
    const refinedSuggestion =
      (reason != null ? CONFLICT_REASON_SUGGESTIONS[reason] : undefined) ?? ERROR_SUGGESTIONS['ConflictError'];
    return buildErrorResponse(
      sanitizeErrorMessage((error as Error).message || 'Resource conflict'),
      {
        ...context,
        status: error.statusCode,
        ...error.details,
        ...(refinedSuggestion != null ? { suggestion: refinedSuggestion } : {}),
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

  // T27: the SDK's client-side parameter validation (InputValidationError)
  // previously fell through to the bare branch below — a third error shape
  // with no status. Give it the standard envelope: status 400 (the request
  // class it would have been had it reached the API), per-field details from
  // the Zod issues it carries, and a suggestion that speaks in tool terms.
  // Name-matched rather than instanceof to stay immune to dual-package
  // class-identity splits (the SdkApiError lesson, tracker bfb1575e).
  if (error instanceof Error && error.name === 'InputValidationError') {
    const rawIssues = (error as { errors?: unknown }).errors;
    const fieldErrors = Array.isArray(rawIssues)
      ? (rawIssues as unknown[])
          .filter((i): i is Record<string, unknown> => typeof i === 'object' && i !== null)
          .map((i) => ({
            path: Array.isArray(i['path']) ? (i['path'] as Array<string | number>).join('.') : '?',
            message: typeof i['message'] === 'string' ? i['message'] : 'invalid',
          }))
      : undefined;
    const formatted = fieldErrors?.map((e) => `${e.path}: ${e.message}`).join('; ');
    return buildErrorResponse(
      sanitizeErrorMessage(error.message) + (formatted != null && formatted !== '' ? `: ${formatted}` : ''),
      {
        ...context,
        status: 400,
        ...(fieldErrors !== undefined && fieldErrors.length > 0 ? { field_errors: fieldErrors } : {}),
      },
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
    ...(toolName != null ? { tool: toolName } : {}),
    suggestion: 'Check parameter types and required fields against the tool schema.',
  });
}
