/**
 * save_run / validate_run are no stricter than the server's save path
 * (ops-uluops-api analysis-never-loses-the-run spec v0.2.3 §3.5, OQ-6 "keep";
 * Alex's ruling 2026-11-03: loosen to match the server, no exceptions).
 *
 * The fixture is DERIVED, not hand-written: candidate entries (every boundary the
 * two sides were known to bound differently, plus each enum value and section type)
 * were run through the server's own `SaveRunSchema` + `toSaveRunInput`, and only the
 * entries the server accepted were kept. Its `derivedFrom` names the ops-api commit.
 * Regenerate it with scripts/derive-server-accepted-entries.ts (instructions in its header)
 * when the server's save schemas change; never hand-edit it.
 *
 * Negative controls:
 *   - on 0.34.1 (25b3120) three entries fail: an empty and a whitespace-only
 *     agent_name (records, and the single-object summary) and an empty record_id;
 *   - in-file: a deliberately tightened copy of the schema refuses a fixture entry,
 *     so the loop below can fail at all.
 */
import { describe, it, expect } from 'vitest';
import { z } from 'zod';
import fixture from './fixtures/server-accepted-analysis-entries.json' with { type: 'json' };
import { SaveRunInputSchema } from '../tools/save-run.js';
import { ValidateRunInputSchema } from '../tools/validate-run.js';
import { SaveAnalysisRecordSchema } from '../types/run-schemas.js';

type Entry = { label: string; entry: Record<string, unknown> };
const records = fixture.records as Entry[];
const summaries = fixture.summaries as Entry[];
const base = { project: 'p', workflow_type: 'post-implementation', agents: [{ name: 'agent-a', decision: 'PASS' }] };

describe('the derived fixture is the instrument', () => {
  it('names its source and covers both arrays', () => {
    expect(fixture.derivedFrom).toMatch(/^ops-uluops-api [0-9a-f]{7,} SaveRunSchema \+ toSaveRunInput/);
    expect(records.length).toBeGreaterThan(20);
    expect(summaries.length).toBeGreaterThan(20);
    // The derivation could refuse: the server rejected these candidates, so they are absent.
    expect(fixture.serverRejects).toEqual(expect.arrayContaining(['record: agent_name 101 chars', 'summary: category_scores fractional score']));
  });
});

describe.each([
  ['save_run', SaveRunInputSchema],
  ['validate_run', ValidateRunInputSchema],
] as const)('%s accepts every entry the server save path accepts', (_tool, schema) => {
  it.each(records.map(r => [r.label, r.entry] as const))('record: %s', (_label, entry) => {
    const r = schema.safeParse({ ...base, analysis_records: [entry] });
    expect(r.success, r.success ? '' : JSON.stringify(r.error.issues)).toBe(true);
  });

  it.each(summaries.map(s => [s.label, s.entry] as const))('summary (array and single object): %s', (_label, entry) => {
    for (const form of [[entry], entry]) {
      const r = schema.safeParse({ ...base, analysis_summary: form });
      expect(r.success, r.success ? '' : JSON.stringify(r.error.issues)).toBe(true);
    }
  });
});

describe('control: the check can fail', () => {
  it('a tightened record_id (min 1, the pre-ruling rule) refuses a server-accepted entry', () => {
    const tightened = SaveAnalysisRecordSchema.extend({ record_id: z.string().min(1).max(100) });
    const refused = records.filter(r => !tightened.safeParse(r.entry).success).map(r => r.label);
    expect(refused).toEqual(['record_id empty']);
  });
});
