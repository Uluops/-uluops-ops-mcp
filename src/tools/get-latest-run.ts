/**
 * get_latest_run tool
 *
 * Get the latest run for a project.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const GetLatestRunInputSchema = z.object({
  project: z.string().min(1).describe('Project name or UUID'),
  workflow_type: z.string().optional().describe('Filter by workflow type'),
});

export type GetLatestRunInput = z.infer<typeof GetLatestRunInputSchema>;

/**
 * Register get_latest_run tool
 */
export function registerGetLatestRunTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'get_latest_run',
    'Get the latest run for a project.',
    GetLatestRunInputSchema.shape,
    createToolHandler(GetLatestRunInputSchema, (n) =>
      opsClient.runs.getLatest(n['project'] as string, n['workflowType'] as string | undefined),
      { toolName: 'get_latest_run' }
    )
  );
}
