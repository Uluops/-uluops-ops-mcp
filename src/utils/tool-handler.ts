/**
 * Tool handler factory
 *
 * Creates standardized MCP tool handlers with consistent error handling.
 * Eliminates boilerplate across tool implementations.
 */

import { z } from 'zod';
import { resolveWorkspaceOrg, type OrgScopedOptions } from '@uluops/ops-sdk';
import { mapSdkErrorToMcp, mapSdkResponseShapeErrorToMcp, mapZodErrorToMcp, redactCredentials } from '../client/sdk-error-mapper.js';
import { ORG_ARG_NAME } from './org-scope.js';
import { normalizeKeys } from './normalize-keys.js';
import { createSuccessResponse, type McpToolResponse } from '../types/index.js';
import { emitOrgCall, formatOrgEcho, getOrgAllowlist, isOrgAllowed, UNTRUSTED_CONTENT_NOTICE, type OrgCallRecord } from './org-call-log.js';


/**
 * Coerce string values to numbers for fields that the Zod schema expects as numeric.
 * MCP JSON-RPC sometimes serializes numeric parameters as strings (e.g., "50" instead of 50).
 * This runs before Zod validation to prevent spurious type errors at the boundary.
 */
function coerceNumericFields(args: unknown, schema: z.ZodSchema): unknown {
  if (typeof args !== 'object' || args === null) return args;
  if (!(schema instanceof z.ZodObject)) return args;

  const shape: Record<string, z.ZodTypeAny> = schema.shape;
  const obj = { ...(args as Record<string, unknown>) };

  for (const [key, fieldSchema] of Object.entries(shape)) {
    if (key in obj && typeof obj[key] === 'string') {
      if (isNumericSchema(fieldSchema)) {
        const num = Number(obj[key]);
        // Number.isFinite rejects NaN, Infinity, and -Infinity
        if (Number.isFinite(num)) {
          obj[key] = num;
        }
      }
    }
  }
  return obj;
}

/** Check if a Zod schema (possibly wrapped in optional/nullable/default) expects a number. */
function isNumericSchema(schema: z.ZodTypeAny): boolean {
  if (schema instanceof z.ZodNumber) return true;
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return isNumericSchema(schema.unwrap());
  }
  if (schema instanceof z.ZodDefault) {
    return isNumericSchema(schema.removeDefault());
  }
  return false;
}

/**
 * Sentinel used by preProcess hooks to short-circuit the handler with a
 * tool response (typically an error). Discriminating on a dedicated symbol
 * avoids accidental collision with tool input schemas that may legitimately
 * contain a top-level `content` field.
 */
const SHORT_CIRCUIT = Symbol('mcp.tool.short-circuit');

type ShortCircuit = McpToolResponse & { readonly [SHORT_CIRCUIT]: true };

/**
 * Construct a short-circuit response from a preProcess hook. The returned
 * value is a normal MCP tool response plus a non-enumerable marker symbol
 * that createToolHandler recognises.
 */
export function shortCircuit(response: McpToolResponse): ShortCircuit {
  return Object.defineProperty({ ...response }, SHORT_CIRCUIT, {
    value: true,
    enumerable: false,
    writable: false,
    configurable: false,
  }) as ShortCircuit;
}

function isShortCircuit(value: unknown): value is ShortCircuit {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { [SHORT_CIRCUIT]?: unknown })[SHORT_CIRCUIT] === true
  );
}

/**
 * Creates a standardized tool handler with Zod validation, key normalization,
 * and SDK error mapping.
 *
 * All handlers follow the same flow:
 * 1. Parse input with Zod schema (validates snake_case MCP input)
 * 2. Normalize keys from snake_case → camelCase for SDK
 * 3. Call SDK method with normalized input
 * 4. Return success response or mapped error
 *
 * @param schema - Zod schema for input validation (snake_case fields)
 * @param sdkCall - Function that receives the normalized (camelCase) input as
 *   `Record<string, unknown>` and the per-call org scope, and calls the SDK.
 *   Forward `scope` as the operation's trailing `options` — that is how `org`
 *   becomes the X-Org-Slug header. The runtime contract is upheld by Zod
 *   validation immediately upstream.
 * @returns MCP-compatible handler function
 *
 * @example
 * ```typescript
 * server.tool(
 *   'query_issues',
 *   'Query issues...',
 *   QueryIssuesInputSchema.shape,
 *   createToolHandler(QueryIssuesInputSchema, (n) =>
 *     opsClient.projects.listIssues(n['project'] as string, n)
 *   )
 * );
 * ```
 */
