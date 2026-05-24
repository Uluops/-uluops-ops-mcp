/**
 * undo_issue_status tool
 *
 * Undo the last status change on an issue.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const UndoIssueStatusInputSchema = z.object({
  issue_id: z.string().uuid().describe('Issue UUID'),
});

export type UndoIssueStatusInput = z.infer<typeof UndoIssueStatusInputSchema>;

/**
 * Register undo_issue_status tool
 */
export function registerUndoIssueStatusTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'undo_issue_status',
    'Undo the last status change on an issue.',
    UndoIssueStatusInputSchema.shape,
    createToolHandler(UndoIssueStatusInputSchema, (n) =>
      opsClient.issues.undoLastChange(n['issueId'] as string),
      { toolName: 'undo_issue_status' }
    )
  );
}
