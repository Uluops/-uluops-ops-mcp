/**
 * Shared Zod schemas for common enums and types
 *
 * Centralizes repeated enum definitions to ensure consistency
 * across all tool schemas.
 */

import { z } from 'zod';
// STRICT_FAILURE_CODE_PATTERN encodes the closed 28-mode × 5-severity set —
// modes are domain-bound (VAL is EPI, not SEM), which the format-only
// FAILURE_CODE_PATTERN cannot express. Advertising the loose pattern let
// well-formed non-members (SEM-VAL/H) pass validation and silently lose their
// classification at ingest (RE-PROBE-02 N2 — this package missed the sibling's
// fix; the two MCP packages must move together).
import { STRICT_FAILURE_CODE_PATTERN } from '@uluops/taxonomy';

/**
 * Issue priority levels
 * - critical: Must fix before shipping
 * - suggested: Should fix, but not blocking
 * - backlog: Technical debt for later
 */
export const PrioritySchema = z.enum(['critical', 'high', 'suggested', 'backlog']);
export type Priority = z.infer<typeof PrioritySchema>;

/**
 * Issue priority with 'all' option for queries
 */
export const PriorityFilterSchema = z.enum(['critical', 'high', 'suggested', 'backlog', 'all']);
export type PriorityFilter = z.infer<typeof PriorityFilterSchema>;

/**
 * Issue severity levels
 */
export const SeveritySchema = z.enum(['critical', 'high', 'medium', 'low', 'info']);
export type Severity = z.infer<typeof SeveritySchema>;

/**
 * Issue status values
 * - open: Active issue
 * - completed: Fixed and verified
 * - deferred: Postponed for later
 * - wontfix: Not planning to address
 * - merged: Combined with another issue
 * - false-positive: Not a real issue (misidentified by agent)
 */
export const IssueStatusSchema = z.enum(['open', 'completed', 'deferred', 'wontfix', 'merged', 'false-positive', 'observation']);
export type IssueStatus = z.infer<typeof IssueStatusSchema>;

/**
 * Issue status with 'all' option for queries
 */
export const IssueStatusFilterSchema = z.enum(['open', 'completed', 'deferred', 'wontfix', 'merged', 'false-positive', 'observation', 'all']);
export type IssueStatusFilter = z.infer<typeof IssueStatusFilterSchema>;

/**
 * Failure taxonomy domains
 * - STR: Structural issues (syntax, formatting)
 * - SEM: Semantic issues (logic, correctness)
 * - PRA: Pragmatic issues (usability, clarity)
 * - EPI: Epistemic issues (knowledge, assumptions)
 */
export const FailureDomainSchema = z.enum(['STR', 'SEM', 'PRA', 'EPI']);
export type FailureDomain = z.infer<typeof FailureDomainSchema>;

/**
 * Classification confidence levels
 */
export const ConfidenceSchema = z.enum(['high', 'medium', 'low']);
export type Confidence = z.infer<typeof ConfidenceSchema>;

/**
 * Classification source
 */
export const ClassifierSchema = z.enum(['agent', 'classifier', 'human']);
export type Classifier = z.infer<typeof ClassifierSchema>;

/**
 * Known analysis record type vocabulary.
 *
 * This list is documentation/autocomplete material, not an exhaustive validator.
 * Agent families can emit new structured analysis shapes; the tracker stores
 * `record_type` as a bounded string so registry-defined agents do not need code
 * releases before their analysis records can be persisted.
 */
export const ANALYSIS_RECORD_TYPES = [
  // Validator
  'category_breakdown', 'criterion_deduction', 'auto_fail_check',
  // Analyst — Nietzsche
  'convention', 'power_map',
  // Analyst — Heraclitus
  'tension', 'tension_health', 'stagnation',
  // Analyst — Aristotle
  'four_cause', 'essential_property',
  // Analyst — Confucius
  'naming_chain', 'ritual',
  // Analyst — Hume
  'evidence_claim', 'causal_claim', 'is_ought_violation', 'habitual_assumption',
  // Analyst — Popper
  'theory', 'corroboration', 'untested_assumption', 'bold_conjecture',
  // Analyst — Plato
  'participation_gap', 'shadow', 'hierarchy_inversion', 'form_extraction',
  // Analyst — Socrates
  'confidence_basis', 'examination_debt',
  // Analyst — Laozi
  'intervention_chain', 'reversal', 'emptiness', 'control_paradox',
  // Analyst — Archimedes
  'stress_concentration', 'lever_point', 'displacement', 'fulcrum', 'center_of_gravity',
  // Explorer
  'commitment', 'contradiction', 'inquiry_question', 'definitional_stability',
  // Forecaster
  'decay_vector', 'tension_trajectory', 'cascade_layer', 'capability_emergence',
  // Executor
  'artifact', 'completion_criterion',
  // Generator
  'improvement', 'evidence_finding',
] as const;

export const AnalysisRecordTypeSchema = z
  .string()
  .min(1)
  .max(50)
  .describe(`Bounded free-form string. Known record types: ${ANALYSIS_RECORD_TYPES.join(', ')}`);
export type AnalysisRecordType = string;

/**
 * Note types for issue annotations
 */
export const NoteTypeSchema = z.enum(['context', 'resolution', 'blocker']);
export type NoteType = z.infer<typeof NoteTypeSchema>;

/**
 * Issue merge strategies
 */
export const MergeStrategySchema = z.enum(['keep_target', 'keep_highest_priority']);
export type MergeStrategy = z.infer<typeof MergeStrategySchema>;

/**
 * Issue type classification
 * Accepts domain-specific types (e.g., "deficiency" for legal domains)
 * in addition to universal types (feature, bug, refactor, config, docs, infra, security, test).
 * The API resolves domain types to universal types before storage.
 */
