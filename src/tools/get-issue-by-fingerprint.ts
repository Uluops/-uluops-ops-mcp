/**
 * get_issue_by_fingerprint tool
 *
 * Get an issue by its SHA-256 fingerprint.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const GetIssueByFingerprintInputSchema = z.object({
  fingerprint: z.string().min(1).describe('Issue SHA-256 fingerprint'),
  project: z.string().min(1).describe('Project name or UUID'),
});

export type GetIssueByFingerprintInput = z.infer<typeof GetIssueByFingerprintInputSchema>;

/**
 * Register get_issue_by_fingerprint tool
 */
export function registerGetIssueByFingerprintTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'get_issue_by_fingerprint',
    'Get an issue by its SHA-256 fingerprint.',
    GetIssueByFingerprintInputSchema.shape,
    createToolHandler(GetIssueByFingerprintInputSchema, (n) =>
      opsClient.issues.getByFingerprint(n['fingerprint'] as string, n['project'] as string),
      { toolName: 'get_issue_by_fingerprint' }
    )
  );
}
