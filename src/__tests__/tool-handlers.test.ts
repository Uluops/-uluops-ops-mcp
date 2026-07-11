/**
 * Tool Handler Tests
 *
 * Tests for tool handler functions, validating both success and error paths.
 * Updated for SDK migration: tools now use OpsClient with namespaced methods
 * and normalizeKeys converts snake_case MCP input to camelCase before SDK calls.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerQueryIssuesTool } from '../tools/query-issues.js';
import { registerUpdateStatusTool } from '../tools/update-status.js';
import { registerGetIssueDetailsTool } from '../tools/get-issue-details.js';
import { registerSaveRunTool } from '../tools/save-run.js';
import { registerDeleteProjectTool } from '../tools/delete-project.js';
import { registerGetProjectSummaryTool } from '../tools/get-project-summary.js';
import { registerGetRunDetailsTool } from '../tools/get-run-details.js';
import { registerDiffRunsTool } from '../tools/diff-runs.js';
import { registerArchiveRunsTool } from '../tools/archive-runs.js';
import { registerGetAnalyticsTool } from '../tools/get-analytics.js';
import { registerSearchIssuesTool } from '../tools/search-issues.js';
import { registerListAgentsTool } from '../tools/list-agents.js';
import { registerValidateRunTool } from '../tools/validate-run.js';
import { registerGetIssueHistoryTool } from '../tools/get-issue-history.js';
import { registerAddIssueNoteTool } from '../tools/add-issue-note.js';
import { registerEditIssueTool } from '../tools/edit-issue.js';
import { registerMergeIssuesTool } from '../tools/merge-issues.js';
import { registerMergeProjectsTool } from '../tools/merge-projects.js';
import { registerBulkUpdateStatusTool } from '../tools/bulk-update-status.js';
import { registerUpdateRunTool } from '../tools/update-run.js';
import { registerGetAgentReliabilityTool } from '../tools/get-agent-reliability.js';
import { registerCreateIssueTool } from '../tools/create-issue.js';
import { NotFoundError, ConflictError } from '@uluops/ops-sdk';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';

// Test UUIDs
const TEST_UUID_1 = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_UUID_2 = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

describe('Tool Handlers', () => {
  let mockServer: McpServerToolRegistration;

  beforeEach(() => {
    mockServer = {
      tool: vi.fn(),
    };
  });

  /**
   * Helper to extract handler from registration and call it
   */
  function getHandler(registration: ReturnType<typeof vi.fn>): (args: unknown) => Promise<unknown> {
    expect(registration).toHaveBeenCalled();
    const call = registration.mock.calls[0];
    return call[3] as (args: unknown) => Promise<unknown>;
  }

  describe('query_issues', () => {
    let mockOpsClient: { projects: { listIssues: ReturnType<typeof vi.fn> } };
    let handler: (args: unknown) => Promise<unknown>;

    beforeEach(() => {
      mockOpsClient = {
        projects: { listIssues: vi.fn() },
      };
      registerQueryIssuesTool(mockServer, mockOpsClient as unknown as OpsClient);
      handler = getHandler(mockServer.tool);
    });

    it('should register with correct name and description', () => {
      const [name, description] = mockServer.tool.mock.calls[0] as [
        string,
        string,
      ];
      expect(name).toBe('query_issues');
      // Anchor on the substantive filter vocabulary, not just the opening
      // words — a description that lost its filter documentation should fail.
      expect(description).toContain('Query issues');
      expect(description.length).toBeGreaterThan(40);
      expect(description).toMatch(/status/i);
      expect(description).toMatch(/priority/i);
    });

    it('should call SDK with valid input', async () => {
      mockOpsClient.projects.listIssues.mockResolvedValue({
        data: [{ id: TEST_UUID_1, title: 'Test Issue' }],
        count: 1,
      });

      const result = await handler({ project: 'test-project' });

      // normalizeKeys converts snake_case to camelCase; project is split out
      expect(mockOpsClient.projects.listIssues).toHaveBeenCalledWith(
        'test-project',
        {
          status: 'open',
          priority: 'all',
          includeResolved: false,
          limit: 50,
        }
      );
      expect(result).toEqual({
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              { data: [{ id: TEST_UUID_1, title: 'Test Issue' }], count: 1 },
              null,
              2
            ),
          },
        ],
      });
    });

    it('should pass all filter options to SDK', async () => {
      mockOpsClient.projects.listIssues.mockResolvedValue({ data: [], count: 0 });

      await handler({
        project: 'test-project',
        workflow_type: 'ship',
        status: 'completed',
        priority: 'critical',
        agent: 'code-validator',
        min_times_seen: 3,
        include_resolved: true,
        failure_domain: 'SEM',
        severity: 'high',
        limit: 25,
      });

      // query_issues explicitly picks SDK-compatible fields only (workflowType excluded)
      expect(mockOpsClient.projects.listIssues).toHaveBeenCalledWith(
        'test-project',
        {
          status: 'completed',
          priority: 'critical',
          agent: 'code-validator',
          minTimesSeen: 3,
          includeResolved: true,
          failureDomain: 'SEM',
          severity: 'high',
          limit: 25,
        }
      );
    });

    it('should return validation error for missing required fields', async () => {
      const result = (await handler({})) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Validation failed');
      expect(mockOpsClient.projects.listIssues).not.toHaveBeenCalled();
    });

    it('should coerce string-typed numeric params to numbers (MCP JSON-RPC quirk)', async () => {
      mockOpsClient.projects.listIssues.mockResolvedValue({ data: [], count: 0 });

      // MCP clients sometimes serialize numbers as strings.
      // coerceNumericFields runs before Zod, so this must not fail validation.
      await handler({
        project: 'test-project',
        limit: '25' as unknown as number,
        min_times_seen: '3' as unknown as number,
      });

      expect(mockOpsClient.projects.listIssues).toHaveBeenCalledWith(
        'test-project',
        expect.objectContaining({ limit: 25, minTimesSeen: 3 }),
      );
    });

    it('should reject Infinity / NaN from string coercion', async () => {
      // Number("Infinity") === Infinity; Number.isFinite rejects it.
      const result = (await handler({
        project: 'test-project',
        limit: 'Infinity' as unknown as number,
      })) as any;

      // Coercion drops the value; Zod then rejects "Infinity" as a string.
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Validation failed');
    });

    it('should return validation error for invalid enum value', async () => {
      const result = (await handler({
        project: 'test',
        status: 'invalid-status',
      })) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Validation failed');
    });

    it('should handle API errors', async () => {
      mockOpsClient.projects.listIssues.mockRejectedValue(new NotFoundError('Project'));

      const result = (await handler({ project: 'missing' })) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Project not found');
    });

    it('should handle network errors', async () => {
      mockOpsClient.projects.listIssues.mockRejectedValue(new Error('Network error'));

      const result = (await handler({ project: 'test' })) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Network error');
    });
  });

  describe('update_status', () => {
    let mockOpsClient: { projects: { bulkUpdateIssueStatus: ReturnType<typeof vi.fn> } };
    let handler: (args: unknown) => Promise<unknown>;

    beforeEach(() => {
      mockOpsClient = {
        projects: { bulkUpdateIssueStatus: vi.fn() },
      };
      registerUpdateStatusTool(mockServer, mockOpsClient as unknown as OpsClient);
      handler = getHandler(mockServer.tool);
    });

    it('should register with correct name', () => {
      const [name] = mockServer.tool.mock.calls[0];
      expect(name).toBe('update_status');
    });

    it('should update issue by UUID', async () => {
      mockOpsClient.projects.bulkUpdateIssueStatus.mockResolvedValue({
        updated: 1,
        results: [{ id: TEST_UUID_1, status: 'completed' }],
      });

      const result = await handler({
        project: 'test-project',
        updates: [{ id: TEST_UUID_1, status: 'completed' }],
      });

      expect(mockOpsClient.projects.bulkUpdateIssueStatus).toHaveBeenCalledWith(
        'test-project',
        [{ id: TEST_UUID_1, status: 'completed' }]
      );
      expect(result).not.toHaveProperty('isError');
    });

    it('should update issue by fingerprint', async () => {
      mockOpsClient.projects.bulkUpdateIssueStatus.mockResolvedValue({ updated: 1, results: [] });

      await handler({
        project: 'test-project',
        updates: [{ fingerprint: 'abc123hash', status: 'deferred', reason: 'Out of scope' }],
      });

      expect(mockOpsClient.projects.bulkUpdateIssueStatus).toHaveBeenCalledWith(
        'test-project',
        [{ fingerprint: 'abc123hash', status: 'deferred', reason: 'Out of scope' }]
      );
    });

    it('should update issue by file_path and title', async () => {
      mockOpsClient.projects.bulkUpdateIssueStatus.mockResolvedValue({ updated: 1, results: [] });

      await handler({
        project: 'test-project',
        updates: [{ file_path: 'src/api.ts', title: 'Fix error handling', status: 'wontfix' }],
      });

      // normalizeKeys converts file_path to filePath in nested objects
      expect(mockOpsClient.projects.bulkUpdateIssueStatus).toHaveBeenCalledWith(
        'test-project',
        [{ filePath: 'src/api.ts', title: 'Fix error handling', status: 'wontfix' }]
      );
    });

    it('should handle multiple updates', async () => {
      mockOpsClient.projects.bulkUpdateIssueStatus.mockResolvedValue({ updated: 3, results: [] });

      await handler({
        project: 'test-project',
        updates: [
          { id: TEST_UUID_1, status: 'completed' },
          { id: TEST_UUID_2, status: 'completed' },
          { fingerprint: 'xyz', status: 'deferred' },
        ],
      });

      expect(mockOpsClient.projects.bulkUpdateIssueStatus).toHaveBeenCalled();
      const [, updates] = mockOpsClient.projects.bulkUpdateIssueStatus.mock.calls[0];
      expect(updates).toHaveLength(3);
    });

    it('should reject invalid UUID format', async () => {
      const result = (await handler({
        project: 'test',
        updates: [{ id: 'not-a-uuid', status: 'completed' }],
      })) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Validation failed');
      expect(mockOpsClient.projects.bulkUpdateIssueStatus).not.toHaveBeenCalled();
    });

    it('should reject empty updates array', async () => {
      const result = (await handler({
        project: 'test',
        updates: [],
      })) as any;

      expect(result.isError).toBe(true);
      expect(mockOpsClient.projects.bulkUpdateIssueStatus).not.toHaveBeenCalled();
    });

    it('should handle API errors', async () => {
      mockOpsClient.projects.bulkUpdateIssueStatus.mockRejectedValue(
        new NotFoundError('Issue')
      );

      const result = (await handler({
        project: 'test',
        updates: [{ id: TEST_UUID_1, status: 'completed' }],
      })) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Issue not found');
    });
  });

  describe('get_issue_details', () => {
    let mockOpsClient: { issues: { getDetails: ReturnType<typeof vi.fn> } };
    let handler: (args: unknown) => Promise<unknown>;

    beforeEach(() => {
      mockOpsClient = {
        issues: { getDetails: vi.fn() },
      };
      registerGetIssueDetailsTool(mockServer, mockOpsClient as unknown as OpsClient);
      handler = getHandler(mockServer.tool);
    });

    it('should register with correct name', () => {
      const [name] = mockServer.tool.mock.calls[0];
      expect(name).toBe('get_issue_details');
    });

    it('should call SDK with UUID', async () => {
      mockOpsClient.issues.getDetails.mockResolvedValue({
        data: {
          issue: { id: TEST_UUID_1, title: 'Test' },
          occurrences: [],
        },
      });

      await handler({ id: TEST_UUID_1 });

      // Only the ID is passed to the SDK method
      expect(mockOpsClient.issues.getDetails).toHaveBeenCalledWith(TEST_UUID_1);
    });

    it('should tolerate stray include_* keys without error', async () => {
      mockOpsClient.issues.getDetails.mockResolvedValue({ data: { issue: {} } });

      const result = await handler({
        id: TEST_UUID_1,
        include_occurrences: false,
        include_related: true,
      });

      // These options were removed from the schema (the /details endpoint has no
      // toggles); the non-strict Zod object strips them and the SDK is still
      // called with just the ID.
      expect(mockOpsClient.issues.getDetails).toHaveBeenCalledWith(TEST_UUID_1);
      expect(result).not.toHaveProperty('isError');
    });

    it('should reject non-UUID id', async () => {
      const result = (await handler({ id: 'not-a-uuid' })) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Validation failed');
      expect(mockOpsClient.issues.getDetails).not.toHaveBeenCalled();
    });

    it('should reject numeric id', async () => {
      const result = (await handler({ id: 123 })) as any;

      expect(result.isError).toBe(true);
      expect(mockOpsClient.issues.getDetails).not.toHaveBeenCalled();
    });

    it('should handle API errors', async () => {
      mockOpsClient.issues.getDetails.mockRejectedValue(new NotFoundError('Issue'));

      const result = (await handler({ id: TEST_UUID_1 })) as any;

      expect(result.isError).toBe(true);
    });
  });

  describe('save_run', () => {
    let mockOpsClient: { runs: { save: ReturnType<typeof vi.fn> } };
    let handler: (args: unknown) => Promise<unknown>;

    beforeEach(() => {
      mockOpsClient = {
        runs: { save: vi.fn() },
      };
      registerSaveRunTool(mockServer, mockOpsClient as unknown as OpsClient);
      handler = getHandler(mockServer.tool);
    });

    it('should register with correct name', () => {
      const [name] = mockServer.tool.mock.calls[0];
      expect(name).toBe('save_run');
    });

    it('should save minimal valid input', async () => {
      mockOpsClient.runs.save.mockResolvedValue({
        run_id: TEST_UUID_1,
        run_number: 1,
        issues_created: 0,
        issues_updated: 0,
      });

      const result = await handler({
        project: 'test-project',
        workflow_type: 'ship',
        agents: [{ name: 'code-validator', score: 85, decision: 'PASS' }],
      });

      expect(mockOpsClient.runs.save).toHaveBeenCalled();
      expect(result).not.toHaveProperty('isError');
    });

    it('should inject an ISO timestamp when the caller omits one', async () => {
      mockOpsClient.runs.save.mockResolvedValue({
        run_id: TEST_UUID_1,
        run_number: 1,
        issues_created: 0,
        issues_updated: 0,
      });

      await handler({
        project: 'test-project',
        workflow_type: 'ship',
        agents: [{ name: 'code-validator', score: 85, decision: 'PASS' }],
      });

      const call = mockOpsClient.runs.save.mock.calls[0][0] as { timestamp?: string };
      expect(typeof call.timestamp).toBe('string');
      // ISO 8601: 2026-06-05T18:58:16.000Z or similar
      expect(call.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    });

    it('should preserve a caller-supplied timestamp instead of overwriting', async () => {
      mockOpsClient.runs.save.mockResolvedValue({
        run_id: TEST_UUID_1,
        run_number: 1,
        issues_created: 0,
        issues_updated: 0,
      });

      const supplied = '2026-01-15T12:00:00.000Z';
      await handler({
        project: 'test-project',
        workflow_type: 'ship',
        timestamp: supplied,
        agents: [{ name: 'code-validator', score: 85, decision: 'PASS' }],
      });

      const call = mockOpsClient.runs.save.mock.calls[0][0] as { timestamp: string };
      expect(call.timestamp).toBe(supplied);
    });

    it('should save with recommendations', async () => {
      mockOpsClient.runs.save.mockResolvedValue({
        run_id: TEST_UUID_1,
        run_number: 1,
        issues_created: 1,
        issues_updated: 0,
      });

      await handler({
        project: 'test-project',
        workflow_type: 'ship',
        agents: [{ name: 'code-validator', score: 85, decision: 'PASS' }],
        recommendations: [
          {
            agent: 'code-validator',
            title: 'Fix linting error',
            priority: 'suggested',
            description: 'ESLint rule violation',
            file_path: 'src/api.ts',
            line_number: 42,
          },
        ],
      });

      expect(mockOpsClient.runs.save).toHaveBeenCalled();
      const call = mockOpsClient.runs.save.mock.calls[0][0];
      // normalizeKeys converts file_path → filePath, line_number → lineNumber
      expect(call.recommendations).toHaveLength(1);
      expect(call.recommendations[0].filePath).toBe('src/api.ts');
      expect(call.recommendations[0].lineNumber).toBe(42);
    });

    it('should reject missing required fields', async () => {
      const result = (await handler({
        project: 'test-project',
        // missing workflow_type and validators
      })) as any;

      expect(result.isError).toBe(true);
      expect(mockOpsClient.runs.save).not.toHaveBeenCalled();
    });

    it('should reject invalid priority in recommendations', async () => {
      const result = (await handler({
        project: 'test-project',
        workflow_type: 'ship',
        agents: [],
        recommendations: [{ agent: 'test', title: 'Test', priority: 'invalid-priority' }],
      })) as any;

      expect(result.isError).toBe(true);
      expect(mockOpsClient.runs.save).not.toHaveBeenCalled();
    });

    it('should handle API errors', async () => {
      mockOpsClient.runs.save.mockRejectedValue(
        new ConflictError('Duplicate run')
      );

      const result = (await handler({
        project: 'test-project',
        workflow_type: 'ship',
        agents: [{ name: 'test', score: 80, decision: 'PASS' }],
      })) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Duplicate run');
    });
  });

  describe('delete_project', () => {
    let mockOpsClient: { projects: { delete: ReturnType<typeof vi.fn> } };
    let handler: (args: unknown) => Promise<unknown>;

    beforeEach(() => {
      mockOpsClient = {
        projects: { delete: vi.fn() },
      };
      registerDeleteProjectTool(mockServer, mockOpsClient as unknown as OpsClient);
      handler = getHandler(mockServer.tool);
    });

    it('should register with correct name', () => {
      const [name] = mockServer.tool.mock.calls[0];
      expect(name).toBe('delete_project');
    });

    it('should delete project with valid confirmation', async () => {
      mockOpsClient.projects.delete.mockResolvedValue({
        success: true,
        deleted: { runs: 5, issues: 10, occurrences: 25 },
      });

      const result = await handler({
        project: 'test-project',
        confirm: true,
        confirmation_phrase: 'test-project',
      });

      expect(mockOpsClient.projects.delete).toHaveBeenCalledWith(
        'test-project',
        expect.objectContaining({
          project: 'test-project',
          confirm: true,
          confirmationPhrase: 'test-project',
        })
      );
      expect(result).not.toHaveProperty('isError');
    });

    it('should reject when confirm is false', async () => {
      const result = (await handler({
        project: 'test-project',
        confirm: false,
        confirmation_phrase: 'test-project',
      })) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('confirm=true');
      expect(mockOpsClient.projects.delete).not.toHaveBeenCalled();
    });

    it('should reject when confirmation phrase does not match', async () => {
      const result = (await handler({
        project: 'test-project',
        confirm: true,
        confirmation_phrase: 'wrong-phrase',
      })) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('must exactly match');
      expect(mockOpsClient.projects.delete).not.toHaveBeenCalled();
    });

    it('should handle API errors', async () => {
      mockOpsClient.projects.delete.mockRejectedValue(new NotFoundError('Project'));

      const result = (await handler({
        project: 'missing',
        confirm: true,
        confirmation_phrase: 'missing',
      })) as any;

      expect(result.isError).toBe(true);
    });

    it('should handle Zod validation errors', async () => {
      const result = (await handler({
        project: '', // Empty string fails min(1) validation
        confirm: true,
        confirmation_phrase: '',
      })) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Validation failed');
      expect(mockOpsClient.projects.delete).not.toHaveBeenCalled();
    });
  });

  describe('get_project_summary', () => {
    let mockOpsClient: { projects: { getSummary: ReturnType<typeof vi.fn> } };
    let handler: (args: unknown) => Promise<unknown>;

    beforeEach(() => {
      mockOpsClient = {
        projects: { getSummary: vi.fn() },
      };
      registerGetProjectSummaryTool(mockServer, mockOpsClient as unknown as OpsClient);
      handler = getHandler(mockServer.tool);
    });

    it('should register with correct name', () => {
      const [name] = mockServer.tool.mock.calls[0];
      expect(name).toBe('get_project_summary');
    });

    it('should get summary with project only', async () => {
      mockOpsClient.projects.getSummary.mockResolvedValue({
        data: { project: 'test', total_runs: 10, open_issues: 5 },
      });

      await handler({ project: 'test-project' });

      expect(mockOpsClient.projects.getSummary).toHaveBeenCalledWith('test-project');
    });

    it('should pass workflow_type filter', async () => {
      mockOpsClient.projects.getSummary.mockResolvedValue({ data: {} });

      await handler({ project: 'test', workflow_type: 'ship' });

      // Current implementation only passes project to SDK
      expect(mockOpsClient.projects.getSummary).toHaveBeenCalledWith('test');
    });

    it('should reject empty project', async () => {
      const result = (await handler({ project: '' })) as any;

      expect(result.isError).toBe(true);
      expect(mockOpsClient.projects.getSummary).not.toHaveBeenCalled();
    });
  });

  describe('get_run_details', () => {
    let mockOpsClient: { runs: { getDetails: ReturnType<typeof vi.fn> } };
    let handler: (args: unknown) => Promise<unknown>;

    beforeEach(() => {
      mockOpsClient = {
        runs: { getDetails: vi.fn() },
      };
      registerGetRunDetailsTool(mockServer, mockOpsClient as unknown as OpsClient);
      handler = getHandler(mockServer.tool);
    });

    it('should register with correct name', () => {
      const [name] = mockServer.tool.mock.calls[0];
      expect(name).toBe('get_run_details');
    });

    it('should get latest run by default', async () => {
      mockOpsClient.runs.getDetails.mockResolvedValue({
        data: { run: { id: TEST_UUID_1, run_number: 5 } },
      });

      await handler({ project: 'test-project' });

      expect(mockOpsClient.runs.getDetails).toHaveBeenCalledWith(
        'test-project',
        undefined
      );
    });

    it('should get specific run by number', async () => {
      mockOpsClient.runs.getDetails.mockResolvedValue({ data: {} });

      await handler({ project: 'test', run_number: 3, workflow_type: 'ship' });

      // normalizeKeys converts run_number → runNumber
      expect(mockOpsClient.runs.getDetails).toHaveBeenCalledWith('test', 3);
    });

    it('should handle API errors', async () => {
      mockOpsClient.runs.getDetails.mockRejectedValue(new NotFoundError('Run'));

      const result = (await handler({ project: 'test', run_number: 999 })) as any;

      expect(result.isError).toBe(true);
    });
  });

  describe('diff_runs', () => {
    let mockOpsClient: { runs: { diff: ReturnType<typeof vi.fn> } };
    let handler: (args: unknown) => Promise<unknown>;

    beforeEach(() => {
      mockOpsClient = {
        runs: { diff: vi.fn() },
      };
      registerDiffRunsTool(mockServer, mockOpsClient as unknown as OpsClient);
      handler = getHandler(mockServer.tool);
    });

    it('should register with correct name', () => {
      const [name] = mockServer.tool.mock.calls[0];
      expect(name).toBe('diff_runs');
    });

    it('should diff two runs', async () => {
      mockOpsClient.runs.diff.mockResolvedValue({
        data: { fixed: [], new_issues: [], unchanged: [] },
      });

      await handler({ project: 'test', base_run: 1, compare_run: 2 });

      // normalizeKeys converts base_run → baseRun, compare_run → compareRun
      expect(mockOpsClient.runs.diff).toHaveBeenCalledWith({
        project: 'test',
        baseRun: 1,
        compareRun: 2,
      });
    });

    it('should reject missing run numbers', async () => {
      const result = (await handler({ project: 'test', base_run: 1 })) as any;

      expect(result.isError).toBe(true);
      expect(mockOpsClient.runs.diff).not.toHaveBeenCalled();
    });
  });

  describe('archive_runs', () => {
    let mockOpsClient: { runs: { archive: ReturnType<typeof vi.fn> } };
    let handler: (args: unknown) => Promise<unknown>;

    beforeEach(() => {
      mockOpsClient = {
        runs: { archive: vi.fn() },
      };
      registerArchiveRunsTool(mockServer, mockOpsClient as unknown as OpsClient);
      handler = getHandler(mockServer.tool);
    });

    it('should register with correct name', () => {
      const [name] = mockServer.tool.mock.calls[0];
      expect(name).toBe('archive_runs');
    });

    it('should archive runs before run number', async () => {
      mockOpsClient.runs.archive.mockResolvedValue({ archived_count: 5 });

      await handler({ project: 'test', before_run_number: 10 });

      expect(mockOpsClient.runs.archive).toHaveBeenCalledWith({
        project: 'test',
        beforeRunNumber: 10,
      });
    });

    it('should archive with keep_last', async () => {
      mockOpsClient.runs.archive.mockResolvedValue({ archived_count: 3 });

      await handler({ project: 'test', keep_last: 5, reason: 'Cleanup' });

      expect(mockOpsClient.runs.archive).toHaveBeenCalledWith({
        project: 'test',
        keepLast: 5,
        reason: 'Cleanup',
      });
    });
  });

  describe('get_analytics', () => {
    let mockOpsClient: { analytics: { getByMetric: ReturnType<typeof vi.fn> } };
    let handler: (args: unknown) => Promise<unknown>;

    beforeEach(() => {
      mockOpsClient = {
        analytics: { getByMetric: vi.fn() },
      };
      registerGetAnalyticsTool(mockServer, mockOpsClient as unknown as OpsClient);
      handler = getHandler(mockServer.tool);
    });

    it('should register with correct name', () => {
      const [name] = mockServer.tool.mock.calls[0];
      expect(name).toBe('get_analytics');
    });

    it('description flags cross_project_patterns as empty-by-default placeholder (T2 §3.2 / F8)', () => {
      // The F8 description note's whole point is to disambiguate `[]` =
      // "metric placeholder" from `[]` = "no patterns in your data" for
      // consumers.  A future rewrite that drops the note would let MCP
      // clients silently treat the placeholder as data.
      const [, description] = mockServer.tool.mock.calls[0];
      const desc = String(description);
      expect(desc).toContain('cross_project_patterns');
      expect(desc).toContain('[]');
      // The semantic disambiguation that's the entire point of the note.
      expect(desc.toLowerCase()).toContain('placeholder');
    });

    it('should get analytics with metric', async () => {
      mockOpsClient.analytics.getByMetric.mockResolvedValue({ data: [] });

      await handler({ metric: 'agent_performance' });

      // metric value stays as-is (normalizeKeys only converts keys, not values)
      expect(mockOpsClient.analytics.getByMetric).toHaveBeenCalledWith(
        'agent_performance',
        { metric: 'agent_performance', days: 30, limit: 20 }
      );
    });

    it('should pass all options', async () => {
      mockOpsClient.analytics.getByMetric.mockResolvedValue({ data: [] });

      await handler({ metric: 'file_hotspots', project: 'test', days: 7, limit: 10 });

      expect(mockOpsClient.analytics.getByMetric).toHaveBeenCalledWith(
        'file_hotspots',
        { metric: 'file_hotspots', project: 'test', days: 7, limit: 10 }
      );
    });

    it('should reject invalid metric', async () => {
      const result = (await handler({ metric: 'invalid_metric' })) as any;

      expect(result.isError).toBe(true);
      expect(mockOpsClient.analytics.getByMetric).not.toHaveBeenCalled();
    });
  });

  describe('search_issues', () => {
    let mockOpsClient: { issues: { search: ReturnType<typeof vi.fn> } };
    let handler: (args: unknown) => Promise<unknown>;

    beforeEach(() => {
      mockOpsClient = {
        issues: { search: vi.fn() },
      };
      registerSearchIssuesTool(mockServer, mockOpsClient as unknown as OpsClient);
      handler = getHandler(mockServer.tool);
    });

    it('should register with correct name', () => {
      const [name] = mockServer.tool.mock.calls[0];
      expect(name).toBe('search_issues');
    });

    it('should search with query', async () => {
      mockOpsClient.issues.search.mockResolvedValue({ data: [], count: 0 });

      await handler({ query: 'authentication error' });

      expect(mockOpsClient.issues.search).toHaveBeenCalledWith({
        query: 'authentication error',
        status: 'all',
        priority: 'all',
        limit: 20,
      });
    });

    it('should pass filter options', async () => {
      mockOpsClient.issues.search.mockResolvedValue({ data: [], count: 0 });

      await handler({
        query: 'test',
        projects: ['proj1', 'proj2'],
        status: 'open',
        priority: 'critical',
        limit: 50,
      });

      expect(mockOpsClient.issues.search).toHaveBeenCalledWith({
        query: 'test',
        projects: ['proj1', 'proj2'],
        status: 'open',
        priority: 'critical',
        limit: 50,
      });
    });

    it('should reject empty query', async () => {
      const result = (await handler({ query: '' })) as any;

      expect(result.isError).toBe(true);
      expect(mockOpsClient.issues.search).not.toHaveBeenCalled();
    });
  });

  describe('list_agents', () => {
    let mockOpsClient: { analytics: { getAgentPerformance: ReturnType<typeof vi.fn> } };
    let handler: (args: unknown) => Promise<unknown>;

    beforeEach(() => {
      mockOpsClient = {
        analytics: { getAgentPerformance: vi.fn() },
      };
      registerListAgentsTool(mockServer, mockOpsClient as unknown as OpsClient);
      handler = getHandler(mockServer.tool);
    });

    it('should register with correct name', () => {
      const [name] = mockServer.tool.mock.calls[0];
      expect(name).toBe('list_agents');
    });

    it('should list agents with empty input', async () => {
      mockOpsClient.analytics.getAgentPerformance.mockResolvedValue([
        { name: 'code-validator' },
      ]);

      await handler({});

      expect(mockOpsClient.analytics.getAgentPerformance).toHaveBeenCalled();
    });
  });

  describe('validate_run', () => {
    let mockOpsClient: { runs: { validate: ReturnType<typeof vi.fn> } };
    let handler: (args: unknown) => Promise<unknown>;

    beforeEach(() => {
      mockOpsClient = {
        runs: { validate: vi.fn() },
      };
      registerValidateRunTool(mockServer, mockOpsClient as unknown as OpsClient);
      handler = getHandler(mockServer.tool);
    });

    it('should register with correct name', () => {
      const [name] = mockServer.tool.mock.calls[0];
      expect(name).toBe('validate_run');
    });

    it('should validate input without saving', async () => {
      mockOpsClient.runs.validate.mockResolvedValue({
        would_create: 2,
        would_update: 1,
        validation_errors: [],
      });

      await handler({
        project: 'test',
        workflow_type: 'ship',
        agents: [{ name: 'code-validator', score: 85, decision: 'PASS' }],
        recommendations: [{ agent: 'test', title: 'Issue', priority: 'suggested' }],
      });

      expect(mockOpsClient.runs.validate).toHaveBeenCalled();
    });
  });

  describe('get_issue_history', () => {
    let mockOpsClient: { issues: { getHistory: ReturnType<typeof vi.fn> } };
    let handler: (args: unknown) => Promise<unknown>;

    beforeEach(() => {
      mockOpsClient = {
        issues: { getHistory: vi.fn() },
      };
      registerGetIssueHistoryTool(mockServer, mockOpsClient as unknown as OpsClient);
      handler = getHandler(mockServer.tool);
    });

    it('should register with correct name', () => {
      const [name] = mockServer.tool.mock.calls[0];
      expect(name).toBe('get_issue_history');
    });

    it('description documents the F10 IssueHistoryEnvelope contract (T2 §3.1)', () => {
      // Description accuracy guard. Issue #2 shortened this so it survives MCP
      // host description truncation, so the contract is now stated in prose
      // (envelope shape + the three event types + undo/tombstone semantics)
      // rather than spelling out every discriminator field. A rewrite that
      // drops the envelope shape or the undo semantics should still fail here;
      // the per-field detail (transitionType/revertedChangeId) now lives on the
      // SDK's IssueHistoryEnvelope type, not in the wire description.
      const [, description] = mockServer.tool.mock.calls[0];
      const desc = String(description);
      // Envelope fields consumers must know to call this.
      expect(desc).toContain('issueId');
      expect(desc).toContain('events');
      expect(desc).toContain('totalEvents');
      expect(desc).toContain('truncated');
      // The three event types.
      expect(desc).toContain('occurrence');
      expect(desc).toContain('status');
      expect(desc).toContain('note');
      // F10 Bug B tombstone semantics.
      expect(desc).toContain('undo');
      // Issue #2: stay within the MCP-host-safe description length budget.
      expect(desc.length).toBeLessThanOrEqual(430);
    });

    it('should get history by issue ID and surface envelope shape in response (T2 §3.1)', async () => {
      // Post-impl r2: the r1 commit claimed to anchor the envelope-shape
      // regression but used `not.toHaveProperty('isError')` — a non-check
      // (passes for any object without isError, including the pre-F10 flat
      // shape).  This version parses the serialized response body and
      // asserts the envelope fields are actually present.
      mockOpsClient.issues.getHistory.mockResolvedValue({
        issueId: TEST_UUID_1,
        events: [],
        totalEvents: 0,
        truncated: false,
      });

      const result = await handler({ issue_id: TEST_UUID_1 });

      // Only issueId is passed to SDK (normalizeKeys converts issue_id → issueId)
      expect(mockOpsClient.issues.getHistory).toHaveBeenCalledWith(TEST_UUID_1);

      // Parse the serialized envelope and assert all four fields are present.
      // If the SDK regresses to the pre-F10 `{ history, notes }` shape, the
      // body would be `{ history: [], notes: [] }` and these assertions fail.
      const r = result as {
        isError?: boolean;
        content: Array<{ type: string; text: string }>;
      };
      expect(r.isError).toBeUndefined();
      const body = JSON.parse(r.content[0].text) as {
        issueId: string;
        events: unknown[];
        totalEvents: number;
        truncated: boolean;
      };
      expect(body.issueId).toBe(TEST_UUID_1);
      expect(Array.isArray(body.events)).toBe(true);
      expect(body.totalEvents).toBe(0);
      expect(body.truncated).toBe(false);
    });

    it('surfaces truncated:true and populated events through the envelope (T2 §3.1)', async () => {
      // Sibling to the above: exercises a non-trivial envelope (truncated
      // flag + a populated event) to prove the envelope passes through
      // without filtering or rewriting.  Without this, a mutation that
      // dropped the `truncated` field in createSuccessResponse would not
      // be caught.
      mockOpsClient.issues.getHistory.mockResolvedValue({
        issueId: TEST_UUID_1,
        events: [
          {
            type: 'status',
            timestamp: '2026-06-08T10:00:00Z',
            oldStatus: 'open',
            newStatus: 'completed',
            reason: 'Fixed',
            transitionType: 'change',
            revertedChangeId: null,
          },
        ],
        totalEvents: 1001,
        truncated: true,
      });

      const result = await handler({ issue_id: TEST_UUID_1 });

      const r = result as {
        isError?: boolean;
        content: Array<{ type: string; text: string }>;
      };
      const body = JSON.parse(r.content[0].text) as {
        events: Array<{ type: string }>;
        totalEvents: number;
        truncated: boolean;
      };
      expect(body.truncated).toBe(true);
      expect(body.totalEvents).toBe(1001);
      expect(body.events).toHaveLength(1);
      expect(body.events[0].type).toBe('status');
    });

    it('should ignore the dropped include_diffs param (T2 §3.1)', async () => {
      // include_diffs was removed in F10 — it was never wired through to the
      // SDK. Confirm the schema strips it silently and the SDK is still called
      // with only the issueId.
      mockOpsClient.issues.getHistory.mockResolvedValue({
        issueId: TEST_UUID_1,
        events: [],
        totalEvents: 0,
        truncated: false,
      });

      const result = await handler({ issue_id: TEST_UUID_1, include_diffs: false });

      expect(mockOpsClient.issues.getHistory).toHaveBeenCalledWith(TEST_UUID_1);
      expect(result).not.toHaveProperty('isError');
    });

    it('should reject invalid UUID', async () => {
      const result = (await handler({ issue_id: 'not-a-uuid' })) as any;

      expect(result.isError).toBe(true);
      expect(mockOpsClient.issues.getHistory).not.toHaveBeenCalled();
    });
  });

  describe('add_issue_note', () => {
    let mockOpsClient: { issues: { addNote: ReturnType<typeof vi.fn> } };
    let handler: (args: unknown) => Promise<unknown>;

    beforeEach(() => {
      mockOpsClient = {
        issues: { addNote: vi.fn() },
      };
      registerAddIssueNoteTool(mockServer, mockOpsClient as unknown as OpsClient);
      handler = getHandler(mockServer.tool);
    });

    it('should register with correct name', () => {
      const [name] = mockServer.tool.mock.calls[0];
      expect(name).toBe('add_issue_note');
    });

    it('should add note with defaults', async () => {
      mockOpsClient.issues.addNote.mockResolvedValue({ note_id: 1 });

      await handler({ issue_id: TEST_UUID_1, content: 'This is a note' });

      // normalizeKeys: issue_id → issueId, note_type → noteType
      expect(mockOpsClient.issues.addNote).toHaveBeenCalledWith(
        TEST_UUID_1,
        { content: 'This is a note', noteType: 'context' }
      );
    });

    it('should add note with all options', async () => {
      mockOpsClient.issues.addNote.mockResolvedValue({ note_id: 2 });

      await handler({
        issue_id: TEST_UUID_1,
        content: 'Resolution steps',
        note_type: 'resolution',
        created_by: 'user@example.com',
      });

      expect(mockOpsClient.issues.addNote).toHaveBeenCalledWith(
        TEST_UUID_1,
        { content: 'Resolution steps', noteType: 'resolution', createdBy: 'user@example.com' }
      );
    });

    it('should reject empty content', async () => {
      const result = (await handler({ issue_id: TEST_UUID_1, content: '' })) as any;

      expect(result.isError).toBe(true);
      expect(mockOpsClient.issues.addNote).not.toHaveBeenCalled();
    });
  });

  describe('edit_issue', () => {
    let mockOpsClient: { issues: { update: ReturnType<typeof vi.fn> } };
    let handler: (args: unknown) => Promise<unknown>;

    beforeEach(() => {
      mockOpsClient = {
        issues: { update: vi.fn() },
      };
      registerEditIssueTool(mockServer, mockOpsClient as unknown as OpsClient);
      handler = getHandler(mockServer.tool);
    });

    it('should register with correct name', () => {
      const [name] = mockServer.tool.mock.calls[0];
      expect(name).toBe('edit_issue');
    });

    it('should edit issue title', async () => {
      mockOpsClient.issues.update.mockResolvedValue({
        issue_id: TEST_UUID_1,
        updated_fields: ['title'],
      });

      await handler({ issue_id: TEST_UUID_1, title: 'Updated title' });

      expect(mockOpsClient.issues.update).toHaveBeenCalledWith(
        TEST_UUID_1,
        { title: 'Updated title' }
      );
    });

    it('should edit multiple fields', async () => {
      mockOpsClient.issues.update.mockResolvedValue({
        issue_id: TEST_UUID_1,
        updated_fields: ['severity', 'failure_code'],
      });

      await handler({
        issue_id: TEST_UUID_1,
        severity: 'critical',
        failure_code: 'SEM-ERR/H',
        file_path: 'src/api.ts',
      });

      // normalizeKeys: failure_code → failureCode, file_path → filePath
      expect(mockOpsClient.issues.update).toHaveBeenCalledWith(
        TEST_UUID_1,
        { severity: 'critical', failureCode: 'SEM-ERR/H', filePath: 'src/api.ts' }
      );
    });

    it('should reject invalid failure_code format', async () => {
      const result = (await handler({
        issue_id: TEST_UUID_1,
        failure_code: 'INVALID',
      })) as any;

      expect(result.isError).toBe(true);
      expect(mockOpsClient.issues.update).not.toHaveBeenCalled();
    });
  });

  describe('merge_projects', () => {
    let mockOpsClient: { projects: { mergeProjects: ReturnType<typeof vi.fn> } };
    let handler: (args: unknown) => Promise<unknown>;

    beforeEach(() => {
      mockOpsClient = { projects: { mergeProjects: vi.fn() } };
      registerMergeProjectsTool(mockServer, mockOpsClient as unknown as OpsClient);
      handler = getHandler(mockServer.tool);
    });

    it('should register with correct name', () => {
      const [name] = mockServer.tool.mock.calls[0];
      expect(name).toBe('merge_projects');
    });

    it('should merge projects via normalized input with defaults applied', async () => {
      mockOpsClient.projects.mergeProjects.mockResolvedValue({ moved: { runs: 2, issues: 1 } });
      await handler({ source: 'old-name', target: 'canonical-name' });
      expect(mockOpsClient.projects.mergeProjects).toHaveBeenCalledWith({
        source: 'old-name',
        target: 'canonical-name',
        dryRun: false,
        deleteSource: true,
        confirmCrossOrg: false,
      });
    });

    it('should pass dry_run and delete_source through', async () => {
      mockOpsClient.projects.mergeProjects.mockResolvedValue({ audit: { dry_run: true } });
      await handler({ source: 'old-name', target: 'canonical-name', dry_run: true, delete_source: false });
      expect(mockOpsClient.projects.mergeProjects).toHaveBeenCalledWith({
        source: 'old-name',
        target: 'canonical-name',
        dryRun: true,
        deleteSource: false,
        confirmCrossOrg: false,
      });
    });

    it('should reject missing target without calling the SDK', async () => {
      const result = (await handler({ source: 'only-source' })) as any;
      expect(result.isError).toBe(true);
      expect(mockOpsClient.projects.mergeProjects).not.toHaveBeenCalled();
    });

    it('should map SDK errors to MCP error responses', async () => {
      const err = new Error('Merge lock unavailable');
      (err as any).statusCode = 409;
      (err as any).code = 'MERGE_LOCK_UNAVAILABLE';
      mockOpsClient.projects.mergeProjects.mockRejectedValue(err);
      const result = (await handler({ source: 'a', target: 'b' })) as any;
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Merge lock unavailable');
    });
  });

  describe('merge_issues', () => {
    let mockOpsClient: { projects: { mergeIssues: ReturnType<typeof vi.fn> } };
    let handler: (args: unknown) => Promise<unknown>;

    beforeEach(() => {
      mockOpsClient = {
        projects: { mergeIssues: vi.fn() },
      };
      registerMergeIssuesTool(mockServer, mockOpsClient as unknown as OpsClient);
      handler = getHandler(mockServer.tool);
    });

    it('should register with correct name', () => {
      const [name] = mockServer.tool.mock.calls[0];
      expect(name).toBe('merge_issues');
    });

    it('should merge issues', async () => {
      mockOpsClient.projects.mergeIssues.mockResolvedValue({
        merged_count: 2,
        migrated_occurrences: 5,
      });

      await handler({
        project: 'test',
        target_issue_id: TEST_UUID_1,
        source_issue_ids: [TEST_UUID_2],
      });

      // normalizeKeys: target_issue_id → targetIssueId, source_issue_ids → sourceIssueIds
      expect(mockOpsClient.projects.mergeIssues).toHaveBeenCalledWith(
        'test',
        {
          targetIssueId: TEST_UUID_1,
          sourceIssueIds: [TEST_UUID_2],
          strategy: 'keep_target',
        }
      );
    });

    it('should pass strategy option', async () => {
      mockOpsClient.projects.mergeIssues.mockResolvedValue({ merged_count: 1 });

      await handler({
        project: 'test',
        target_issue_id: TEST_UUID_1,
        source_issue_ids: [TEST_UUID_2],
        strategy: 'keep_highest_priority',
      });

      expect(mockOpsClient.projects.mergeIssues).toHaveBeenCalledWith(
        'test',
        {
          targetIssueId: TEST_UUID_1,
          sourceIssueIds: [TEST_UUID_2],
          strategy: 'keep_highest_priority',
        }
      );
    });

    it('should reject empty source_issue_ids', async () => {
      const result = (await handler({
        project: 'test',
        target_issue_id: TEST_UUID_1,
        source_issue_ids: [],
      })) as any;

      expect(result.isError).toBe(true);
      expect(mockOpsClient.projects.mergeIssues).not.toHaveBeenCalled();
    });
  });

  describe('bulk_update_status', () => {
    let mockOpsClient: { issues: { bulkUpdateStatus: ReturnType<typeof vi.fn> } };
    let handler: (args: unknown) => Promise<unknown>;

    beforeEach(() => {
      mockOpsClient = {
        issues: { bulkUpdateStatus: vi.fn() },
      };
      registerBulkUpdateStatusTool(mockServer, mockOpsClient as unknown as OpsClient);
      handler = getHandler(mockServer.tool);
    });

    it('should register with correct name', () => {
      const [name] = mockServer.tool.mock.calls[0];
      expect(name).toBe('bulk_update_status');
    });

    it('should bulk update multiple issues', async () => {
      mockOpsClient.issues.bulkUpdateStatus.mockResolvedValue({ updated: 2, skipped: 0 });

      await handler({
        project: 'test',
        updates: [
          { issue_id: TEST_UUID_1, status: 'completed' },
          { issue_id: TEST_UUID_2, status: 'completed', reason: 'Fixed in PR' },
        ],
      });

      // normalizeKeys: issue_id → issueId in nested objects
      expect(mockOpsClient.issues.bulkUpdateStatus).toHaveBeenCalledWith([
        { issueId: TEST_UUID_1, status: 'completed' },
        { issueId: TEST_UUID_2, status: 'completed', reason: 'Fixed in PR' },
      ]);
    });

    it('should reject empty updates', async () => {
      const result = (await handler({ project: 'test', updates: [] })) as any;

      expect(result.isError).toBe(true);
      expect(mockOpsClient.issues.bulkUpdateStatus).not.toHaveBeenCalled();
    });
  });

  describe('update_run', () => {
    let mockOpsClient: {
      runs: {
        updateById: ReturnType<typeof vi.fn>;
        update: ReturnType<typeof vi.fn>;
      };
    };
    let handler: (args: unknown) => Promise<unknown>;

    beforeEach(() => {
      mockOpsClient = {
        runs: {
          updateById: vi.fn(),
          update: vi.fn(),
        },
      };
      registerUpdateRunTool(mockServer, mockOpsClient as unknown as OpsClient);
      handler = getHandler(mockServer.tool);
    });

    it('should register with correct name', () => {
      const [name] = mockServer.tool.mock.calls[0];
      expect(name).toBe('update_run');
    });

    it('should update run with tokens via run_id', async () => {
      mockOpsClient.runs.updateById.mockResolvedValue({
        run_id: TEST_UUID_1,
        updated_fields: ['validators'],
      });

      await handler({
        project: 'test',
        run_id: TEST_UUID_1,
        agents: [
          {
            name: 'code-validator',
            input_tokens: 1000,
            output_tokens: 500,
            cache_creation_tokens: 2000,
            cache_read_tokens: 5000,
            total_effective_tokens: 3500,
          },
        ],
      });

      expect(mockOpsClient.runs.updateById).toHaveBeenCalled();
      const [runId, normalized] = mockOpsClient.runs.updateById.mock.calls[0];
      expect(runId).toBe(TEST_UUID_1);
      // normalizeKeys converts token fields to camelCase
      expect(normalized.agents[0].cacheCreationTokens).toBe(2000);
      expect(normalized.agents[0].cacheReadTokens).toBe(5000);
    });

    it('should update run metadata', async () => {
      mockOpsClient.runs.updateById.mockResolvedValue({ run_id: TEST_UUID_1 });

      await handler({
        project: 'test',
        run_id: TEST_UUID_1,
        all_gates_passed: true,
        average_score: 92.5,
      });

      expect(mockOpsClient.runs.updateById).toHaveBeenCalledWith(
        TEST_UUID_1,
        expect.objectContaining({
          project: 'test',
          runId: TEST_UUID_1,
          allGatesPassed: true,
          averageScore: 92.5,
        }),
        { _skipClientValidation: true }
      );
    });
  });

  describe('get_agent_reliability', () => {
    let mockOpsClient: { analytics: { getAgentReliability: ReturnType<typeof vi.fn> } };
    let handler: (args: unknown) => Promise<unknown>;

    beforeEach(() => {
      mockOpsClient = {
        analytics: { getAgentReliability: vi.fn() },
      };
      registerGetAgentReliabilityTool(mockServer, mockOpsClient as unknown as OpsClient);
      handler = getHandler(mockServer.tool);
    });

    it('should register with correct name', () => {
      const [name] = mockServer.tool.mock.calls[0];
      expect(name).toBe('get_agent_reliability');
    });

    it('should get reliability with defaults', async () => {
      mockOpsClient.analytics.getAgentReliability.mockResolvedValue({ data: [] });

      await handler({});

      expect(mockOpsClient.analytics.getAgentReliability).toHaveBeenCalledWith({
        days: 90,
      });
    });

    it('should pass filter options', async () => {
      mockOpsClient.analytics.getAgentReliability.mockResolvedValue({ data: [] });

      await handler({
        agent: 'code-validator',
        project: 'test-project',
        days: 30,
      });

      expect(mockOpsClient.analytics.getAgentReliability).toHaveBeenCalledWith({
        agent: 'code-validator',
        project: 'test-project',
        days: 30,
      });
    });
  });

  describe('create_issue', () => {
    let mockOpsClient: { issues: { create: ReturnType<typeof vi.fn> } };
    let handler: (args: unknown) => Promise<unknown>;

    beforeEach(() => {
      mockOpsClient = {
        issues: { create: vi.fn() },
      };
      registerCreateIssueTool(mockServer, mockOpsClient as unknown as OpsClient);
      handler = getHandler(mockServer.tool);
    });

    it('should register with correct name', () => {
      const [name] = mockServer.tool.mock.calls[0];
      expect(name).toBe('create_issue');
    });

    it('should create issue with minimal required fields', async () => {
      mockOpsClient.issues.create.mockResolvedValue({
        issue_id: TEST_UUID_1,
        created: true,
      });

      const result = await handler({
        project: 'test-project',
        title: 'Test Issue',
        priority: 'suggested',
      });

      expect(mockOpsClient.issues.create).toHaveBeenCalledWith({
        project: 'test-project',
        title: 'Test Issue',
        priority: 'suggested',
      });
      expect(result).not.toHaveProperty('isError');
    });

    it('should create issue with all optional fields', async () => {
      mockOpsClient.issues.create.mockResolvedValue({
        issue_id: TEST_UUID_1,
        created: true,
      });

      await handler({
        project: 'test-project',
        title: 'Full Issue',
        priority: 'critical',
        severity: 'high',
        category: 'security',
        description: 'Detailed description of the issue',
        file_path: 'src/api.ts',
        line_number: 42,
        failure_code: 'SEM-VAL/H',
        failure_domain: 'SEM',
        failure_mode: 'VAL',
        agent: 'user-submitted',
      });

      // normalizeKeys converts snake_case keys to camelCase
      expect(mockOpsClient.issues.create).toHaveBeenCalledWith({
        project: 'test-project',
        title: 'Full Issue',
        priority: 'critical',
        severity: 'high',
        category: 'security',
        description: 'Detailed description of the issue',
        filePath: 'src/api.ts',
        lineNumber: 42,
        failureCode: 'SEM-VAL/H',
        failureDomain: 'SEM',
        failureMode: 'VAL',
        agent: 'user-submitted',
      });
    });

    it('should reject missing project', async () => {
      const result = (await handler({
        title: 'Test Issue',
        priority: 'suggested',
      })) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Validation failed');
      expect(mockOpsClient.issues.create).not.toHaveBeenCalled();
    });

    it('should reject missing title', async () => {
      const result = (await handler({
        project: 'test-project',
        priority: 'suggested',
      })) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Validation failed');
      expect(mockOpsClient.issues.create).not.toHaveBeenCalled();
    });

    it('should reject missing priority', async () => {
      const result = (await handler({
        project: 'test-project',
        title: 'Test Issue',
      })) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Validation failed');
      expect(mockOpsClient.issues.create).not.toHaveBeenCalled();
    });

    it('should reject invalid priority enum', async () => {
      const result = (await handler({
        project: 'test-project',
        title: 'Test Issue',
        priority: 'invalid-priority',
      })) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Validation failed');
      expect(mockOpsClient.issues.create).not.toHaveBeenCalled();
    });

    it('should reject invalid severity enum', async () => {
      const result = (await handler({
        project: 'test-project',
        title: 'Test Issue',
        priority: 'suggested',
        severity: 'invalid-severity',
      })) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Validation failed');
      expect(mockOpsClient.issues.create).not.toHaveBeenCalled();
    });

    it('should reject invalid failure_domain enum', async () => {
      const result = (await handler({
        project: 'test-project',
        title: 'Test Issue',
        priority: 'suggested',
        failure_domain: 'INVALID',
      })) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Validation failed');
      expect(mockOpsClient.issues.create).not.toHaveBeenCalled();
    });

    it('should reject negative line_number', async () => {
      const result = (await handler({
        project: 'test-project',
        title: 'Test Issue',
        priority: 'suggested',
        line_number: -1,
      })) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Validation failed');
      expect(mockOpsClient.issues.create).not.toHaveBeenCalled();
    });

    it('should reject title exceeding max length', async () => {
      const result = (await handler({
        project: 'test-project',
        title: 'x'.repeat(501),
        priority: 'suggested',
      })) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Validation failed');
      expect(mockOpsClient.issues.create).not.toHaveBeenCalled();
    });

    it('should handle API errors', async () => {
      mockOpsClient.issues.create.mockRejectedValue(new NotFoundError('Project'));

      const result = (await handler({
        project: 'missing-project',
        title: 'Test Issue',
        priority: 'suggested',
      })) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Project not found');
    });

    it('should handle network errors', async () => {
      mockOpsClient.issues.create.mockRejectedValue(new Error('Connection refused'));

      const result = (await handler({
        project: 'test-project',
        title: 'Test Issue',
        priority: 'suggested',
      })) as any;

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Connection refused');
    });
  });
});