export const IssueTypeSchema = z.string().max(50);
export type IssueType = string;

/**
 * File path schema with client-side validation
 *
 * Validates paths to prevent:
 * - Path traversal attacks (../)
 * - Null byte injection
 * - Excessively long paths
 *
 * Note: The backend API performs authoritative validation;
 * this is defense-in-depth.
 */
export const FilePathSchema = z
  .string()
  .max(1000, 'File path exceeds maximum length of 1000 characters')
  .refine((path) => !path.includes('\0'), 'File path cannot contain null bytes')
  .refine(
    (path) => !path.includes('../') && !path.includes('..\\'),
    'File path cannot contain path traversal sequences'
  );

/**
 * Token usage metrics for agent runs
 *
 * Base schema requires input_tokens and output_tokens.
 * Extended fields (cache_creation, cache_read, total_effective) are optional.
 */
export const TokenUsageSchema = z
  .object({
    input_tokens: z.number().int().nonnegative().describe('Input tokens consumed'),
    output_tokens: z.number().int().nonnegative().describe('Output tokens generated'),
    cache_creation: z.number().int().nonnegative().optional().describe('Cache creation tokens'),
    cache_creation_tokens: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe('Cache creation tokens (alias)'),
    cache_read: z.number().int().nonnegative().optional().describe('Cache read tokens'),
    cache_read_tokens: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe('Cache read tokens (alias)'),
    total_effective: z.number().int().nonnegative().optional().describe('Total effective tokens'),
    total_effective_tokens: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe('Total effective tokens (alias)'),
  })
  .describe('Token usage metrics for an agent run');
export type TokenUsage = z.infer<typeof TokenUsageSchema>;

/**
 * Agent result schema for validation runs
 */
export const AgentResultSchema = z
  .object({
    name: z.string().min(1).describe('Agent name (e.g., code-validator, test-architect)'),
    score: z.number().optional().nullable().describe('Agent score (0-100). Omit for generator/executor agents that do not produce scores.'),
    max_score: z.number().optional().nullable().describe('Maximum possible score. Omit or null for generator/executor agents that do not produce scores (paired with score).'),
    decision: z.string().describe('Agent decision (e.g., PASS, FAIL, CLEAR, BEWITCHED)'),
    definition_version: z.string().max(50).optional().describe('Definition version for version-aware analytics'),
    summary: z.string().optional().describe('Brief human-readable summary of agent result'),
    model: z.string().optional().describe('Model used (e.g., sonnet, opus)'),
    tokens: TokenUsageSchema.optional().describe('Token usage metrics'),
    duration_ms: z
      .number()
      .int()
      .nonnegative()
      .optional()
      .describe('Execution duration in milliseconds'),
    agent_id: z
      .string()
      .max(50)
      .optional()
      .describe('Harness transcript/agent provenance id (e.g., a4f35bf2cacc5f3ac from agent-metrics) — joins this row to its buffer entry and transcript'),
  })
  .describe('Results from a single agent');
export type AgentResult = z.infer<typeof AgentResultSchema>;

/**
 * Recommendation/issue schema for validation findings
 */
export const RecommendationSchema = z
  .object({
    agent: z.string().min(1).describe('Source agent name'),
    title: z.string().min(1).describe('Issue title'),
    priority: PrioritySchema.describe('Issue priority'),
    type: IssueTypeSchema.optional().describe(
      'Issue type. Universal types: feature, bug, refactor, config, docs, infra, security, test. Domain-specific types (e.g., "deficiency", "ambiguity" for legal) are also accepted and resolved by the API.'
    ),
    description: z.string().optional().describe('Detailed description'),
    file_path: FilePathSchema.optional().describe('File path where issue was found'),
    line_number: z.number().int().nonnegative().optional().nullable().describe('Line number in file'),
    category: z.string().optional().describe('Issue category'),
    severity: SeveritySchema.optional().describe('Issue severity'),
    failure_code: z
      .string()
      .regex(STRICT_FAILURE_CODE_PATTERN, {
        message:
          'Must be one of the 28 canonical failure modes plus severity (e.g., EPI-VAL/H, STR-OMI/M). ' +
          'Modes are domain-bound — SEM-VAL is not a member (VAL is an EPI mode). ' +
          'Fetch the taxonomy resource or get_taxonomy for the full set.',
      })
      .optional()
      .describe('Failure taxonomy code from the closed canonical set (e.g., EPI-VAL/H)'),
    failure_domain: FailureDomainSchema.optional().describe('Failure domain'),
    failure_mode: z
      .string()
      .regex(/^[A-Z]{3}$/, {
        message: 'Must be exactly 3 uppercase letters (e.g., VAL, OMI, FRA). For the full code (e.g., EPI-VAL/H), use failure_code instead.',
      })
      .optional()
      .describe('Failure mode identifier — 3 uppercase letters (e.g., VAL, OMI)'),
    classification_confidence: ConfidenceSchema.optional().describe('Classification confidence'),
    classified_by: ClassifierSchema.optional().describe('Classification source'),
    secondary_failure_codes: z.array(z.string()).optional().describe('Secondary failure codes'),
    taxonomy_version: z.string().optional().describe('Taxonomy version used'),
  })
  .describe('A single issue or recommendation from validation');
export type Recommendation = z.infer<typeof RecommendationSchema>;

/**
 * Summary statistics schema for validation runs
 */
export const ValidationSummarySchema = z
  .object({
    all_gates_passed: z.boolean().optional().describe('Whether all validation gates passed'),
    average_score: z.number().optional().describe('Average score across all agents'),
  })
  .describe('Summary statistics for the validation run');
export type ValidationSummary = z.infer<typeof ValidationSummarySchema>;
