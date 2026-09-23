/**
 * validate_run tool
 *
 * Preview what save_run would do without modifying the database.
 */

import { runSummaryErrorMap, RUN_MAP_CONTRACT, RUN_TOKEN_CONTRACT } from './run-input-contract.js';
import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import {
  AgentResultSchema,
  RecommendationSchema,
  type McpServerToolRegistration,
} from '../types/index.js';
import {
  AnalysisRecordBaseSchema,
  AnalysisSummaryBaseSchema,
} from '../types/run-schemas.js';
import { createToolHandler } from '../utils/tool-handler.js';

const AnalysisRecordSchema = AnalysisRecordBaseSchema;
const AnalysisSummarySchema = AnalysisSummaryBaseSchema;

export const ValidateRunInputSchema = z.object({
  project: z.string().min(1).max(200).describe('Project name'),
  workflow_type: z
    .string()
    .min(1)
    .max(100)
    .describe('Workflow type (e.g., post-implementation, ship)'),
  // .min(1) as save_run — the preview refuses what the write refuses (T2).
  agents: z.array(AgentResultSchema).min(1).describe('Array of agent results — at least one'),
  // .default([]) matches save_run EXACTLY (tool-sweep T2): a preview stricter
  // than the write it models rejects payloads the real call accepts, and
  // teaches callers to skip validation.
  recommendations: z.array(RecommendationSchema).default([]).describe('Array of issues/recommendations'),
  // Analysis-records preview (API v1.4.1+). Optional; mirrors save_run shape
  // so a dry-run can preview analysis persistence alongside recommendations.
  analysis_records: z.array(AnalysisRecordSchema).max(100).optional().describe('Structured analysis records to preview (mirrors save_run shape)'),
  analysis_summary: z.union([
    AnalysisSummarySchema,
    z.array(AnalysisSummarySchema.extend({
      agent_name: z.string().max(100).optional().describe('Agent name for per-agent attribution'),
    })).max(20),
  ], { errorMap: runSummaryErrorMap }).optional().describe('Analysis summary to preview — single object or per-agent array'),
});

export type ValidateRunInput = z.infer<typeof ValidateRunInputSchema>;

/**
 * Register validate_run tool
 */
export function registerValidateRunTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'validate_run',
    'Preview what save_run would do without modifying the database. Returns would_create, would_update, would_regress, would_create_analysis_records, would_create_analysis_summaries, and validation_errors. Accepts the same shape as save_run including optional analysis_records and analysis_summary so the dry-run faithfully reflects the full set of side effects.' + RUN_MAP_CONTRACT + RUN_TOKEN_CONTRACT,
    ValidateRunInputSchema.shape,
    // `_skipClientValidation`, as save_run / update_run / preview_update_run
    // pass: the tool schema above is the client-side contract and the server
    // is authoritative. Without it the SDK's own validateSaveRunInput ran here
    // only — it enforces agents.min(1), which save_run skips — so validate_run
    // refused `agents: []` while the identical save_run was accepted, the T2
    // parity break again for a second field (consumer-validate run #13).
    createToolHandler(
      ValidateRunInputSchema,
      (n, scope) => opsClient.runs.validate(n, { _skipClientValidation: true, ...scope }),
      { toolName: 'validate_run' }
    )
  );
}
