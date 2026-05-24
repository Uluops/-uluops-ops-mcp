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
import { RecommendationSchema, SeveritySchema, AnalysisRecordTypeSchema } from '../types/schemas.js';

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
});

const AnalysisRecordSchema = z.object({
  agent_name: z.string().max(100).optional().describe('Agent name — overrides run-level default'),
  record_type: AnalysisRecordTypeSchema.describe('Record type (convention, tension, decay_vector, etc.)'),
  record_id: z.string().max(20).describe('Agent-local ID (C-1, T-3, D-2)'),
  title: z.string().max(500).describe('Human-readable title'),
  classification: z.string().max(50).optional().nullable().describe('Type-specific classification'),
  severity: SeveritySchema.optional().nullable().describe('Severity when applicable'),
  data: z.record(z.unknown()).describe('Full structured data for this record'),
});

const CategoryScoreSchema = z.object({
  name: z.string().describe('Category name'),
  weight: z.number().int().min(1).describe('Category weight'),
  score: z.number().int().min(0).describe('Points earned'),
});

const ExplorationSectionBase = z.object({
  label: z.string().describe('Human-readable section title'),
  summary: z.string().optional().describe('Brief section description'),
});

const ExplorationSectionSchema = z.discriminatedUnion('type', [
  ExplorationSectionBase.extend({
    type: z.literal('inventory'),
    items: z.array(z.record(z.unknown())).optional().describe('Inventory items'),
    gaps: z.array(z.string()).optional().describe('Identified gaps'),
  }).passthrough(),
  ExplorationSectionBase.extend({
    type: z.literal('topology'),
    entities: z.array(z.record(z.unknown())).optional().describe('Entities in the topology'),
    relationships: z.array(z.record(z.unknown())).optional().describe('Relationships between entities'),
    clusters: z.array(z.record(z.unknown())).optional().describe('Entity clusters'),
  }).passthrough(),
  ExplorationSectionBase.extend({
    type: z.literal('landscape'),
    dimensions: z.array(z.string()).optional().describe('Landscape dimensions'),
    findings: z.array(z.record(z.unknown())).optional().describe('Findings across dimensions'),
  }).passthrough(),
  ExplorationSectionBase.extend({
    type: z.literal('classification'),
    hierarchy: z.array(z.record(z.unknown())).optional().describe('Taxonomic hierarchy'),
  }).passthrough(),
  ExplorationSectionBase.extend({
    type: z.literal('mapping'),
    source_domain: z.string().optional().describe('Source domain name'),
    target_domain: z.string().optional().describe('Target domain name'),
    translations: z.array(z.record(z.unknown())).optional().describe('Source-to-target translations'),
  }).passthrough(),
  ExplorationSectionBase.extend({
    type: z.literal('synthesis'),
    patterns: z.array(z.record(z.unknown())).optional().describe('Discovered patterns'),
    archetypes: z.array(z.record(z.unknown())).optional().describe('Identified archetypes'),
  }).passthrough(),
  ExplorationSectionBase.extend({
    type: z.literal('limitation'),
    blind_spots: z.array(z.record(z.unknown())).optional().describe('Framework blind spots'),
  }).passthrough(),
  ExplorationSectionBase.extend({
    type: z.literal('agenda'),
    questions: z.array(z.record(z.unknown())).optional().describe('Inquiry questions for downstream analysis'),
  }).passthrough(),
]).describe('Typed section — type determines available fields');

const ExplorationMapSchema = z.object({
  metadata: z.object({
    explorer_name: z.string().describe('Explorer agent name'),
    framework: z.string().describe('Analytical framework (archimedes, bateson, meadows, etc.)'),
    artifact_path: z.string().optional().describe('Path to analyzed artifact'),
  }),
  sections: z.array(ExplorationSectionSchema).max(50).describe('Typed structural sections'),
}).describe('Structural mapping from an explorer agent');

const AnalysisSummarySchema = z.object({
  agent_name: z.string().max(100).optional().describe('Agent name — overrides run-level default'),
  decision: z.string().max(50).describe('Decision (VITAL, FLOWING, PASS, etc.)'),
  score: z.number().min(0).max(100).optional().nullable().describe('Score. Omit for scoreless agents.'),
  decision_vocabulary: z.string().max(100).optional().nullable().describe('e.g., VITAL/DECADENT'),
  system_metrics: z.record(z.unknown()).optional().nullable().describe('Agent-type-specific metrics'),
  category_scores: z.array(CategoryScoreSchema).optional().nullable().describe('Category score breakdown'),
  epistemic_assessment: z.record(z.unknown()).optional().nullable().describe('Failure signature risk ratings'),
  audit_implications: z.array(z.string()).optional().nullable().describe('Trajectory projections'),
  exploration_maps: z.array(ExplorationMapSchema).optional().nullable().describe('Structural maps from explorer agents'),
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
