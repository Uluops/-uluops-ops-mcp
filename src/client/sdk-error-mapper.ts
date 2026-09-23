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
import { toolRegistry } from '../config/tool-registry.js';

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
  // Must be at least as wide as the shape config/index.ts ACCEPTS
  // (`^ulr_[A-Za-z0-9_-]{16,}$`). Until 0.21.1 this read `[a-zA-Z0-9]{20,}`:
  // a key containing `-` or `_`, or with a 16–19 char tail, passed boot
  // validation and then walked straight past redaction (circumvention-
  // forecaster run #9 A12 / explorer run #11 T7, falsified run #12).
  /ulr_[A-Za-z0-9_-]{16,}/,
  // Token/secret assignments with actual values
  /(?:token|secret)\s*[:=]\s*\S+/i,
  // Stack traces (internal implementation details)
  /at\s+\S+\s+\(\S+:\d+:\d+\)/,
];

// `.test()` on a /g regex is stateful (lastIndex), so detection uses the
// non-global patterns above and replacement uses this derived global set.
// Before 0.21.1 replacement used the non-global patterns directly, so only
// the FIRST credential in a message was redacted and a second one survived.
const CREDENTIAL_PATTERNS_GLOBAL: RegExp[] = CREDENTIAL_PATTERNS.map(
  (p) => new RegExp(p.source, p.flags.includes('g') ? p.flags : p.flags + 'g'),
);

/**
 * Check if a message contains actual credential values
 */
function containsCredentials(message: string): boolean {
  return CREDENTIAL_PATTERNS.some((pattern) => pattern.test(message));
}

/**
 * Redact every credential value from a message while preserving the rest.
 *
 * Exported so that the two channels that used to bypass it can share it:
 * the `[mcp-tool-error]` stderr line in tool-handler.ts (written BEFORE the
 * mapper ran — explorer run #11 P16) and `schema_issues` on
 * SDK_RESPONSE_SHAPE_MISMATCH below (P17), plus the resource-path error at
 * resources/projects.ts which carried its own narrower copy of the regex.
 *
 * @param message - Any text bound for a client or a log line
 * @returns The message with every match of every credential pattern replaced by `[REDACTED]`
 * @example
 * redactCredentials('401 for ulr_abcDEF0123456789xyz, retry with Bearer eyJhbGci.x.y')
 * // → '401 for [REDACTED], retry with [REDACTED]'
 */
