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
    // maxEgressBytes is NOT a response bound in practice. mcp-secure-server's
    // Layer 4 evaluates it at REQUEST time as `argsBytes * 16` (layer4-semantics
    // `estimatedEgress`, 0.0.20-security) — it never sees a response. Any value
    // below 16 * maxArgsSize therefore silently overrides maxArgsSize at
    // maxEgressBytes / 16: the 1 MB that stood here capped args at 64 KB, and a
    // 97-recommendation ship run was refused 2026-09-10 with
    // "Estimated egress exceeds policy: 1156352 > 1048576" while 1.1 MB under
    // maxArgsSize. 32 MB = 16 * 2 MB is the floor at which the args cap is the
    // binding one again. Real responses are ~10-50 KB; this is a derived floor,
    // not a response budget.
    maxEgressBytes: 32 * MB,
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
    // argsBytes*16 request-time floor (see save_run); was 500 * KB = 32000-byte effective args cap.
    maxEgressBytes: 3200 * KB,
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
    // argsBytes*16 request-time floor (see save_run); was 10 * KB = 640-byte effective args cap.
    maxEgressBytes: 160 * KB,
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
    // argsBytes*16 request-time floor (see save_run); was 50 * KB = 3200-byte effective args cap.
    maxEgressBytes: 160 * KB,
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
    // Same payload as save_run (dry-run); same argsBytes*16 floor — see save_run.
    maxEgressBytes: 32 * MB,
    quotaPerMinute: 60,
    quotaPerHour: 1000,
  },
  {
    name: 'get_issue_history',
    sideEffects: 'read',
    maxArgsSize: 10 * KB,
    // Merges up to 1000 events spanning occurrences, status changes, and notes.
    // Note bodies are MySQL TEXT (up to 64KB each), so a busy issue's history can
    // exceed a 200KB envelope and trip silent truncation. 500KB matches the other
    // bulk read tools (get_analytics, get_agent_lifecycle).
    maxEgressBytes: 500 * KB,
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
    // argsBytes*16 request-time floor (see save_run); was 100 * KB = 6400-byte effective args cap.
    maxEgressBytes: 1280 * KB,
    quotaPerMinute: 120,
    quotaPerHour: 2000,
  },
  {
    name: 'edit_issue',
    sideEffects: 'write',
    maxArgsSize: 20 * KB,
    // argsBytes*16 request-time floor (see save_run); was 50 * KB = 3200-byte effective args cap.
    maxEgressBytes: 320 * KB,
    quotaPerMinute: 120,
    quotaPerHour: 2000,
  },
  {
    name: 'merge_issues',
    sideEffects: 'write',
    maxArgsSize: 20 * KB,
    // argsBytes*16 request-time floor (see save_run); was 50 * KB = 3200-byte effective args cap.
    maxEgressBytes: 320 * KB,
    quotaPerMinute: 60,
    quotaPerHour: 1000,
  },
  {
    // Project-level merge (merge-projects spec v0.3.4) — infrequent,
    // expensive, durable. The hourly cap is the real throttle: LLM-driven
    // callers should never legitimately fan out merges, and unmodeled retry
    // loops are a known failure mode (spec §7 Phase 3 rationale).
    name: 'merge_projects',
    sideEffects: 'write',
    maxArgsSize: 2 * KB,
    // argsBytes*16 request-time floor (see save_run); was 16 * KB = 1024-byte effective args cap.
    maxEgressBytes: 32 * KB,
    quotaPerMinute: 5,
    quotaPerHour: 10,
  },
  {
    name: 'bulk_update_status',
    sideEffects: 'write',
    maxArgsSize: 500 * KB,
    // argsBytes*16 request-time floor (see save_run); was 1 * MB = 65536-byte effective args cap.
    maxEgressBytes: 8000 * KB,
    quotaPerMinute: 60,
    quotaPerHour: 1000,
  },
  {
    name: 'update_run',
    sideEffects: 'write',
    // Must match save_run: update_run accepts the same analysis_records
    // (maxItems 100) and recommendations arrays. Re-derived 2026-08-20 for the
    // 1a per-agent replace semantics: replace is now scoped to the agents
    // named in the payload, but within a named agent it still REPLACES rather
    // than appends — keeping an agent's set means resending it in full, so the
    // worst-case payload is unchanged from the run-wide era and equals
    // save_run's budget. Re-checked 2026-08-21 for 1b merge: merge sends only
    // deltas, but replace remains available and its full-set resend still
    // bounds the worst case — 2 MB stands. Originally raised from 500 * KB on
    // 2026-08-18 after a 65-record write failed.
    maxArgsSize: 2 * MB,
    // maxEgressBytes is NOT a response bound in practice. mcp-secure-server's
    // Layer 4 evaluates it at REQUEST time as `argsBytes * 16` (layer4-semantics
    // `estimatedEgress`, 0.0.20-security) — it never sees a response. Any value
    // below 16 * maxArgsSize therefore silently overrides maxArgsSize at
    // maxEgressBytes / 16: the 1 MB that stood here capped args at 64 KB, and a
    // 97-recommendation ship run was refused 2026-09-10 with
    // "Estimated egress exceeds policy: 1156352 > 1048576" while 1.1 MB under
    // maxArgsSize. 32 MB = 16 * 2 MB is the floor at which the args cap is the
    // binding one again. Real responses are ~10-50 KB; this is a derived floor,
    // not a response budget.
    maxEgressBytes: 32 * MB,
    quotaPerMinute: 120,
    quotaPerHour: 2000,
  },
  {
    name: 'preview_update_run',
    // Read-only by contract: POST on the wire, but the endpoint computes the
    // plan without writing (spec §4; parity with the write path is the API's
    // §6 test 7, not an assumption here).
    sideEffects: 'read',
    // Same worst-case request body as update_run's analysis portion — the
    // preview accepts the identical analysis_records (maxItems 100) /
    // analysis_summary (maxItems 20) payload the write does, so the 2 MB
    // derivation carries over unchanged.
    maxArgsSize: 2 * MB,
    // The real plan (counts plus would_retire_record_ids) fits in 200 KB with
    // margin — but see save_run: the check is argsBytes * 16 at request time,
    // so 200 KB capped the preview's args at 12.5 KB, i.e. a preview of any
    // non-trivial write was refused before the write it was meant to protect.
    // maxEgressBytes is NOT a response bound in practice. mcp-secure-server's
    // Layer 4 evaluates it at REQUEST time as `argsBytes * 16` (layer4-semantics
    // `estimatedEgress`, 0.0.20-security) — it never sees a response. Any value
    // below 16 * maxArgsSize therefore silently overrides maxArgsSize at
    // maxEgressBytes / 16: the 1 MB that stood here capped args at 64 KB, and a
    // 97-recommendation ship run was refused 2026-09-10 with
    // "Estimated egress exceeds policy: 1156352 > 1048576" while 1.1 MB under
    // maxArgsSize. 32 MB = 16 * 2 MB is the floor at which the args cap is the
    // binding one again. Real responses are ~10-50 KB; this is a derived floor,
    // not a response budget.
    maxEgressBytes: 32 * MB,
    // The intended pattern is preview-then-write, so preview volume tracks
    // update_run's — same 120/2000 rather than a derived-down read quota.
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
    // argsBytes*16 request-time floor (see save_run); was 100 * KB = 6400-byte effective args cap.
    maxEgressBytes: 1600 * KB,
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
    // argsBytes*16 request-time floor (see save_run); was 50 * KB = 3200-byte effective args cap.
    maxEgressBytes: 160 * KB,
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
    // argsBytes*16 request-time floor (see save_run); was 10 * KB = 640-byte effective args cap.
    maxEgressBytes: 160 * KB,
    quotaPerMinute: 60,
    quotaPerHour: 1000,
  },
  {
    name: 'update_profile',
    sideEffects: 'write',
    maxArgsSize: 10 * KB,
    // argsBytes*16 request-time floor (see save_run); was 10 * KB = 640-byte effective args cap.
    maxEgressBytes: 160 * KB,
    quotaPerMinute: 30,
    quotaPerHour: 200,
  },
  {
    name: 'update_project',
    sideEffects: 'write',
    maxArgsSize: 10 * KB,
    // argsBytes*16 request-time floor (see save_run); was 10 * KB = 640-byte effective args cap.
    maxEgressBytes: 160 * KB,
    quotaPerMinute: 60,
    quotaPerHour: 1000,
  },
  {
    name: 'soft_delete_project',
    sideEffects: 'write',
    maxArgsSize: 10 * KB,
    // argsBytes*16 request-time floor (see save_run); was 10 * KB = 640-byte effective args cap.
    maxEgressBytes: 160 * KB,
    quotaPerMinute: 10,
    quotaPerHour: 50,
  },
  {
    name: 'restore_project',
    sideEffects: 'write',
    maxArgsSize: 10 * KB,
    // argsBytes*16 request-time floor (see save_run); was 10 * KB = 640-byte effective args cap.
    maxEgressBytes: 160 * KB,
    quotaPerMinute: 30,
    quotaPerHour: 300,
  },
  {
    // Project re-home (project-org-routing-and-rehome spec §4.1, D14) — moves
    // a project's whole history between orgs. Same posture as merge_projects:
    // infrequent, durable (reversible only by another move), never a fan-out.
    // The hourly cap is the throttle against an unmodeled retry loop.
    name: 'rehome_project',
    sideEffects: 'write',
    maxArgsSize: 2 * KB,
    maxEgressBytes: 32 * KB,
    quotaPerMinute: 5,
    quotaPerHour: 20,
  },
  {
    // The D19 member-visible audit feed — a paged read; egress sized for a
    // 200-entry page of audit rows with details blobs.
    name: 'get_org_audit_feed',
    sideEffects: 'read',
    maxArgsSize: 2 * KB,
    maxEgressBytes: 512 * KB,
    quotaPerMinute: 60,
    quotaPerHour: 600,
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
    // argsBytes*16 request-time floor (see save_run); was 10 * KB = 640-byte effective args cap.
    maxEgressBytes: 160 * KB,
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
    // argsBytes*16 request-time floor (see save_run); was 100 * KB = 6400-byte effective args cap.
    maxEgressBytes: 160 * KB,
    quotaPerMinute: 120,
    quotaPerHour: 2000,
  },
  {
    name: 'update_issue_by_fingerprint',
    sideEffects: 'write',
    maxArgsSize: 20 * KB,
    // argsBytes*16 request-time floor (see save_run); was 20 * KB = 1280-byte effective args cap.
    maxEgressBytes: 320 * KB,
    quotaPerMinute: 60,
    quotaPerHour: 1000,
  },
  {
    name: 'restore_issue',
    sideEffects: 'write',
    maxArgsSize: 10 * KB,
    // argsBytes*16 request-time floor (see save_run); was 100 * KB = 6400-byte effective args cap.
    maxEgressBytes: 160 * KB,
    quotaPerMinute: 60,
    quotaPerHour: 1000,
  },
  {
    name: 'soft_delete_issue',
    sideEffects: 'write',
    maxArgsSize: 10 * KB,
    // argsBytes*16 request-time floor (see save_run); was 10 * KB = 640-byte effective args cap.
    maxEgressBytes: 160 * KB,
    quotaPerMinute: 60,
    quotaPerHour: 1000,
  },
  {
    name: 'undo_issue_status',
    sideEffects: 'write',
    maxArgsSize: 10 * KB,
    // argsBytes*16 request-time floor (see save_run); was 100 * KB = 6400-byte effective args cap.
    maxEgressBytes: 160 * KB,
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
    // argsBytes*16 request-time floor (see save_run); was 50 * KB = 3200-byte effective args cap.
    maxEgressBytes: 160 * KB,
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
