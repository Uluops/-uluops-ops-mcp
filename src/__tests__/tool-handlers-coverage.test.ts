/**
 * Tool Handler Coverage Tests
 *
 * Behavioral smoke tests for the P2 tools that previously had only
 * registration assertions (via fixtures/expected-tools.ts), leaving their
 * inner `createToolHandler` callback — the arrow that actually calls the SDK —
 * uncovered (the function-coverage gap that kept these files at 1/2 functions).
 *
 * Each case registers the tool, extracts the handler, invokes it with valid
 * input, and asserts the wired SDK method was called and a non-error response
 * came back. This exercises the full per-tool pipeline: Zod validation →
 * normalizeKeys → SDK call → success response.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';

import { registerCreateProjectTool } from '../tools/create-project.js';
import { registerDeleteRunTool } from '../tools/delete-run.js';
import { registerGetAgentLifecycleTool } from '../tools/get-agent-lifecycle.js';
import { registerGetAgentMatrixTool } from '../tools/get-agent-matrix.js';
import { registerGetAgentRunsAnalysisTool } from '../tools/get-agent-runs-analysis.js';
import { registerGetBurndownTool } from '../tools/get-burndown.js';
import { registerGetDiscoveryTool } from '../tools/get-discovery.js';
import { registerGetFullTaxonomyAnalyticsTool } from '../tools/get-full-taxonomy-analytics.js';
import { registerGetIssueByFingerprintTool } from '../tools/get-issue-by-fingerprint.js';
import { registerGetLatestRunTool } from '../tools/get-latest-run.js';
import { registerGetProjectAnalysisTool } from '../tools/get-project-analysis.js';
import { registerGetProjectTrendsTool } from '../tools/get-project-trends.js';
import { registerGetProjectTool } from '../tools/get-project.js';
import { registerGetRunAnalysisTool } from '../tools/get-run-analysis.js';
import { registerGetRunTool } from '../tools/get-run.js';
import { registerGetTaxonomyTool } from '../tools/get-taxonomy.js';
import { registerGetVelocityTool } from '../tools/get-velocity.js';
import { registerListProjectsTool } from '../tools/list-projects.js';
import { registerListRunsTool } from '../tools/list-runs.js';
import { registerQueryAnalysisRecordsTool } from '../tools/query-analysis-records.js';
import { registerRestoreIssueTool } from '../tools/restore-issue.js';
import { registerRestoreProjectTool } from '../tools/restore-project.js';
import { registerSoftDeleteIssueTool } from '../tools/soft-delete-issue.js';
import { registerSoftDeleteProjectTool } from '../tools/soft-delete-project.js';
import { registerUndoIssueStatusTool } from '../tools/undo-issue-status.js';
import { registerUpdateIssueByFingerprintTool } from '../tools/update-issue-by-fingerprint.js';
import { registerUpdateProfileTool } from '../tools/update-profile.js';
import { registerUpdateProjectTool } from '../tools/update-project.js';

const TEST_UUID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';

type Register = (server: McpServerToolRegistration, client: OpsClient) => void;

interface Case {
  name: string;
  register: Register;
  domain: string;
  method: string;
  input: Record<string, unknown>;
}

const cases: Case[] = [
  { name: 'create_project', register: registerCreateProjectTool, domain: 'projects', method: 'create', input: { name: 'Test Project' } },
  { name: 'delete_run', register: registerDeleteRunTool, domain: 'runs', method: 'delete', input: { run_id: TEST_UUID, confirm: true } },
  { name: 'get_agent_lifecycle', register: registerGetAgentLifecycleTool, domain: 'analytics', method: 'getAgentLifecycle', input: { name: 'my-agent' } },
  { name: 'get_agent_matrix', register: registerGetAgentMatrixTool, domain: 'analytics', method: 'getAgentMatrix', input: {} },
  { name: 'get_agent_runs_analysis', register: registerGetAgentRunsAnalysisTool, domain: 'runs', method: 'getAgentRunsAnalysis', input: { agent_name: 'a', project: 'p' } },
  { name: 'get_burndown', register: registerGetBurndownTool, domain: 'analytics', method: 'getBurndown', input: {} },
  { name: 'get_discovery', register: registerGetDiscoveryTool, domain: 'analytics', method: 'getDiscovery', input: {} },
  { name: 'get_full_taxonomy_analytics', register: registerGetFullTaxonomyAnalyticsTool, domain: 'analytics', method: 'getFullTaxonomy', input: {} },
  { name: 'get_issue_by_fingerprint', register: registerGetIssueByFingerprintTool, domain: 'issues', method: 'getByFingerprint', input: { fingerprint: 'fp', project: 'p' } },
  { name: 'get_latest_run', register: registerGetLatestRunTool, domain: 'runs', method: 'getLatest', input: { project: 'p' } },
  { name: 'get_project_analysis', register: registerGetProjectAnalysisTool, domain: 'runs', method: 'getProjectAnalysis', input: { project: 'p' } },
  { name: 'get_project_trends', register: registerGetProjectTrendsTool, domain: 'projects', method: 'getTrends', input: { project: 'p' } },
  { name: 'get_project', register: registerGetProjectTool, domain: 'projects', method: 'get', input: { project: 'p' } },
  { name: 'get_run_analysis', register: registerGetRunAnalysisTool, domain: 'runs', method: 'getAnalysis', input: { run_id: TEST_UUID } },
  { name: 'get_run', register: registerGetRunTool, domain: 'runs', method: 'get', input: { run_id: TEST_UUID } },
  { name: 'get_taxonomy', register: registerGetTaxonomyTool, domain: 'taxonomy', method: 'get', input: {} },
  { name: 'get_velocity', register: registerGetVelocityTool, domain: 'analytics', method: 'getVelocity', input: {} },
  { name: 'list_projects', register: registerListProjectsTool, domain: 'projects', method: 'list', input: {} },
  { name: 'list_runs', register: registerListRunsTool, domain: 'runs', method: 'listByProject', input: { project: 'p' } },
  { name: 'query_analysis_records', register: registerQueryAnalysisRecordsTool, domain: 'runs', method: 'queryAnalysisRecords', input: {} },
  { name: 'restore_issue', register: registerRestoreIssueTool, domain: 'issues', method: 'restore', input: { issue_id: TEST_UUID } },
  { name: 'restore_project', register: registerRestoreProjectTool, domain: 'projects', method: 'restore', input: { project: 'p' } },
  { name: 'soft_delete_issue', register: registerSoftDeleteIssueTool, domain: 'issues', method: 'softDelete', input: { issue_id: TEST_UUID } },
  { name: 'soft_delete_project', register: registerSoftDeleteProjectTool, domain: 'projects', method: 'softDelete', input: { project: 'p', confirm: true, confirmation_phrase: 'p' } },
  { name: 'undo_issue_status', register: registerUndoIssueStatusTool, domain: 'issues', method: 'undoLastChange', input: { issue_id: TEST_UUID } },
  { name: 'update_issue_by_fingerprint', register: registerUpdateIssueByFingerprintTool, domain: 'issues', method: 'updateStatusByFingerprint', input: { fingerprint: 'fp', project: 'p', status: 'completed' } },
  { name: 'update_profile', register: registerUpdateProfileTool, domain: 'auth', method: 'updateProfile', input: { username: 'testuser' } },
  { name: 'update_project', register: registerUpdateProjectTool, domain: 'projects', method: 'update', input: { project: 'p', name: 'New Name' } },
];

type MockClient = Record<string, Record<string, ReturnType<typeof vi.fn>>>;

/**
 * Builds a mock OpsClient containing a resolved vi.fn() for every domain.method
 * referenced by the case table, so the handler and the assertion share the same
 * reference.
 */
function makeMockClient(): MockClient {
  const client: MockClient = {};
  for (const { domain, method } of cases) {
    (client[domain] ??= {})[method] ??= vi.fn().mockResolvedValue({ ok: true });
  }
  return client;
}

describe('P2 tool handler behavior (function coverage)', () => {
  let mockServer: McpServerToolRegistration;

  beforeEach(() => {
    mockServer = { tool: vi.fn() };
  });

  it.each(cases)('$name invokes $domain.$method and returns a non-error response', async ({ register, domain, method, input }) => {
    const client = makeMockClient();
    register(mockServer, client as unknown as OpsClient);

    const call = (mockServer.tool as ReturnType<typeof vi.fn>).mock.calls[0];
    const handler = call[3] as (args: unknown) => Promise<unknown>;

    const result = await handler(input);

    expect(client[domain][method]).toHaveBeenCalledTimes(1);
    expect(result).not.toHaveProperty('isError');
  });
});