export function createToolHandler<TInput>(
  schema: z.ZodSchema<TInput>,
  // SAFETY: `normalized` is `any` because normalizeKeys performs a runtime
  // snake_case → camelCase key transformation that TypeScript cannot track
  // statically. Zod validation immediately upstream enforces the shape; the
  // SDK call signatures further constrain field types. createToolHandler is
  // an internal utility (not re-exported from src/index.ts), so this `any`
  // does not leak to the public npm surface. (no-explicit-any is disabled for
  // this file via the eslint.config.js file-pattern override.)
  sdkCall: (normalized: any, scope: OrgScopedOptions | undefined) => Promise<unknown>,
  options?: {
    /** Tool name for error context. Included in error responses to help MCP clients diagnose failures. */
    toolName?: string;
    /**
     * Transform parsed input before normalization. Return the value produced
     * by `shortCircuit(response)` to bypass the SDK call and return `response`
     * directly to the caller.
     */
    preProcess?: (input: TInput) => TInput | ShortCircuit;
    /**
     * For tools whose BODY names a second org (rehome_project's `target_org`):
     * read it from the normalized input. When present, the target is (a)
     * checked against `ULUOPS_ORG_ALLOW` before the SDK call — D15 bounds
     * every org this server may touch, and before the 0.19.0 pre-publish review it bounded the source
     * only (anxiety-reader F3) — and (b) recorded on the per-call org record
     * and the echo, so the destination of a move is in the log and beside the
     * result, not only inside the SDK payload (F5).
     */
    targetOrgOf?: (normalized: Record<string, unknown>) => string | undefined;
  }
): (args: unknown) => Promise<McpToolResponse> {
  const toolName = options?.toolName;

  return async (args: unknown): Promise<McpToolResponse> => {
    try {
      // Org routing (spec §3.3 / D13): lift `org` out of the RAW args before Zod
      // sees them — a tool's schema does not declare it, Zod strips unknown keys,
      // and the API's non-strict body schemas would strip a leaked one silently.
      // Resolution goes through the SDK (explicit > nearest .uluops.json above
      // the session's launch directory > ULUOPS_ORG_SLUG > personal); a malformed
      // value or a forbidden workspace file throws InputValidationError, which
      // the mapper surfaces as a 400 — loud, never a silently wrong org.
      const { [ORG_ARG_NAME]: rawOrg, ...bodyArgs } =
        (typeof args === 'object' && args !== null ? args : {}) as Record<string, unknown>;
      const resolved = resolveWorkspaceOrg({
        // A non-string `org` (number, object) is passed as '' so the resolver's
        // slug check rejects it with a named InputValidationError — never coerced.
        explicit: typeof rawOrg === 'string' ? rawOrg : rawOrg === undefined ? undefined : '',
        cwd: process.cwd(),
        env: process.env,
      });
      // `undefined` (not `{}`) when personal: nothing on the wire, and the SDK
      // call receives exactly what a caller with no org would have passed.
      const scope: OrgScopedOptions | undefined = resolved.org !== undefined ? { org: resolved.org } : undefined;
      const orgRecord: OrgCallRecord = {
        tool: toolName ?? 'unknown',
        org: resolved.org ?? 'personal',
        orgSource: resolved.source,
        ...(resolved.path !== undefined ? { orgFile: resolved.path } : {}),
      };
      // D15: refuse BEFORE the SDK call when the org is outside the allowlist.
      // Terminal and not applied — and the suggestion does not say "retry
      // without org", because for an allowlist refusal the right move is to
      // stop and tell the user, not to file the work personally.
      if (!isOrgAllowed(resolved.org)) {
        const allowed = getOrgAllowlist() ?? [];
        emitOrgCall({ ...orgRecord, refused: 'not-allowed' });
        return {
          content: [{ type: 'text', text: JSON.stringify({
            error: `Org \`${String(resolved.org)}\` is not in this server's allowlist (ULUOPS_ORG_ALLOW: ${allowed.join(', ') || '(empty)'}). Nothing was applied.`,
            ...(toolName !== undefined ? { tool: toolName } : {}),
            code: 'ORG_NOT_ALLOWED',
            status: 403,
            terminal: true,
            applied: false,
            org: resolved.org,
            org_source: resolved.source,
            allowed_orgs: allowed,
            suggestion:
              'Terminal — this MCP server may only act in the orgs its operator listed. Do NOT retry with a different org ' +
              'and do NOT retry without `org`. Tell the user which org was named and where it came from; the operator ' +
              'adds it to ULUOPS_ORG_ALLOW in the server registration if it belongs there.',
          }) }],
          isError: true,
        };
      }
      emitOrgCall(orgRecord);

      let input = schema.parse(coerceNumericFields(bodyArgs, schema));

      if (options?.preProcess) {
        const preResult = options.preProcess(input);
        if (isShortCircuit(preResult)) {
          return preResult;
        }
        input = preResult;
      }

      const normalized = normalizeKeys(input) as Record<string, unknown>;
      const targetOrg = options?.targetOrgOf?.(normalized);
      if (targetOrg !== undefined) {
        orgRecord.targetOrg = targetOrg;
        if (!isOrgAllowed(targetOrg)) {
          const allowed = getOrgAllowlist() ?? [];
          emitOrgCall({ ...orgRecord, refused: 'target-not-allowed' });
          return {
            content: [{ type: 'text', text: JSON.stringify({
              error: `Target org \`${targetOrg}\` is not in this server's allowlist (ULUOPS_ORG_ALLOW: ${allowed.join(', ') || '(empty)'}). Nothing was applied.`,
              ...(toolName !== undefined ? { tool: toolName } : {}),
              code: 'ORG_NOT_ALLOWED',
              status: 403,
              terminal: true,
              applied: false,
              org: resolved.org ?? 'personal',
              org_source: resolved.source,
              target_org: targetOrg,
              allowed_orgs: allowed,
              suggestion:
                'Terminal — this MCP server may only move projects INTO orgs its operator listed, the same bound it applies to `org`. ' +
                'Do NOT retry with a different target_org and do NOT drop `org`. Tell the user which target was named; the operator ' +
                'adds it to ULUOPS_ORG_ALLOW in the server registration if it belongs there.',
            }) }],
            isError: true,
          };
        }
      }
      const result = await sdkCall(normalized, scope);
      const response = createSuccessResponse(result);
      // Echo where it landed as a SECOND content block: the first block stays
      // the SDK payload byte-for-byte (consumers parse it), and the model sees
      // the destination beside every result, reads included (D12 — a read
      // against the wrong org is silently wrong data).
      response.content.push({ type: 'text', text: formatOrgEcho(orgRecord) });
      // D16: the untrusted-content notice, last, on every success.
      response.content.push({ type: 'text', text: UNTRUSTED_CONTENT_NOTICE });
      return response;
    } catch (error) {
      // Log errors to stderr for debugging (MCP transport uses stdout).
      // Redacted: this line is written BEFORE the mapper runs, so until 0.20.2
      // it carried the raw message — the one channel with no redaction at all
      // (explorer run #11 P16). Stderr is the host's log, not the model's
      // context, but a host that captures it persists whatever was here.
      const errorMsg = redactCredentials(error instanceof Error ? error.message : String(error));
      const errorType = error instanceof z.ZodError ? 'validation' :
        error instanceof Error ? error.constructor.name : 'unknown';
      process.stderr.write(
        `[mcp-tool-error] tool=${toolName ?? 'unknown'} type=${errorType} message=${errorMsg.slice(0, 200)}\n`
      );

      if (error instanceof z.ZodError) {
        return mapZodErrorToMcp(error, toolName);
      }
      // A ZodError that is NOT ours: ops-sdk bundles zod 4 and parses every
      // response with it, so an SDK response-schema failure is a ZodError this
      // file's zod-3 `instanceof` does not recognise. Before the 0.19.0 pre-publish review it fell to
      // the bare-Error branch — no status, no `applied` — AFTER a write had
      // landed (code-auditor, 2026-09-15, reproduced). Name-match it and say
      // what it is: the server answered, the SDK could not read the answer.
      if (error instanceof Error && error.name === 'ZodError') {
        return mapSdkResponseShapeErrorToMcp(error, toolName);
      }
      return mapSdkErrorToMcp(error, toolName);
    }
  };
}
