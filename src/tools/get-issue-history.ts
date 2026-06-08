/**
 * get_issue_history tool
 *
 * Returns the merged audit history for an issue as a single timestamp-sorted
 * event stream covering three sources:
 *   - occurrences  (per-run sightings of the issue)
 *   - status       (deliberate status changes AND undo tombstones)
 *   - notes        (manually added notes)
 *
 * Prior to live-tests T2 §3.1 (F10) this tool returned only the status slice,
 * and undoLastChange destroyed the row it reverted — so the audit trail was
 * both incomplete and non-monotonic. The new shape merges all three sources
 * and exposes tombstone rows (transitionType = 'undo' with revertedChangeId)
 * for full timeline reconstruction.
 *
 * Response envelope:
 *   { issueId, events: HistoryEvent[], totalEvents, truncated }
 *
 * Events are sorted by timestamp descending and capped at 1000 events
 * post-merge (truncated = true when the cap fires; oldest events are dropped
 * uniformly across all three sources).
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
    [
      'Get the merged audit history for an issue: occurrences, status changes',
      '(including undo tombstones), and notes — sorted by timestamp descending',
      'and capped at 1000 events. Returns an envelope { issueId, events,',
      'totalEvents, truncated }. Each event has a discriminator `type`:',
      "'occurrence' | 'status' | 'note'. Status events carry a transitionType",
      "('change' | 'undo' | null for pre-migration rows) and a revertedChangeId",
      "pointing at the original change when transitionType is 'undo'.",
    ].join(' '),
    GetIssueHistoryInputSchema.shape,
    createToolHandler(GetIssueHistoryInputSchema, (n) =>
      opsClient.issues.getHistory(n['issueId'] as string),
      { toolName: 'get_issue_history' }
    )
  );
}
