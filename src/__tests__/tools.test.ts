/**
 * Tool Schema Tests
 *
 * Tests for tool input validation schemas.
 */

import { describe, it, expect } from 'vitest';
import { SaveRunInputSchema } from '../tools/save-run.js';
import { QueryIssuesInputSchema } from '../tools/query-issues.js';
import { UpdateStatusInputSchema } from '../tools/update-status.js';
import { GetProjectSummaryInputSchema } from '../tools/get-project-summary.js';
import { DeleteProjectInputSchema } from '../tools/delete-project.js';

// Valid UUIDs for testing
const TEST_UUID_1 = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
const TEST_UUID_2 = 'b2c3d4e5-f6a7-8901-bcde-f12345678901';

describe('tool schemas', () => {
  describe('SaveRunInputSchema', () => {
    it('should accept valid minimal input', () => {
      const input = {
        project: 'test-project',
        workflow_type: 'ship',
        agents: [{ name: 'code-validator', score: 85, decision: 'PASS' }],
      };

      const result = SaveRunInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept input with recommendations', () => {
      const input = {
        project: 'test-project',
        workflow_type: 'ship',
        agents: [{ name: 'code-validator', score: 85, decision: 'PASS' }],
        recommendations: [
          {
            agent: 'code-validator',
            title: 'Fix linting error',
            priority: 'suggested',
          },
        ],
      };

      const result = SaveRunInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept full recommendation with all fields', () => {
      const input = {
        project: 'test-project',
        workflow_type: 'ship',
        agents: [{ name: 'code-validator', score: 85, decision: 'PASS' }],
        recommendations: [
          {
            agent: 'code-validator',
            title: 'Missing error handling',
            priority: 'critical',
            description: 'Function lacks try/catch',
            file_path: 'src/api.ts',
            line_number: 42,
            category: 'error-handling',
            severity: 'high',
            failure_code: 'SEM-ERR/H',
            failure_domain: 'SEM',
          },
        ],
      };

      const result = SaveRunInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject missing project', () => {
      const input = {
        workflow_type: 'ship',
        agents: [],
      };

      const result = SaveRunInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject missing workflow_type', () => {
      const input = {
        project: 'test-project',
        agents: [],
      };

      const result = SaveRunInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid priority', () => {
      const input = {
        project: 'test-project',
        workflow_type: 'ship',
        agents: [],
        recommendations: [
          {
            agent: 'test',
            title: 'Test',
            priority: 'invalid',
          },
        ],
      };

      const result = SaveRunInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid severity', () => {
      const input = {
        project: 'test-project',
        workflow_type: 'ship',
        agents: [],
        recommendations: [
          {
            agent: 'test',
            title: 'Test',
            priority: 'suggested',
            severity: 'invalid',
          },
        ],
      };

      const result = SaveRunInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('QueryIssuesInputSchema', () => {
    it('should accept minimal input', () => {
      const input = { project: 'test-project' };

      const result = QueryIssuesInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should apply default values', () => {
      const input = { project: 'test-project' };

      const result = QueryIssuesInputSchema.parse(input);
      expect(result.status).toBe('open');
      expect(result.priority).toBe('all');
      expect(result.include_resolved).toBe(false);
      expect(result.limit).toBe(50);
    });

    it('should accept all filter options', () => {
      const input = {
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
      };

      const result = QueryIssuesInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject invalid status', () => {
      const input = { project: 'test', status: 'invalid' };

      const result = QueryIssuesInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid priority', () => {
      const input = { project: 'test', priority: 'invalid' };

      const result = QueryIssuesInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject limit over 100', () => {
      const input = { project: 'test', limit: 150 };

      const result = QueryIssuesInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('UpdateStatusInputSchema', () => {
    it('should accept update by ID', () => {
      const input = {
        project: 'test-project',
        updates: [{ id: TEST_UUID_1, status: 'completed' }],
      };

      const result = UpdateStatusInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept update by fingerprint', () => {
      const input = {
        project: 'test-project',
        updates: [{ fingerprint: 'abc123', status: 'deferred', reason: 'Not now' }],
      };

      const result = UpdateStatusInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept update by file_path and title', () => {
      const input = {
        project: 'test-project',
        updates: [{ file_path: 'src/api.ts', title: 'Fix bug', status: 'wontfix' }],
      };

      const result = UpdateStatusInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept multiple updates', () => {
      const input = {
        project: 'test-project',
        updates: [
          { id: TEST_UUID_1, status: 'completed' },
          { id: TEST_UUID_2, status: 'completed' },
          { fingerprint: 'xyz', status: 'deferred' },
        ],
      };

      const result = UpdateStatusInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject empty updates array', () => {
      const input = { project: 'test', updates: [] };

      const result = UpdateStatusInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject invalid status', () => {
      const input = {
        project: 'test',
        updates: [{ id: TEST_UUID_1, status: 'invalid' }],
      };

      const result = UpdateStatusInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('GetProjectSummaryInputSchema', () => {
    it('should accept minimal input', () => {
      const input = { project: 'test-project' };

      const result = GetProjectSummaryInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept with workflow_type filter', () => {
      const input = { project: 'test-project', workflow_type: 'ship' };

      const result = GetProjectSummaryInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject empty project name', () => {
      const input = { project: '' };

      const result = GetProjectSummaryInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  describe('DeleteProjectInputSchema', () => {
    it('should accept valid deletion request', () => {
      const input = {
        project: 'test-project',
        confirm: true,
        confirmation_phrase: 'test-project',
      };

      const result = DeleteProjectInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should accept deletion with confirm=false', () => {
      const input = {
        project: 'test-project',
        confirm: false,
        confirmation_phrase: '',
      };

      const result = DeleteProjectInputSchema.safeParse(input);
      expect(result.success).toBe(true);
    });

    it('should reject missing confirm field', () => {
      const input = {
        project: 'test-project',
        confirmation_phrase: 'test-project',
      };

      const result = DeleteProjectInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });

    it('should reject missing confirmation_phrase', () => {
      const input = {
        project: 'test-project',
        confirm: true,
      };

      const result = DeleteProjectInputSchema.safeParse(input);
      expect(result.success).toBe(false);
    });
  });

  // ==========================================================================
  // Schema Boundary Tests
  // ==========================================================================
  describe('Schema Boundaries', () => {
    describe('QueryIssuesInputSchema boundaries', () => {
      it('should accept limit at minimum boundary (1)', () => {
        const result = QueryIssuesInputSchema.safeParse({ project: 'test', limit: 1 });
        expect(result.success).toBe(true);
      });

      it('should accept limit at maximum boundary (100)', () => {
        const result = QueryIssuesInputSchema.safeParse({ project: 'test', limit: 100 });
        expect(result.success).toBe(true);
      });

      it('should reject limit at zero', () => {
        const result = QueryIssuesInputSchema.safeParse({ project: 'test', limit: 0 });
        expect(result.success).toBe(false);
      });

      it('should reject negative limit', () => {
        const result = QueryIssuesInputSchema.safeParse({ project: 'test', limit: -1 });
        expect(result.success).toBe(false);
      });

      it('should reject limit just over maximum (101)', () => {
        const result = QueryIssuesInputSchema.safeParse({ project: 'test', limit: 101 });
        expect(result.success).toBe(false);
      });

      it('should reject non-integer limit', () => {
        const result = QueryIssuesInputSchema.safeParse({ project: 'test', limit: 10.5 });
        expect(result.success).toBe(false);
      });

      it('should reject empty string project', () => {
        const result = QueryIssuesInputSchema.safeParse({ project: '' });
        expect(result.success).toBe(false);
      });

      it('should accept single character project', () => {
        const result = QueryIssuesInputSchema.safeParse({ project: 'a' });
        expect(result.success).toBe(true);
      });

      it('should accept min_times_seen at minimum (1)', () => {
        const result = QueryIssuesInputSchema.safeParse({ project: 'test', min_times_seen: 1 });
        expect(result.success).toBe(true);
      });

      it('should reject min_times_seen at zero', () => {
        const result = QueryIssuesInputSchema.safeParse({ project: 'test', min_times_seen: 0 });
        expect(result.success).toBe(false);
      });
    });

    describe('SaveRunInputSchema boundaries', () => {
      it('should accept empty validators array', () => {
        const result = SaveRunInputSchema.safeParse({
          project: 'test',
          workflow_type: 'ship',
          agents: [],
        });
        expect(result.success).toBe(true);
      });

      it('should accept score at minimum (0)', () => {
        const result = SaveRunInputSchema.safeParse({
          project: 'test',
          workflow_type: 'ship',
          agents: [{ name: 'test', score: 0, decision: 'FAIL' }],
        });
        expect(result.success).toBe(true);
      });

      it('should accept score at maximum (100)', () => {
        const result = SaveRunInputSchema.safeParse({
          project: 'test',
          workflow_type: 'ship',
          agents: [{ name: 'test', score: 100, decision: 'PASS' }],
        });
        expect(result.success).toBe(true);
      });

      it('should reject empty validator name', () => {
        const result = SaveRunInputSchema.safeParse({
          project: 'test',
          workflow_type: 'ship',
          agents: [{ name: '', score: 50, decision: 'PASS' }],
        });
        expect(result.success).toBe(false);
      });

      it('should accept line_number at minimum (1)', () => {
        const result = SaveRunInputSchema.safeParse({
          project: 'test',
          workflow_type: 'ship',
          agents: [],
          recommendations: [
            { agent: 'test', title: 'Test', priority: 'suggested', line_number: 1 },
          ],
        });
        expect(result.success).toBe(true);
      });

      it('should accept line_number at zero (used when no specific line)', () => {
        // line_number: 0 is valid - validators use it when issue has no specific line
        const result = SaveRunInputSchema.safeParse({
          project: 'test',
          workflow_type: 'ship',
          agents: [],
          recommendations: [
            { agent: 'test', title: 'Test', priority: 'suggested', line_number: 0 },
          ],
        });
        expect(result.success).toBe(true);
      });

      it('should reject negative line_number', () => {
        const result = SaveRunInputSchema.safeParse({
          project: 'test',
          workflow_type: 'ship',
          agents: [],
          recommendations: [
            { agent: 'test', title: 'Test', priority: 'suggested', line_number: -1 },
          ],
        });
        expect(result.success).toBe(false);
      });
    });

    describe('UpdateStatusInputSchema boundaries', () => {
      it('should reject updates array with zero elements', () => {
        const result = UpdateStatusInputSchema.safeParse({
          project: 'test',
          updates: [],
        });
        expect(result.success).toBe(false);
      });

      it('should accept updates array with one element', () => {
        const result = UpdateStatusInputSchema.safeParse({
          project: 'test',
          updates: [{ id: TEST_UUID_1, status: 'completed' }],
        });
        expect(result.success).toBe(true);
      });

      it('should accept updates array with many elements', () => {
        const updates = Array.from({ length: 50 }, (_, i) => ({
          id: `a1b2c3d4-e5f6-7890-abcd-ef12345${String(i).padStart(5, '0')}`,
          status: 'completed' as const,
        }));
        const result = UpdateStatusInputSchema.safeParse({
          project: 'test',
          updates,
        });
        expect(result.success).toBe(true);
      });
    });

    describe('UUID validation', () => {
      it('should accept valid UUID v4 format', () => {
        const result = UpdateStatusInputSchema.safeParse({
          project: 'test',
          updates: [{ id: '550e8400-e29b-41d4-a716-446655440000', status: 'completed' }],
        });
        expect(result.success).toBe(true);
      });

      it('should reject UUID with wrong length', () => {
        const result = UpdateStatusInputSchema.safeParse({
          project: 'test',
          updates: [{ id: '550e8400-e29b-41d4-a716', status: 'completed' }],
        });
        expect(result.success).toBe(false);
      });

      it('should reject UUID with invalid characters', () => {
        const result = UpdateStatusInputSchema.safeParse({
          project: 'test',
          updates: [{ id: '550e8400-e29b-41d4-a716-44665544000g', status: 'completed' }],
        });
        expect(result.success).toBe(false);
      });

      it('should reject UUID without hyphens', () => {
        const result = UpdateStatusInputSchema.safeParse({
          project: 'test',
          updates: [{ id: '550e8400e29b41d4a716446655440000', status: 'completed' }],
        });
        expect(result.success).toBe(false);
      });
    });

    // Mutation safety tests - ensure parsed output is not affected by input mutation
    describe('Input mutation safety', () => {
      it('should not be affected by input mutation after parsing (QueryIssuesInputSchema)', () => {
        const input = { project: 'original-project', limit: 50 };
        const result = QueryIssuesInputSchema.parse(input);

        // Mutate the original input after parsing
        input.project = 'mutated-project';
        input.limit = 999;

        // Parsed result should retain original values
        expect(result.project).toBe('original-project');
        expect(result.limit).toBe(50);
      });

      it('should not be affected by nested array mutation (SaveRunInputSchema)', () => {
        const input = {
          project: 'test-project',
          workflow_type: 'ship',
          agents: [{ name: 'code-validator', score: 85, decision: 'PASS' }],
          recommendations: [{ agent: 'test', title: 'Issue', priority: 'critical' as const }],
        };
        const result = SaveRunInputSchema.parse(input);

        // Mutate nested arrays after parsing
        input.agents[0].score = 0;
        input.agents[0].name = 'mutated';
        input.recommendations[0].priority = 'backlog';

        // Parsed result should retain original values
        expect(result.agents[0].score).toBe(85);
        expect(result.agents[0].name).toBe('code-validator');
        expect(result.recommendations[0].priority).toBe('critical');
      });

      it('should not be affected by array push after parsing (UpdateStatusInputSchema)', () => {
        const updates = [{ id: TEST_UUID_1, status: 'completed' as const }];
        const input = { project: 'test', updates };
        const result = UpdateStatusInputSchema.parse(input);

        // Mutate the original array after parsing
        updates.push({ id: TEST_UUID_1, status: 'deferred' as const });
        input.updates = [];

        // Parsed result should retain original length
        expect(result.updates).toHaveLength(1);
        expect(result.updates[0].status).toBe('completed');
      });
    });
  });
});
