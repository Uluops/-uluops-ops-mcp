/**
 * get_issue_details tool
 *
 * Get complete issue details including all occurrences, lifecycle events, and related issues.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const GetIssueDetailsInputSchema = z.object({
  id: z.string().uuid(),
  include_occurrences: z.boolean().default(true),
  include_related: z.boolean().default(false),
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
    'Get complete issue details including all occurrences, lifecycle events, regression history, and optionally related issues.',
    GetIssueDetailsInputSchema.shape,
    createToolHandler(GetIssueDetailsInputSchema, (n) =>
      opsClient.issues.getDetails(n['id'] as string),
      { toolName: 'get_issue_details' }
    )
  );
}
