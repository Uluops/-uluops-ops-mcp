/**
 * Tool Registration Integration Tests
 *
 * Tests that registerAllTools correctly registers all MCP tools.
 */

import { z } from 'zod';
import { describe, it, expect, vi } from 'vitest';
import { registerAllTools } from '../tools/index.js';
import { toolGuid, toolInteger } from '../utils/tool-schema.js';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { EXPECTED_TOOLS, EXPECTED_TOOL_COUNT } from './fixtures/expected-tools.js';

describe('registerAllTools', () => {
  it('should register the expected number of tools', () => {
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

/**
 * Tool schema wire (zod-4 train T4): every tool advertises what 0.31.x (zod 3) advertised for
 * integers, ids and the exploration-section union. See utils/tool-schema.ts. Converted with zod
 * 4's own `toJSONSchema`, the converter the MCP SDK uses for zod 4 schemas.
 */
describe('tool schema wire', () => {
  const shapes = new Map<string, Record<string, z.ZodType>>();
  registerAllTools(
    { tool: vi.fn((name: string, _d: string, shape: Record<string, z.ZodType>) => { shapes.set(name, shape); }) } as unknown as McpServerToolRegistration,
    {} as OpsClient,
  );
  const wire = (shape: Record<string, z.ZodType>): string => JSON.stringify(z.toJSONSchema(z.object(shape), { io: 'input' }));
  const SAFE = String(Number.MAX_SAFE_INTEGER);

  it('covers every registered tool (non-vacuous)', () => {
    expect(shapes.size).toBe(EXPECTED_TOOL_COUNT);
  });

  // These four declare `offset: ….max(Number.MAX_SAFE_INTEGER)` in source; 0.31.x advertised that
  // cap too. Any OTHER safe-integer bound (an undeclared one from zod 4's `.int()`) is a regression,
  // so the check counts occurrences per tool instead of exempting the tool.
  const DECLARED_SAFE_CAPS: Record<string, number> = { query_issues: 1, get_analytics: 1, search_issues: 1, list_projects: 1 };

  it('no tool advertises an undeclared safe-integer bound, an id pattern, or oneOf', () => {
    const offenders = [...shapes].flatMap(([name, shape]) => {
      const w = wire(shape);
      const safe = w.split(SAFE).length - 1;
      return [safe !== (DECLARED_SAFE_CAPS[name] ?? 0) && `${name}: ${String(safe)} safe-integer bound(s)`, w.includes('"pattern":"^([0-9a-fA-F]{8}') && `${name}: id pattern`, w.includes('"oneOf"') && `${name}: oneOf`].filter(Boolean);
    });
    expect(offenders).toEqual([]);
  });

  it('the helpers advertise the zod 3 wire and validate the zod 3 set', () => {
    const js = z.toJSONSchema(z.object({ n: toolInteger().positive(), id: toolGuid() }), { io: 'input' }) as { properties: Record<string, unknown> };
    expect(js.properties['n']).toEqual({ type: 'integer', exclusiveMinimum: 0 });
    expect(js.properties['id']).toEqual({ type: 'string', format: 'uuid' });
    expect(toolInteger().safeParse(1.5).success).toBe(false);
    expect(toolGuid().safeParse('11111111-1111-1111-1111-111111111111').success).toBe(true); // non-RFC, as zod 3 accepted
    expect(toolGuid().safeParse('not-an-id').success).toBe(false);
  });

  it('control: zod 4 built-ins do advertise what the helpers avoid', () => {
    expect(wire({ n: z.number().int() })).toContain(SAFE);
    expect(wire({ id: z.guid() })).toContain('"pattern"');
    expect(wire({ u: z.discriminatedUnion('t', [z.object({ t: z.literal('a') }), z.object({ t: z.literal('b') })]) })).toContain('"oneOf"');
  });
});
