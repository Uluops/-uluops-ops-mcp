import { describe, it, expect } from 'vitest';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { registerGetAgentLifecycleTool } from '../tools/get-agent-lifecycle.js';
import { registerAllTools } from '../tools/index.js';
import { CROSS_VERSION_CAVEAT, UNVERSIONED_FIGURES_CAVEAT, UNVERSIONED_FIGURES_TOOLS } from '../tools/cross-version-caveat.js';

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

// Pinned here, independently of the array under test, so removing a tool from
// UNVERSIONED_FIGURES_TOOLS fails this file (the A31 TA-3 lesson, as in @uluops/registry-mcp).
const EXPECTED_UNVERSIONED = ['get_agent_matrix', 'get_agent_reliability', 'get_agent_runs_analysis', 'get_analytics'];

function registerAll(): { descriptions: Map<string, string>; handlers: Map<string, Handler> } {
  const descriptions = new Map<string, string>();
  const handlers = new Map<string, Handler>();
  const server: McpServerToolRegistration = {
    tool(name: string, description: string, _shape: unknown, ...rest: unknown[]): void {
      descriptions.set(name, description);
      handlers.set(name, rest[rest.length - 1] as Handler);
    },
  };
  // Every SDK method resolves to an empty object, so each handler reaches its success path.
  const method = (): Promise<object> => Promise.resolve({});
  const namespace = new Proxy({}, { get: () => method });
  const client = new Proxy({}, { get: () => namespace });
  registerAllTools(server, client as unknown as OpsClient);
  return { descriptions, handlers };
}

describe('unversioned-figures caveat (dvc spec v0.11.2 \u00a74.1, amendment CM; P0m-3)', () => {
  const { descriptions, handlers } = registerAll();

  it('the tool list matches the pinned set', () => {
    expect([...UNVERSIONED_FIGURES_TOOLS].sort()).toEqual(EXPECTED_UNVERSIONED);
  });

  it.each(EXPECTED_UNVERSIONED)('%s carries the caveat in description and response', async (name) => {
    expect(descriptions.get(name), `${name} is not registered`).toContain(UNVERSIONED_FIGURES_CAVEAT);
    const handler = handlers.get(name);
    if (handler === undefined) throw new Error(`${name} is not registered`);
    const response = await handler({ name: 'code-validator', agent_name: 'code-validator', project: 'p', metric: 'agent_performance' });
    expect(response.content.map((c) => c.text)).toContain(JSON.stringify({ caveat: UNVERSIONED_FIGURES_CAVEAT }));
  });

  it('only get_agent_lifecycle carries the cross-version caveat, and only the pinned set the unversioned one', () => {
    const others = [...descriptions].filter(([name]) => !EXPECTED_UNVERSIONED.includes(name));
    // Vacuity guard: the server registers far more than the covered tools.
    expect(others.length).toBeGreaterThan(20);
    for (const [name, description] of others) expect(description, name).not.toContain(UNVERSIONED_FIGURES_CAVEAT);
    for (const [name, description] of descriptions) {
      if (name !== 'get_agent_lifecycle') expect(description, name).not.toContain(CROSS_VERSION_CAVEAT);
    }
  });

  it('pins the shared sentence word for word (the same literal is pinned in @uluops/registry-mcp)', () => {
    expect(UNVERSIONED_FIGURES_CAVEAT).toBe(
      'Figures here that carry no definition version are not evidence about any one version: each may pool every ' +
      'version of the agent or definition it describes (some also span several definitions or orgs), even when the ' +
      'request named a version, or may come from a single version the response does not name. Do not attribute such a ' +
      'figure to a version, compare it with a version\'s own figures, or read a change in it as evidence that an edit ' +
      'made a definition better or worse.',
    );
  });
});
