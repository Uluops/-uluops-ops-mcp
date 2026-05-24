/**
 * save_run tool
 *
 * Save validation pipeline output with automatic correlation.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import {
  ValidatorResultSchema,
  RecommendationSchema,
  ValidationSummarySchema,
  SeveritySchema,
  AnalysisRecordTypeSchema,
  type McpServerToolRegistration,
} from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

const AnalysisRecordSchema = z.object({
  record_type: AnalysisRecordTypeSchema.describe('Record type (convention, tension, decay_vector, etc.)'),
  record_id: z.string().max(20).describe('Agent-local ID (C-1, T-3, D-2)'),
  title: z.string().max(500).describe('Human-readable title'),
  classification: z.string().max(50).optional().nullable().describe('Type-specific classification (LIVING, CALCIFIED, IMMINENT, etc.)'),
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
  decision: z.string().max(50).describe('Decision (VITAL, FLOWING, PASS, etc.)'),
  score: z.number().min(0).max(100).optional().nullable().describe('Score. Omit for scoreless agents.'),
  decision_vocabulary: z.string().max(100).optional().nullable().describe('e.g., VITAL/DECADENT'),
  system_metrics: z.record(z.unknown()).optional().nullable().describe('Agent-type-specific metrics'),
  category_scores: z.array(CategoryScoreSchema).optional().nullable().describe('Category score breakdown'),
  epistemic_assessment: z.record(z.unknown()).optional().nullable().describe('Failure signature risk ratings'),
  audit_implications: z.array(z.string()).optional().nullable().describe('Trajectory projections'),
  exploration_maps: z.array(ExplorationMapSchema).optional().nullable().describe('Structural maps from explorer agents — inventories, topologies, claim extractions, etc.'),
});

export const SaveRunInputSchema = z.object({
  project: z.string().min(1).describe('Project name'),
  workflow_type: z.string().min(1).describe('Workflow type (e.g., post-implementation, ship)'),
  timestamp: z.string().optional().describe('ISO 8601 timestamp (defaults to now)'),
  create_new_project: z.boolean().optional().describe('Create project if it does not exist'),
  agents: z.array(ValidatorResultSchema).describe('Array of agent results'),
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
