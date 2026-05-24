/**
 * list_projects tool
 *
 * List all active projects.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const ListProjectsInputSchema = z.object({});

export type ListProjectsInput = z.infer<typeof ListProjectsInputSchema>;

/**
 * Register list_projects tool
 */
export function registerListProjectsTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'list_projects',
    'List all active projects (excludes soft-deleted).',
    ListProjectsInputSchema.shape,
    createToolHandler(ListProjectsInputSchema, () => opsClient.projects.list(), { toolName: 'list_projects' })
  );
}
