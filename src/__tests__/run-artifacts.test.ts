/**
 * Run artifacts through ops-mcp (v0.36.0; effectiveness-analytics checklist
 * P3-3, P3-9). Value-asserting, as the cluster_key tests are: a plain
 * `z.object()` strips an undeclared key with no error, so the only honest test
 * reads the value the SDK receives.
 *
 * The artifact object must survive in BOTH spellings: snake_case (this tool's
 * convention) and camelCase, which is what `ulu artifact describe` prints and
 * what a prompt-driven writer pastes. These tests fail on 0.35.0, where
 * AgentResultSchema, RecommendationSchema and the run schemas declared none of
 * these keys (checked by running them against the 0.35.0 sources).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { registerSaveRunTool } from '../tools/save-run.js';
import { registerValidateRunTool } from '../tools/validate-run.js';
import { registerUpdateRunTool } from '../tools/update-run.js';
import { OPS_MCP_VERSION, OPS_MCP_WRITER_STAMP } from '../config/version.js';
import pkg from '../../package.json' with { type: 'json' };

const HASH = `sha256:${'b'.repeat(64)}`;
const CAMEL = { kind: 'spec', kindSource: 'caller', repo: 'github.com/uluops/specs', path: 'specs/a-v0_2_0.md', hash: HASH, revisionOf: 'specs/a-v0_1_0.md', revisionOfSource: 'convention', role: 'primary' };
const SNAKE = { kind: 'spec', kind_source: 'caller', repo: 'github.com/uluops/specs', path: 'specs/a-v0_2_0.md', hash: HASH, revision_of: 'specs/a-v0_1_0.md', revision_of_source: 'convention', role: 'primary' };
const SENT = CAMEL; // what the SDK must receive from either spelling

type Handler = (args: unknown) => Promise<unknown>;
/** The first call's first argument; throws when the mock was never called. */
function firstArg(m: ReturnType<typeof vi.fn>): Record<string, any> {
  const call = m.mock.calls[0];
  if (call === undefined) throw new Error('mock was not called');
  return call[0] as Record<string, any>;
}
function register(fn: (s: McpServerToolRegistration, c: OpsClient) => void, client: unknown): Handler {
  const server = { tool: vi.fn() } as unknown as McpServerToolRegistration & { tool: ReturnType<typeof vi.fn> };
  fn(server, client as OpsClient);
  const call = server.tool.mock.calls[0];
  if (call === undefined) throw new Error('tool was not registered');
  return call[3] as Handler;
}

describe('ops-mcp writer stamp', () => {
  it('is ops-mcp@<package.json version>', () => {
    expect(OPS_MCP_VERSION).toBe(pkg.version);
    expect(OPS_MCP_WRITER_STAMP).toBe(`ops-mcp@${pkg.version}`);
  });
});

