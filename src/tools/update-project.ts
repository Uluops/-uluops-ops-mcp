/**
 * update_project tool
 *
 * Update a project's name.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const UpdateProjectInputSchema = z.object({
  project: z.string().min(1).describe('Project name or UUID to update'),
  name: z.string().min(1).max(200).describe('New project name'),
});

export type UpdateProjectInput = z.infer<typeof UpdateProjectInputSchema>;

/**
 * Register update_project tool
 */
export function registerUpdateProjectTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'update_project',
    'Update a project name. Identifies the project by current name or UUID, then applies the new name.',
    UpdateProjectInputSchema.shape,
    createToolHandler(UpdateProjectInputSchema, (n) => {
      const { project, ...input } = n;
      return opsClient.projects.update(project as string, input);
    }, { toolName: 'update_project' })
  );
}
