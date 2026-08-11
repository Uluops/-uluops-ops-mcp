/**
 * edit_issue tool
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import { SeveritySchema, PrioritySchema, IssueTypeSchema, FilePathSchema, type McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

/**
 * `.strict()`, not a bare `z.object()` — and that is the actual fix here.
 *
 * `priority` was absent from this schema while the API has always accepted it on
 * `PATCH /issues/:id` (`UpdateIssueSchema`) and `@uluops/ops-sdk`'s `issues.update`
 * has always forwarded it. A caller passing `priority` therefore got a **200 with a
 * bumped `updated_at` and every other field written**, because `z.object()` strips
 * unknown keys instead of rejecting them. The edit looked like it landed. Tracker
 * `89ae6355`.
 *
 * That silent-strip is the same failure this workspace hit twice in two days: the
 * SDK dropping `mergedIntoIssueId` for months, and this. The missing field is the
 * symptom; a schema that discards what it does not recognise is the cause. `.strict()`
 * turns the next omission into an error at the boundary rather than a value that
 * evaporates, which is the difference between a caller learning immediately and a
 * caller never learning at all.
 *
 * **Three fields the SDK accepts are deliberately NOT exposed here**, recorded so the
 * next sweep does not read them as the same omission `priority` was:
 *
 *   `status`  — `editIssue` on the API writes NO `status_history` row and does no
 *               `resolved_at` derivation, so setting status through this path would
 *               silently bypass the audit trail. Use `update_status`. (That the API
 *               accepts it at all is a defect in its own right — tracker `ff0f3d8a`.)
 *   `failure_domain`, `failure_mode`
 *             — derived from `failure_code` by `deriveFailureTaxonomy`; sending the
 *               code is the canonical input and sending the parts invites drift
 *               between them.
 */
export const EditIssueInputSchema = z.object({
  issue_id: z.string().uuid(),
  title: z.string().min(1).max(500).optional(),
  /**
   * The tracker's queue is sorted by priority, so an edit that silently fails to
   * apply leaves the issue arriving at its old rank indefinitely — the mechanism
   * behind at least one issue surviving three triage rounds untriaged.
   */
  priority: PrioritySchema.optional().describe('Issue priority'),
  file_path: FilePathSchema.optional(),
  category: z.string().max(100).optional(),
  /**
   * Settable on create but not, until now, on edit — a misclassified issue could
   * never be reclassified. Found by sweeping every tool schema against the SDK input
   * interface it targets, which is how `priority` should have been found too.
   */
  type: IssueTypeSchema.optional().describe('Issue type (bug, feature, refactor, …)'),
  severity: SeveritySchema.optional(),
  failure_code: z
    .string()
    .regex(/^(STR|SEM|PRA|EPI)-[A-Z]{3}\/[CHMLI]$/)
    .optional(),
  line_number: z.number().int().nonnegative().optional().nullable(),
}).strict();

export type EditIssueInput = z.infer<typeof EditIssueInputSchema>;

export function registerEditIssueTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'edit_issue',
    'Edit issue metadata. Can update title, priority, type, file_path, category, severity, failure_code, line_number. Does not change the fingerprint.',
    EditIssueInputSchema.shape,
    createToolHandler(EditIssueInputSchema, (n) => {
      const { issueId, ...input } = n;
      return opsClient.issues.update(issueId as string, input);
    }, { toolName: 'edit_issue' })
  );
}
