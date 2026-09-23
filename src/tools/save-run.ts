/**
 * save_run tool
 *
 * Save validation pipeline output with automatic correlation.
 */

import { runSummaryErrorMap, RUN_MAP_CONTRACT, RUN_TOKEN_CONTRACT } from './run-input-contract.js';
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
  // .min(1): a run records at least one agent's result. The API refuses an
  // empty array (ops-uluops-api SaveRunSchema, 2026-09-23); saying so here
  // turns the round-trip 400 into an immediate, named refusal. Until then this
  // schema and the API both omitted the bound while the SDK's client
  // validator — which this tool skips — enforced it, so save_run persisted
  // agent-less runs (and auto-created the named project).
  agents: z.array(AgentResultSchema).min(1).describe('Array of agent results — at least one'),
  recommendations: z
    .array(RecommendationSchema)
    .default([])
    .describe('Array of issues/recommendations'),
  summary: ValidationSummarySchema.optional().describe('Summary statistics for the run'),
  raw_markdown: z.string().nullish().describe('Raw markdown report content'),
  idempotency_contract: z.enum(['legacy-v1', 'report-v2']).optional().describe('Omission keeps legacy-v1, which excludes report text from comparison. report-v2 compares exact report bytes and requires server capability support. Reusing a key with another contract or payload conflicts; use a new key only for an intentional new submission.'),
  idempotency_key: z.string().max(100).optional().describe('Key for duplicate prevention. When omitted, a content-derived key is used (sha256 of the payload), so a byte-identical retry returns the original run with deduplicated:true instead of creating a second one. Pass explicit distinct keys to deliberately save identical payloads twice.'),
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
  ], { errorMap: runSummaryErrorMap }).optional().describe('Analysis summary — single object or per-agent array (v1.8.0). For pipelines, pass an array with one entry per agent.'),
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
    'Save a run — the findings a definition (agent, workflow or pipeline) produced against a project. Auto-increments run number per project+workflow. Detects regressions and persistent issues. A project that does not exist is CREATED under the name given — check the spelling with list_projects first; a typo becomes a new project.' + RUN_MAP_CONTRACT + RUN_TOKEN_CONTRACT,
    SaveRunInputSchema.shape,
    createToolHandler(
      SaveRunInputSchema,
      (n, scope) => opsClient.runs.save(n, { _skipClientValidation: true, ...scope }),
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
