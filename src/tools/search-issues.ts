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
  query: z.string().min(1).max(500),
  projects: z.array(z.string()).optional(),
  agents: z.array(z.string()).optional(),
  status: IssueStatusFilterSchema.default('all'),
  priority: PriorityFilterSchema.default('all'),
  severities: z.array(SeveritySchema).optional(),
  failure_domains: z.array(FailureDomainSchema).optional(),
  limit: z.number().int().positive().default(20),
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
    createToolHandler(SearchIssuesInputSchema, (n) => opsClient.issues.search(n), { toolName: 'search_issues' })
  );
}
