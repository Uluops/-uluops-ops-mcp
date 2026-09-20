/**
 * bulk_update_status tool
 */

import { z } from 'zod';
import { STATUS_REASON_MAX_LENGTH, type OpsClient } from '@uluops/ops-sdk';
import { IssueStatusSchema, type McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

const BulkStatusUpdateSchema = z
  .object({
    issue_id: z.string().uuid().optional().describe('Issue UUID (preferred)'),
    id: z.string().uuid().optional().describe('Issue UUID (alias for issue_id)'),
    status: IssueStatusSchema,
    reason: z.string().max(STATUS_REASON_MAX_LENGTH).optional(),
  })
  .refine(
    (data) => (data.issue_id ?? data.id) !== undefined,
    { message: 'Either issue_id or id must be provided' }
  );

export const BulkUpdateStatusInputSchema = z.object({
  // Informational only. The handler never read this field and the SDK's
  // bulkUpdateStatus(updates, scope) has no project parameter — issues are
  // addressed by UUID and may span every project in the org. Until 0.20.2 the
  // schema REQUIRED it, which advertised a scope the call did not enforce
  // (circumvention-forecaster run #9 A2 sibling, falsified run #12). Kept
  // optional so callers that send it keep working; do not read it as a bound.
  project: z.string().min(1).optional().describe(
    'Informational label for the caller\'s own bookkeeping. NOT a scope: updates are matched by issue UUID across the whole org, whatever this says.',
  ),
  updates: z.array(BulkStatusUpdateSchema).min(1).max(100),
});

export type BulkUpdateStatusInput = z.infer<typeof BulkUpdateStatusInputSchema>;

export function registerBulkUpdateStatusTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'bulk_update_status',
    'Bulk update multiple issue statuses in a single transaction, addressed by issue UUID across the org (the `project` field is informational, not a scope). Records status history for each change.',
    BulkUpdateStatusInputSchema.shape,
    createToolHandler(BulkUpdateStatusInputSchema, (n, scope) =>
      opsClient.issues.bulkUpdateStatus(n['updates'], scope),
      { toolName: 'bulk_update_status' }
    )
  );
}
