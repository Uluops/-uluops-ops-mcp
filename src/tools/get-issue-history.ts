/**
 * get_issue_history tool
 *
 * Thin pass-through to opsClient.issues.getHistory. The merged-event-stream
 * shape (occurrences + status changes/undo tombstones + notes, sorted desc and
 * capped at 1000) is defined and documented by the SDK's IssueHistoryEnvelope
 * type — see @uluops/ops-sdk types/issues. Live-tests T2 §3.1 (F10).
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const GetIssueHistoryInputSchema = z.object({
  issue_id: z.string().uuid(),
});

export type GetIssueHistoryInput = z.infer<typeof GetIssueHistoryInputSchema>;

export function registerGetIssueHistoryTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'get_issue_history',
    'Get the merged audit history for an issue: occurrences, status changes (with undo tombstones), and notes, sorted newest-first and capped at 1000 events. Returns { issueId, events, totalEvents, truncated }; each event has a type discriminator (occurrence | status | note).',
    GetIssueHistoryInputSchema.shape,
    createToolHandler(GetIssueHistoryInputSchema, (n) =>
      opsClient.issues.getHistory(n['issueId'] as string),
      { toolName: 'get_issue_history' }
    )
  );
}
