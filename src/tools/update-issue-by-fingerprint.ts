/**
 * update_issue_by_fingerprint tool
 *
 * Update an issue's status by its fingerprint.
 */

import { z } from 'zod';
import { STATUS_REASON_MAX_LENGTH, type OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { IssueStatusSchema } from '../types/schemas.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const UpdateIssueByFingerprintInputSchema = z.object({
  fingerprint: z.string().min(1).describe('Issue SHA-256 fingerprint'),
  project: z.string().min(1).describe('Project name or UUID'),
  status: IssueStatusSchema.describe('New status'),
  reason: z.string().max(STATUS_REASON_MAX_LENGTH).optional().describe('Reason for status change'),
});

export type UpdateIssueByFingerprintInput = z.infer<typeof UpdateIssueByFingerprintInputSchema>;

/**
 * Register update_issue_by_fingerprint tool
 */
export function registerUpdateIssueByFingerprintTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'update_issue_by_fingerprint',
    'Update an issue status by its fingerprint.',
    UpdateIssueByFingerprintInputSchema.shape,
    createToolHandler(UpdateIssueByFingerprintInputSchema, (n) => {
      const { fingerprint, project, ...input } = n;
      return opsClient.issues.updateStatusByFingerprint(
        fingerprint as string,
        project as string,
        input
      );
    }, { toolName: 'update_issue_by_fingerprint' })
  );
}
