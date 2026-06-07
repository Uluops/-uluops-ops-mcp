/**
 * Tool Registration Integration Tests
 *
 * Tests that registerAllTools correctly registers all MCP tools.
 */

import { describe, it, expect, vi } from 'vitest';
import { registerAllTools } from '../tools/index.js';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { EXPECTED_TOOLS, EXPECTED_TOOL_COUNT } from './fixtures/expected-tools.js';

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
    const mockApiClient = {} as OpsClient;

    // Register all tools
    registerAllTools(mockServer, mockApiClient);

    // Verify count
    expect(registeredTools.length).toBe(EXPECTED_TOOL_COUNT);
  });

  it('should register all expected tools by name', () => {
    const registeredTools: string[] = [];

    const mockServer: McpServerToolRegistration = {
      tool: vi.fn((name: string) => {
        registeredTools.push(name);
      }),
    };

    const mockApiClient = {} as OpsClient;
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

    const mockApiClient = {} as OpsClient;
    registerAllTools(mockServer, mockApiClient);

    const uniqueTools = new Set(registeredTools);
    expect(uniqueTools.size).toBe(registeredTools.length);
  });

  it('should call server.tool with name, description, and handler', () => {
    const mockServer: McpServerToolRegistration = {
      tool: vi.fn(),
    };

    const mockApiClient = {} as OpsClient;
    registerAllTools(mockServer, mockApiClient);

    // Verify tool() was called with expected arguments pattern
    // Each call should have: name (string), description (string), schema (object), handler (function)
    expect(mockServer.tool).toHaveBeenCalledTimes(EXPECTED_TOOL_COUNT);

    const firstCall = vi.mocked(mockServer.tool).mock.calls[0];
    expect(typeof firstCall[0]).toBe('string'); // name
    expect(typeof firstCall[1]).toBe('string'); // description
    expect(typeof firstCall[2]).toBe('object'); // schema
    expect(typeof firstCall[3]).toBe('function'); // handler
  });
});
