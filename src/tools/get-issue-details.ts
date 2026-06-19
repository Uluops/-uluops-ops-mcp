/**
 * get_issue_details tool
 *
 * Get complete issue details. The backend `/issues/:id/details` endpoint
 * returns a fixed envelope { issue, occurrences, notes, history } — there are
 * no server-side toggles to suppress sections and no "related issues" field.
 * The tool therefore takes only the issue id.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const GetIssueDetailsInputSchema = z.object({
  id: z.string().uuid(),
});

export type GetIssueDetailsInput = z.infer<typeof GetIssueDetailsInputSchema>;

/**
 * Register get_issue_details tool
 */
export function registerGetIssueDetailsTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'get_issue_details',
    'Get complete issue details: the issue plus all of its occurrences, notes, and status/regression history.',
    GetIssueDetailsInputSchema.shape,
    createToolHandler(GetIssueDetailsInputSchema, (n) =>
      opsClient.issues.getDetails(n['id'] as string),
      { toolName: 'get_issue_details' }
    )
  );
}
