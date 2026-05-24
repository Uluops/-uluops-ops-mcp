/**
 * delete_project tool
 *
 * CRITICAL: Permanently delete all project data.
 * Requires two-step confirmation for safety.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import { createErrorResponse, type McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const DeleteProjectInputSchema = z.object({
  project: z.string().min(1),
  confirm: z.boolean(),
  confirmation_phrase: z.string(),
});

export type DeleteProjectInput = z.infer<typeof DeleteProjectInputSchema>;

/**
 * Register delete_project tool
 */
export function registerDeleteProjectTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'delete_project',
    'CRITICAL: Permanently delete ALL data for a project (runs, issues, occurrences). ' +
      'Requires two-step confirmation: set confirm=true AND confirmation_phrase to exact project name. ' +
      'THIS CANNOT BE UNDONE.',
    DeleteProjectInputSchema.shape,
    createToolHandler(
      DeleteProjectInputSchema,
      (n) => opsClient.projects.delete(n['project'], n),
      {
        toolName: 'delete_project',
        preProcess: (input) => {
          if (!input.confirm) {
            return createErrorResponse(
              'Deletion requires confirm=true. This action is irreversible.'
            );
          }
          if (input.confirmation_phrase !== input.project) {
            return createErrorResponse(
              `Confirmation phrase must exactly match project name "${input.project}"`
            );
          }
          return input;
        },
      }
    )
  );
}
