/**
 * update_status tool
 *
 * Update issue status (mark completed, deferred, etc.).
 */

import { z } from 'zod';
import { STATUS_REASON_MAX_LENGTH, type OpsClient } from '@uluops/ops-sdk';
import { IssueStatusSchema, type McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

const StatusUpdateSchema = z.object({
  id: z.string().uuid().optional().describe('Issue UUID (preferred identifier)'),
  issue_id: z.string().uuid().optional().describe('Issue UUID (alias for id)'),
  fingerprint: z.string().optional().describe('Issue fingerprint hash'),
  file_path: z.string().optional().describe('File path (use with title)'),
  title: z.string().optional().describe('Issue title (use with file_path)'),
  status: IssueStatusSchema.describe('New status'),
  reason: z.string().max(STATUS_REASON_MAX_LENGTH).optional().describe('Reason for status change (max 1000 chars)'),
})
  // T16: the schema used to accept an identifier-less update the domain
  // always rejects — and the domain error's remedy pointed back at this
  // schema. Enforce the invariant where it is declared: every update names
  // its issue by id (preferred), fingerprint, or file_path+title.
  .refine(
    (u) => Boolean(u.id ?? u.issue_id ?? u.fingerprint ?? (u.file_path && u.title)),
    { message: "Each update needs an identifier: 'id' (preferred), 'issue_id', 'fingerprint', or 'file_path' together with 'title'." },
  )
  .refine(
    (u) => !(u.file_path && !u.title) && !(u.title && !u.file_path) || Boolean(u.id ?? u.issue_id ?? u.fingerprint),
    { message: "'file_path' and 'title' identify an issue only as a PAIR — supply both, or use 'id'/'fingerprint'." },
  );

export const UpdateStatusInputSchema = z.object({
  project: z.string().min(1).describe('Project name'),
  updates: z.array(StatusUpdateSchema).min(1).describe('Array of status updates'),
});

export type UpdateStatusInput = z.infer<typeof UpdateStatusInputSchema>;

/**
 * Register update_status tool
 */
export function registerUpdateStatusTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'update_status',
    'Update issue status. Identify by ID (preferred), fingerprint, or file_path+title.',
    UpdateStatusInputSchema.shape,
    createToolHandler(UpdateStatusInputSchema, (n) =>
      opsClient.projects.bulkUpdateIssueStatus(n['project'], n['updates']),
      { toolName: 'update_status' }
    )
  );
}
