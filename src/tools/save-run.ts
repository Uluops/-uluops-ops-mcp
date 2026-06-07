/**
 * save_run tool
 *
 * Save validation pipeline output with automatic correlation.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import {
  AgentResultSchema,
  RecommendationSchema,
  ValidationSummarySchema,
  type McpServerToolRegistration,
} from '../types/index.js';
import {
  AnalysisRecordBaseSchema,
  AnalysisSummaryBaseSchema,
} from '../types/run-schemas.js';
import { createToolHandler } from '../utils/tool-handler.js';

const AnalysisRecordSchema = AnalysisRecordBaseSchema;
const AnalysisSummarySchema = AnalysisSummaryBaseSchema;

export const SaveRunInputSchema = z.object({
  project: z.string().min(1).describe('Project name'),
  workflow_type: z.string().min(1).describe('Workflow type (e.g., post-implementation, ship)'),
  timestamp: z.string().optional().describe('ISO 8601 timestamp (defaults to now)'),
  create_new_project: z.boolean().optional().describe('Create project if it does not exist'),
  agents: z.array(AgentResultSchema).describe('Array of agent results'),
  recommendations: z
    .array(RecommendationSchema)
    .default([])
    .describe('Array of issues/recommendations'),
  summary: ValidationSummarySchema.optional().describe('Summary statistics for the validation run'),
  raw_markdown: z.string().optional().describe('Raw markdown report content'),
  idempotency_key: z.string().max(100).optional().describe('Key for duplicate prevention'),
  definition_type: z.string().max(20).optional().describe('Definition type (agent, command, workflow, pipeline)'),
  definition_name: z.string().max(100).optional().describe('Definition name'),
  definition_version: z.string().max(50).optional().describe('Definition version'),
  definition_hash: z.string().max(64).optional().describe('SHA-256 content hash of the definition'),
  definition_id: z.string().uuid().optional().describe('Registry definition UUID for direct identity linkage'),
  analysis_records: z.array(AnalysisRecordSchema).max(100).optional().describe('Structured analysis records (v1.4.0)'),
  analysis_summary: z.union([
    AnalysisSummarySchema,
    z.array(AnalysisSummarySchema.extend({
      agent_name: z.string().max(100).optional().describe('Agent name for per-agent attribution'),
    })).max(20),
  ]).optional().describe('Analysis summary — single object or per-agent array (v1.8.0). For pipelines, pass an array with one entry per agent.'),
});

export type SaveRunInput = z.infer<typeof SaveRunInputSchema>;

/**
 * Register save_run tool
 */
export function registerSaveRunTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'save_run',
    'Save validation pipeline output. Auto-increments run number per project+workflow. Detects regressions and persistent issues.',
    SaveRunInputSchema.shape,
    createToolHandler(
      SaveRunInputSchema,
      (n) => opsClient.runs.save(n, { _skipClientValidation: true }),
      {
        toolName: 'save_run',
        preProcess: (input) => ({
          ...input,
          timestamp: input.timestamp ?? new Date().toISOString(),
        }),
      }
    )
  );
}
