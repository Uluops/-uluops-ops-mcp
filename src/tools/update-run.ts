/**
 * update_run tool
 *
 * Update run metadata post-hoc (tokens, scores, timestamps, recommendations).
 * Supports identification by run_id OR (project + run_number).
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';
import { RecommendationSchema } from '../types/schemas.js';
import {
  AnalysisRecordBaseSchema,
  AnalysisSummaryBaseSchema,
} from '../types/run-schemas.js';

const AgentUpdateSchema = z.object({
  name: z.string().min(1),
  score: z.number().min(0).max(100).optional(),
  decision: z
    .string()
    .optional()
    .describe('Agent decision (e.g., PASS, FAIL, CLEAR, BEWITCHED, VITAL)'),
  input_tokens: z.number().int().nonnegative().optional(),
  output_tokens: z.number().int().nonnegative().optional(),
  cache_creation_tokens: z.number().int().nonnegative().optional(),
  cache_read_tokens: z.number().int().nonnegative().optional(),
  total_effective_tokens: z.number().int().nonnegative().optional(),
  duration_ms: z.number().int().nonnegative().optional(),
  model: z.string().optional(),
  agent_id: z
    .string()
    .max(50)
    .optional()
    .describe('Harness transcript/agent provenance id (e.g., from agent-metrics extract)'),
});

// agent_name moved into AnalysisRecordBaseSchema, so save_run and validate_run inherit it
// instead of update_run being the only tool that could attribute a record to its agent.
const AnalysisRecordSchema = AnalysisRecordBaseSchema;

export const AnalysisSummarySchema = AnalysisSummaryBaseSchema.extend({
  agent_name: z.string().max(100).optional().describe('Agent name — overrides run-level default'),
});

export const UpdateRunInputSchema = z.object({
  project: z.string().min(1),
  run_id: z.string().uuid().optional(),
  run_number: z.number().int().positive().optional(),
  workflow_type: z.string().optional(),
  agents: z.array(AgentUpdateSchema).optional(),
  timestamp: z.string().optional(),
  all_gates_passed: z.boolean().optional(),
  average_score: z.number().min(0).max(100).optional(),
  raw_markdown: z.string().max(100000).optional(),
  recommendations: z.array(RecommendationSchema).optional().describe('Array of issues/recommendations to correlate with this run'),
  analysis_records: z.array(AnalysisRecordSchema).max(100).optional().describe('Structured analysis records — PER-AGENT REPLACE (API 1a): for each agent named in this array, that agent\'s entire live record set is superseded and these rows written; agents not named are untouched, and nothing here can remove another agent\'s rows. Omitting a record an agent previously had retires it — send every record that agent should keep, and use preview_update_run first when unsure. Leaves analysis_summary untouched. agent_name/record_id matching is case- and accent-insensitive.'),
  analysis_summary: z.union([
    AnalysisSummarySchema,
    z.array(AnalysisSummarySchema).max(20),
  ]).optional().describe('Analysis summary — single object or per-agent array. PER-AGENT REPLACE, and summaries have no mode: each named agent\'s live summary rows are superseded by its entries here; agents not named are untouched. Leaves analysis_records untouched. agent_name matching is case- and accent-insensitive.'),
});

export type UpdateRunInput = z.infer<typeof UpdateRunInputSchema>;

export function registerUpdateRunTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'update_run',
    'Update run metadata post-hoc (tokens, scores, timestamps). Also supports adding recommendations/issues, and PER-AGENT REPLACE of analysis records/summary after initial save — analysis writes supersede only the agents named in the payload and cannot remove another agent\'s rows (there is no delete endpoint). Preview an analysis write with preview_update_run. Identify run by either run_id OR (project + run_number).',
    UpdateRunInputSchema.shape,
    createToolHandler(UpdateRunInputSchema, (n) => {
      const runId = n['runId'];
      if (typeof runId === 'string') {
        // Use direct run ID path
        return opsClient.runs.updateById(runId, n, { _skipClientValidation: true });
      }
      // Use project + run_number path
      return opsClient.runs.update(n, { _skipClientValidation: true });
    }, { toolName: 'update_run' })
  );
}
