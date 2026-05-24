/**
 * merge_issues tool
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import { MergeStrategySchema, type McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const MergeIssuesInputSchema = z.object({
  project: z.string().min(1),
  target_issue_id: z.string().uuid(),
  source_issue_ids: z.array(z.string().uuid()).min(1),
  strategy: MergeStrategySchema.default('keep_target'),
});

export type MergeIssuesInput = z.infer<typeof MergeIssuesInputSchema>;

export function registerMergeIssuesTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'merge_issues',
    'Merge multiple issues into a target issue. Migrates occurrences and marks source issues as merged.',
    MergeIssuesInputSchema.shape,
    createToolHandler(MergeIssuesInputSchema, (n) => {
      const { project, ...input } = n;
      return opsClient.projects.mergeIssues(project as string, input);
    }, { toolName: 'merge_issues' })
  );
}
