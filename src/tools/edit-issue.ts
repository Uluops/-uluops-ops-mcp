/**
 * edit_issue tool
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import { SeveritySchema, FilePathSchema, type McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const EditIssueInputSchema = z.object({
  issue_id: z.string().uuid(),
  title: z.string().min(1).max(500).optional(),
  file_path: FilePathSchema.optional(),
  category: z.string().max(100).optional(),
  severity: SeveritySchema.optional(),
  failure_code: z
    .string()
    .regex(/^(STR|SEM|PRA|EPI)-[A-Z]{3}\/[CHMLI]$/)
    .optional(),
  line_number: z.number().int().nonnegative().optional().nullable(),
});

export type EditIssueInput = z.infer<typeof EditIssueInputSchema>;

export function registerEditIssueTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'edit_issue',
    'Edit issue metadata. Can update title, file_path, category, severity, failure_code, line_number. Does not change the fingerprint.',
    EditIssueInputSchema.shape,
    createToolHandler(EditIssueInputSchema, (n) => {
      const { issueId, ...input } = n;
      return opsClient.issues.update(issueId as string, input);
    }, { toolName: 'edit_issue' })
  );
}
