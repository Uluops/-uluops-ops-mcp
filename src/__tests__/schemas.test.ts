/**
 * Tests for shared Zod schemas
 */

import { describe, it, expect } from 'vitest';
import { FilePathSchema, RecommendationSchema } from '../types/schemas.js';

describe('FilePathSchema', () => {
  describe('valid paths', () => {
    it('accepts simple relative paths', () => {
      expect(FilePathSchema.parse('src/index.ts')).toBe('src/index.ts');
    });

    it('accepts paths with dots in filenames', () => {
      expect(FilePathSchema.parse('src/file.test.ts')).toBe('src/file.test.ts');
    });

    it('accepts absolute paths', () => {
      expect(FilePathSchema.parse('/home/user/project/file.ts')).toBe('/home/user/project/file.ts');
    });

    it('accepts Windows-style paths', () => {
      expect(FilePathSchema.parse('C:\\Users\\project\\file.ts')).toBe(
        'C:\\Users\\project\\file.ts'
      );
    });

    it('accepts paths up to 1000 characters', () => {
      const longPath = 'a'.repeat(1000);
      expect(FilePathSchema.parse(longPath)).toBe(longPath);
    });
  });

  describe('invalid paths', () => {
    it('rejects paths with Unix path traversal', () => {
      expect(() => FilePathSchema.parse('../etc/passwd')).toThrow('path traversal');
      expect(() => FilePathSchema.parse('src/../../../etc/passwd')).toThrow('path traversal');
    });

    it('rejects paths with Windows path traversal', () => {
      expect(() => FilePathSchema.parse('..\\Windows\\System32')).toThrow('path traversal');
      expect(() => FilePathSchema.parse('src\\..\\..\\Windows')).toThrow('path traversal');
    });

    it('rejects paths with null bytes', () => {
      expect(() => FilePathSchema.parse('file.ts\0.txt')).toThrow('null bytes');
    });

    it('rejects paths exceeding 1000 characters', () => {
      const tooLongPath = 'a'.repeat(1001);
      expect(() => FilePathSchema.parse(tooLongPath)).toThrow('1000 characters');
    });
  });
});

describe('RecommendationSchema', () => {
  const validRecommendation = {
    agent: 'code-validator',
    title: 'Test issue',
    priority: 'suggested' as const,
  };

  describe('failure_code validation', () => {
    it('accepts valid failure codes', () => {
      // SEM-VAL/H and EPI-DOC/L sat in this list for months — both are
      // well-formed NON-members (VAL is an EPI mode, DOC is a PRA mode) that
      // the old format-only pattern accepted (RE-PROBE-02 N2).
      const validCodes = ['STR-INC/C', 'EPI-VAL/H', 'PRA-FRA/M', 'PRA-DOC/L', 'STR-OMI/I'];
      for (const failure_code of validCodes) {
        const result = RecommendationSchema.safeParse({ ...validRecommendation, failure_code });
        expect(result.success).toBe(true);
      }
    });

    it('rejects invalid failure codes like N/A', () => {
      const result = RecommendationSchema.safeParse({ ...validRecommendation, failure_code: 'N/A' });
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toContain('canonical failure modes');
      }
    });

    it('rejects well-formed non-member codes (domain-bound modes, N2)', () => {
      for (const failure_code of ['SEM-VAL/H', 'EPI-DOC/L', 'STR-ZZZ/C']) {
        const result = RecommendationSchema.safeParse({ ...validRecommendation, failure_code });
        expect(result.success, `${failure_code} must be rejected`).toBe(false);
      }
    });

    it('rejects malformed failure codes', () => {
      const invalidCodes = ['INVALID', 'STR-AB/H', 'XXX-ABC/H', 'SEM-ABC/X', 'sem-val/h'];
      for (const failure_code of invalidCodes) {
        const result = RecommendationSchema.safeParse({ ...validRecommendation, failure_code });
        expect(result.success).toBe(false);
      }
    });

    it('accepts missing failure_code (optional)', () => {
      const result = RecommendationSchema.safeParse(validRecommendation);
      expect(result.success).toBe(true);
    });
  });

  describe('cluster_key (within-run convergence, tracker migration 076)', () => {
    // The schema is a plain z.object(), so Zod STRIPS undeclared keys rather
    // than erroring. That is the mechanism this block guards against: the
    // published @uluops/ops-mcp shipped 0.16.x–0.17.1 with cluster_key
    // undeclared, so every external save_run silently recorded NULL
    // convergence (tracker issue 105c478f). Assert the surviving VALUE, never
    // `.success` alone — a stripped key still parses successfully.
    it('survives parse with its value intact', () => {
      const result = RecommendationSchema.safeParse({
        ...validRecommendation,
        cluster_key: 'auth-refresh-unhandled-rejection',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.cluster_key).toBe('auth-refresh-unhandled-rejection');
      }
    });

    it('control: an undeclared key IS stripped — proving the value assertion above can fail', () => {
      const result = RecommendationSchema.safeParse({
        ...validRecommendation,
        not_a_declared_key: 'would be silently lost',
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).not.toHaveProperty('not_a_declared_key');
      }
    });

    it('rejects an empty string and anything over 64 chars', () => {
      expect(RecommendationSchema.safeParse({ ...validRecommendation, cluster_key: '' }).success).toBe(false);
      expect(RecommendationSchema.safeParse({ ...validRecommendation, cluster_key: 'k'.repeat(65) }).success).toBe(false);
      expect(RecommendationSchema.safeParse({ ...validRecommendation, cluster_key: 'k'.repeat(64) }).success).toBe(true);
    });

    it('is optional — a pipeline with no adjudicating stage omits it', () => {
      const result = RecommendationSchema.safeParse(validRecommendation);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.cluster_key).toBeUndefined();
      }
    });
  });
});
