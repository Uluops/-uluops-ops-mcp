/**
 * Shared Zod schemas for run-related tools (save_run, update_run, validate_run).
 *
 * Extracted to eliminate the ~80-line copy-paste block that previously lived
 * in both save-run.ts and update-run.ts. Variants that need extra fields
 * (e.g., `agent_name` on update_run records) `.extend()` the base schemas.
 */

import { z } from 'zod';
import { AnalysisRecordTypeSchema, SeveritySchema } from './schemas.js';

/** Per-category score breakdown for an agent. */
export const CategoryScoreSchema = z.object({
  name: z.string().describe('Category name'),
  weight: z.number().int().min(1).describe('Category weight'),
  score: z.number().int().min(0).describe('Points earned'),
});

const ExplorationSectionBase = z.object({
  label: z.string().describe('Human-readable section title'),
  summary: z.string().optional().describe('Brief section description'),
});

/** Discriminated union of exploration map section variants. */
export const ExplorationSectionSchema = z.discriminatedUnion('type', [
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

/** A complete structural map emitted by an explorer agent. */
export const ExplorationMapSchema = z.object({
  metadata: z.object({
    explorer_name: z.string().describe('Explorer agent name'),
    framework: z.string().describe('Analytical framework (archimedes, bateson, meadows, etc.)'),
    artifact_path: z.string().optional().describe('Path to analyzed artifact'),
  }),
  sections: z.array(ExplorationSectionSchema).max(50).describe('Typed structural sections'),
}).describe('Structural mapping from an explorer agent');

/** Analysis summary base — extend with agent_name for per-agent updates. */
export const AnalysisSummaryBaseSchema = z.object({
  decision: z.string().max(50).describe('Decision (VITAL, FLOWING, PASS, etc.)'),
  score: z.number().min(0).max(100).optional().nullable().describe('Score. Omit for scoreless agents.'),
  decision_vocabulary: z.string().max(100).optional().nullable().describe('e.g., VITAL/DECADENT'),
  system_metrics: z.record(z.unknown()).optional().nullable().describe('Agent-type-specific metrics'),
  category_scores: z.array(CategoryScoreSchema).optional().nullable().describe('Category score breakdown'),
  epistemic_assessment: z.record(z.unknown()).optional().nullable().describe('Failure signature risk ratings'),
  audit_implications: z.array(z.string()).optional().nullable().describe('Trajectory projections'),
  exploration_maps: z.array(ExplorationMapSchema).optional().nullable().describe('Structural maps from explorer agents — inventories, topologies, claim extractions, etc.'),
});

/** Structured analysis record base — extend with agent_name for per-agent updates. */
export const AnalysisRecordBaseSchema = z.object({
  record_type: AnalysisRecordTypeSchema.describe('Record type (convention, tension, decay_vector, etc.)'),
  record_id: z.string().max(20).describe('Agent-local ID (C-1, T-3, D-2)'),
  title: z.string().max(500).describe('Human-readable title'),
  classification: z.string().max(50).optional().nullable().describe('Type-specific classification (LIVING, CALCIFIED, IMMINENT, etc.)'),
  severity: SeveritySchema.optional().nullable().describe('Severity when applicable'),
  data: z.record(z.unknown()).describe('Full structured data for this record'),
});
