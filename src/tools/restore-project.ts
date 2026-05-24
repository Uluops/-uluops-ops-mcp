/**
 * restore_project tool
 *
 * Restore a soft-deleted project.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const RestoreProjectInputSchema = z.object({
  project: z.string().min(1).describe('Project name or UUID to restore'),
});

export type RestoreProjectInput = z.infer<typeof RestoreProjectInputSchema>;

/**
 * Register restore_project tool
 */
export function registerRestoreProjectTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'restore_project',
    'Restore a soft-deleted project. Reactivates the project and all its associated runs, issues, and analytics data.',
    RestoreProjectInputSchema.shape,
    createToolHandler(RestoreProjectInputSchema, (n) =>
      opsClient.projects.restore(n['project'] as string),
      { toolName: 'restore_project' }
    )
  );
}
