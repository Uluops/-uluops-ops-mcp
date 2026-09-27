import { DiscoveryPageShape, useDiscoveryPage } from '../utils/discovery-page.js';
/**
 * list_projects tool
 *
 * List all active projects.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const ListProjectsInputSchema = z.object({
  ...DiscoveryPageShape,
  search: z.string().max(200).optional().describe('Case-insensitive literal substring of the project name/slug; whitespace means no filter.'),
  sort_by: z.enum(['name', 'createdAt']).optional(),
  sort_order: z.enum(['asc', 'desc']).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
});

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
    createToolHandler(ListProjectsInputSchema, (n, scope) => useDiscoveryPage(n, ['limit', 'offset']) ? opsClient.discovery.listProjects(n, scope) : opsClient.projects.list(scope), { toolName: 'list_projects' })
  );
}
