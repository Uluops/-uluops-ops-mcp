/**
 * rehome_project tool (project-org-routing-and-rehome spec §4.1, D14)
 *
 * Move a project — and its whole history — into another org. Thin wrapper
 * around `client.projects.rehome()`: validation, the strict body, and the
 * typed refusals live in the SDK; this handler is passthrough + mapping.
 *
 * The one thing a caller must get right, and the description says it twice:
 * the generic `org` argument names the SOURCE (where the project is NOW —
 * the org context the API looks the project up in), and `target_org` names
 * the destination. Omitting `org` for a work-org project does not "find it
 * anyway": the API looks in the caller's personal org and answers 404.
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
  target_org: z.string().min(1).max(100)
    .describe('Slug of the org the project should live in after the move. You must be admin or owner there; a personal org only if it is yours.'),
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
    'Refusals name their reason: same_org (already there), name_collision / soft_deleted_conflict / rehomed_away_conflict (the name is taken in the target), ' +
    'export_in_progress, moved_during_request (retry once), PROJECT_LIMIT (target at its cap). Do NOT retry a 403 without `org`.',
    RehomeProjectInputSchema.shape,
    createToolHandler(RehomeProjectInputSchema, (n, scope) =>
      opsClient.projects.rehome(
        n['project'] as string,
        { targetOrg: n['targetOrg'] as string, ...(n['reason'] !== undefined ? { reason: n['reason'] as string } : {}) },
        scope,
      ),
    { toolName: 'rehome_project' })
  );
}
