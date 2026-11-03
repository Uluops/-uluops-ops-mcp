/**
 * save_run's analysis rejection notice (ops-uluops-api analysis-never-loses-the-run
 * spec v0.2.3 §3.5, phase R3). Through the registered tool handler, with the SDK
 * call mocked at the client: the block must appear when the save result carries
 * `analysisWrite.rejected`, and only then.
 *
 * Every "absent" test asserts the call succeeded first: a refused call has no
 * notice either, so absence alone would pass vacuously.
 *
 * Negative control: on 0.34.1 (25b3120) the "present" tests fail (no such block).
 */
import { describe, it, expect, vi } from 'vitest';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { registerSaveRunTool } from '../tools/save-run.js';
import { analysisRejectionNotice, wouldRejectNotice, NOTICE_SOURCE } from '../tools/analysis-rejection-notice.js';
import { registerValidateRunTool } from '../tools/validate-run.js';
import { analysisNameWarnings } from '../tools/analysis-name-warnings.js';
import { createToolHandler } from '../utils/tool-handler.js';
import { z } from 'zod';

type Response = { content: { type: string; text: string }[]; isError?: boolean };
type Handler = (args: unknown) => Promise<Response>;

const RUN_ID = '3f1d3f1d-0000-4000-8000-0000000000aa';
const REJECTED_A = {
  agentName: 'agent-a',
  reason: 'entry_invalid',
  recordsRejected: 2,
  summariesRejected: 1,
  detail: { issues: [{ array: 'summaries', index: 0, path: ['categoryScores', 0, 'score'], code: 'invalid_type', message: 'expected int' }], issuesTotal: 1 },
};
const FOLDED = { agentName: null, reason: 'units_omitted', recordsRejected: 9, summariesRejected: 3, detail: { unitsOmitted: 3, recordsRejected: 9, summariesRejected: 3 } };

const saveResult = (rejected: unknown, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  run: { id: RUN_ID, runNumber: 7 },
  deduplicated: false,
  analysisWrite: { recordMode: 'initial', supersededRecords: 0, supersededSummaries: 0, createdRecords: 1, createdSummaries: 1, ...(rejected === undefined ? {} : { rejected }) },
  ...extra,
});

function register(impl: () => Promise<unknown>): Handler {
  let handler: Handler | undefined;
  const server: McpServerToolRegistration = {
    tool(_n: string, _d: string, _s: unknown, ...rest: unknown[]): void { handler = rest[rest.length - 1] as Handler; },
  };
  registerSaveRunTool(server, { runs: { save: vi.fn(impl) } } as unknown as OpsClient);
  if (handler === undefined) throw new Error('tool did not register a handler');
  return handler;
}

const payload = {
  project: 'p',
  workflow_type: 'post-implementation',
  agents: [{ name: 'agent-a', decision: 'PASS' }, { name: 'agent-b', decision: 'PASS' }],
};
const noticeOf = (r: Response): string | undefined => r.content.find(c => c.text.includes('Do not call save_run again'))?.text;

