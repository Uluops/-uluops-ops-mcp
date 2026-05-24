/**
 * soft_delete_project tool
 *
 * Soft delete a project (can be restored later).
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const SoftDeleteProjectInputSchema = z.object({
  project: z.string().min(1).describe('Project name or UUID to soft-delete'),
  confirm: z.boolean().describe('Must be true to confirm deletion'),
  confirmation_phrase: z.string().min(1).describe('Must match the exact project name'),
});

export type SoftDeleteProjectInput = z.infer<typeof SoftDeleteProjectInputSchema>;

/**
 * Register soft_delete_project tool
 */
export function registerSoftDeleteProjectTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'soft_delete_project',
    'Soft delete a project (can be restored later). Requires confirmation.',
    SoftDeleteProjectInputSchema.shape,
    createToolHandler(SoftDeleteProjectInputSchema, (n) => {
      const { project, ...input } = n;
      return opsClient.projects.softDelete(project as string, input);
    }, { toolName: 'soft_delete_project' })
  );
}
