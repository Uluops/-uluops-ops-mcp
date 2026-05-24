/**
 * get_project_summary tool
 *
 * Get project overview and validation trends.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const GetProjectSummaryInputSchema = z.object({
  project: z.string().min(1),
});

export type GetProjectSummaryInput = z.infer<typeof GetProjectSummaryInputSchema>;

/**
 * Register get_project_summary tool
 */
export function registerGetProjectSummaryTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'get_project_summary',
    'Get current validation status summary including workflows, issues, and agent trends.',
    GetProjectSummaryInputSchema.shape,
    createToolHandler(GetProjectSummaryInputSchema, (n) =>
      opsClient.projects.getSummary(n['project'] as string),
      { toolName: 'get_project_summary' }
    )
  );
}