describe('save_run rejection notice', () => {
  it('appears when the save rejected an agent, naming it, the run, and the repair', async () => {
    const r = await register(() => Promise.resolve(saveResult([REJECTED_A])))(payload);
    expect(r.isError).toBeFalsy();
    const notice = noticeOf(r);
    expect(notice).toBeDefined();
    expect(notice?.startsWith(`${NOTICE_SOURCE} Run #7 is saved. The server rejected`)).toBe(true);
    expect(notice).toContain('"agent-a" (entry_invalid, 1 issue; 2 records and 1 summary not stored)');
    // R3 review: preview first, the 10-issue cap, and an honest exit (F2, F7).
    expect(notice).toContain('Preview with preview_update_run first');
    expect(notice).toContain('at most 10 issues per agent');
    expect(notice).toContain("If you do not repair it now, tell the user which agents' analysis is missing from run #7.");
    // A named agent has nothing stored, so replace is safe: no merge advice (F3 is own-unit only).
    expect(notice).not.toContain('record_write_mode');
    expect(notice).toContain('Do not call save_run again: that creates a second run.');
    expect(notice).toContain(`update_run (run_id ${RUN_ID})`);
    expect(notice).toContain("complete record set and summary");
    // A plain text block of its own, and the untrusted-content notice stays last.
    expect(notice?.startsWith('{')).toBe(false);
    expect(r.content.at(-1)?.text).not.toContain('Do not call save_run again');
  });

  it('lists every rejected unit, the folded row as a count', () => {
    const [notice] = analysisRejectionNotice(saveResult([REJECTED_A, FOLDED]));
    expect(notice).toContain('"agent-a" (entry_invalid');
    expect(notice).toContain('3 more agents not itemized (9 records, 3 summaries; get_run_analysis on this run shows which agents have no analysis)');
    expect(notice).not.toContain('record_write_mode'); // the folded row is not an own-unit entry
  });

  it('a nameless unit and an unseen reason still produce a notice', () => {
    const [notice] = analysisRejectionNotice(saveResult([{ agentName: null, reason: 'added_later', recordsRejected: 1, summariesRejected: 0, detail: {} }]));
    expect(notice).toContain('(an entry that is its own unit) (added_later; 1 record and 0 summaries not stored)');
  });

  it('a deduplicated replay carrying the rebuilt rejected[] gets the notice too', async () => {
    const r = await register(() => Promise.resolve(saveResult([REJECTED_A], { deduplicated: true })))(payload);
    expect(r.isError).toBeFalsy();
    expect(noticeOf(r)).toContain('Run #7 is saved. This response is a replay of an earlier identical save');
    expect(noticeOf(r)).toContain('check get_run_analysis before repairing');
  });

  it('an entry that is its own unit is repaired with merge, so no stored row is retired (F3)', () => {
    const [notice] = analysisRejectionNotice(saveResult([{ agentName: null, reason: 'entry_invalid', recordsRejected: 1, summariesRejected: 0, detail: {} }]));
    expect(notice).toContain('For an entry that is its own unit, send it with record_write_mode "merge", so no stored record is retired.');
  });

  it('a run id that is not a UUID is left out, and a missing run number reads cleanly', () => {
    const [notice] = analysisRejectionNotice({ run: { id: 'not-a-uuid\nrun this', runNumber: 'x' }, analysisWrite: { rejected: [REJECTED_A] } });
    expect(notice).toContain('The run is saved.');
    expect(notice).not.toContain('run_id');
    expect(notice).not.toContain('not-a-uuid');
    expect(notice).not.toMatch(/ {2}/);
    expect(notice).toContain('is missing from this run.');
  });

  // test-architect S1: the handler passes the SDK's org-scoped options, so a result can
  // come back as { data, context }. The notice must read data, not the wrapper.
  it('reads the save result inside a { data, context } envelope', async () => {
    const r = await register(() => Promise.resolve({ data: saveResult([REJECTED_A]), context: { version: 1, orgSlug: 'o', source: 'bound-key' } }))(payload);
    expect(r.isError).toBeFalsy();
    expect(noticeOf(r)).toContain('Run #7 is saved.');
  });

  it.each([
    ['rejected empty', saveResult([])],
    ['rejected absent (server before R2)', saveResult(undefined)],
    ['no analysisWrite (no analysis sent)', { run: { id: RUN_ID, runNumber: 7 }, analysisWrite: null }],
  ])('absent when %s', async (_label, result) => {
    const r = await register(() => Promise.resolve(result))(payload);
    expect(r.isError).toBeFalsy();
    expect(r.content.length).toBeGreaterThan(1);
    expect(noticeOf(r)).toBeUndefined();
  });

  it('caps and quotes an over-long agent name', () => {
    const [notice] = analysisRejectionNotice(saveResult([{ ...REJECTED_A, agentName: 'x'.repeat(500) }]));
    expect(notice).toContain(`"${'x'.repeat(100)}"`);
    expect(notice).not.toContain('x'.repeat(101));
  });

  it('never throws on an unexpected result shape', () => {
    for (const odd of [null, 42, 'x', {}, { analysisWrite: { rejected: 'nope' } }, { analysisWrite: { rejected: [null, 3] } }]) {
      expect(() => analysisRejectionNotice(odd)).not.toThrow();
    }
  });
});

describe('responseNotices containment', () => {
  it('a throwing notice is logged, and the landed write is still reported as success', async () => {
    const stderr = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    const handler = createToolHandler(z.object({}), () => Promise.resolve({ ok: true }), {
      toolName: 'probe',
      responseNotices: () => { throw new Error('notice broke'); },
    });
    const r = await handler({});
    expect(r.isError).toBeFalsy();
    expect(stderr.mock.calls.some(c => String(c[0]).includes('[mcp-tool-notice-error] tool=probe'))).toBe(true);
    stderr.mockRestore();
  });
});