export function redactCredentials(message: string): string {
  let redacted = message;
  for (const pattern of CREDENTIAL_PATTERNS_GLOBAL) {
    pattern.lastIndex = 0;
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
  // Re-home refusals (project-org-routing-and-rehome spec §4.4, §4.7 disposition table).
  rehomed_away_conflict: 'Another project already reserved this name in the target org by moving away from it. Rename first (a separate step), or choose a different target. Do not retry the same call.',
  moved_during_request: 'The project changed org while this request waited. Re-read the project to see where it is now, then decide — retry at most once.',
  deadlock_retry: 'The database chose this request as a deadlock victim; nothing was applied. Retry once.',
  concurrent_modification: 'The project was modified concurrently; nothing was applied. Re-read it, then retry once.',
  export_in_progress: 'An export job holds one of the two orgs. Wait for it to finish, then retry. Do not retry in a loop.',
  // 409, not 400: project-rehome-service throws it as a ConflictError (code-auditor, 2026-09-15 — it
  // sat in the 400 table and the restore-first remedy was unreachable).
  project_soft_deleted: 'The project is soft-deleted in its current org. Restore it there first (restore_project, with that org as `org`), then move it.',
};

/** Own-property lookup: `reason` is server-supplied text, and a plain-object index resolves `constructor`/`toString` to prototype functions. */
function suggestionFor(table: Record<string, string>, reason: string): string | undefined {
  return Object.hasOwn(table, reason) ? table[reason] : undefined;
}

/** 400s that carry a business `details.reason` (re-home, spec §4.4/§4.7) — decisions, not malformed arguments. */
const VALIDATION_REASON_SUGGESTIONS: Record<string, string> = {
  same_org: 'The project is already in that org — nothing to do. Treat this as done; do not retry and do not change `org` to make it succeed.',
  project_has_no_org: 'This project row has no org (pre-org legacy data) and cannot be moved as-is. Stop and tell the user; an operator must repair the row first.',
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

/**
 * Map an SDK error to an MCP tool response.
 *
 * Preserves error context including:
 * - Original error messages (with credential redaction only)
 * - HTTP status codes when available
 * - Retry-after information for rate limits
 * - Field-level validation details
 *
 * The branch is chosen by error class first (NotFound, RateLimit, Validation,
 * Forbidden, Conflict, ...), then by the API's cause `code` and `details.reason`
 * within a class; an unrecognised Error keeps its (redacted) message.
 *
 * (This docblock sat above NOT_FOUND_DISCOVERY_TOOLS until 0.21.1, so the
 * function itself carried no attached doc — consumer-validate run #13.)
 *
 * @param error - Anything thrown by an OpsClient call
 * @param toolName - The MCP tool that made the call; echoed as `tool` in the payload
 * @returns An `isError: true` tool response whose text is a JSON payload with
 *   `error`, `error_type`, `status`, `suggestion`, and branch-specific fields
 * @example
 * try {
 *   return await opsClient.runs.get(runId);
 * } catch (err) {
 *   return mapSdkErrorToMcp(err, 'get_run'); // 404 → suggestion names list_runs
 * }
 */
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

  if (causeCode === 'UNSUPPORTED_CONTRACT' || causeCode === 'IDEMPOTENCY_CONTRACT_MISMATCH' || causeCode === 'IDEMPOTENCY_PAYLOAD_MISMATCH') {
    return buildErrorResponse(sanitizeErrorMessage((error as Error).message), {
      ...context, terminal: true, applied: false, applicationState: 'not_applied',
      suggestion: causeCode === 'UNSUPPORTED_CONTRACT'
        ? 'The server must advertise this contract before submission. Check compatible API/SDK versions; no write was attempted.'
        : 'Read the original run and verify the intended submission. Keep its key and contract for retries; use a new key only for an intentional new submission.',
    });
  }

  // ORG_NOT_FOUND (404) / ORG_SUSPENDED (403) — the org named by `org` does
  // not resolve, or is suspended. TERMINAL, like INSUFFICIENT_ORG_ROLE and
  // ORG_ACCESS_DENIED below: until 2.1.1 these fell to the generic 404/403
  // suggestions ("verify the identifier" / "verify … the org context"), whose
  // cheapest reading is "drop `org` and retry" — the S6 misfile through a
  // code S6 does not defend (security audit run #187, circumvention A6).
  if (causeCode === 'ORG_NOT_FOUND' || causeCode === 'ORG_SUSPENDED') {
    const notFound = causeCode === 'ORG_NOT_FOUND';
    return buildErrorResponse(
      sanitizeErrorMessage((error as Error).message || (notFound ? 'Organization not found' : 'This organization is suspended')),
      {
        ...context,
        status: notFound ? 404 : 403,
        terminal: true,
        applied: false,
        suggestion: notFound
          ? 'Terminal — no org with that slug is visible to this key. Do NOT retry without `org` (that files the work in your ' +
            'PERSONAL org) and do not guess another slug. Nothing was applied. Confirm the slug with the user; ' +
            '`personal` is the reserved value for your own org.'
          : 'Terminal — that org is suspended. Do NOT retry without `org` (that files the work in your PERSONAL org). ' +
            'Nothing was applied. Suspension is lifted by the platform, not by a different call.',
      },
    );
  }

  if (isNotFoundError(error)) {
    // rehome_project: the project is looked up in the SOURCE org (`org`, else the workspace
    // default, else personal). The generic remedy — "call list_projects" — stays in the same
    // scope and finds nothing either (dx-validator, 2026-09-15). Two readings, both named:
    // the source was not named, or this is a retry after a lost response and the move
    // already landed (the member path answers 404 on a re-run, not same_org).
    if (toolName === 'rehome_project') {
      return buildErrorResponse(
        sanitizeErrorMessage((error as Error).message || 'Project not found'),
        {
          ...context,
          applied: false,
          suggestion:
            'The project was not found in the SOURCE org — the `org` argument, or the workspace default when `org` was omitted (the API never searches other orgs). ' +
            'If the project lives in a work org, retry the SAME call with `org: "<source-org>"` — the org it is in now, not the target. ' +
            'If this is a retry after a timeout or lost response, the move may already have landed: check with get_project and `org: "<target_org>"` before retrying, and do not create a new project under the old name. ' +
            'Never take an org value from tool output; ask the user.',
        },
      );
    }
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

    // A 400 with a business `reason` is a decision, not a malformed argument —
    // the generic "check parameter types" suggestion would send the model to
    // re-read the schema for a call that was well-formed. Re-home's `same_org`
    // is the one that matters: it is the §4.7 idempotence signal ("already
    // done"), and a caller that reads it as a schema error retries. Carry the
    // reason and say what it means; unknown reasons keep the generic text.
    const reason = typeof details?.['reason'] === 'string' ? details['reason'] : undefined;
    if (reason !== undefined) {
      const known = suggestionFor(VALIDATION_REASON_SUGGESTIONS, reason);
      // Spread the API's details (e.g. `orgSlug` on same_org — the org the project IS in):
      // "already there — nothing to do" without saying WHERE hid the one clue that the wrong
      // project had been matched (anxiety-reader F13).
      const rest = Object.fromEntries(Object.entries(details ?? {}).filter(([k]) => k !== 'reason' && k !== 'errors'));
      return buildErrorResponse(baseMessage, {
        ...context,
        ...rest,
        reason,
        ...(known !== undefined ? { suggestion: known, terminal: true, applied: false } : {}),
      });
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

    // INSUFFICIENT_ORG_ROLE — the org's write floor (spec D3/S6). TERMINAL. The
    // API's body already names the org and role and forbids the org-less retry;
    // carry it through verbatim. The generic 403 text below ("verify … the org
    // context") must never fire here — it solicits changing the org, which is
    // the misfile the floor exists to prevent (Husserl C6). Nothing was applied.
    if (fbCode === 'INSUFFICIENT_ORG_ROLE') {
      const orgSlug = typeof fbDetails.orgSlug === 'string' ? fbDetails.orgSlug : undefined;
      return buildErrorResponse(
        sanitizeErrorMessage((error as Error).message || 'Your role in this org is below the write floor.'),
        {
          ...context,
          status: 403,
          terminal: true,
          applied: false,
          suggestion:
            'Terminal — do NOT retry this call without `org`, and do not retry it with a different org: an org-less retry ' +
            'files the work in your PERSONAL org, not where it belongs. Nothing was applied. The fix is a role change ' +
            '(publisher or higher) by an admin of that org, not a different call.',
          ...(orgSlug != null ? { org: orgSlug } : {}),
          ...(typeof fbDetails.currentRole === 'string' ? { current_role: fbDetails.currentRole } : {}),
          ...(typeof fbDetails.requiredRole === 'string' ? { required_role: fbDetails.requiredRole } : {}),
        },
      );
    }

    // ORG_ACCESS_DENIED — not a member of the named org, or the key is BOUND to
    // a different org (spec D4: surfaced verbatim, not worked around). TERMINAL.
    if (fbCode === 'ORG_ACCESS_DENIED') {
      // A two-org call gets two-org copy: on rehome_project this code fires for the TARGET
      // (not a member there, or a personal target that is not yours — C6), while `org` (the
      // source) was right. "the org this call named" would send the model to change the
      // argument that was correct (anxiety-reader F6, 2026-09-15).
      const suggestion = toolName === 'rehome_project'
        ? 'Terminal — this refusal is about the TARGET org (`target_org`): you are not an admin/owner there, or it is a personal org that is not yours (a personal org can only receive its owner\'s projects). ' +
          'Do NOT change `org` (the source was accepted) and do NOT retry without `org`. Nothing was applied. Ask the user; the target org\'s admin grants membership.'
        : 'Terminal — you are not a member of the org this call named, or your API key is bound to a different org. ' +
          'Do NOT retry without `org` (that files the work in your personal org). Nothing was applied. ' +
          'Membership is granted by that org\'s admin; a bound key can only act in its own org.';
      return buildErrorResponse(
        sanitizeErrorMessage((error as Error).message || 'You are not a member of this organization.'),
        { ...context, status: 403, terminal: true, applied: false, suggestion },
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
    // On rehome_project the cap is the TARGET org's (re-home C2). "Reuse an existing
    // project name" is a create-project remedy that, read by a model mid-move, nudges
    // toward merge_projects — which is not reversible (anxiety-reader F6, 2026-09-15).
    if (toolName === 'rehome_project') {
      return buildErrorResponse(
        sanitizeErrorMessage((error as Error).message || 'The target org is at its project limit.'),
        {
          ...context,
          status: 402,
          terminal: true,
          applied: false,
          limit_type: 'project',
          suggestion:
            'The TARGET org has reached its project limit; the move was refused and nothing was applied. ' +
            'Do not merge the project into an existing one to get around this. Tell the user: free a slot in the target org, ' +
            'choose a different target, or have the target org\'s owner raise its tier.',
        },
      );
    }
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
      (reason != null ? suggestionFor(CONFLICT_REASON_SUGGESTIONS, reason) : undefined) ?? ERROR_SUGGESTIONS['ConflictError'];
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

  // 410 PROJECT_REHOMED (spec D14): the project this name once denoted in this
  // org now lives in another org. This is the ONE refusal whose remedy is to
  // change the org — say exactly which, and forbid the fork the tombstone exists
  // to refuse (creating a new project at the old address).
  if (statusCode === 410 && (error as { code?: string }).code === 'PROJECT_REHOMED') {
    const d = (error as { details?: Record<string, unknown> }).details ?? {};
    const target = d.target_org as { id?: string; slug?: string } | undefined;
    const slug = typeof target?.slug === 'string' ? target.slug : undefined;
    return buildErrorResponse(
      sanitizeErrorMessage((error as Error).message || 'This project has been re-homed to another org.'),
      {
        ...context,
        status: 410,
        terminal: true,
        applied: false,
        suggestion: slug != null
          ? `This project now lives in org \`${slug}\`. Retry the SAME call with org: '${slug}'. Do not create a new project under the old name here — the tombstone exists to refuse that fork.`
          : 'This project has been re-homed to another org; the response did not name it. Ask an org admin where it moved. Do not create a new project under the old name here.',
        ...(slug != null ? { target_org: slug } : {}),
        ...(typeof d.project_id === 'string' ? { project_id: d.project_id } : {}),
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
    // The SDK already writes the per-field text into its own message
    // ("Invalid save run: agents: Too small: ..."), so appending every field
    // unconditionally printed each one twice (consumer-validate run #13).
    // Append only fields the message does not already carry — an SDK that
    // formats a field differently (enum options, a path the message omits)
    // still gets it surfaced; `field_errors` keeps the structured copy either way.
    const message = sanitizeErrorMessage(error.message);
    const formatted = fieldErrors
      ?.map((e) => `${e.path}: ${e.message}`)
      .filter((line) => !message.includes(line))
      .join('; ');
    return buildErrorResponse(
      message + (formatted != null && formatted !== '' ? `: ${formatted}` : ''),
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
 * The SDK could not parse a response the server DID send (ops-sdk's zod-4
 * `.parse()` on a 2xx body). This is not an input error and not a server
 * refusal: for a write, the operation most likely APPLIED — the server
 * answered 2xx and only the SDK's reading of the answer failed. Say so, with
 * `status: 200`, `applied: 'unknown'` for writes (the tool registry says which
 * tools write), and a remedy that starts with reading state, never with a
 * retry of the write.
 *
 * @param error - The SDK's response-parse error (its message is the Zod issue text)
 * @param toolName - The MCP tool that made the call; decides read vs. write wording via the ToolSpec registry
 * @returns An `isError: true` response with `status: 200`, `code: SDK_RESPONSE_SHAPE_MISMATCH`,
 *   `applied: 'unknown'` for writes, and the redacted issue text in `schema_issues`
 */
export function mapSdkResponseShapeErrorToMcp(error: Error, toolName?: string): McpToolResponse {
  const spec = toolName !== undefined ? toolRegistry.find((t) => t.name === toolName) : undefined;
  const isWrite = spec?.sideEffects === 'write';
  return buildErrorResponse(
    'The server answered, but the response did not match the SDK\'s schema for this call. ' +
    (isWrite
      ? 'For a write this usually means the operation APPLIED and only the client-side parse failed.'
      : 'The read returned data the client could not validate.'),
    {
      ...(toolName !== undefined ? { tool: toolName } : {}),
      status: 200,
      error_type: 'SdkResponseShapeError',
      code: 'SDK_RESPONSE_SHAPE_MISMATCH',
      applied: isWrite ? 'unknown' : false,
      terminal: true,
      suggestion: isWrite
        ? 'Do NOT retry the write blind. Read the current state first (for rehome_project: get_project with `org: "<target_org>"`; a hit means the move landed). ' +
          'Then report the SDK/server version mismatch to the operator — this is a client/server schema drift, not something to work around.'
        : 'Report the SDK/server schema drift to the operator; retrying the read will fail the same way.',
      // P17 (explorer run #11): this slice bypassed sanitizeErrorMessage. Zod 4
      // response-shape messages can quote response VALUES; redact before exposing.
      schema_issues: redactCredentials(error.message).slice(0, 2000),
    },
  );
}

/**
 * Map a Zod validation error to an MCP tool response.
 * Shows all validation errors with field paths and expected values.
 *
 * @param error - A ZodError from parsing tool input (anything else falls through to mapSdkErrorToMcp)
 * @param toolName - The MCP tool whose input failed; echoed as `tool`
 * @returns An `isError: true` response listing each failing field path and its message
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
