/**
 * query_issues tool
 *
 * Query validation issues with flexible filtering.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import {
  IssueStatusFilterSchema,
  PriorityFilterSchema,
  FailureDomainSchema,
  SeveritySchema,
  type McpServerToolRegistration,
} from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const QueryIssuesInputSchema = z.object({
  project: z.string().min(1),
  workflow_type: z.string().optional(),
  status: IssueStatusFilterSchema.default('open'),
  priority: PriorityFilterSchema.default('all'),
  agent: z.string().optional(),
  min_times_seen: z.number().int().positive().optional(),
  include_resolved: z.boolean().default(false),
  classified: z.boolean().optional(),
  failure_domain: FailureDomainSchema.optional(),
  failure_mode: z.string().optional(),
  severity: SeveritySchema.optional(),
  limit: z.number().int().positive().max(100).default(50),
});

export type QueryIssuesInput = z.infer<typeof QueryIssuesInputSchema>;

/**
 * Register query_issues tool
 */
export function registerQueryIssuesTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'query_issues',
    'Query issues by project, workflow, status, priority, agent, or persistence.',
    QueryIssuesInputSchema.shape,
    createToolHandler(QueryIssuesInputSchema, (n) => {
      const project = n.project as string;
      // Explicitly pick SDK-compatible fields to avoid passing extra MCP-only fields.
      //
      // `failureMode` was declared in this tool's input schema but MISSING from
      // this list, so the tool accepted `failure_mode` and then silently dropped
      // it — `query_issues(failure_mode: 'ZZZ')` returned rows whose modes were
      // INC/COM/COH. `failure_domain` was present and worked, which made the
      // asymmetry easy to miss. Tracker `1658dafd`.
      //
      // Note the SDK's `ListProjectIssuesQuery` type still omits `failureMode`
      // (its `Issue` type has it). That is a DX gap, not a functional one: this
      // object is `Record<string, unknown>` and the SDK's `buildIssueListParams`
      // is a bare `toApiQuery(query)` camelCase->snake_case conversion with no
      // allowlist, so the key reaches the wire regardless. Adding it to the SDK
      // type needs a publish + pin bump and is tracked separately.
      const query: Record<string, unknown> = {};
      for (const key of [
        'status', 'priority', 'severity', 'failureDomain', 'failureMode', 'agent',
        'includeResolved', 'minTimesSeen', 'limit', 'offset', 'dateStart', 'dateEnd',
      ]) {
        if (n[key] !== undefined) query[key] = n[key];
      }
      return opsClient.projects.listIssues(project, query);
    }, { toolName: 'query_issues' })
  );
}
