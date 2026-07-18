/**
 * Handler ↔ ToolSpec Parity
 *
 * The tool surface is registered twice: handlers in src/tools/index.ts and
 * security ToolSpecs in src/config/tool-registry.ts. The two files are joined
 * only by string tool-name — no type or build step binds them — and a handler
 * with no ToolSpec is rejected by mcp-secure-server at first invocation with
 * a bare -32602 that names neither the tool file nor the registry.
 *
 * This test welds the two sets together: any drift fails CI with the missing
 * name, in the vocabulary of the file that needs the edit. The boot-time
 * counterpart is checkToolSpecParity() in src/index.ts.
 */

import { describe, it, expect, vi } from 'vitest';
import type { OpsClient } from '@uluops/ops-sdk';
import { registerAllTools } from '../tools/index.js';
import { toolRegistry } from '../config/tool-registry.js';
import { checkToolSpecParity } from '../index.js';
import type { McpServerToolRegistration } from '../types/index.js';

function collectRegisteredToolNames(): string[] {
  const names: string[] = [];
  const mockServer: McpServerToolRegistration = {
    tool: (name) => {
      names.push(name);
    },
  };
  // Handlers are never invoked — a bare object stub suffices for registration.
  registerAllTools(mockServer, {} as unknown as OpsClient);
  return names;
}

describe('handler ↔ ToolSpec parity', () => {
  it('every registered handler has a ToolSpec in tool-registry.ts', () => {
    const registered = collectRegisteredToolNames();
    const specNames = new Set(toolRegistry.map((s) => s.name));
    const missingSpecs = registered.filter((n) => !specNames.has(n));
    expect(
      missingSpecs,
      `Handlers with no ToolSpec (will be rejected -32602 at first invocation — add entries to src/config/tool-registry.ts): ${missingSpecs.join(', ')}`
    ).toEqual([]);
  });

  it('every ToolSpec has a registered handler', () => {
    const registered = new Set(collectRegisteredToolNames());
    const orphanSpecs = toolRegistry
      .map((s) => s.name)
      .filter((n) => !registered.has(n));
    expect(
      orphanSpecs,
      `ToolSpecs with no handler (stale registry entries, or a missed registration in src/tools/index.ts): ${orphanSpecs.join(', ')}`
    ).toEqual([]);
  });

  it('registers no duplicate handler names', () => {
    const registered = collectRegisteredToolNames();
    expect(new Set(registered).size).toBe(registered.length);
  });
});

describe('checkToolSpecParity', () => {
  it('warns for a handler with no ToolSpec, naming the tool and the registry file', () => {
    const warn = vi.fn();
    const { missingSpecs, orphanSpecs } = checkToolSpecParity(
      ['save_run', 'brand_new_tool'],
      ['save_run'],
      { warn }
    );
    expect(missingSpecs).toEqual(['brand_new_tool']);
    expect(orphanSpecs).toEqual([]);
    expect(warn).toHaveBeenCalledTimes(1);
    const message = warn.mock.calls[0]?.[0] as string;
    expect(message).toContain("'brand_new_tool'");
    expect(message).toContain('tool-registry.ts');
    expect(message).toContain('-32602');
  });

  it('warns for a ToolSpec with no handler', () => {
    const warn = vi.fn();
    const { missingSpecs, orphanSpecs } = checkToolSpecParity(
      ['save_run'],
      ['save_run', 'removed_tool'],
      { warn }
    );
    expect(missingSpecs).toEqual([]);
    expect(orphanSpecs).toEqual(['removed_tool']);
    expect(warn).toHaveBeenCalledTimes(1);
    const message = warn.mock.calls[0]?.[0] as string;
    expect(message).toContain("'removed_tool'");
  });

  it('stays silent when the sets match', () => {
    const warn = vi.fn();
    const result = checkToolSpecParity(['a', 'b'], ['b', 'a'], { warn });
    expect(result).toEqual({ missingSpecs: [], orphanSpecs: [] });
    expect(warn).not.toHaveBeenCalled();
  });
});
