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
  project: z.string().min(1),
  updates: z.array(BulkStatusUpdateSchema).min(1).max(100),
});

export type BulkUpdateStatusInput = z.infer<typeof BulkUpdateStatusInputSchema>;

export function registerBulkUpdateStatusTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'bulk_update_status',
    'Bulk update multiple issue statuses in a single transaction. Records status history for each change.',
    BulkUpdateStatusInputSchema.shape,
    createToolHandler(BulkUpdateStatusInputSchema, (n) =>
      opsClient.issues.bulkUpdateStatus(n['updates']),
      { toolName: 'bulk_update_status' }
    )
  );
}
