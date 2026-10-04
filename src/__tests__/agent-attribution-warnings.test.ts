/**
 * X4-9 save-time attribution warnings (dvc checklist v0.12.6), as revised after the
 * 2026-10-04 review crew (code-auditor, test-architect, public-interface-validator,
 * heidegger-analyst, perverse-outcome-detector). Each warning fires on its fixture; a
 * clean payload produces none; every response test asserts success BEFORE asserting the
 * absence of a warning, because a refused call has no warnings either (the first draft's
 * clean fixture failed Zod and passed vacuously).
 */
import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { agentAttributionWarnings, isMissingVersion } from '../tools/agent-attribution-warnings.js';
import { registerSaveRunTool } from '../tools/save-run.js';
import { registerValidateRunTool } from '../tools/validate-run.js';
import { createToolHandler, WARNINGS_SOURCE } from '../utils/tool-handler.js';

type Response = { content: { type: string; text: string }[]; isError?: boolean };
type Handler = (args: unknown) => Promise<Response>;

const spliced = (name: string, version: string, id: string): { name: string; decision: string; definition_version: string; agent_id: string } =>
  ({ name, decision: 'PASS', definition_version: version, agent_id: id });
const auditor = spliced('code-auditor', '2.7.3', 'a8010e4ddb41dcbf1');
const clean = {
  definition_type: 'pipeline',
  definition_name: 'post-implementation',
  definition_version: '2.0.0',
  agents: [auditor, spliced('test-architect', '1.9.0', 'a1e9c2f193c70725a')],
};
// Both halves are load-bearing: the forbidden sources, AND why — the asymmetry is what the
// model needs to resist filling a version to clear the block (perverse-outcome P1).
const WRONG_IS_WORSE = /Never read a version from the agent file, look one up in the registry, or copy the run's: an omitted version is counted as a miss, while a guessed one can credit the wrong version and hides the miss\./;

