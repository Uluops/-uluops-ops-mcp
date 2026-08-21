/**
 * Canonical inventory of every MCP tool the server is expected to register.
 *
 * Single source of truth shared by tools-integration.test.ts and
 * tool-registry.test.ts. Adding a tool requires exactly one change here.
 */

export const EXPECTED_TOOLS = [
  // P0 Core Tools
  'save_run',
  'query_issues',
  'update_status',
  'get_project_summary',
  'delete_project',
  // P1 Extended Tools
  'get_issue_details',
  'get_run_details',
  'diff_runs',
  'archive_runs',
  'get_analytics',
  'search_issues',
  'list_agents',
  'get_agent_lifecycle',
  'validate_run',
  'get_issue_history',
  'add_issue_note',
  'edit_issue',
  'merge_issues',
  'merge_projects',
  'bulk_update_status',
  'update_run',
  'preview_update_run',
  'get_agent_reliability',
  'create_issue',
  // P2 Project Tools
  'list_projects',
  'get_project',
  'get_project_trends',
  'create_project',
  'update_project',
  'soft_delete_project',
  'restore_project',
  // User profile
  'update_profile',
  // P2 Run Tools
  'get_run',
  'list_runs',
  'get_latest_run',
  'delete_run',
  // P2 Issue Tools
  'get_issue_by_fingerprint',
  'update_issue_by_fingerprint',
  'restore_issue',
  'soft_delete_issue',
  'undo_issue_status',
  // P2 Analysis Tools
  'get_run_analysis',
  'get_project_analysis',
  'query_analysis_records',
  'get_agent_runs_analysis',
  // P2 Taxonomy Tools
  'get_taxonomy',
  'get_full_taxonomy_analytics',
  'get_burndown',
  'get_velocity',
  'get_discovery',
  'get_agent_matrix',
] as const;

export const EXPECTED_TOOL_COUNT = EXPECTED_TOOLS.length;
