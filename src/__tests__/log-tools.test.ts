/**
 * get_project_log + get_log_stat (ulu log spec §3.8 D8; checklist Phase 5).
 *
 * Assertions are on what reaches the SDK (arguments, scope) and on what the
 * model sees — never on a mock that merely agrees with the handler. The
 * load-bearing case is key normalisation: the MCP input is snake_case
 * (`workflow_type`, `include_archived`) and the SDK must receive camelCase,
 * because the SDK sends those names to the API as-is and a snake_cased key
 * would be silently ignored there.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { registerGetProjectLogTool } from '../tools/get-project-log.js';
import { registerGetLogStatTool } from '../tools/get-log-stat.js';
import { toolRegistry } from '../config/tool-registry.js';

type Handler = (args: unknown) => Promise<{ content: Array<{ text: string }>; isError?: boolean }>;

function grab(register: (s: McpServerToolRegistration, c: OpsClient) => void, client: unknown): { handler: Handler; description: string; shape: Record<string, unknown> } {
  const server = { tool: vi.fn() };
  register(server, client as OpsClient);
  const call = server.tool.mock.calls[0] as [string, string, Record<string, unknown>, Handler];
  return { handler: call[3], description: call[1], shape: call[2] };
}
const payload = (r: { content: Array<{ text: string }> }): Record<string, unknown> => JSON.parse(r.content[0]?.text ?? '{}') as Record<string, unknown>;

const page = { data: [{ type: 'decision', issueId: 'i', fingerprint: 'f', title: 't', from: 'open', to: 'completed', reason: null, source: null, at: '2026-09-15T10:00:00.000Z', seq: 1 }], count: 1, hasMore: true, nextCursor: 'c2' };
const stat = { projectId: 'p', window: { since: null, until: null }, examined: { runs: 1 }, found: { issues: 1 }, decided: {}, cameBack: {}, activity: {} };
const orgStat = { org: 'acme', computedAt: '2026-09-15T21:44:44.938Z', ...stat, projects: [], hasMoreProjects: false };

describe('get_project_log', () => {
  let getLog: ReturnType<typeof vi.fn>;
  let handler: Handler;
  let description: string;
  let shape: Record<string, unknown>;

  beforeEach(() => {
    getLog = vi.fn().mockResolvedValue(page);
    ({ handler, description, shape } = grab(registerGetProjectLogTool, { projects: { getLog } }));
  });

  it('normalises snake_case inputs to the SDK\'s camelCase query and forwards the org scope', async () => {
    const r = await handler({
      org: 'acme', project: 'billing', since: '2026-09-01T00:00:00Z', until: '2026-09-15T00:00:00Z', limit: 25, cursor: 'c1',
      kind: ['run', 'regression'], workflow_type: 'ship', agent: 'code-validator', include_archived: true,
    });
    expect(r.isError).toBeUndefined();
    expect(getLog).toHaveBeenCalledWith(
      'billing',
      { since: '2026-09-01T00:00:00Z', until: '2026-09-15T00:00:00Z', limit: 25, cursor: 'c1', kind: ['run', 'regression'], workflowType: 'ship', agent: 'code-validator', includeArchived: true },
      { org: 'acme' },
    );
    // CONTROL: the snake_case names never reach the SDK.
    const sent = getLog.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(sent).not.toHaveProperty('workflow_type');
    expect(sent).not.toHaveProperty('include_archived');
    // The page is relayed as the SDK parsed it — camelCase, uncollapsed.
    const p = payload(r);
    expect(p['nextCursor']).toBe('c2');
    expect(p['hasMore']).toBe(true);
    expect((p['data'] as unknown[]).length).toBe(1);
  });

  it('rejects an unknown kind and an out-of-range limit before any request', async () => {
    const bad = await handler({ project: 'billing', kind: ['merge'] });
    expect(bad.isError).toBe(true);
    const big = await handler({ project: 'billing', limit: 501 });
    expect(big.isError).toBe(true);
    expect(getLog).not.toHaveBeenCalled();
  });

  it('every optional input is described; the description carries the ledger facts a model must keep', () => {
    for (const [key, def] of Object.entries(shape)) {
      expect((def as { description?: string }).description, `${key} has no .describe()`).toBeTruthy();
    }
    expect(description).toMatch(/reason: null/);
    expect(description).toMatch(/source: null.*unattributed.*never "human"/);
    expect(description).toMatch(/regression.*RUN re-detected/);
    expect(description).toMatch(/reopened by decision/);
    expect(description).toMatch(/counts: null/);
    expect(description).toMatch(/Never collapsed/);
  });

  it('has a read ToolSpec whose declared args cap is the effective one', () => {
    const spec = toolRegistry.find((s) => s.name === 'get_project_log');
    expect(spec?.sideEffects).toBe('read');
    // This used to assert maxEgressBytes >= 500 * 1300 — "sized for a 500-event
    // page". That was a response budget on a field that never bounds a response:
    // mcp-secure-server 0.0.20-security evaluates maxEgressBytes at REQUEST time
    // as argsBytes * 16 and never sees a response (tool-registry.ts save_run
    // docblock; tool-registry.test.ts equality invariant). The 650 KB here made
    // the effective ARGS cap 40 KB against a declared 4 KB, and bounded the page
    // size not at all. Response size for this tool is bounded by `limit` (500)
    // on the API side, not by any ToolSpec field.
    expect(spec?.maxEgressBytes).toBe(16 * (spec?.maxArgsSize ?? 0));
  });
});

describe('get_log_stat', () => {
  let getLogStat: ReturnType<typeof vi.fn>;
  let orgGetLogStat: ReturnType<typeof vi.fn>;
  let list: ReturnType<typeof vi.fn>;
  let handler: Handler;
  let shape: Record<string, unknown>;

  beforeEach(() => {
    getLogStat = vi.fn().mockResolvedValue(stat);
    orgGetLogStat = vi.fn().mockResolvedValue(orgStat);
    list = vi.fn().mockResolvedValue([
      { id: 'a', name: 'me', slug: 'alexself2', isPersonal: true, role: 'owner', memberCount: 1, subscriptionTier: 'enterprise', paymentStatus: 'none', suspendedAt: null },
      { id: 'b', name: 'Acme', slug: 'acme', isPersonal: false, role: 'admin', memberCount: 2, subscriptionTier: 'enterprise', paymentStatus: 'none', suspendedAt: null },
    ]);
    ({ handler, shape } = grab(registerGetLogStatTool, { projects: { getLogStat }, orgs: { getLogStat: orgGetLogStat, list } }));
  });

  it('with `project`: the project rollup, windowed, in the org scope', async () => {
    const r = await handler({ org: 'acme', project: 'billing', since: '2026-01-01T00:00:00Z' });
    expect(r.isError).toBeUndefined();
    expect(getLogStat).toHaveBeenCalledWith('billing', { since: '2026-01-01T00:00:00Z' }, { org: 'acme' });
    expect(orgGetLogStat).not.toHaveBeenCalled();
    expect(payload(r)['projectId']).toBe('p');
  });

  it('without `project`: the ORG rollup of the org the call resolves to (slug on the path, no scope)', async () => {
    const r = await handler({ org: 'acme', until: '2026-09-15T00:00:00Z' });
    expect(r.isError).toBeUndefined();
    expect(orgGetLogStat).toHaveBeenCalledWith('acme', { until: '2026-09-15T00:00:00Z' });
    expect(getLogStat).not.toHaveBeenCalled();
    expect(list).not.toHaveBeenCalled();
    expect(payload(r)['computedAt']).toBe('2026-09-15T21:44:44.938Z');
  });

  it('without `project` and resolving to PERSONAL: looks the personal slug up via orgs.list, never guesses', async () => {
    const r = await handler({});
    expect(r.isError).toBeUndefined();
    expect(list).toHaveBeenCalledTimes(1);
    expect(orgGetLogStat).toHaveBeenCalledWith('alexself2', {});
  });

  it('without `project`, personal, and no personal org listed: a loud 400 naming what to pass', async () => {
    list.mockResolvedValue([]);
    const r = await handler({});
    expect(r.isError).toBe(true);
    expect(String(payload(r)['error'])).toContain('pass `org: "<slug>"` or `project`');
    expect(orgGetLogStat).not.toHaveBeenCalled();
  });

  it('every optional input is described; the ToolSpec is a read', () => {
    for (const [key, def] of Object.entries(shape)) {
      expect((def as { description?: string }).description, `${key} has no .describe()`).toBeTruthy();
    }
    expect(toolRegistry.find((s) => s.name === 'get_log_stat')?.sideEffects).toBe('read');
  });
});
