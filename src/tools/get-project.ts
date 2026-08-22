/**
 * get_project tool
 *
 * Get a single project by ID or name.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const GetProjectInputSchema = z.object({
  project: z.string().min(1).describe('Project name or UUID'),
});

export type GetProjectInput = z.infer<typeof GetProjectInputSchema>;

/**
 * Register get_project tool
 */
export function registerGetProjectTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'get_project',
    'Get a single project by ID or name. Returns project metadata only: id, name, domain, owner, created/updated timestamps. For run counts, latest run, and issue statistics use get_project_summary.',
    GetProjectInputSchema.shape,
    createToolHandler(GetProjectInputSchema, (n) =>
      opsClient.projects.get(n['project'] as string),
      { toolName: 'get_project' }
    )
  );
}
