/**
 * Tool Registry Configuration
 *
 * Per-tool security policies for the MCP server.
 * Required by mcp-secure-server's semantic validation layer.
 *
 * Since this is a thin client adapter (security enforced at API layer),
 * we use permissive defaults with generous limits.
 */

import type { ToolSpec } from 'mcp-secure-server';

// Size constants - generous limits for validation workflows
const KB = 1024;
const MB = 1024 * KB;

/**
 * All uluops-tracker tools (P0 + P1 + P2)
 *
 * Limits are set high since:
 * 1. Security is enforced at the API layer
 * 2. Claude Code is trusted automation
 * 3. Validation workflows can produce large payloads
 *
 * Quota rationale (per-tool rate limits):
 * - quotaPerMinute: 240 for reads (4/sec), 120 for writes (2/sec), 60 for bulk ops
 * - quotaPerHour: 5000 for frequent reads, 2000 for writes, 1000 for batch ops
 * - Destructive ops (delete_*): 10/min, 50/hr to prevent accidental mass deletion
 */
export const toolRegistry: ToolSpec[] = [
  // ============================================================================
  // P0 Core Tools
  // ============================================================================
  {
    name: 'save_run',
    sideEffects: 'write',
    maxArgsSize: 2 * MB,
    // Response includes full issue list with all fields
    maxEgressBytes: 1 * MB,
    quotaPerMinute: 120,
    quotaPerHour: 2000,
  },
  {
    name: 'query_issues',
    sideEffects: 'read',
    maxArgsSize: 50 * KB,
    maxEgressBytes: 1 * MB,
    quotaPerMinute: 240,
    quotaPerHour: 5000,
  },
  {
    name: 'update_status',
    sideEffects: 'write',
    maxArgsSize: 200 * KB,
    maxEgressBytes: 500 * KB,
    quotaPerMinute: 120,
    quotaPerHour: 2000,
  },
  {
    name: 'get_project_summary',
    sideEffects: 'read',
    maxArgsSize: 10 * KB,
    maxEgressBytes: 500 * KB,
    quotaPerMinute: 240,
    quotaPerHour: 5000,
  },
  {
    name: 'delete_project',
    sideEffects: 'write',
    maxArgsSize: 10 * KB,
    maxEgressBytes: 10 * KB,
    quotaPerMinute: 10,
    quotaPerHour: 50,
  },

  // ============================================================================
  // P1 Extended Tools
  // ============================================================================
  {
    name: 'get_issue_details',
    sideEffects: 'read',
    maxArgsSize: 10 * KB,
    maxEgressBytes: 200 * KB,
    quotaPerMinute: 240,
    quotaPerHour: 5000,
  },
  {
    name: 'get_run_details',
    sideEffects: 'read',
    maxArgsSize: 10 * KB,
    maxEgressBytes: 1 * MB,
    quotaPerMinute: 240,
    quotaPerHour: 5000,
  },
  {
    name: 'diff_runs',
    sideEffects: 'read',
    maxArgsSize: 10 * KB,
    maxEgressBytes: 500 * KB,
    quotaPerMinute: 120,
    quotaPerHour: 2000,
  },
  {
    name: 'archive_runs',
    sideEffects: 'write',
    maxArgsSize: 10 * KB,
    maxEgressBytes: 50 * KB,
    quotaPerMinute: 20,
    quotaPerHour: 200,
  },
  {
    name: 'get_analytics',
    sideEffects: 'read',
    maxArgsSize: 10 * KB,
    maxEgressBytes: 500 * KB,
    quotaPerMinute: 120,
    quotaPerHour: 1000,
  },
  {
    name: 'search_issues',
    sideEffects: 'read',
    maxArgsSize: 20 * KB,
    maxEgressBytes: 1 * MB,
    quotaPerMinute: 120,
    quotaPerHour: 2000,
  },
  {
    name: 'list_agents',
    sideEffects: 'read',
    maxArgsSize: 10 * KB,
    maxEgressBytes: 200 * KB,
    quotaPerMinute: 240,
    quotaPerHour: 5000,
  },
  {
    name: 'get_agent_lifecycle',
    sideEffects: 'read',
    maxArgsSize: 10 * KB,
    maxEgressBytes: 500 * KB,
    quotaPerMinute: 120,
    quotaPerHour: 2000,
  },
  {
    name: 'validate_run',
    sideEffects: 'read',
    maxArgsSize: 2 * MB,
    maxEgressBytes: 1 * MB,
    quotaPerMinute: 60,
    quotaPerHour: 1000,
  },
  {
    name: 'get_issue_history',
    sideEffects: 'read',
    maxArgsSize: 10 * KB,
    maxEgressBytes: 200 * KB,
    quotaPerMinute: 240,
    quotaPerHour: 5000,
  },
  {
    name: 'add_issue_note',
    sideEffects: 'write',
    // content column is MySQL TEXT (64KB max). Combined with the response
    // payload (the note + issue context), 20KB was too tight for legitimate
    // stack-trace-heavy notes. Bumped to 100KB.
    maxArgsSize: 80 * KB,
    maxEgressBytes: 100 * KB,
    quotaPerMinute: 120,
    quotaPerHour: 2000,
  },
  {
    name: 'edit_issue',
    sideEffects: 'write',
    maxArgsSize: 20 * KB,
    maxEgressBytes: 50 * KB,
    quotaPerMinute: 120,
    quotaPerHour: 2000,
  },
  {
    name: 'merge_issues',
    sideEffects: 'write',
    maxArgsSize: 20 * KB,
    maxEgressBytes: 50 * KB,
    quotaPerMinute: 60,
    quotaPerHour: 1000,
  },
  {
    name: 'bulk_update_status',
    sideEffects: 'write',
    maxArgsSize: 500 * KB,
    maxEgressBytes: 1 * MB,
    quotaPerMinute: 60,
    quotaPerHour: 1000,
  },
  {
    name: 'update_run',
    sideEffects: 'write',
    maxArgsSize: 500 * KB,
    maxEgressBytes: 500 * KB,
    quotaPerMinute: 120,
    quotaPerHour: 2000,
  },
  {
    name: 'get_agent_reliability',
    sideEffects: 'read',
    maxArgsSize: 10 * KB,
    maxEgressBytes: 200 * KB,
    quotaPerMinute: 120,
    quotaPerHour: 1000,
  },
  {
    name: 'create_issue',
    sideEffects: 'write',
    maxArgsSize: 100 * KB,
    maxEgressBytes: 100 * KB,
    quotaPerMinute: 120,
    quotaPerHour: 2000,
  },

  // ============================================================================
  // P2 Project Tools
  // ============================================================================
  {
    name: 'list_projects',
    sideEffects: 'read',
    maxArgsSize: 10 * KB,
    maxEgressBytes: 500 * KB,
    quotaPerMinute: 240,
    quotaPerHour: 5000,
  },
  {
    name: 'get_project',
    sideEffects: 'read',
    maxArgsSize: 10 * KB,
    maxEgressBytes: 50 * KB,
    quotaPerMinute: 240,
    quotaPerHour: 5000,
  },
  {
    name: 'get_project_trends',
    sideEffects: 'read',
    maxArgsSize: 10 * KB,
    maxEgressBytes: 200 * KB,
    quotaPerMinute: 120,
    quotaPerHour: 2000,
  },
  {
    name: 'create_project',
    sideEffects: 'write',
    maxArgsSize: 10 * KB,
    maxEgressBytes: 10 * KB,
    quotaPerMinute: 60,
    quotaPerHour: 1000,
  },
  {
    name: 'update_project',
    sideEffects: 'write',
    maxArgsSize: 10 * KB,
    maxEgressBytes: 10 * KB,
    quotaPerMinute: 60,
    quotaPerHour: 1000,
  },
  {
    name: 'soft_delete_project',
    sideEffects: 'write',
    maxArgsSize: 10 * KB,
    maxEgressBytes: 10 * KB,
    quotaPerMinute: 10,
    quotaPerHour: 50,
  },
  {
    name: 'restore_project',
    sideEffects: 'write',
    maxArgsSize: 10 * KB,
    maxEgressBytes: 10 * KB,
    quotaPerMinute: 30,
    quotaPerHour: 300,
  },

  // ============================================================================
  // P2 Run Tools
  // ============================================================================
  {
    name: 'get_run',
    sideEffects: 'read',
    maxArgsSize: 10 * KB,
    maxEgressBytes: 200 * KB,
    quotaPerMinute: 240,
    quotaPerHour: 5000,
  },
  {
    name: 'list_runs',
    sideEffects: 'read',
    maxArgsSize: 10 * KB,
    maxEgressBytes: 500 * KB,
    quotaPerMinute: 120,
    quotaPerHour: 2000,
  },
  {
    name: 'get_latest_run',
    sideEffects: 'read',
    maxArgsSize: 10 * KB,
    maxEgressBytes: 200 * KB,
    quotaPerMinute: 240,
    quotaPerHour: 5000,
  },
  {
    name: 'delete_run',
    sideEffects: 'write',
    maxArgsSize: 10 * KB,
    maxEgressBytes: 10 * KB,
    quotaPerMinute: 10,
    quotaPerHour: 50,
  },

  // ============================================================================
  // P2 Issue Tools
  // ============================================================================
  {
    name: 'get_issue_by_fingerprint',
    sideEffects: 'read',
    maxArgsSize: 10 * KB,
    maxEgressBytes: 100 * KB,
    quotaPerMinute: 120,
    quotaPerHour: 2000,
  },
  {
    name: 'update_issue_by_fingerprint',
    sideEffects: 'write',
    maxArgsSize: 20 * KB,
    maxEgressBytes: 20 * KB,
    quotaPerMinute: 60,
    quotaPerHour: 1000,
  },
  {
    name: 'restore_issue',
    sideEffects: 'write',
    maxArgsSize: 10 * KB,
    maxEgressBytes: 100 * KB,
    quotaPerMinute: 60,
    quotaPerHour: 1000,
  },
  {
    name: 'soft_delete_issue',
    sideEffects: 'write',
    maxArgsSize: 10 * KB,
    maxEgressBytes: 10 * KB,
    quotaPerMinute: 60,
    quotaPerHour: 1000,
  },
  {
    name: 'undo_issue_status',
    sideEffects: 'write',
    maxArgsSize: 10 * KB,
    maxEgressBytes: 100 * KB,
    quotaPerMinute: 30,
    quotaPerHour: 500,
  },

  // ============================================================================
  // P2 Taxonomy Tools
  // ============================================================================
  {
    name: 'get_taxonomy',
    sideEffects: 'read',
    maxArgsSize: 10 * KB,
    maxEgressBytes: 50 * KB,
    quotaPerMinute: 240,
    quotaPerHour: 5000,
  },
  {
    name: 'get_full_taxonomy_analytics',
    sideEffects: 'read',
    maxArgsSize: 10 * KB,
    maxEgressBytes: 200 * KB,
    quotaPerMinute: 120,
    quotaPerHour: 1000,
  },
  {
    name: 'get_burndown',
    sideEffects: 'read',
    maxArgsSize: 10 * KB,
    // Burndown includes time series + detailed trend diagnostics
    maxEgressBytes: 500 * KB,
    quotaPerMinute: 120,
    quotaPerHour: 1000,
  },
  {
    name: 'get_velocity',
    sideEffects: 'read',
    maxArgsSize: 10 * KB,
    // Velocity includes sparkline arrays for all failure modes
    maxEgressBytes: 300 * KB,
    quotaPerMinute: 120,
    quotaPerHour: 1000,
  },
  {
    name: 'get_discovery',
    sideEffects: 'read',
    maxArgsSize: 10 * KB,
    // Discovery timeline with new/recurring issue counts per period
    maxEgressBytes: 300 * KB,
    quotaPerMinute: 120,
    quotaPerHour: 1000,
  },
  {
    name: 'get_agent_matrix',
    sideEffects: 'read',
    maxArgsSize: 10 * KB,
    // Agent-taxonomy coverage matrix with blind spot analysis
    maxEgressBytes: 500 * KB,
    quotaPerMinute: 120,
    quotaPerHour: 1000,
  },
  // Analysis tools (v1.4.0)
  {
    name: 'get_run_analysis',
    sideEffects: 'read',
    maxArgsSize: 10 * KB,
    maxEgressBytes: 500 * KB,
    quotaPerMinute: 240,
    quotaPerHour: 5000,
  },
  {
    name: 'get_project_analysis',
    sideEffects: 'read',
    maxArgsSize: 10 * KB,
    maxEgressBytes: 1 * MB,
    quotaPerMinute: 120,
    quotaPerHour: 2000,
  },
  {
    name: 'query_analysis_records',
    sideEffects: 'read',
    maxArgsSize: 10 * KB,
    maxEgressBytes: 1 * MB,
    quotaPerMinute: 120,
    quotaPerHour: 2000,
  },
  {
    name: 'get_agent_runs_analysis',
    sideEffects: 'read',
    maxArgsSize: 10 * KB,
    maxEgressBytes: 500 * KB,
    quotaPerMinute: 120,
    quotaPerHour: 2000,
  },
];
