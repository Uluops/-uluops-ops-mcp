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
    'Get an issue by its SHA-256 fingerprint. Derivation (computable client-side): sha256 hex of components joined by "|" — normalized title, normalized agent name, then filePath and category only when present. Text normalization: NFC, lowercase, whitespace collapsed to single spaces, "|" characters removed, trimmed. filePath: backslashes to "/", leading/trailing slashes stripped, lowercased. Note the AGENT participates: the same finding from a different agent has a different fingerprint, and edit_issue retains the original fingerprint after a retitle.',
    GetIssueByFingerprintInputSchema.shape,
    createToolHandler(GetIssueByFingerprintInputSchema, (n) =>
      opsClient.issues.getByFingerprint(n['fingerprint'] as string, n['project'] as string),
      { toolName: 'get_issue_by_fingerprint' }
    )
  );
}
