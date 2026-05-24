/**
 * create_project tool
 *
 * Create a new project.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const CreateProjectInputSchema = z.object({
  name: z.string().min(1).max(200).describe('Project name (1-200 characters)'),
});

export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;

/**
 * Register create_project tool
 */
export function registerCreateProjectTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'create_project',
    'Create a new project for tracking validation runs, issues, and analytics. Returns the created project with its UUID.',
    CreateProjectInputSchema.shape,
    createToolHandler(CreateProjectInputSchema, (n) => opsClient.projects.create(n), { toolName: 'create_project' })
  );
}
