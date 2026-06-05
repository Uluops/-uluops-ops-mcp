/**
 * Tool registry - registers all MCP tools
 */

import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';

// P0 Core Tools
import { registerSaveRunTool } from './save-run.js';
import { registerQueryIssuesTool } from './query-issues.js';
import { registerUpdateStatusTool } from './update-status.js';
import { registerGetProjectSummaryTool } from './get-project-summary.js';
import { registerDeleteProjectTool } from './delete-project.js';

// P1 Extended Tools
import { registerGetIssueDetailsTool } from './get-issue-details.js';
import { registerGetRunDetailsTool } from './get-run-details.js';
import { registerDiffRunsTool } from './diff-runs.js';
import { registerArchiveRunsTool } from './archive-runs.js';
import { registerGetAnalyticsTool } from './get-analytics.js';
import { registerSearchIssuesTool } from './search-issues.js';
import { registerListAgentsTool } from './list-agents.js';
import { registerGetAgentLifecycleTool } from './get-agent-lifecycle.js';
import { registerValidateRunTool } from './validate-run.js';
import { registerGetIssueHistoryTool } from './get-issue-history.js';
import { registerAddIssueNoteTool } from './add-issue-note.js';
import { registerEditIssueTool } from './edit-issue.js';
import { registerMergeIssuesTool } from './merge-issues.js';
import { registerBulkUpdateStatusTool } from './bulk-update-status.js';
import { registerUpdateRunTool } from './update-run.js';
import { registerGetAgentReliabilityTool } from './get-agent-reliability.js';
import { registerCreateIssueTool } from './create-issue.js';

// P2 Project Tools
import { registerListProjectsTool } from './list-projects.js';
import { registerGetProjectTool } from './get-project.js';
import { registerGetProjectTrendsTool } from './get-project-trends.js';
import { registerCreateProjectTool } from './create-project.js';
import { registerUpdateProjectTool } from './update-project.js';
import { registerSoftDeleteProjectTool } from './soft-delete-project.js';
import { registerRestoreProjectTool } from './restore-project.js';

// P2 Run Tools
import { registerGetRunTool } from './get-run.js';
import { registerListRunsTool } from './list-runs.js';
import { registerGetLatestRunTool } from './get-latest-run.js';
import { registerDeleteRunTool } from './delete-run.js';

// P2 Issue Tools
import { registerGetIssueByFingerprintTool } from './get-issue-by-fingerprint.js';
import { registerUpdateIssueByFingerprintTool } from './update-issue-by-fingerprint.js';
import { registerRestoreIssueTool } from './restore-issue.js';
import { registerSoftDeleteIssueTool } from './soft-delete-issue.js';
import { registerUndoIssueStatusTool } from './undo-issue-status.js';

// P2 Analysis Tools
import { registerGetRunAnalysisTool } from './get-run-analysis.js';
import { registerGetProjectAnalysisTool } from './get-project-analysis.js';
import { registerQueryAnalysisRecordsTool } from './query-analysis-records.js';
import { registerGetAgentRunsAnalysisTool } from './get-agent-runs-analysis.js';

// P2 Taxonomy Tools
import { registerGetTaxonomyTool } from './get-taxonomy.js';
import { registerGetFullTaxonomyAnalyticsTool } from './get-full-taxonomy-analytics.js';
import { registerGetBurndownTool } from './get-burndown.js';
import { registerGetVelocityTool } from './get-velocity.js';
import { registerGetDiscoveryTool } from './get-discovery.js';
import { registerGetAgentMatrixTool } from './get-agent-matrix.js';

/**
 * Register all MCP tools (P0 + P1 + P2)
 */
export function registerAllTools(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  // P0 Core tools
  registerSaveRunTool(server, opsClient);
  registerQueryIssuesTool(server, opsClient);
  registerUpdateStatusTool(server, opsClient);
  registerGetProjectSummaryTool(server, opsClient);
  registerDeleteProjectTool(server, opsClient);

  // P1 Extended tools
  registerGetIssueDetailsTool(server, opsClient);
  registerGetRunDetailsTool(server, opsClient);
  registerDiffRunsTool(server, opsClient);
  registerArchiveRunsTool(server, opsClient);
  registerGetAnalyticsTool(server, opsClient);
  registerSearchIssuesTool(server, opsClient);
  registerListAgentsTool(server, opsClient);
  registerGetAgentLifecycleTool(server, opsClient);
  registerValidateRunTool(server, opsClient);
  registerGetIssueHistoryTool(server, opsClient);
  registerAddIssueNoteTool(server, opsClient);
  registerEditIssueTool(server, opsClient);
  registerMergeIssuesTool(server, opsClient);
  registerBulkUpdateStatusTool(server, opsClient);
  registerUpdateRunTool(server, opsClient);
  registerGetAgentReliabilityTool(server, opsClient);
  registerCreateIssueTool(server, opsClient);

  // P2 Project tools
  registerListProjectsTool(server, opsClient);
  registerGetProjectTool(server, opsClient);
  registerGetProjectTrendsTool(server, opsClient);
  registerCreateProjectTool(server, opsClient);
  registerUpdateProjectTool(server, opsClient);
  registerSoftDeleteProjectTool(server, opsClient);
  registerRestoreProjectTool(server, opsClient);

  // P2 Run tools
  registerGetRunTool(server, opsClient);
  registerListRunsTool(server, opsClient);
  registerGetLatestRunTool(server, opsClient);
  registerDeleteRunTool(server, opsClient);

  // P2 Issue tools
  registerGetIssueByFingerprintTool(server, opsClient);
  registerUpdateIssueByFingerprintTool(server, opsClient);
  registerRestoreIssueTool(server, opsClient);
  registerSoftDeleteIssueTool(server, opsClient);
  registerUndoIssueStatusTool(server, opsClient);

  // P2 Analysis tools
  registerGetRunAnalysisTool(server, opsClient);
  registerGetProjectAnalysisTool(server, opsClient);
  registerQueryAnalysisRecordsTool(server, opsClient);
  registerGetAgentRunsAnalysisTool(server, opsClient);

  // P2 Taxonomy tools
  registerGetTaxonomyTool(server, opsClient);
  registerGetFullTaxonomyAnalyticsTool(server, opsClient);
  registerGetBurndownTool(server, opsClient);
  registerGetVelocityTool(server, opsClient);
  registerGetDiscoveryTool(server, opsClient);
  registerGetAgentMatrixTool(server, opsClient);
}
