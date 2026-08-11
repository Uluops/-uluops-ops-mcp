import { describe, it, expect } from 'vitest';
import { ANALYSIS_RECORD_ID_MAX_LENGTH } from '@uluops/ops-sdk';
import { AnalysisRecordBaseSchema } from '../types/run-schemas.js';
import { SaveRunInputSchema } from '../tools/save-run.js';
import { ValidateRunInputSchema } from '../tools/validate-run.js';
import { UpdateRunInputSchema } from '../tools/update-run.js';

/**
 * Locks the MCP record_id input contract to the SDK-sourced cap (currently 100).
 * Guards against re-hardcoding the old 20-char cap or dropping the SDK import.
 */
describe('AnalysisRecordBaseSchema.record_id length', () => {
  const base = {
    record_type: 'four_cause',
    title: 'Long semantic id',
    data: { material: 'TypeScript' },
  };

  it('tracks the SDK cap of 100 characters', () => {
    expect(ANALYSIS_RECORD_ID_MAX_LENGTH).toBe(100);
  });

  it('accepts a 100-char record_id and a realistic namespaced id', () => {
    expect(
      AnalysisRecordBaseSchema.safeParse({
        ...base,
        record_id: 'a'.repeat(ANALYSIS_RECORD_ID_MAX_LENGTH),
      }).success,
    ).toBe(true);
    expect(
      AnalysisRecordBaseSchema.safeParse({
        ...base,
        record_id: 'foundations-api-aristotle-20260626',
      }).success,
    ).toBe(true);
  });

  it('rejects a 101-char record_id', () => {
    expect(
      AnalysisRecordBaseSchema.safeParse({
        ...base,
        record_id: 'a'.repeat(ANALYSIS_RECORD_ID_MAX_LENGTH + 1),
      }).success,
    ).toBe(false);
  });
});

/**
 * `agent_name` is the only way a caller can attribute an analysis record to the agent that
 * produced it. It used to live in a per-tool `.extend()` on update_run alone — the base
 * schema's own docstring said "extend with agent_name for per-agent updates" — which
 * encoded the assumption that attribution matters when revising a run but not when
 * creating one. It matters more at creation: that is when a multi-agent run's records are
 * first written.
 *
 * A tool schema is the wire contract: `createToolHandler` forwards `schema.parse(args)` and
 * `z.object()` strips undeclared keys, so a field the schema omits is one an orchestrator
 * cannot send — silently. The tracker then falls back to
 * `definitionName ?? agents[0].name ?? 'unknown'` and infers `agent_type` from that string.
 *
 * Observed on tracker run #4 (2026-08-09): 18 records from anxiety-reader and 14 from
 * operators-eye all stored under a definition name, every one typed `validator`.
 */
describe('agent_name attribution on analysis records', () => {
  const record = {
    agent_name: 'anxiety-reader',
    record_type: 'fear',
    record_id: 'F1',
    title: 'Non-string recordType becomes a storable fabricated type',
    data: { register: 'tactical' },
  };

  it('retains agent_name through the base schema', () => {
    const r = AnalysisRecordBaseSchema.safeParse(record);
    expect(r.success).toBe(true);
    expect(r.success && r.data.agent_name).toBe('anxiety-reader');
  });

  it.each([
    ['save_run', SaveRunInputSchema, { project: 'p', workflow_type: 'w', agents: [{ name: 'a', decision: 'PASS' }] }],
    ['validate_run', ValidateRunInputSchema, { project: 'p', workflow_type: 'w', agents: [{ name: 'a', decision: 'PASS' }], recommendations: [] }],
    ['update_run', UpdateRunInputSchema, { project: 'p', run_number: 1 }],
  ])('%s carries agent_name through its full tool input contract', (_name, schema, envelope) => {
    // Parsing the FULL tool input, not the record schema alone — the strip that caused the
    // defect happened on the whole args object, so that is the level the guarantee holds at.
    const parsed = schema.safeParse({ ...envelope, analysis_records: [record] });
    expect(parsed.success).toBe(true);
    const records = parsed.success
      ? (parsed.data as { analysis_records?: unknown[] }).analysis_records
      : undefined;
    expect(records?.[0]).toMatchObject({ agent_name: 'anxiety-reader' });
  });

  it('leaves agent_name absent rather than inventing one', () => {
    // Absent must stay absent — the tracker's run-level fallback is correct for a
    // single-agent run, and guessing here would pre-empt it at the wrong layer.
    const withoutAgent: Record<string, unknown> = { ...record };
    delete withoutAgent.agent_name;
    const r = AnalysisRecordBaseSchema.safeParse(withoutAgent);
    expect(r.success).toBe(true);
    expect(r.success && 'agent_name' in r.data).toBe(false);
  });

  it.each([['empty string', ''], ['whitespace only', '   ']])(
    'rejects a blank agent_name (%s)',
    (_label, value) => {
      // Neither is nullish, so the tracker's `?? defaultAgentName` fallback does not fire —
      // a blank name reaches a column its own read schema requires to be non-empty.
      expect(AnalysisRecordBaseSchema.safeParse({ ...record, agent_name: value }).success).toBe(false);
    },
  );

  it('trims surrounding whitespace rather than storing it', () => {
    const r = AnalysisRecordBaseSchema.safeParse({ ...record, agent_name: '  anxiety-reader  ' });
    expect(r.success && r.data.agent_name).toBe('anxiety-reader');
  });

  it('bounds agent_name at 100 to match the column', () => {
    expect(AnalysisRecordBaseSchema.safeParse({ ...record, agent_name: 'a'.repeat(100) }).success).toBe(true);
    expect(AnalysisRecordBaseSchema.safeParse({ ...record, agent_name: 'a'.repeat(101) }).success).toBe(false);
  });
});
