/**
 * soft_delete_issue tool
 *
 * Soft-delete an active issue. Reversible via restore_issue.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const SoftDeleteIssueInputSchema = z.object({
  issue_id: z.string().uuid().describe('Issue UUID to soft-delete'),
});

export type SoftDeleteIssueInput = z.infer<typeof SoftDeleteIssueInputSchema>;

/**
 * Register soft_delete_issue tool
 */
export function registerSoftDeleteIssueTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'soft_delete_issue',
    'Soft-delete an active issue. Sets deleted_at; reversible via restore_issue.',
    SoftDeleteIssueInputSchema.shape,
    createToolHandler(SoftDeleteIssueInputSchema, (n) =>
      opsClient.issues.softDelete(n['issueId'] as string),
      { toolName: 'soft_delete_issue' }
    )
  );
}
