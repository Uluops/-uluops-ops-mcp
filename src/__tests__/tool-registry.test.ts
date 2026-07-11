/**
 * Tool Registry Tests
 *
 * Tests for tool registry configuration and validation.
 */

import { describe, it, expect } from 'vitest';
import { toolRegistry } from '../config/tool-registry.js';
import { EXPECTED_TOOLS, EXPECTED_TOOL_COUNT } from './fixtures/expected-tools.js';

describe('toolRegistry', () => {
  it('should export an array of tool specs', () => {
    expect(Array.isArray(toolRegistry)).toBe(true);
    expect(toolRegistry.length).toBeGreaterThan(0);
  });

  it('should contain all expected tools', () => {
    const toolNames = toolRegistry.map((tool) => tool.name);
    for (const expected of EXPECTED_TOOLS) {
      expect(toolNames).toContain(expected);
    }
  });

  it('should have exactly 50 tools', () => {
    expect(toolRegistry.length).toBe(EXPECTED_TOOL_COUNT);
  });

  it('should have no duplicate tool names', () => {
    const toolNames = toolRegistry.map((tool) => tool.name);
    const uniqueNames = new Set(toolNames);
    expect(uniqueNames.size).toBe(toolNames.length);
  });

  describe('tool spec validation', () => {
    it.each(toolRegistry)('$name should have valid sideEffects', (tool) => {
      expect(['read', 'write']).toContain(tool.sideEffects);
    });

    it.each(toolRegistry)('$name should have positive maxArgsSize', (tool) => {
      expect(tool.maxArgsSize).toBeGreaterThan(0);
    });

    it.each(toolRegistry)('$name should have positive maxEgressBytes', (tool) => {
      expect(tool.maxEgressBytes).toBeGreaterThan(0);
    });

    it.each(toolRegistry)('$name should have positive quotaPerMinute', (tool) => {
      expect(tool.quotaPerMinute).toBeGreaterThan(0);
    });

    it.each(toolRegistry)('$name should have positive quotaPerHour', (tool) => {
      expect(tool.quotaPerHour).toBeGreaterThan(0);
    });

    it.each(toolRegistry)('$name should have quotaPerHour >= quotaPerMinute', (tool) => {
      expect(tool.quotaPerHour).toBeGreaterThanOrEqual(tool.quotaPerMinute);
    });
  });

  describe('side effects classification', () => {
    const readTools = [
      'query_issues',
      'get_project_summary',
      'get_issue_details',
      'get_run_details',
      'diff_runs',
      'get_analytics',
      'search_issues',
      'list_agents',
      'validate_run',
      'get_issue_history',
      'get_agent_reliability',
    ];

    const writeTools = [
      'save_run',
      'update_status',
      'delete_project',
      'archive_runs',
      'add_issue_note',
      'edit_issue',
      'merge_issues',
      'bulk_update_status',
      'update_run',
      'create_issue',
    ];

    it.each(readTools)('%s should have sideEffects: read', (toolName) => {
      const tool = toolRegistry.find((t) => t.name === toolName);
      expect(tool).toBeDefined();
      expect(tool?.sideEffects).toBe('read');
    });

    it.each(writeTools)('%s should have sideEffects: write', (toolName) => {
      const tool = toolRegistry.find((t) => t.name === toolName);
      expect(tool).toBeDefined();
      expect(tool?.sideEffects).toBe('write');
    });
  });

  describe('size limits', () => {
    it('save_run should allow large args (1MB) for batch operations', () => {
      const tool = toolRegistry.find((t) => t.name === 'save_run');
      expect(tool?.maxArgsSize).toBeGreaterThanOrEqual(1024 * 1024);
    });

    it('validate_run should match save_run limits', () => {
      const save = toolRegistry.find((t) => t.name === 'save_run');
      const validate = toolRegistry.find((t) => t.name === 'validate_run');
      expect(validate?.maxArgsSize).toBe(save?.maxArgsSize);
      expect(validate?.maxEgressBytes).toBe(save?.maxEgressBytes);
    });

    it('delete_project should have low quotas for safety', () => {
      const tool = toolRegistry.find((t) => t.name === 'delete_project');
      expect(tool?.quotaPerMinute).toBeLessThanOrEqual(10);
      expect(tool?.quotaPerHour).toBeLessThanOrEqual(50);
    });
  });
});
