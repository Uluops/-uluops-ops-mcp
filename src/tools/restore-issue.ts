/**
 * restore_issue tool
 *
 * Restore a soft-deleted issue.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const RestoreIssueInputSchema = z.object({
  issue_id: z.string().uuid().describe('Issue UUID to restore'),
});

export type RestoreIssueInput = z.infer<typeof RestoreIssueInputSchema>;

/**
 * Register restore_issue tool
 */
export function registerRestoreIssueTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'restore_issue',
    'Restore a soft-deleted issue.',
    RestoreIssueInputSchema.shape,
    createToolHandler(RestoreIssueInputSchema, (n) =>
      opsClient.issues.restore(n['issueId'] as string),
      { toolName: 'restore_issue' }
    )
  );
}
