/**
 * Arm-to-destroy — confirmation-and-org-provenance spec v0.2.0 D1–D5.
 *
 * Each gating assertion has a control beside it: the refusal is checked
 * against a call that must NOT be refused, so a gate that refused everything
 * (or nothing) fails here.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { z } from 'zod';
import type { McpServerToolRegistration, ToolHandler } from '../types/index.js';
import { parseAllowDestructive } from '../config/index.js';
import { toolRegistry } from '../config/tool-registry.js';
import {
  DESTRUCTIVE_TOOLS,
  UNGATED_WRITES,
  ADDITIVE_WRITES,
  DESTRUCTIVE_DESCRIPTION_NOTE,
  PROMPTED_DESCRIPTION_NOTE,
  REQUIRES_USER_INTERACTION,
  setDestructiveMode,
  setDestructiveRefusalSink,
  toolAnnotations,
  toolRegistrationConfig,
  withDestructiveGate,
} from '../utils/destructive-gate.js';
import { registerAllTools } from '../tools/index.js';
import { ORG_ARG_DESCRIPTION, ORG_ARG_DESCRIPTION_READ } from '../utils/org-scope.js';
import { setOrgAllowlist, setUnboundedOrgSink, warnIfUnbounded, type UnboundedOrgWarning } from '../utils/org-call-log.js';
import { createToolHandler } from '../utils/tool-handler.js';

afterEach(() => {
  setDestructiveMode('default');
  setDestructiveRefusalSink(() => {});
  setOrgAllowlist(undefined);
  setUnboundedOrgSink(() => {});
});

/** Register every tool against a recording server; return name → {description, handler}. */
function registerRecorded(): Map<string, { description: string; handler: ToolHandler }> {
  const recorded = new Map<string, { description: string; handler: ToolHandler }>();
  const server: McpServerToolRegistration = {
    tool: (name, description, _schema, handler) => { recorded.set(name, { description, handler }); },
  };
  registerAllTools(server, {} as never);
  return recorded;
}

/** Look up a recorded tool's handler, failing loudly if the name is absent. */
function handlerOf(recorded: Map<string, { handler: ToolHandler }>, name: string): ToolHandler {
  const entry = recorded.get(name);
  if (entry === undefined) throw new Error(`tool ${name} was not registered`);
  return entry.handler;
}

/** First text block of a tool response. */
function firstText(res: { content: Array<{ text: string }> }): string {
  const block = res.content[0];
  if (block === undefined) throw new Error('empty response');
  return block.text;
}

describe('parseAllowDestructive (D1)', () => {
  it('unset and empty are the armed default', () => {
    expect(parseAllowDestructive(undefined)).toBe('default');
    expect(parseAllowDestructive('')).toBe('default');
    expect(parseAllowDestructive('  ')).toBe('default');
  });

  it('true/1 arm explicitly and false/0 disarm, case-insensitively', () => {
    expect(['true', 'TRUE', '1', ' true '].map(parseAllowDestructive)).toEqual(['armed', 'armed', 'armed', 'armed']);
    expect(['false', 'False', '0'].map(parseAllowDestructive)).toEqual(['disarmed', 'disarmed', 'disarmed']);
  });

  it('refuses to start on anything else — a misspelt disarm must not read as armed', () => {
    for (const bad of ['flase', 'no', 'off', 'yes', '2']) {
      expect(() => parseAllowDestructive(bad), bad).toThrow(/ULUOPS_ALLOW_DESTRUCTIVE must be true, false, 1 or 0/);
    }
  });
});

