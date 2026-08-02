/**
 * P1 Tool Schema Tests
 *
 * Tests for P1 extended tool input validation schemas.
 */

import { describe, it, expect } from 'vitest';
import { GetIssueDetailsInputSchema } from '../tools/get-issue-details.js';
import { GetRunDetailsInputSchema } from '../tools/get-run-details.js';
import { DiffRunsInputSchema } from '../tools/diff-runs.js';
import { ArchiveRunsInputSchema } from '../tools/archive-runs.js';
import { GetAnalyticsInputSchema } from '../tools/get-analytics.js';
import { SearchIssuesInputSchema } from '../tools/search-issues.js';
import { ListAgentsInputSchema } from '../tools/list-agents.js';
import { ValidateRunInputSchema } from '../tools/validate-run.js';
import { GetIssueHistoryInputSchema } from '../tools/get-issue-history.js';
import { AddIssueNoteInputSchema } from '../tools/add-issue-note.js';
import { EditIssueInputSchema } from '../tools/edit-issue.js';
import { MergeIssuesInputSchema } from '../tools/merge-issues.js';
import { BulkUpdateStatusInputSchema } from '../tools/bulk-update-status.js';
import { UpdateRunInputSchema } from '../tools/update-run.js';
import { GetAgentReliabilityInputSchema } from '../tools/get-agent-reliability.js';

// Valid UUIDs for testing
const TEST_UUID_1 = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_UUID_2 = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';
const TEST_UUID_3 = 'c3d4e5f6-a7b8-9012-cdef-123456789012';
const TEST_UUID_4 = 'd4e5f6a7-b8c9-0123-defa-234567890123';

