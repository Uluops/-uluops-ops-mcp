/**
 * preview_update_run tool
 *
 * Read-only preview of an analysis-bearing update_run (API 1a/1b:
 * POST /runs/:id/update-preview and POST /runs/update-preview). Computes,
 * per agent named in the payload, what a write under the requested
 * record_write_mode would supersede, create, and — replace only — retire by
 * omission (merge cannot retire; its retire list is [] by construction) —
 * without writing anything.
 *
 * Scope rule (spec §4): analysis concerns ONLY. The API rejects any other
 * update field with a named 400 — but that 400 is unreachable from here,
 * because the MCP transport validates against this tool's shape and STRIPS
 * unknown keys before the handler runs, and the SDK then builds the request
 * body from the analysis fields alone. A stripped `agents` or
 * `average_score` would silently narrow the preview into modelling only
 * part of the write the caller is about to perform. So the forbidden update
 * fields are DECLARED in the shape (making the transport pass them through)
 * and rejected by name in the handler — the only layer where the rejection
 * can actually fire.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import { ValidationError } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';
import { AnalysisRecordBaseSchema } from '../types/run-schemas.js';
import { AnalysisSummarySchema } from './update-run.js';

const FORBIDDEN_NOTE =
  'NOT ACCEPTED — update-preview takes analysis concerns only. Sending this field is a named error, never a silent strip: a preview that dropped it would model only part of the write you are about to perform.';

/**
 * update_run fields the preview refuses, in the tool's snake_case
 * vocabulary. Mirrors the API's UPDATE_PREVIEW_FORBIDDEN_KEYS plus the
 * update-only identifiers this tool shares with update_run.
 */
const FORBIDDEN_PREVIEW_FIELDS = [
  'workflow_type',
  'agents',
  'timestamp',
  'all_gates_passed',
  'average_score',
  'raw_markdown',
  'recommendations',
  'archived_at',
  'archive_reason',
] as const;

export const PreviewUpdateRunInputSchema = z.object({
  project: z.string().min(1),
  run_id: z.string().uuid().optional(),
  run_number: z.number().int().positive().optional(),
  analysis_records: z.array(AnalysisRecordBaseSchema).max(100).optional().describe('Analysis records the update would write. Per agent named here, the preview reports would_supersede_records, would_create_records, and would_retire_record_ids — the live records omitted from this payload that a replace write would retire.'),
  analysis_summary: z.union([
    AnalysisSummarySchema,
    z.array(AnalysisSummarySchema).max(20),
  ]).optional().describe('Analysis summary/summaries the update would write. Per named agent, the preview reports would_supersede_summaries and would_create_summaries.'),
  record_write_mode: z.enum(['replace', 'merge']).optional().describe('Preview under this mode (default replace) — MUST match the mode the write will use: previewing replace while the write merges reports retirements that will not happen (and vice versa). Under merge, would_supersede_records counts matched keys and would_retire_record_ids is always empty (merge cannot retire).'),
  // Declared so the transport does not strip them — the handler rejects them
  // by name (see module docblock).
  workflow_type: z.unknown().optional().describe(FORBIDDEN_NOTE),
  agents: z.unknown().optional().describe(FORBIDDEN_NOTE),
  timestamp: z.unknown().optional().describe(FORBIDDEN_NOTE),
  all_gates_passed: z.unknown().optional().describe(FORBIDDEN_NOTE),
  average_score: z.unknown().optional().describe(FORBIDDEN_NOTE),
  raw_markdown: z.unknown().optional().describe(FORBIDDEN_NOTE),
  recommendations: z.unknown().optional().describe(FORBIDDEN_NOTE),
  archived_at: z.unknown().optional().describe(FORBIDDEN_NOTE),
  archive_reason: z.unknown().optional().describe(FORBIDDEN_NOTE),
});

export type PreviewUpdateRunInput = z.infer<typeof PreviewUpdateRunInputSchema>;

/** snake_case field name → the camelCase key normalizeKeys hands the handler. */
const toCamel = (s: string): string => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

export function registerPreviewUpdateRunTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'preview_update_run',
    'Read-only preview of an analysis-bearing update_run under the requested record_write_mode (default replace): reports, per agent named in the payload, what the write would supersede, create, and — under replace — retire by omission (would_retire_record_ids; always empty under merge, which cannot retire). Nothing is written. Accepts analysis concerns only; any other update field is rejected by name. Identify run by either run_id OR (project + run_number).',
    PreviewUpdateRunInputSchema.shape,
    createToolHandler(PreviewUpdateRunInputSchema, (n) => {
      const offending = FORBIDDEN_PREVIEW_FIELDS.filter(
        (k) => (n as Record<string, unknown>)[toCamel(k)] !== undefined
      );
      if (offending.length > 0) {
        // Same wording as the API's scope-rule 400 (run-controller.ts), so the
        // error reads identically whichever layer catches it first.
        throw new ValidationError(
          `update-preview accepts analysis concerns only; remove: ${offending.join(', ')}`
        );
      }
      const runId = n['runId'];
      if (typeof runId === 'string') {
        return opsClient.runs.previewUpdateById(runId, n, { _skipClientValidation: true });
      }
      return opsClient.runs.previewUpdate(n, { _skipClientValidation: true });
    }, { toolName: 'preview_update_run' })
  );
}
