import { DiscoveryPageShape, useDiscoveryPage } from '../utils/discovery-page.js';
/**
 * search_issues tool
 *
 * Search issues across projects with relevance ranking.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import {
  IssueStatusFilterSchema,
  PriorityFilterSchema,
  SeveritySchema,
  FailureDomainSchema,
  type McpServerToolRegistration,
} from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const SearchIssuesInputSchema = z.object({
  ...DiscoveryPageShape,
  sort_by: z.enum(['createdAt', 'priority']).optional(),
  sort_order: z.enum(['asc', 'desc']).optional(),
  offset: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  query: z.string().min(1).max(500),
  projects: z.array(z.string()).optional(),
  agents: z.array(z.string()).optional(),
  status: IssueStatusFilterSchema.default('all'),
  priority: PriorityFilterSchema.default('all'),
  severities: z.array(SeveritySchema).optional(),
  failure_domains: z.array(FailureDomainSchema).optional(),
  limit: z.number().int().min(1).max(100).optional(),
});

export type SearchIssuesInput = z.infer<typeof SearchIssuesInputSchema>;

/**
 * Register search_issues tool
 */
export function registerSearchIssuesTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'search_issues',
    'Search issues across projects with relevance ranking. Filter by project, agent, status, and priority.',
    SearchIssuesInputSchema.shape,
    createToolHandler(SearchIssuesInputSchema, (n, scope) => useDiscoveryPage(n, ['offset']) ? opsClient.discovery.searchIssues(n, scope) : opsClient.issues.search({ ...n, limit: n.limit ?? 20 }, scope), { toolName: 'search_issues' })
  );
}
