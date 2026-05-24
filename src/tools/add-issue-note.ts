/**
 * add_issue_note tool
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import { NoteTypeSchema, type McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const AddIssueNoteInputSchema = z.object({
  issue_id: z.string().uuid(),
  content: z.string().min(1).max(10000),
  note_type: NoteTypeSchema.default('context'),
  created_by: z.string().max(200).optional(),
});

export type AddIssueNoteInput = z.infer<typeof AddIssueNoteInputSchema>;

export function registerAddIssueNoteTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'add_issue_note',
    'Add a note to an issue. Note types: context (additional context), resolution (how to resolve), blocker (why blocking).',
    AddIssueNoteInputSchema.shape,
    createToolHandler(AddIssueNoteInputSchema, (n) => {
      const { issueId, ...input } = n;
      return opsClient.issues.addNote(issueId as string, input);
    }, { toolName: 'add_issue_note' })
  );
}
