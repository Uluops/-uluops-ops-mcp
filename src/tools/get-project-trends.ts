/**
 * get_project_trends tool
 *
 * Get issue trends over time for a project.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const GetProjectTrendsInputSchema = z.object({
  project: z.string().min(1).describe('Project name or UUID'),
  days: z
    .number()
    .int()
    .min(1)
    .max(365)
    .optional()
    .describe('Number of days to include (1-365, default 30)'),
});

export type GetProjectTrendsInput = z.infer<typeof GetProjectTrendsInputSchema>;

/**
 * Register get_project_trends tool
 */
export function registerGetProjectTrendsTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'get_project_trends',
    'Get issue trends over time for a project.',
    GetProjectTrendsInputSchema.shape,
    createToolHandler(GetProjectTrendsInputSchema, (n) => {
      const { project, ...query } = n;
      return opsClient.projects.getTrends(project as string, query);
    }, { toolName: 'get_project_trends' })
  );
}
