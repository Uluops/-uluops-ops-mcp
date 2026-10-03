import { describe, it, expect } from 'vitest';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { registerGetAgentLifecycleTool } from '../tools/get-agent-lifecycle.js';
import { CROSS_VERSION_CAVEAT } from '../tools/cross-version-caveat.js';

type Handler = (args: unknown) => Promise<{ content: { type: string; text: string }[] }>;

function register(): { name: string; description: string; handler: Handler }[] {
  const registered: { name: string; description: string; handler: Handler }[] = [];
  const server: McpServerToolRegistration = {
    tool(name: string, description: string, _shape: unknown, ...rest: unknown[]): void {
      registered.push({ name, description, handler: rest[rest.length - 1] as Handler });
    },
  };
  const client = { analytics: { getAgentLifecycle: (): Promise<object> => Promise.resolve({ versions: [] }) } };
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

  it('pins the shared sentence word for word (the same literal is pinned in @uluops/registry-mcp)', () => {
    expect(CROSS_VERSION_CAVEAT).toBe(
      'Cross-version figures here are observational. Some may not be per-version at all: health, failure-domain, ' +
      'taxonomy and execution-count figures, where present, may be computed for the definition rather than the ' +
      'version they are shown under (pooling its runs across versions, and possibly across orgs, or taking ' +
      'issue-derived parts from a single version that need not be the one shown) and are stored against a version ' +
      'whenever it is recomputed, so a difference between versions there can reflect when and how each was recomputed ' +
      'rather than the versions. Pass rates and scores, where per-version, come from each version\'s own runs in its ' +
      'own period, on its own artifacts, and are the agent\'s own assessments of those artifacts, so an edit that ' +
      'changes how lenient it is moves them without changing quality. No difference between versions here is evidence ' +
      'that an edit made the definition better or worse; do not rank versions or recommend one on the basis of these ' +
      'figures, alone or combined with other figures.',
    );
    expect(CROSS_VERSION_CAVEAT).not.toMatch(/figures alone\./);
    expect(CROSS_VERSION_CAVEAT).not.toMatch(/\bgrades?\b/);
  });
});