describe('the destructive set (D2)', () => {
  const registered = registerRecorded();
  const writes = new Set(toolRegistry.filter((t) => t.sideEffects === 'write').map((t) => t.name));

  it('has twelve members, every one a registered write tool — including update_status (unbounded bulk re-status)', () => {
    expect(DESTRUCTIVE_TOOLS.size).toBe(12);
    expect(DESTRUCTIVE_TOOLS.has('update_status')).toBe(true);
    for (const name of DESTRUCTIVE_TOOLS) {
      expect(registered.has(name), `${name} registered`).toBe(true);
      expect(writes.has(name), `${name} is sideEffects:write`).toBe(true);
    }
  });

  it('every write tool is classified exactly once — a new one forces a decision (anxiety F4)', () => {
    expect(writes.size).toBeGreaterThan(20);
    for (const name of writes) {
      const inD = DESTRUCTIVE_TOOLS.has(name);
      const inN = UNGATED_WRITES.has(name);
      expect(inD !== inN, `${name}: gated=${String(inD)} ungated=${String(inN)} — add it to exactly one set`).toBe(true);
    }
    for (const name of UNGATED_WRITES) expect(writes.has(name), `${name} is sideEffects:write`).toBe(true);
    for (const name of ADDITIVE_WRITES) expect(UNGATED_WRITES.has(name), `${name} additive ⊂ ungated`).toBe(true);
  });

  it('ungated overwrites are still labelled destructive — the label is the effect, not the gate', () => {
    for (const n of ['save_run', 'edit_issue', 'update_project', 'update_issue_by_fingerprint', 'undo_issue_status', 'restore_issue']) {
      expect(toolAnnotations(n).destructiveHint, n).toBe(true);
    }
    for (const n of ['add_issue_note', 'create_issue', 'create_project']) expect(toolAnnotations(n).destructiveHint, n).toBe(false);
  });

  it('an unclassified write is labelled destructive, never safe', () => {
    expect(toolAnnotations('some_future_write_tool')).toMatchObject({ readOnlyHint: false, destructiveHint: true });
  });

  it('the prompt-forced five are a subset of it', () => {
    expect(REQUIRES_USER_INTERACTION.size).toBe(5);
    for (const name of REQUIRES_USER_INTERACTION) expect(DESTRUCTIVE_TOOLS.has(name), name).toBe(true);
  });
});

describe('gate (D1) through the real registration seam', () => {
  const registered = registerRecorded();

  it('disarmed: every destructive tool refuses before createToolHandler (org resolution, its Zod parse, the SDK)', async () => {
    setDestructiveMode('disarmed');
    for (const name of DESTRUCTIVE_TOOLS) {
      // No args at all: had the call reached createToolHandler's Zod parse it
      // would be a validation error, not this refusal — so the gate precedes
      // it. (In the running server the SDK's protocol-layer inputSchema check
      // runs before ANY handler, so a malformed call gets that error instead;
      // neither reaches the API. Verified over stdio against dist, 2026-09-24.)
      const res = await handlerOf(registered, name)({});
      const body = JSON.parse(firstText(res)) as Record<string, unknown>;
      expect(res.isError, name).toBe(true);
      expect(body['code'], name).toBe('DESTRUCTIVE_NOT_ARMED');
      expect(body['applied'], name).toBe(false);
      expect(body['terminal'], name).toBe(true);
      expect(res.content, `${name}: no org echo — nothing resolved`).toHaveLength(1);
    }
  });

  it('control: disarmed leaves every non-destructive tool un-refused', async () => {
    setDestructiveMode('disarmed');
    const others = [...registered.keys()].filter((n) => !DESTRUCTIVE_TOOLS.has(n));
    expect(others.length).toBeGreaterThan(40);
    for (const name of others) {
      const res = await handlerOf(registered, name)({});
      expect(firstText(res), name).not.toContain('DESTRUCTIVE_NOT_ARMED');
    }
  });

  it('armed and default pass straight through to the inner handler', async () => {
    const inner = vi.fn<ToolHandler>().mockResolvedValue({ content: [{ type: 'text', text: 'inner' }] });
    const calls = new Map<string, { handler: ToolHandler }>();
    withDestructiveGate({ tool: (n, _d, _s, h) => { calls.set(n, { handler: h }); } }).tool('delete_run', 'd', {}, inner);
    const gated = handlerOf(calls, 'delete_run');
    for (const m of ['default', 'armed'] as const) {
      setDestructiveMode(m);
      expect(firstText(await gated({ x: 1 })), m).toBe('inner');
    }
    expect(inner).toHaveBeenCalledTimes(2);
    setDestructiveMode('disarmed');
    await gated({ x: 1 });
    expect(inner, 'disarmed must not reach the inner handler').toHaveBeenCalledTimes(2);
  });

  it('a refused call leaves a trace; an armed call does not (audit F2)', async () => {
    const refused: string[] = [];
    setDestructiveRefusalSink((tool) => { refused.push(tool); });
    setDestructiveMode('disarmed');
    await handlerOf(registered, 'delete_project')({});
    setDestructiveMode('armed');
    const inner = vi.fn<ToolHandler>().mockResolvedValue({ content: [{ type: 'text', text: 'ok' }] });
    const calls = new Map<string, { handler: ToolHandler }>();
    withDestructiveGate({ tool: (n, _d, _s, h) => { calls.set(n, { handler: h }); } }).tool('delete_run', 'd', {}, inner);
    await handlerOf(calls, 'delete_run')({});
    expect(refused).toEqual(['delete_project']);
  });

  it('destructive descriptions carry the env sentence; the org sentence stays last; others are untouched', () => {
    for (const [name, { description }] of registered) {
      const has = description.includes(DESTRUCTIVE_DESCRIPTION_NOTE);
      expect(has, name).toBe(DESTRUCTIVE_TOOLS.has(name));
      expect(description.includes(PROMPTED_DESCRIPTION_NOTE), `${name} prompted note`).toBe(REQUIRES_USER_INTERACTION.has(name));
    }
    const orgSuffixed = [...registered.values()].filter(({ description }) =>
      description.endsWith(ORG_ARG_DESCRIPTION) || description.endsWith(ORG_ARG_DESCRIPTION_READ));
    expect(orgSuffixed.length).toBe(52);
  });
});

