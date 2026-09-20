/**
 * Shared response helpers for MCP resources
 *
 * Provides consistent response formatting across all resource handlers.
 */

import type { ResourceResponse } from '../types/index.js';
import { emitOrgCall, UNTRUSTED_CONTENT_NOTICE } from '../utils/org-call-log.js';

/**
 * Where a resource read lands, in the same record the tool path emits.
 *
 * Resources are registered on the raw server, not through `withOrgArgument` /
 * `createToolHandler`, so until 0.20.2 a `resources/read` produced no
 * provenance line at all — the one ingress the D15/D16 seam did not cover
 * (circumvention-forecaster run #9 A8, explorer run #11 P2/P31,
 * security-explorer run #10 Q1 — the one finding all three reached; falsified
 * run #12, SURVIVES). A resource carries no `org` argument and the OpsClient
 * is constructed without one, so every resource read lands on the personal
 * org by construction; the record says so rather than leaving the line absent.
 */
export function emitResourceRead(uri: string): void {
  emitOrgCall({ tool: `resources/read ${uri}`, org: 'personal', orgSource: 'personal' });
}

/**
 * Create a resource response with JSON content.
 *
 * The first entry is the payload byte-for-byte (consumers parse it). The
 * second is the D16 untrusted-content notice — the same block the tool path
 * appends last on every success (tool-handler.ts). Tracker-user-authored text
 * (project names, descriptions) comes back through `validation://projects`
 * exactly as it does through `list_projects`; before 0.20.2 only the tool path
 * carried the notice. Same text, so a consumer that already recognises it on
 * tool results recognises it here.
 */
export function createResourceResponse(uri: string, data: unknown): ResourceResponse {
  emitResourceRead(uri);
  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(data, null, 2),
      },
      {
        uri,
        mimeType: 'text/plain',
        text: UNTRUSTED_CONTENT_NOTICE,
      },
    ],
  };
}

/**
 * Create an error resource response
 */
export function createErrorResourceResponse(uri: string, error: string): ResourceResponse {
  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify({ error }),
      },
    ],
  };
}