describe('agentAttributionWarnings', () => {
  it('a clean payload produces no warnings at either moment (control for an always-warn reference)', () => {
    expect(agentAttributionWarnings(clean, 'saved')).toEqual([]);
    expect(agentAttributionWarnings(clean, 'preview')).toEqual([]);
  });

  it('a hand-built entry with no version is a defect, and the text states that a guessed version is worse (P1)', () => {
    const w = agentAttributionWarnings({ ...clean, agents: [auditor, { name: 'gap-analyst' }] }, 'preview');
    const v = w.find(s => s.includes('no definition_version and no agent_id'));
    expect(v).toMatch(/^1 agent carries no definition_version and no agent_id \(gap-analyst\)/);
    expect(v).toMatch(WRONG_IS_WORSE);
    expect(v).toMatch(/leave the version out/);
  });

  it('a spliced entry with no version is a no-action note, not a defect to fix (P1/P7: a compliant exit)', () => {
    const w = agentAttributionWarnings({ ...clean, agents: [auditor, { name: 'Explore', agent_id: 'abc123' }] }, 'saved');
    expect(w).toHaveLength(1);
    expect(w[0]).toMatch(/^Note, no action needed: 1 agent has no definition_version \(Explore\)/);
    expect(w[0]).toMatch(/Leave it omitted/);
    expect(w[0]).toMatch(WRONG_IS_WORSE);
    expect(w[0]).not.toMatch(/re-save|before calling save_run/);
  });

  it('placeholders count as missing: empty, whitespace and "unknown" (code-auditor M1, P4)', () => {
    for (const v of ['', '   ', 'unknown', 'Unknown']) {
      expect(isMissingVersion(v)).toBe(true);
      const w = agentAttributionWarnings({ ...clean, agents: [{ name: 'gap-analyst', definition_version: v, agent_id: 'x1' }] }, 'saved');
      expect(w.some(s => s.includes('no definition_version (gap-analyst)'))).toBe(true);
    }
    expect(isMissingVersion('1.0.0')).toBe(false);
    const w = agentAttributionWarnings({ ...clean, agents: [{ name: 'gap-analyst', definition_version: '1.0.0', agent_id: '  ' }] }, 'saved');
    expect(w.some(s => s.includes('no agent_id (gap-analyst)'))).toBe(true);
  });

  it('inheritance mirrors the server: type agent, or both fields omitted on a single-agent run (code-auditor M2, public-interface handoff)', () => {
    const solo = { definition_version: '2.7.3', agents: [{ name: 'code-auditor', agent_id: 'x1' }] };
    // Both omitted on a single-agent run: the server infers type agent + this name, and inherits.
    expect(agentAttributionWarnings(solo, 'saved')).toEqual([]);
    expect(agentAttributionWarnings({ ...solo, definition_type: 'agent', definition_name: 'code-auditor' }, 'saved')).toEqual([]);
    // Controls — the server does NOT inherit in these, so they are reported:
    // a name with no type leaves the type null;
    expect(agentAttributionWarnings({ ...solo, definition_name: 'code-auditor' }, 'saved')).toHaveLength(1);
    // a pipeline of the same name;
    expect(agentAttributionWarnings({ ...solo, definition_type: 'pipeline', definition_name: 'code-auditor' }, 'saved')).toHaveLength(1);
    // no run-level version to inherit;
    expect(agentAttributionWarnings({ agents: solo.agents }, 'saved')).toHaveLength(1);
    // two agents with both fields omitted: no single-agent inference.
    expect(agentAttributionWarnings({ ...solo, agents: [...solo.agents, { name: 'gap-analyst', agent_id: 'x2' }] }, 'saved')).toHaveLength(1);
  });

  it('the agent_id warning forbids inventing or reusing one (P3)', () => {
    const w = agentAttributionWarnings({ ...clean, agents: [auditor, { name: 'test-architect', definition_version: '1.9.0' }] }, 'saved');
    expect(w).toEqual([expect.stringMatching(/^1 agent carries no agent_id \(test-architect\).*Never invent or reuse an agent_id/)]);
  });

  it('a reused agent_id is reported (P3)', () => {
    const w = agentAttributionWarnings({ ...clean, agents: [spliced('code-auditor', '2.7.3', 'same'), spliced('test-architect', '1.9.0', 'same')] }, 'saved');
    expect(w).toEqual([expect.stringMatching(/^agent_id same appears on more than one agent/)]);
  });

  it('flags a hand-built copy of the run version, and says to KEEP the run-level fields (P2)', () => {
    const w = agentAttributionWarnings({ ...clean, agents: [auditor, { name: 'test-architect', definition_version: '2.0.0' }] }, 'saved');
    const c = w.find(s => s.includes('may have been copied'));
    expect(c).toMatch(/^1 agent has a hand-built definition_version that may have been copied \(test-architect\)/);
    expect(c).toMatch(/Keep the run-level definition_version and definition_name/);
  });

  it('does not call a SPLICED version a copy when it coincides with the run version (P5: 29 corpus definitions share 1.0.2)', () => {
    const w = agentAttributionWarnings({ ...clean, definition_version: '1.0.2', agents: [spliced('code-auditor', '1.0.2', 'x1'), spliced('gap-analyst', '1.0.2', 'x2')] }, 'saved');
    expect(w).toEqual([]);
  });

  it('still catches the copy when the run-level fields were dropped (P2: deleting a field no longer clears it)', () => {
    const w = agentAttributionWarnings({ agents: [{ name: 'code-auditor', definition_version: '2.0.0' }, { name: 'test-architect', definition_version: '2.0.0' }] }, 'saved');
    expect(w.some(s => /may have been copied \(code-auditor, test-architect\)/.test(s))).toBe(true);
    // Control: a single hand-built version, with no run fields to compare against, infers nothing.
    expect(agentAttributionWarnings({ agents: [{ name: 'code-auditor', definition_version: '2.0.0' }] }, 'saved').some(s => s.includes('copied'))).toBe(false);
  });

  it('tense follows the moment: saved never says fix-before-saving, preview never says already-recorded (code-auditor H1, heidegger OBTRUSIVE-1)', () => {
    const payload = { ...clean, agents: [{ name: 'gap-analyst' }] };
    const saved = agentAttributionWarnings(payload, 'saved').join(' ');
    const preview = agentAttributionWarnings(payload, 'preview').join(' ');
    expect(saved).toMatch(/already recorded as sent; do not re-save it/);
    expect(saved).not.toMatch(/before calling save_run/);
    expect(preview).toMatch(/Fix this before calling save_run/);
    expect(preview).not.toMatch(/already recorded/);
  });

  it('inflects the verb and lists a repeated name once', () => {
    const w = agentAttributionWarnings({ ...clean, agents: [{ name: 'x', definition_version: '1' }, { name: 'x', definition_version: '1' }] }, 'saved');
    expect(w.find(s => s.includes('no agent_id'))).toMatch(/^2 agents carry no agent_id \(x\):/);
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

/** The parsed warnings block, or undefined. Fails on a block that names warnings but does not parse. */
const blockOf = (r: Response): { warnings: string[]; from: string } | undefined => {
  for (const c of r.content) {
    if (!c.text.startsWith('{') || !c.text.includes('"warnings"')) continue;
    return JSON.parse(c.text) as { warnings: string[]; from: string };
  }
  return undefined;
};

describe('save_run / validate_run responses', () => {
  const base = { project: 'p', workflow_type: 'post-implementation' };

  it('save_run: a clean payload succeeds with no warnings block', async () => {
    const { handler } = register('save', () => Promise.resolve({ run: { runNumber: 1 } }));
    const ok = await handler({ ...base, ...clean });
    expect(ok.isError).toBeFalsy(); // a refused call would pass the next line vacuously
    expect(ok.content.length).toBeGreaterThan(1);
    expect(blockOf(ok)).toBeUndefined();
  });

  it('save_run: a lossy payload succeeds with a provenance-labelled block before the untrusted notice', async () => {
    const { handler } = register('save', () => Promise.resolve({ run: { runNumber: 1 } }));
    const warned = await handler({ ...base, ...clean, agents: [{ name: 'test-architect', decision: 'APPROVED' }] });
    expect(warned.isError).toBeFalsy();
    const block = blockOf(warned);
    expect(block?.warnings).toHaveLength(2);
    expect(block?.from).toBe(WARNINGS_SOURCE);
    expect(block?.warnings.join(' ')).toMatch(/already recorded/);
    expect(warned.content.at(-1)?.text).not.toContain('warnings'); // the untrusted notice stays last
  });

  it('save_run: never fills or alters the payload sent to the SDK', async () => {
    const { handler, call } = register('save', () => Promise.resolve({}));
    expect((await handler({ ...base, ...clean, agents: [{ name: 'test-architect', decision: 'APPROVED' }] })).isError).toBeFalsy();
    expect(call).toHaveBeenCalledTimes(1);
    const sent = call.mock.calls[0]?.[0] as { agents: Record<string, unknown>[] };
    expect(sent.agents).toHaveLength(1);
    expect(sent.agents[0]).not.toHaveProperty('definitionVersion');
    expect(sent.agents[0]).not.toHaveProperty('agentId');
  });

  it('save_run: no warnings on an error response (nothing was recorded)', async () => {
    const { handler } = register('save', () => Promise.reject(Object.assign(new Error('boom'), { status: 500 })));
    const r = await handler({ ...base, agents: [{ name: 'test-architect', decision: 'APPROVED' }] });
    expect(r.isError).toBe(true);
    expect(JSON.stringify(r.content)).toContain('boom'); // the SDK error, not a Zod refusal
    expect(blockOf(r)).toBeUndefined();
  });

  it('validate_run: previews the copy warning before anything is saved, in pre-write tense (heidegger OBSTINATE-3, P6)', async () => {
    const { handler } = register('validate', () => Promise.resolve({ would_create: 0 }));
    const r = await handler({ ...base, ...clean, agents: [auditor, { name: 'test-architect', decision: 'APPROVED', definition_version: '2.0.0' }] });
    expect(r.isError).toBeFalsy();
    const w = blockOf(r)?.warnings ?? [];
    expect(w.some(s => /may have been copied \(test-architect\)/.test(s))).toBe(true);
    expect(w.join(' ')).toMatch(/Fix this before calling save_run/);
    expect(w.join(' ')).not.toMatch(/already recorded/);
  });
});

describe('createToolHandler responseWarnings', () => {
  it('a throwing warning hook never turns a landed write into an error (code-auditor L1)', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
      const handler = createToolHandler(z.object({ x: z.string() }), () => Promise.resolve({ ok: true }), {
        toolName: 't',
        responseWarnings: () => { throw new Error('warning bug'); },
      });
      const r = (await handler({ x: 'y' })) as Response;
      expect(r.isError).toBeFalsy();
      expect(JSON.parse(r.content[0]?.text ?? '{}')).toEqual({ ok: true });
      expect(blockOf(r)).toBeUndefined();
      expect(stderr.mock.calls.some(c => String(c[0]).includes('[mcp-tool-warn-error] tool=t'))).toBe(true);
    } finally {
      stderr.mockRestore();
    }
  });
});
