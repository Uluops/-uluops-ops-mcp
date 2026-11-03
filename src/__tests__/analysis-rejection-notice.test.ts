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
import { analysisRejectionNotice } from '../tools/analysis-rejection-notice.js';
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
    expect(notice).toMatch(/^Run #7 is saved\./);
    expect(notice).toContain('"agent-a" (entry_invalid, 1 issue; 2 records and 1 summary not stored)');
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
    expect(notice).toContain('3 more agents not itemized (9 records, 3 summaries)');
  });

  it('a nameless unit and an unseen reason still produce a notice', () => {
    const [notice] = analysisRejectionNotice(saveResult([{ agentName: null, reason: 'added_later', recordsRejected: 1, summariesRejected: 0, detail: {} }]));
    expect(notice).toContain('(an entry that is its own unit) (added_later; 1 record and 0 summaries not stored)');
  });

  it('a deduplicated replay carrying the rebuilt rejected[] gets the notice too', async () => {
    const r = await register(() => Promise.resolve(saveResult([REJECTED_A], { deduplicated: true })))(payload);
    expect(r.isError).toBeFalsy();
    expect(noticeOf(r)).toMatch(/^Run #7 is saved\./);
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