describe('save_run carries run artifacts to the SDK', () => {
  let save: ReturnType<typeof vi.fn>;
  let handler: Handler;
  beforeEach(() => {
    save = vi.fn().mockResolvedValue({ run: { id: 'x', runNumber: 1 } });
    handler = register(registerSaveRunTool, { runs: { save } });
  });

  it.each([['snake_case', SNAKE], ['camelCase (pasted from ulu artifact describe)', CAMEL]])('artifacts in %s arrive camelCased with every key', async (_label, artifact) => {
    await handler({
      project: 'p', workflow_type: 'pre-implementation', writer: 'pdl-executor@2.3.0', purpose: 'validation', artifacts: [artifact],
      agents: [{ name: 'rev', score: 80, decision: 'PASS', agent_id: 'a1', spawn_ordinal: 3, stage_role: 'review', sees_peer_findings: true, threshold: 72.5, artifacts: [artifact] }],
      recommendations: [{ agent: 'rev', title: 't', priority: 'suggested', agent_ref: 'a1', artifact: 0 }],
    });
    const n = firstArg(save);
    expect(n.writer).toBe(`pdl-executor@2.3.0 ${OPS_MCP_WRITER_STAMP}`);
    expect(n.purpose).toBe('validation');
    expect(n.artifacts).toEqual([SENT]);
    expect(n.agents[0]).toMatchObject({ agentId: 'a1', spawnOrdinal: 3, stageRole: 'review', seesPeerFindings: true, threshold: 72.5, artifacts: [SENT] });
    expect(n.recommendations[0]).toMatchObject({ agentRef: 'a1', artifact: 0 });
  });

  it('stamps ops-mcp when the caller sent no writer', async () => {
    await handler({ project: 'p', workflow_type: 'manual', agents: [{ name: 'a', decision: 'PASS' }] });
    expect(firstArg(save).writer).toBe(OPS_MCP_WRITER_STAMP);
  });

  it('refuses a malformed hash and an unknown kind before the round trip', async () => {
    for (const bad of [{ ...CAMEL, hash: 'sha256:XYZ' }, { ...CAMEL, kind: 'unknown' }]) {
      const r = await handler({ project: 'p', workflow_type: 'm', agents: [{ name: 'a', decision: 'PASS' }], artifacts: [bad] }) as { isError?: boolean };
      expect(r.isError).toBe(true);
    }
    expect(save).not.toHaveBeenCalled();
  });
});

describe('validate_run sends the same fields and stamp', () => {
  it('artifacts, instance fields and writer reach runs.validate', async () => {
    const validate = vi.fn().mockResolvedValue({ wouldCreate: 0, wouldUpdate: 0, wouldRegress: 0, validationErrors: [], preview: { newIssues: [], recurringIssues: [], regressions: [] } });
    const handler = register(registerValidateRunTool, { runs: { validate } });
    await handler({ project: 'p', workflow_type: 'pre-implementation', artifacts: [CAMEL], agents: [{ name: 'rev', decision: 'PASS', stage_role: 'review' }] });
    const n = firstArg(validate);
    expect([n.writer, n.artifacts, n.agents[0].stageRole]).toEqual([OPS_MCP_WRITER_STAMP, [SENT], 'review']);
  });
});

describe('update_run appends artifacts and returns the D64 warnings', () => {
  it('sends run and instance artifacts; surfaces warnings beside the run', async () => {
    const warning = { code: 'agent_id_unmatched', path: 'agents.0.agentId', agentId: 'zz', message: 'applied to the unmatched placeholder' };
    const updateWithEcho = vi.fn().mockResolvedValue({ run: { id: 'r', runNumber: 2 }, analysisWrite: null, warnings: [warning] });
    const handler = register(registerUpdateRunTool, { runs: { updateWithEcho, updateByIdWithEcho: vi.fn() } });
    const out = await handler({ project: 'p', run_number: 2, artifacts: [SNAKE], agents: [{ name: 'rev', agent_id: 'zz', stage_role: 'review', artifacts: [CAMEL] }] }) as { content: Array<{ text: string }> };
    const n = firstArg(updateWithEcho);
    expect(n.artifacts).toEqual([SENT]);
    expect(n.agents[0]).toMatchObject({ agentId: 'zz', stageRole: 'review', artifacts: [SENT] });
    expect(out.content.map((c) => c.text).join('\n')).toContain('agent_id_unmatched');
  });

  it('omits warnings when there are none, and tolerates an SDK that returns no warnings key', async () => {
    const updateWithEcho = vi.fn().mockResolvedValue({ run: { id: 'r', runNumber: 2 }, analysisWrite: null });
    const handler = register(registerUpdateRunTool, { runs: { updateWithEcho, updateByIdWithEcho: vi.fn() } });
    const out = await handler({ project: 'p', run_number: 2, raw_markdown: 'x' }) as { content: Array<{ text: string }>; isError?: boolean };
    expect(out.isError).toBeFalsy();
    expect(out.content.map((c) => c.text).join('\n')).not.toContain('warnings');
  });
});
