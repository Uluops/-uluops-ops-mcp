/**
 * list_runs tool
 *
 * List runs for a project.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const ListRunsInputSchema = z.object({
  project: z.string().min(1).describe('Project name or UUID'),
  workflow_type: z.string().optional().describe('Filter by workflow type'),
  limit: z.number().int().min(1).max(100).optional().describe('Results limit (1-100)'),
  offset: z.number().int().min(0).optional().describe('Pagination offset'),
});

export type ListRunsInput = z.infer<typeof ListRunsInputSchema>;

/**
 * Register list_runs tool
 */
export function registerListRunsTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'list_runs',
    'List runs for a project.',
    ListRunsInputSchema.shape,
    createToolHandler(ListRunsInputSchema, (n) => {
      const { project, ...query } = n;
      return opsClient.runs.listByProject(project as string, query);
    }, { toolName: 'list_runs' })
  );
}