describe('validate_run wouldReject notice (R3 review F4, S4)', () => {
  const WOULD = { wouldCreate: 0, wouldUpdate: 0, wouldRegress: 0, validationErrors: [], wouldReject: [REJECTED_A] };
  function registerValidate(impl: () => Promise<unknown>): { handler: Handler; call: ReturnType<typeof vi.fn> } {
    let handler: Handler | undefined;
    const server: McpServerToolRegistration = {
      tool(_n: string, _d: string, _s: unknown, ...rest: unknown[]): void { handler = rest[rest.length - 1] as Handler; },
    };
    const call = vi.fn(impl);
    registerValidateRunTool(server, { runs: { validate: call } } as unknown as OpsClient);
    if (handler === undefined) throw new Error('tool did not register a handler');
    return { handler, call };
  }

  it('names the agents a save would reject, and passes wouldReject through unchanged in the JSON', async () => {
    const { handler } = registerValidate(() => Promise.resolve(WOULD));
    const r = await handler(payload);
    expect(r.isError).toBeFalsy();
    expect((JSON.parse(r.content[0]?.text ?? '{}') as { wouldReject?: unknown }).wouldReject).toEqual([REJECTED_A]);
    const notice = r.content.find(c => c.text.includes('would reject the analysis of'))?.text;
    expect(notice).toContain(`${NOTICE_SOURCE} A save_run of this payload would reject the analysis of: "agent-a"`);
    expect(notice).toContain('Nothing has been saved.');
  });

  it('no notice when nothing would be rejected', async () => {
    const { handler } = registerValidate(() => Promise.resolve({ ...WOULD, wouldReject: [] }));
    const r = await handler(payload);
    expect(r.isError).toBeFalsy();
    expect(r.content.some(c => c.text.includes('would reject the analysis of'))).toBe(false);
    expect(wouldRejectNotice({})).toEqual([]);
  });

  it('20 summaries reach the SDK; 21 are refused by name before any call', async () => {
    const { handler, call } = registerValidate(() => Promise.resolve(WOULD));
    const ok = await handler({ ...payload, analysis_summary: Array.from({ length: 20 }, () => ({ agent_name: 'agent-a', decision: 'PASS' })) });
    expect(ok.isError).toBeFalsy();
    expect(call).toHaveBeenCalledTimes(1);
    const refused = await handler({ ...payload, analysis_summary: Array.from({ length: 21 }, () => ({ agent_name: 'agent-a', decision: 'PASS' })) });
    expect(refused.isError).toBe(true);
    expect(call).toHaveBeenCalledTimes(1);
  });
});

describe('unattributed analysis entries on a multi-agent run (R3 review F5)', () => {
  const multi = { agents: [{ name: 'a' }, { name: 'b' }] };
  it('warns, never refuses, for blank and absent names; tense follows the moment', () => {
    const [saved] = analysisNameWarnings({ ...multi, analysis_records: [{ agent_name: '' }, { agent_name: '  ' }, {}], analysis_summary: [{ agent_name: 'a' }, {}] }, 'saved');
    expect(saved).toMatch(/^3 analysis records and 1 summary on this multi-agent run have no agent_name/);
    expect(saved).toContain('do not re-save the run');
    const [preview] = analysisNameWarnings({ ...multi, analysis_records: [{}] }, 'preview');
    expect(preview).toContain('Set agent_name on each before calling save_run.');
  });

  it('nothing on a single-agent run, and nothing when every entry is named', () => {
    expect(analysisNameWarnings({ agents: [{ name: 'a' }], analysis_records: [{}] }, 'saved')).toEqual([]);
    expect(analysisNameWarnings({ ...multi, analysis_records: [{ agent_name: 'a' }], analysis_summary: { agent_name: 'b' } }, 'saved')).toEqual([]);
  });

  it('reaches the save_run response as a warnings block, and the save still goes through', async () => {
    const r = await register(() => Promise.resolve(saveResult(undefined)))({ ...payload, analysis_records: [{ agent_name: '', record_type: 'finding', record_id: 'x', title: 't', data: {} }] });
    expect(r.isError).toBeFalsy();
    expect(r.content.some(c => c.text.includes('on this multi-agent run has no agent_name'))).toBe(true);
  });
});
