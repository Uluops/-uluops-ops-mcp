import { describe, it, expect } from 'vitest';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { registerGetAgentLifecycleTool } from '../tools/get-agent-lifecycle.js';
import { CROSS_VERSION_CAVEAT } from '../tools/cross-version-caveat.js';

type Handler = (args: unknown) => Promise<{ content: { type: string; text: string }[] }>;

function register(): { name: string; description: string; handler: Handler }[] {
  const registered: { name: string; description: string; handler: Handler }[] = [];
  const server = {
    tool(name: string, description: string, _shape: unknown, ...rest: unknown[]): void {
      registered.push({ name, description, handler: rest[rest.length - 1] as Handler });
    },
  } as unknown as McpServerToolRegistration;
  const client = { analytics: { getAgentLifecycle: async (): Promise<object> => ({ versions: [] }) } };
  registerGetAgentLifecycleTool(server, client as unknown as OpsClient);
  return registered;
}

describe('cross-version caveat (dvc spec \u00a74.1, amendments AC and AH)', () => {
  it('get_agent_lifecycle carries the caveat in its description', () => {
    const registered = register();
    expect(registered).toHaveLength(1);
    expect(registered[0].name).toBe('get_agent_lifecycle');
    expect(registered[0].description).toContain(CROSS_VERSION_CAVEAT);
  });

  it('get_agent_lifecycle carries the caveat in every success response', async () => {
    const response = await register()[0].handler({ name: 'code-validator' });
    expect(response.content.map((c) => c.text)).toContain(JSON.stringify({ caveat: CROSS_VERSION_CAVEAT }));
  });

  it('pins the shared sentence word for word (same text ships in @uluops/registry-mcp 0.11.2)', () => {
    expect(CROSS_VERSION_CAVEAT).toBe(
      'Cross-version figures here are observational: each version ran in its own period, on its own artifacts, ' +
      'and its findings were triaged under the process of that time. Pass rates and scores are the agent\'s own grades, ' +
      'so an edit that changes how lenient it is moves them without changing quality. Differences between versions are ' +
      'not evidence that an edit made the definition better or worse; do not rank versions or recommend one on the basis ' +
      'of these figures, alone or combined with other figures.',
    );
    expect(CROSS_VERSION_CAVEAT).not.toMatch(/figures alone\./);
  });
});