describe('annotations and _meta (D3, D5)', () => {
  it('every registry tool is labelled by effect: only reads and purely additive writes are non-destructive (A8)', () => {
    expect(toolRegistry.length).toBeGreaterThan(50);
    for (const t of toolRegistry) {
      const a = toolAnnotations(t.name);
      expect(a.readOnlyHint, t.name).toBe(t.sideEffects === 'read');
      expect(a.destructiveHint, t.name).toBe(t.sideEffects === 'write' && !ADDITIVE_WRITES.has(t.name));
      expect(a.openWorldHint, t.name).toBe(false);
    }
  });

  it('the registration config carries annotations, and _meta only on the five', () => {
    const shape = { a: z.string() };
    for (const t of toolRegistry) {
      const cfg = toolRegistrationConfig(t.name, 'desc', shape);
      expect(cfg.description).toBe('desc');
      expect(cfg.inputSchema).toBe(shape);
      expect(cfg.annotations).toEqual(toolAnnotations(t.name));
      if (REQUIRES_USER_INTERACTION.has(t.name)) {
        expect(cfg._meta, t.name).toEqual({ 'anthropic/requiresUserInteraction': true });
      } else {
        expect(cfg, t.name).not.toHaveProperty('_meta');
      }
    }
  });
});

describe('per-call unbounded-org warning (D4)', () => {
  const capture = (): UnboundedOrgWarning[] => {
    const seen: UnboundedOrgWarning[] = [];
    setUnboundedOrgSink((w) => { seen.push(w); });
    return seen;
  };

  it('warns for a named org while the allowlist is unset; not for personal; not once a list is set', () => {
    const seen = capture();
    warnIfUnbounded('save_run', 'acme', 'org', 'explicit');
    warnIfUnbounded('save_run', undefined, 'org', 'personal');
    warnIfUnbounded('save_run', 'personal', 'target', 'body');
    setOrgAllowlist(['acme']);
    warnIfUnbounded('save_run', 'acme', 'org', 'explicit');
    expect(seen).toEqual([{ tool: 'save_run', org: 'acme', role: 'org', orgSource: 'explicit' }]);
  });

  it('fires through createToolHandler for the resolved org and for a body target org', async () => {
    const seen = capture();
    const sdk = vi.fn().mockResolvedValue({ ok: true });
    const handler = createToolHandler(
      z.object({ project: z.string(), target_org: z.string() }),
      sdk,
      { toolName: 'rehome_project', targetOrgOf: (n) => n['targetOrg'] as string },
    );
    await handler({ project: 'p', target_org: 'evil', org: 'acme' });
    expect(sdk).toHaveBeenCalledTimes(1);
    expect(seen.map((w) => [w.role, w.org])).toEqual([['org', 'acme'], ['target', 'evil']]);
  });

  it('a call that fails validation never reached the API and is not counted (audit F3)', async () => {
    const seen = capture();
    const sdk = vi.fn().mockResolvedValue({ ok: true });
    const handler = createToolHandler(z.object({ project: z.string() }), sdk, { toolName: 'get_project' });
    await handler({ org: 'acme' });                 // no project → Zod fails
    expect(sdk).not.toHaveBeenCalled();
    expect(seen).toEqual([]);
    await handler({ project: 'p', org: 'acme' });   // control: the valid call is counted
    expect(seen.map((w) => w.org)).toEqual(['acme']);
  });

  it('control: an omitted org (personal) produces no warning', async () => {
    const seen = capture();
    const sdk = vi.fn().mockResolvedValue({ ok: true });
    await createToolHandler(z.object({ project: z.string() }), sdk, { toolName: 'get_project' })({ project: 'p' });
    expect(sdk).toHaveBeenCalledTimes(1);
    expect(seen).toEqual([]);
  });
});
