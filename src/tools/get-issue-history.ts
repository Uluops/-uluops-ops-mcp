/**
 * get_issue_history tool
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const GetIssueHistoryInputSchema = z.object({
  issue_id: z.string().uuid(),
  include_diffs: z.boolean().default(true),
});

export type GetIssueHistoryInput = z.infer<typeof GetIssueHistoryInputSchema>;

export function registerGetIssueHistoryTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'get_issue_history',
    'Get the full history of an issue including all occurrences, changes between runs, and any notes.',
    GetIssueHistoryInputSchema.shape,
    createToolHandler(GetIssueHistoryInputSchema, (n) =>
      opsClient.issues.getHistory(n['issueId'] as string),
      { toolName: 'get_issue_history' }
    )
  );
}
