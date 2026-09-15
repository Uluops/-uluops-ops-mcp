/**
 * rehome_project + get_org_audit_feed (project-org-routing-and-rehome §4.1, D19).
 *
 * Assertions are on what reaches the SDK (arguments, scope) and on the payload
 * the model sees — never on a mock that merely agrees with the handler.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OpsClient } from '@uluops/ops-sdk';
import { ConflictError } from '@uluops/ops-sdk/errors';
import type { McpServerToolRegistration } from '../types/index.js';
import { registerRehomeProjectTool } from '../tools/rehome-project.js';
import { registerGetOrgAuditFeedTool, summarizeFeedEntry } from '../tools/get-org-audit-feed.js';
import { toolRegistry } from '../config/tool-registry.js';

type Handler = (args: unknown) => Promise<{ content: Array<{ text: string }>; isError?: boolean }>;

function grab(register: (s: McpServerToolRegistration, c: OpsClient) => void, client: unknown): { handler: Handler; description: string } {
  const server = { tool: vi.fn() };
  register(server, client as OpsClient);
  const call = server.tool.mock.calls[0] as [string, string, unknown, Handler];
  return { handler: call[3], description: call[1] };
}
const payload = (r: { content: Array<{ text: string }> }): Record<string, unknown> => JSON.parse(r.content[0]?.text ?? '{}') as Record<string, unknown>;

const ORG_A = { id: 'a-id', slug: 'acme' };
const ORG_B = { id: 'b-id', slug: 'ulu-labs' };

describe('rehome_project', () => {
  let rehome: ReturnType<typeof vi.fn>;
  let handler: Handler;
  let description: string;

  beforeEach(() => {
    rehome = vi.fn().mockResolvedValue({ id: 'p1', name: 'billing', orgId: ORG_B.id, rehome: { from_org: ORG_A, to_org: ORG_B, audit_ids: [] } });
    ({ handler, description } = grab(registerRehomeProjectTool, { projects: { rehome } }));
  });

  it('maps target_org → targetOrg, omits reason when absent, and forwards `org` as the SOURCE scope', async () => {
    const r = await handler({ project: 'billing', target_org: 'ulu-labs', org: 'acme' });
    expect(r.isError).toBeUndefined();
    expect(rehome).toHaveBeenCalledWith('billing', { targetOrg: 'ulu-labs' }, { org: 'acme' });
    expect(payload(r)).toMatchObject({ rehome: { to_org: { slug: 'ulu-labs' } } });
  });

  it('carries reason when given; no `org` → undefined scope (personal source), and org never leaks into the body', async () => {
    await handler({ project: 'billing', target_org: 'ulu-labs', reason: 'team took it' });
    expect(rehome).toHaveBeenCalledWith('billing', { targetOrg: 'ulu-labs', reason: 'team took it' }, undefined);
    const input = rehome.mock.calls[0]?.[1] as Record<string, unknown>;
    expect(Object.keys(input)).not.toContain('org');
  });

  it('rejects a missing target_org and an over-long reason before any SDK call', async () => {
    const r1 = await handler({ project: 'billing' });
    const r2 = await handler({ project: 'billing', target_org: 'x', reason: 'r'.repeat(501) });
    expect(r1.isError).toBe(true);
    expect(r2.isError).toBe(true);
    expect(rehome).not.toHaveBeenCalled();
  });

  it('relays a 409 with its reason and a reason-specific suggestion (rehomed_away_conflict)', async () => {
    const err = new ConflictError('name reserved', { reason: 'rehomed_away_conflict' });
    rehome.mockRejectedValueOnce(err);
    const r = await handler({ project: 'billing', target_org: 'ulu-labs', org: 'acme' });
    expect(r.isError).toBe(true);
    const p = payload(r);
    expect(p['status']).toBe(409);
    expect(p['reason']).toBe('rehomed_away_conflict');
    expect(String(p['suggestion'])).toMatch(/Do not retry the same call/);
  });

  it('the description says which argument is the source and which the target', () => {
    expect(description).toMatch(/`org` is the SOURCE/);
    expect(description).toMatch(/`target_org` is the destination/);
    expect(description).toMatch(/Do NOT retry a 403 without `org`/);
  });

  it('has a write ToolSpec with a tight hourly quota', () => {
    const spec = toolRegistry.find((t) => t.name === 'rehome_project');
    expect(spec?.sideEffects).toBe('write');
    expect(spec?.quotaPerHour).toBeLessThanOrEqual(20);
  });
});

describe('get_org_audit_feed', () => {
  const entry = (action: 'project.rehome_out' | 'project.rehome_in', extra: Record<string, unknown> = {}): { id: string; actorId: string; action: string; createdAt: string; details: Record<string, unknown> } => ({
    id: 'e1', actorId: 'u1', action: 'org.updated', createdAt: '2026-09-15T10:00:00.000Z',
    details: {
      source: 'project_rehome', action, project_id: 'p1', project_name: 'billing',
      from_org: ORG_A, to_org: { id: 'pers', slug: 'alexself2' }, actor: 'u1', reason: 'moving out',
      via_admin_path: false, to_personal_org: true, visibility: 'org', ...extra,
    },
  });
  let getVisibleAuditLog: ReturnType<typeof vi.fn>;
  let handler: Handler;

  beforeEach(() => {
    getVisibleAuditLog = vi.fn().mockResolvedValue({ data: { entries: [entry('project.rehome_out')] }, count: 1, hasMore: true, nextCursor: '2026-09-15T10:00:00.000Z|e1' });
    ({ handler } = grab(registerGetOrgAuditFeedTool, { orgs: { getVisibleAuditLog } }));
  });

  it('reads the feed of the org named by `org`, passes cursor/limit, and returns summaries + next_cursor', async () => {
    const r = await handler({ org: 'acme', cursor: 'c0', limit: 25 });
    expect(r.isError).toBeUndefined();
    expect(getVisibleAuditLog).toHaveBeenCalledWith('acme', { cursor: 'c0', limit: 25 });
    const p = payload(r);
    expect(p['org']).toBe('acme');
    expect(p['next_cursor']).toBe('2026-09-15T10:00:00.000Z|e1');
    expect(p['has_more']).toBe(true);
    const entries = p['entries'] as Array<Record<string, unknown>>;
    expect(entries[0]?.['summary']).toBe('2026-09-15T10:00:00.000Z: project "billing" moved to `alexself2` — a personal org — reason: moving out');
    expect(entries[0]?.['details']).toBeDefined(); // raw entry preserved beside the summary
  });

  it('without `org` (personal resolution) it refuses with a 400 that names the argument — no SDK call', async () => {
    const r = await handler({});
    expect(r.isError).toBe(true);
    expect(getVisibleAuditLog).not.toHaveBeenCalled();
    const p = payload(r);
    expect(p['status']).toBe(400);
    expect(String(p['error'])).toMatch(/pass `org: "<slug>"`/);
  });

  it('summarizeFeedEntry: rehome_in reads "arrived from", admin path is marked, non-rehome rows give null', () => {
    expect(summarizeFeedEntry(entry('project.rehome_in', { via_admin_path: true, to_personal_org: false, reason: null }) as never))
      .toBe('2026-09-15T10:00:00.000Z: project "billing" arrived from `acme` (platform admin)');
    expect(summarizeFeedEntry({ id: 'e2', actorId: null, action: 'org.updated', createdAt: '2026-09-15T09:00:00.000Z', details: { visibility: 'org', note: 'x' } })).toBeNull();
  });

  it('has a read ToolSpec (so its advertised org text is the read variant)', () => {
    const spec = toolRegistry.find((t) => t.name === 'get_org_audit_feed');
    expect(spec?.sideEffects).toBe('read');
  });
});

describe('sdk-error-mapper — 400 with a business reason (same_org)', () => {
  it('carries reason + a terminal "already done" suggestion instead of the schema-check text; unknown reasons keep the generic text', async () => {
    const { ValidationError } = await import('@uluops/ops-sdk/errors');
    const { mapSdkErrorToMcp } = await import('../client/sdk-error-mapper.js');
    const same = JSON.parse(mapSdkErrorToMcp(new ValidationError('The project is already in that organization', { reason: 'same_org' }), 'rehome_project').content[0]?.text ?? '{}') as Record<string, unknown>;
    expect(same['reason']).toBe('same_org');
    expect(same['terminal']).toBe(true);
    expect(same['applied']).toBe(false);
    expect(String(same['suggestion'])).toMatch(/already in that org — nothing to do/);
    const other = JSON.parse(mapSdkErrorToMcp(new ValidationError('bad', { reason: 'some_new_reason' }), 'rehome_project').content[0]?.text ?? '{}') as Record<string, unknown>;
    expect(other['reason']).toBe('some_new_reason');
    expect(String(other['suggestion'])).toMatch(/Check parameter types/);
  });
});
