/**
 * X4-9 save-time attribution warnings (dvc checklist v0.12.6). Each warning fires on its
 * fixture; a clean payload produces none (an always-warn reference fails the clean case);
 * the warnings ride on success responses only, and never alter the SDK payload.
 */
import { describe, it, expect, vi } from 'vitest';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { agentAttributionWarnings } from '../tools/agent-attribution-warnings.js';
import { registerSaveRunTool } from '../tools/save-run.js';
import { registerValidateRunTool } from '../tools/validate-run.js';

type Handler = (args: unknown) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>;

const clean = {
  definition_name: 'post-implementation',
  definition_version: '2.0.0',
  agents: [
    { name: 'code-auditor', decision: 'SOUND', definition_version: '2.7.3', agent_id: 'a8010e4ddb41dcbf1' },
    { name: 'test-architect', decision: 'APPROVED', definition_version: '1.9.0', agent_id: 'a1e9c2f193c70725a' },
  ],
};

describe('agentAttributionWarnings', () => {
  it('a clean payload produces no warnings (control for an always-warn reference)', () => {
    expect(agentAttributionWarnings(clean)).toEqual([]);
  });

  it('names every agent with no definition_version', () => {
    const w = agentAttributionWarnings({ ...clean, agents: [clean.agents[0], { name: 'test-architect', agent_id: 'x' }, { name: 'gap-analyst', agent_id: 'y' }] });
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/^2 agents carry no definition_version \(test-architect, gap-analyst\)/);
    expect(w[0]).not.toContain('code-auditor');
  });

  it('names every agent with no agent_id', () => {
    const w = agentAttributionWarnings({ ...clean, agents: [clean.agents[0], { name: 'test-architect', definition_version: '1.9.0' }] });
    expect(w).toEqual([expect.stringMatching(/^1 agent carry no agent_id \(test-architect\)/)]);
  });

  it('flags the c18f1ab1 signature: the run version under a different agent name', () => {
    const w = agentAttributionWarnings({ ...clean, agents: [clean.agents[0], { name: 'test-architect', definition_version: '2.0.0', agent_id: 'x' }] });
    expect(w).toHaveLength(1);
    expect(w[0]).toContain('(test-architect) carry the run\'s definition_version (2.0.0, which belongs to post-implementation)');
  });

  it('does not flag the run definition itself carrying its own version (single-agent run)', () => {
    expect(agentAttributionWarnings({ definition_name: 'code-auditor', definition_version: '2.7.3', agents: [clean.agents[0]] })).toEqual([]);
  });

  it('makes no copy inference without a run-level definition_name', () => {
    expect(agentAttributionWarnings({ definition_version: '2.7.3', agents: [clean.agents[0]] })).toEqual([]);
  });
});

function register(which: 'save' | 'validate', impl: () => Promise<unknown>): { handler: Handler; call: ReturnType<typeof vi.fn> } {
  let handler: Handler | undefined;
  const server: McpServerToolRegistration = {
    tool(_n: string, _d: string, _s: unknown, ...rest: unknown[]): void { handler = rest[rest.length - 1] as Handler; },
  };
  const call = vi.fn(impl);
  const client = { runs: { save: call, validate: call } } as unknown as OpsClient;
  if (which === 'save') registerSaveRunTool(server, client); else registerValidateRunTool(server, client);
  if (handler === undefined) throw new Error('tool did not register a handler');
  return { handler, call };
}

const warningsOf = (r: { content: { text: string }[] }): string[] | undefined => {
  for (const c of r.content) {
    try { const o = JSON.parse(c.text) as { warnings?: string[] }; if (o.warnings) return o.warnings; } catch { /* not JSON */ }
  }
  return undefined;
};

describe('save_run / validate_run responses', () => {
  const base = { project: 'p', workflow_type: 'post-implementation' };

  it('save_run: a warning block on success, none for a clean payload', async () => {
    const { handler } = register('save', () => Promise.resolve({ run: { runNumber: 1 } }));
    const ok = await handler({ ...base, ...clean });
    expect(ok.isError).toBeFalsy(); // a refused call would pass the next line vacuously
    expect(ok.content.length).toBeGreaterThan(1);
    expect(warningsOf(ok)).toBeUndefined();
    const warned = await handler({ ...base, ...clean, agents: [{ name: 'test-architect', decision: 'APPROVED' }] });
    expect(warned.isError).toBeFalsy();
    expect(warningsOf(warned)).toHaveLength(2);
    // The untrusted-content notice stays last.
    expect(warned.content.at(-1)?.text).not.toContain('warnings');
  });

  it('save_run: never fills or alters the payload sent to the SDK', async () => {
    const { handler, call } = register('save', () => Promise.resolve({}));
    expect((await handler({ ...base, ...clean, agents: [{ name: 'test-architect', decision: 'APPROVED' }] })).isError).toBeFalsy();
    expect(call).toHaveBeenCalledTimes(1);
    const sent = call.mock.calls[0]?.[0] as { agents: Record<string, unknown>[] };
    expect(sent.agents).toHaveLength(1);
    expect(sent.agents[0]).not.toHaveProperty('definitionVersion');
    expect(sent.agents[0]).not.toHaveProperty('definition_version');
  });

  it('save_run: no warnings on an error response (nothing was recorded)', async () => {
    const { handler } = register('save', () => Promise.reject(Object.assign(new Error('boom'), { status: 500 })));
    const r = await handler({ ...base, agents: [{ name: 'test-architect', decision: 'APPROVED' }] });
    expect(r.isError).toBe(true);
    expect(JSON.stringify(r.content)).toContain('boom'); // the SDK error, not a Zod refusal
    expect(warningsOf(r)).toBeUndefined();
  });

  it('validate_run: the same missing-version warning before anything is saved', async () => {
    const { handler } = register('validate', () => Promise.resolve({ would_create: 0 }));
    const r = await handler({ ...base, agents: [{ name: 'test-architect', decision: 'APPROVED', agent_id: 'x' }] });
    expect(r.isError).toBeFalsy();
    const w = warningsOf(r);
    expect(w).toEqual([expect.stringMatching(/^1 agent carry no definition_version \(test-architect\)/)]);
  });
});
