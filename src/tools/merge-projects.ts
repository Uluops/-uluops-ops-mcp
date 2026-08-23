/**
 * merge_projects tool (merge-projects spec v0.3.4)
 *
 * Thin wrapper around `client.projects.mergeProjects()` — HTTP marshalling,
 * typed-error translation, and client-side validation all live in the SDK.
 * This handler is parameter passthrough + SDK-error → MCP-error mapping only.
 *
 * Operator guidance: ALWAYS dry_run first. The merge is durable (no undo);
 * the dry-run response reports exactly what the real call would move.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import { type McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const MergeProjectsInputSchema = z.object({
  source: z.string().min(1).max(200)
    .describe('Source project name or UUID — consumed by the merge'),
  target: z.string().min(1).max(200)
    .describe('Target project name or UUID — survives and absorbs the source'),
  dry_run: z.boolean().default(false)
    .describe('Preview only: the merge transaction is rolled back. Run this first.'),
  delete_source: z.boolean().default(true)
    .describe('Soft-delete the source after the merge (false keeps it as an empty project, reserving the name)'),
  confirm_cross_org: z.boolean().default(false)
    .describe('Required true for system-actor cross-org merges; no-op for human callers'),
});

export type MergeProjectsInput = z.infer<typeof MergeProjectsInputSchema>;

export function registerMergeProjectsTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'merge_projects',
    'Merge one project into another: runs and issues are re-keyed into the target, colliding issues deduplicated by fingerprint, and the source soft-deleted. Pairwise only — chain calls to consolidate several duplicates. Use dry_run:true first to preview. On 409 MERGE_LOCK_UNAVAILABLE, retry after the hinted delay; this tool does not auto-retry.',
    MergeProjectsInputSchema.shape,
    createToolHandler(MergeProjectsInputSchema, (n) =>
      opsClient.projects.mergeProjects(n),
    { toolName: 'merge_projects' })
  );
}
