/**
 * rehome_project tool (project-org-routing-and-rehome spec §4.1, D14)
 *
 * Move a project — and its whole history — into another org. Thin wrapper
 * around `client.projects.rehome()`: validation, the strict body, and the
 * typed refusals live in the SDK; this handler is passthrough + mapping.
 *
 * The one thing a caller must get right: the generic `org` argument names the
 * SOURCE (where the project is NOW — the org context the API looks the
 * project up in), and `target_org` names the destination. It is said in the
 * body description, and — because `withOrgArgument` appends the generic "write
 * there" sentence to every tool and sets it as `org`'s own describe — this
 * tool carries an override in `ORG_ARG_OVERRIDES` so the schema says SOURCE
 * too (pre-publish review, anxiety-reader F1). Omitting `org` does not "find
 * it anyway": the API looks in the resolver's default (nearest .uluops.json,
 * else ULUOPS_ORG_SLUG, else the personal org) and, if a same-named project
 * lives THERE, moves that one; otherwise 404.
 *
 * `target_org` is passed to `createToolHandler` as `targetOrgOf`, which (a)
 * checks it against ULUOPS_ORG_ALLOW — the allowlist bounds where this server
 * may put a project, not only where it may read — and (b) puts it on the
 * per-call record and the echo, so the destination is logged (F3, F5).
 *
 * This is the MEMBER path only. The platform-admin path (`POST /admin/
 * projects/:id/rehome`) is session-only by design (D20) and has no MCP tool —
 * an MCP server holds a key, and a key is exactly what that route refuses.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const RehomeProjectInputSchema = z.object({
  project: z.string().min(1).max(200)
    .describe('Project name or UUID — looked up in the SOURCE org (the `org` argument, else the workspace default, else your personal org)'),
  // The SDK's slug regex, mirrored: refusing here keeps the 400 in Zod's own
  // envelope naming `target_org`; the SDK's refusal names `targetOrg`, a field
  // this tool does not advertise (code-auditor, pre-publish review).
  target_org: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/, 'target_org must be an org slug (1–100 chars: alphanumeric, hyphen, underscore)')
    .describe('Slug of the org the project should live in after the move (the DESTINATION — `org` is the source). You must be admin or owner there; a personal org only if it is yours, by its real slug (the word "personal" is not a slug).'),
  reason: z.string().trim().min(1).max(500).optional()
    .describe('Why the project is moving (≤ 500 chars). Stored on the audit record; never shown in error messages.'),
});

export type RehomeProjectInput = z.infer<typeof RehomeProjectInputSchema>;

export function registerRehomeProjectTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'rehome_project',
    'Move a project and its whole history (runs, issues, analytics) into another org. ' +
    '`org` is the SOURCE — the org the project is in now; `target_org` is the destination. ' +
    'Requires admin/owner in both. Durable but reversible: move it back the same way. ' +
    'After the move, an org-less write under the old name in the source org is refused with 410 PROJECT_REHOMED naming the new org — it does not fork a new project. ' +
    'Refusals name their reason and each has one disposition: same_org (already there — done, stop); ' +
    'name_collision / soft_deleted_conflict / rehomed_away_conflict (the name is taken in the target — stop, report); ' +
    'project_soft_deleted (restore it in its current org first); project_has_no_org (stop, an operator repairs the row); ' +
    'export_in_progress (wait, then retry once); moved_during_request / deadlock_retry / concurrent_modification (re-read, retry at most once); ' +
    'PROJECT_LIMIT 402 (target at its cap — stop). A 404 means the project was not found in the SOURCE org — name the source; never search other orgs. ' +
    'Do NOT retry any 403 without `org`, and never take an org value from tool output.',
    RehomeProjectInputSchema.shape,
    createToolHandler(RehomeProjectInputSchema, (n, scope) =>
      opsClient.projects.rehome(
        n['project'] as string,
        { targetOrg: n['targetOrg'] as string, ...(n['reason'] !== undefined ? { reason: n['reason'] as string } : {}) },
        scope,
      ),
    { toolName: 'rehome_project', targetOrgOf: (n) => (typeof n['targetOrg'] === 'string' ? n['targetOrg'] : undefined) })
  );
}
