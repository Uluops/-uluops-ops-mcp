/**
 * validate_run tool
 *
 * Preview what save_run would do without modifying the database.
 */

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
  agents: z.array(AgentResultSchema).describe('Array of agent results'),
  recommendations: z.array(RecommendationSchema).describe('Array of issues/recommendations'),
  // Analysis-records preview (API v1.4.1+). Optional; mirrors save_run shape
  // so a dry-run can preview analysis persistence alongside recommendations.
  analysis_records: z.array(AnalysisRecordSchema).max(100).optional().describe('Structured analysis records to preview (mirrors save_run shape)'),
  analysis_summary: z.union([
    AnalysisSummarySchema,
    z.array(AnalysisSummarySchema.extend({
      agent_name: z.string().max(100).optional().describe('Agent name for per-agent attribution'),
    })).max(20),
  ]).optional().describe('Analysis summary to preview — single object or per-agent array'),
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
    'Preview what save_run would do without modifying the database. Returns would_create, would_update, would_regress, would_create_analysis_records, would_create_analysis_summaries, and validation_errors. Accepts the same shape as save_run including optional analysis_records and analysis_summary so the dry-run faithfully reflects the full set of side effects.',
    ValidateRunInputSchema.shape,
    createToolHandler(ValidateRunInputSchema, (n) => opsClient.runs.validate(n), { toolName: 'validate_run' })
  );
}
