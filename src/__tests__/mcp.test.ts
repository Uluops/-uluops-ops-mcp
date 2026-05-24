/**
 * MCP Response Helper Tests
 *
 * Tests for MCP response creation utilities.
 */

import { describe, it, expect } from 'vitest';
import { createSuccessResponse, createErrorResponse } from '../types/mcp.js';

describe('mcp', () => {
  describe('createSuccessResponse', () => {
    it('should create success response with object data', () => {
      const data = { project: 'test', issues: 5 };
      const response = createSuccessResponse(data);

      expect(response.isError).toBeUndefined();
      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe('text');
      expect(JSON.parse(response.content[0].text)).toEqual(data);
    });

    it('should create success response with array data', () => {
      const data = [{ id: 1 }, { id: 2 }];
      const response = createSuccessResponse(data);

      expect(response.isError).toBeUndefined();
      expect(JSON.parse(response.content[0].text)).toEqual(data);
    });

    it('should create success response with string data', () => {
      const response = createSuccessResponse('Operation complete');

      expect(response.isError).toBeUndefined();
      expect(JSON.parse(response.content[0].text)).toBe('Operation complete');
    });

    it('should create success response with null data', () => {
      const response = createSuccessResponse(null);

      expect(response.isError).toBeUndefined();
      expect(JSON.parse(response.content[0].text)).toEqual({ success: true });
    });

    it('should create success response with undefined data', () => {
      const response = createSuccessResponse(undefined);

      expect(response.isError).toBeUndefined();
      expect(JSON.parse(response.content[0].text)).toEqual({ success: true });
    });

    it('should create success response with number data', () => {
      const response = createSuccessResponse(42);

      expect(response.isError).toBeUndefined();
      expect(JSON.parse(response.content[0].text)).toBe(42);
    });

    it('should create success response with boolean data', () => {
      const response = createSuccessResponse(true);

      expect(response.isError).toBeUndefined();
      expect(JSON.parse(response.content[0].text)).toBe(true);
    });

    it('should handle nested objects', () => {
      const data = {
        project: 'test',
        summary: {
          issues: { open: 5, closed: 10 },
          agents: ['v1', 'v2'],
        },
      };
      const response = createSuccessResponse(data);

      expect(response.isError).toBeUndefined();
      expect(JSON.parse(response.content[0].text)).toEqual(data);
    });

    it('should pretty-print JSON', () => {
      const data = { a: 1, b: 2 };
      const response = createSuccessResponse(data);

      // Check for newlines indicating pretty-printing
      expect(response.content[0].text).toContain('\n');
    });
  });

  describe('createErrorResponse', () => {
    it('should create error response with message', () => {
      const response = createErrorResponse('Something went wrong');

      expect(response.isError).toBe(true);
      expect(response.content).toHaveLength(1);
      expect(response.content[0].type).toBe('text');

      const parsed = JSON.parse(response.content[0].text);
      expect(parsed.error).toBe('Something went wrong');
    });

    it('should format error as JSON object', () => {
      const response = createErrorResponse('Invalid project name');
      const parsed = JSON.parse(response.content[0].text);

      expect(parsed).toEqual({ error: 'Invalid project name' });
    });

    it('should handle empty error message', () => {
      const response = createErrorResponse('');
      const parsed = JSON.parse(response.content[0].text);

      expect(response.isError).toBe(true);
      expect(parsed.error).toBe('');
    });

    it('should handle multiline error messages', () => {
      const response = createErrorResponse('Line 1\nLine 2\nLine 3');
      const parsed = JSON.parse(response.content[0].text);

      expect(response.isError).toBe(true);
      expect(parsed.error).toContain('Line 1');
      expect(parsed.error).toContain('Line 2');
    });

    it('should produce valid JSON', () => {
      const response = createErrorResponse('Test error');
      expect(() => JSON.parse(response.content[0].text)).not.toThrow();
    });
  });
});