describe('P1 tool schemas', () => {
  describe('GetIssueDetailsInputSchema', () => {
    it('should accept valid input with id', () => {
      const result = GetIssueDetailsInputSchema.safeParse({ id: TEST_UUID_1 });
      expect(result.success).toBe(true);
    });

    it('should strip unknown include_* options without error', () => {
      // The backend /details endpoint returns a fixed envelope; the tool no
      // longer exposes include_occurrences/include_related. Extra keys are
      // stripped by the non-strict Zod object rather than rejected.
      const result = GetIssueDetailsInputSchema.safeParse({
        id: TEST_UUID_2,
        include_occurrences: false,
        include_related: true,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).not.toHaveProperty('include_occurrences');
        expect(result.data).not.toHaveProperty('include_related');
      }
    });

    it('should reject invalid uuid', () => {
      const result = GetIssueDetailsInputSchema.safeParse({ id: 'not-a-uuid' });
      expect(result.success).toBe(false);
    });
  });

  describe('GetRunDetailsInputSchema', () => {
    it('should accept project only (latest run)', () => {
      const result = GetRunDetailsInputSchema.safeParse({ project: 'test-proj' });
      expect(result.success).toBe(true);
    });

    it('should accept specific run_number', () => {
      const result = GetRunDetailsInputSchema.safeParse({
        project: 'test-proj',
        run_number: 5,
        workflow_type: 'ship',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty project', () => {
      const result = GetRunDetailsInputSchema.safeParse({ project: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('DiffRunsInputSchema', () => {
    it('should accept valid diff input', () => {
      const result = DiffRunsInputSchema.safeParse({
        project: 'test-proj',
        base_run: 1,
        compare_run: 2,
      });
      expect(result.success).toBe(true);
    });

    it('should accept with workflow_type', () => {
      const result = DiffRunsInputSchema.safeParse({
        project: 'test-proj',
        base_run: 3,
        compare_run: 5,
        workflow_type: 'post-implementation',
      });
      expect(result.success).toBe(true);
    });

    it('should reject missing runs', () => {
      const result = DiffRunsInputSchema.safeParse({ project: 'test' });
      expect(result.success).toBe(false);
    });
  });

  describe('ArchiveRunsInputSchema', () => {
    it('should accept project with before_run_number', () => {
      const result = ArchiveRunsInputSchema.safeParse({
        project: 'test-proj',
        before_run_number: 10,
      });
      expect(result.success).toBe(true);
    });

    it('should accept keep_last', () => {
      const result = ArchiveRunsInputSchema.safeParse({
        project: 'test-proj',
        keep_last: 5,
        reason: 'Cleanup old runs',
      });
      expect(result.success).toBe(true);
    });

    it('should accept before_date', () => {
      const result = ArchiveRunsInputSchema.safeParse({
        project: 'test-proj',
        before_date: '2024-01-01',
      });
      expect(result.success).toBe(true);
    });
  });

  describe('GetAnalyticsInputSchema', () => {
    it('should accept all metric types', () => {
      const metrics = [
        'agent_performance',
        'resolution_rates',
        'cross_project_patterns',
        'file_hotspots',
        'regression_analysis',
        'trend_summary',
        'cost_analysis',
        'taxonomy_distribution',
      ];

      for (const metric of metrics) {
        const result = GetAnalyticsInputSchema.safeParse({ metric });
        expect(result.success).toBe(true);
      }
    });

    it('should apply defaults', () => {
      const result = GetAnalyticsInputSchema.safeParse({
        metric: 'agent_performance',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.days).toBe(30);
        expect(result.data.limit).toBe(20);
      }
    });

    it('should reject invalid metric', () => {
      const result = GetAnalyticsInputSchema.safeParse({ metric: 'invalid' });
      expect(result.success).toBe(false);
    });
  });

  describe('SearchIssuesInputSchema', () => {
    it('should accept simple query', () => {
      const result = SearchIssuesInputSchema.safeParse({ query: 'error handling' });
      expect(result.success).toBe(true);
    });

    it('should accept full filter options', () => {
      const result = SearchIssuesInputSchema.safeParse({
        query: 'security',
        projects: ['proj-a', 'proj-b'],
        agents: ['security-analyst'],
        status: 'open',
        priority: 'critical',
        severities: ['critical', 'high'],
        failure_domains: ['STR', 'SEM'],
        limit: 50,
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty query', () => {
      const result = SearchIssuesInputSchema.safeParse({ query: '' });
      expect(result.success).toBe(false);
    });
  });

  describe('ListAgentsInputSchema', () => {
    it('should accept empty object', () => {
      const result = ListAgentsInputSchema.safeParse({});
      expect(result.success).toBe(true);
    });
  });

  describe('ValidateRunInputSchema', () => {
    it('should accept valid input', () => {
      const result = ValidateRunInputSchema.safeParse({
        project: 'test-proj',
        workflow_type: 'ship',
        agents: [{ name: 'code-validator', score: 85, decision: 'PASS' }],
        recommendations: [
          { agent: 'code-validator', title: 'Fix error', priority: 'suggested' },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid priority', () => {
      const result = ValidateRunInputSchema.safeParse({
        project: 'test-proj',
        workflow_type: 'ship',
        agents: [],
        recommendations: [{ agent: 'test', title: 'Test', priority: 'invalid' }],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('GetIssueHistoryInputSchema', () => {
    // Live-tests T2 §3.1 (F10): the schema was trimmed to a single field after
    // the Strategy B rewrite. The old `include_diffs` parameter was declared
    // but never wired through to the API — dropping it removes the lie.
    it('should accept issue_id', () => {
      const result = GetIssueHistoryInputSchema.safeParse({ issue_id: TEST_UUID_1 });
      expect(result.success).toBe(true);
    });

    it('should reject unknown parameters (e.g., the dropped include_diffs)', () => {
      // Sanity check that schema is strict enough: extra keys are allowed by
      // default in z.object (strip), but they must not appear on the parsed
      // output. This guards against the schema silently accepting params that
      // never reach the SDK.
      const result = GetIssueHistoryInputSchema.safeParse({
        issue_id: TEST_UUID_2,
        include_diffs: false,
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect('include_diffs' in result.data).toBe(false);
      }
    });
  });

  describe('AddIssueNoteInputSchema', () => {
    it('should accept valid note', () => {
      const result = AddIssueNoteInputSchema.safeParse({
        issue_id: TEST_UUID_1,
        content: 'This is a note about the issue.',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.note_type).toBe('context'); // default
      }
    });

    it('should accept all note types', () => {
      for (const note_type of ['context', 'resolution', 'blocker']) {
        const result = AddIssueNoteInputSchema.safeParse({
          issue_id: TEST_UUID_1,
          content: 'Note content',
          note_type,
        });
        expect(result.success).toBe(true);
      }
    });

    it('should reject empty content', () => {
      const result = AddIssueNoteInputSchema.safeParse({
        issue_id: TEST_UUID_1,
        content: '',
      });
      expect(result.success).toBe(false);
    });
  });

  describe('EditIssueInputSchema', () => {
    it('should accept issue_id only', () => {
      const result = EditIssueInputSchema.safeParse({ issue_id: TEST_UUID_1 });
      expect(result.success).toBe(true);
    });

    it('should accept all editable fields', () => {
      const result = EditIssueInputSchema.safeParse({
        issue_id: TEST_UUID_1,
        title: 'Updated title',
        file_path: 'src/new-file.ts',
        category: 'refactoring',
        severity: 'medium',
        failure_code: 'STR-INC/M',
        line_number: 42,
      });
      expect(result.success).toBe(true);
    });

    it('should reject invalid failure_code format', () => {
      const result = EditIssueInputSchema.safeParse({
        issue_id: TEST_UUID_1,
        failure_code: 'INVALID',
      });
      expect(result.success).toBe(false);
    });

    it('should accept valid failure_code formats', () => {
      const validCodes = ['STR-INC/C', 'SEM-TYP/H', 'PRA-MAT/M', 'PRA-DOC/L', 'STR-FMT/I'];
      for (const failure_code of validCodes) {
        const result = EditIssueInputSchema.safeParse({ issue_id: TEST_UUID_1, failure_code });
        expect(result.success).toBe(true);
      }
    });
  });

  describe('MergeIssuesInputSchema', () => {
    it('should accept valid merge input', () => {
      const result = MergeIssuesInputSchema.safeParse({
        project: 'test-proj',
        target_issue_id: TEST_UUID_1,
        source_issue_ids: [TEST_UUID_2, TEST_UUID_3, TEST_UUID_4],
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.strategy).toBe('keep_target'); // default
      }
    });

    it('should accept strategy option', () => {
      const result = MergeIssuesInputSchema.safeParse({
        project: 'test-proj',
        target_issue_id: TEST_UUID_1,
        source_issue_ids: [TEST_UUID_2],
        strategy: 'keep_highest_priority',
      });
      expect(result.success).toBe(true);
    });

    it('should reject empty source_issue_ids', () => {
      const result = MergeIssuesInputSchema.safeParse({
        project: 'test-proj',
        target_issue_id: TEST_UUID_1,
        source_issue_ids: [],
      });
      expect(result.success).toBe(false);
    });
  });

  describe('BulkUpdateStatusInputSchema', () => {
    it('should accept valid bulk update', () => {
      const result = BulkUpdateStatusInputSchema.safeParse({
        project: 'test-proj',
        updates: [
          { issue_id: TEST_UUID_1, status: 'completed' },
          { issue_id: TEST_UUID_2, status: 'deferred', reason: 'Out of scope' },
        ],
      });
      expect(result.success).toBe(true);
    });

    it('should accept all status values', () => {
      for (const status of ['open', 'completed', 'deferred', 'wontfix', 'merged', 'false-positive']) {
        const result = BulkUpdateStatusInputSchema.safeParse({
          project: 'test',
          updates: [{ issue_id: TEST_UUID_1, status }],
        });
        expect(result.success).toBe(true);
      }
    });

    it('should reject empty updates', () => {
      const result = BulkUpdateStatusInputSchema.safeParse({
        project: 'test-proj',
        updates: [],
      });
      expect(result.success).toBe(false);
    });

    it('should enforce max 100 updates', () => {
      // Generate 101 unique UUIDs for the test
      const updates = Array.from({ length: 101 }, (_, i) => ({
        issue_id: `a1b2c3d4-e5f6-7890-abcd-ef12345${String(i).padStart(5, '0')}`,
        status: 'completed' as const,
      }));
      const result = BulkUpdateStatusInputSchema.safeParse({
        project: 'test-proj',
        updates,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('UpdateRunInputSchema', () => {
    it('should accept project only', () => {
      const result = UpdateRunInputSchema.safeParse({ project: 'test-proj' });
      expect(result.success).toBe(true);
    });

    it('should accept all update options', () => {
      const result = UpdateRunInputSchema.safeParse({
        project: 'test-proj',
        run_id: TEST_UUID_1,
        run_number: 5,
        workflow_type: 'ship',
        agents: [{ name: 'code-validator', score: 90, input_tokens: 1000, output_tokens: 500 }],
        timestamp: '2024-01-15T10:00:00Z',
        all_gates_passed: true,
        average_score: 92.5,
      });
      expect(result.success).toBe(true);
    });

    it('should enforce score range', () => {
      const result = UpdateRunInputSchema.safeParse({
        project: 'test-proj',
        average_score: 150,
      });
      expect(result.success).toBe(false);
    });
  });

  describe('GetAgentReliabilityInputSchema', () => {
    it('should accept empty object', () => {
      const result = GetAgentReliabilityInputSchema.safeParse({});
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.days).toBe(90); // default
      }
    });

    it('should accept filter options', () => {
      const result = GetAgentReliabilityInputSchema.safeParse({
        agent: 'code-validator',
        project: 'test-proj',
        days: 30,
      });
      expect(result.success).toBe(true);
    });
  });
});
