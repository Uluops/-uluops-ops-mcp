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
  record_write_mode: z.enum(['replace', 'merge']).optional().describe('Records-only write mode (API 1b; default replace). replace: each named agent\'s FULL record set is superseded by the payload\'s — omission retires. merge: upsert on (agent_name, record_id) — matched records are superseded (prior duplicates collapse to one, visible in analysis_write.supersededRecords), unmatched keys are pure appends, and NOTHING is retired; merge cannot remove anything, and there is no delete endpoint. Summaries are unaffected (always per-agent replace). Sending this without analysis_records is an error. NOTE: past the 100-records-per-call cap, replace can no longer restate a merged agent\'s full set.'),
});

export type UpdateRunInput = z.infer<typeof UpdateRunInputSchema>;

export function registerUpdateRunTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'update_run',
    'Update run metadata post-hoc (tokens, scores, timestamps). Also supports adding recommendations/issues, and PER-AGENT analysis writes after initial save — replace (default) or merge, via record_write_mode; writes supersede only the agents named in the payload and cannot remove another agent\'s rows (there is no delete endpoint). Analysis-bearing responses include the analysisWrite echo (a camelCase response key: superseded/created counts — supersededRecords 0 on an enrichment that expected to replace means the named agents had no live rows). Preview with preview_update_run. Identify run by either run_id OR (project + run_number).',
    UpdateRunInputSchema.shape,
    createToolHandler(UpdateRunInputSchema, async (n) => {
      // With-echo variants (F17): the §3.9 echo's counts are the success
      // path's only view of what the write superseded. Additive response:
      // run fields unchanged, `analysisWrite` beside them on
      // analysis-bearing updates only (the server emits no echo otherwise).
      const runId = n['runId'];
      const result = typeof runId === 'string'
        ? await opsClient.runs.updateByIdWithEcho(runId, n, { _skipClientValidation: true })
        : await opsClient.runs.updateWithEcho(n, { _skipClientValidation: true });
      return result.analysisWrite ? { ...result.run, analysisWrite: result.analysisWrite } : result.run;
    }, { toolName: 'update_run' })
  );
}
