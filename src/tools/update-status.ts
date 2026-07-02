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
});

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
