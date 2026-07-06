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

const AnalysisRecordSchema = AnalysisRecordBaseSchema.extend({
  agent_name: z.string().max(100).optional().describe('Agent name — overrides run-level default'),
});

const AnalysisSummarySchema = AnalysisSummaryBaseSchema.extend({
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
  analysis_records: z.array(AnalysisRecordSchema).max(100).optional().describe('Structured analysis records — replaces existing if present'),
  analysis_summary: z.union([
    AnalysisSummarySchema,
    z.array(AnalysisSummarySchema).max(20),
  ]).optional().describe('Analysis summary — single object or per-agent array. Replaces existing.'),
});

export type UpdateRunInput = z.infer<typeof UpdateRunInputSchema>;

export function registerUpdateRunTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'update_run',
    'Update run metadata post-hoc (tokens, scores, timestamps). Also supports adding recommendations/issues and analysis records/summary after initial save. Identify run by either run_id OR (project + run_number).',
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
