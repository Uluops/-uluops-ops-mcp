import { describe, it, expect } from 'vitest';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { registerGetAgentLifecycleTool } from '../tools/get-agent-lifecycle.js';
import { CROSS_VERSION_CAVEAT } from '../tools/cross-version-caveat.js';

describe('cross-version caveat (dvc spec §4.1, amendment AC)', () => {
  it('get_agent_lifecycle carries the caveat', () => {
    const registered: Array<{ name: string; description: string }> = [];
    const server = {
      tool(name: string, description: string): void {
        registered.push({ name, description });
      },
    } as unknown as McpServerToolRegistration;
    registerGetAgentLifecycleTool(server, {} as OpsClient);
    expect(registered).toHaveLength(1);
    expect(registered[0].name).toBe('get_agent_lifecycle');
    expect(registered[0].description).toContain(CROSS_VERSION_CAVEAT);
  });

  it('pins the shared sentence (same text ships in @uluops/registry-mcp)', () => {
    expect(CROSS_VERSION_CAVEAT).toMatch(/^Cross-version figures here are observational: .* from these figures alone\.$/);
  });
});
