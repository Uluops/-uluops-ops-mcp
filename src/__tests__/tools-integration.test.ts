/**
 * Tool Registration Integration Tests
 *
 * Tests that registerAllTools correctly registers all MCP tools.
 */

import { describe, it, expect, vi } from 'vitest';
import { registerAllTools } from '../tools/index.js';
import type { BackendApiClient } from '../client/api-client.js';
import type { McpServerToolRegistration } from '../types/index.js';

// Expected tool names (must match tool-registry.ts)
const EXPECTED_TOOLS = [
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
  'validate_run',
  'get_issue_history',
  'add_issue_note',
  'edit_issue',
  'merge_issues',
  'bulk_update_status',
  'update_run',
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
  // P2 Taxonomy Tools
  'get_taxonomy',
  'get_full_taxonomy_analytics',
  'get_burndown',
  'get_velocity',
  'get_discovery',
  'get_agent_matrix',
];

describe('registerAllTools', () => {
  it('should register all 48 tools', () => {
    const registeredTools: string[] = [];

    // Mock server that captures tool registrations
    const mockServer: McpServerToolRegistration = {
      tool: vi.fn((name: string) => {
        registeredTools.push(name);
      }),
    };

    // Mock API client (unused in registration, just needed for signature)
    const mockApiClient = {} as BackendApiClient;

    // Register all tools
    registerAllTools(mockServer, mockApiClient);

    // Verify count
    expect(registeredTools.length).toBe(48);
  });

  it('should register all expected tools by name', () => {
    const registeredTools: string[] = [];

    const mockServer: McpServerToolRegistration = {
      tool: vi.fn((name: string) => {
        registeredTools.push(name);
      }),
    };

    const mockApiClient = {} as BackendApiClient;
    registerAllTools(mockServer, mockApiClient);

    // Verify each expected tool is registered
    for (const expectedTool of EXPECTED_TOOLS) {
      expect(registeredTools).toContain(expectedTool);
    }
  });

  it('should register tools with unique names (no duplicates)', () => {
    const registeredTools: string[] = [];

    const mockServer: McpServerToolRegistration = {
      tool: vi.fn((name: string) => {
        registeredTools.push(name);
      }),
    };

    const mockApiClient = {} as BackendApiClient;
    registerAllTools(mockServer, mockApiClient);

    const uniqueTools = new Set(registeredTools);
    expect(uniqueTools.size).toBe(registeredTools.length);
  });

  it('should call server.tool with name, description, and handler', () => {
    const mockServer: McpServerToolRegistration = {
      tool: vi.fn(),
    };

    const mockApiClient = {} as BackendApiClient;
    registerAllTools(mockServer, mockApiClient);

    // Verify tool() was called with expected arguments pattern
    // Each call should have: name (string), description (string), schema (object), handler (function)
    expect(mockServer.tool).toHaveBeenCalledTimes(48);

    const firstCall = vi.mocked(mockServer.tool).mock.calls[0];
    expect(typeof firstCall[0]).toBe('string'); // name
    expect(typeof firstCall[1]).toBe('string'); // description
    expect(typeof firstCall[2]).toBe('object'); // schema
    expect(typeof firstCall[3]).toBe('function'); // handler
  });
});
