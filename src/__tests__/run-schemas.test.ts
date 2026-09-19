import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import { registerSaveRunTool } from '../tools/save-run.js';
import { registerValidateRunTool } from '../tools/validate-run.js';
import { registerUpdateRunTool } from '../tools/update-run.js';
import { registerPreviewUpdateRunTool } from '../tools/preview-update-run.js';

import { describe, it, expect, vi } from 'vitest';
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

// The full contracts must retain agent_type before createToolHandler normalizes keys.
describe('F02 explicit analysis types', () => {
  it.each([
    ['save_run', SaveRunInputSchema, { project: 'p', workflow_type: 'w', agents: [{ name: 'a', decision: 'PASS' }] }],
    ['validate_run', ValidateRunInputSchema, { project: 'p', workflow_type: 'w', agents: [{ name: 'a', decision: 'PASS' }], recommendations: [] }],
    ['update_run', UpdateRunInputSchema, { project: 'p', run_number: 1 }],
  ])('%s retains distinct record and summary types', (_name, schema, envelope) => {
    const analysis_records = [{ agent_name: 'map', agent_type: 'explorer', record_type: 'custom_topology', record_id: 'map', title: 'Map', data: {} }];
    const analysis_summary = [{ agent_name: 'check', agent_type: 'validator', decision: 'PASS' }];
    expect(schema.parse({ ...envelope, analysis_records, analysis_summary })).toMatchObject({ analysis_records, analysis_summary });
  });
  it('rejects unsupported declarations', () => {
    expect(AnalysisRecordBaseSchema.safeParse({ agent_type: 'guess', record_type: 'map', record_id: 'map', title: 'Map', data: {} }).success).toBe(false);
  });
});

describe.each([
  ['save_run', registerSaveRunTool, true],
  ['validate_run', registerValidateRunTool, true],
  ['update_run', registerUpdateRunTool, false],
  ['preview_update_run', registerPreviewUpdateRunTool, false],
] as const)('%s authoring contract', (name, register, hasTokens) => {
  function contract(): { description: string; schema: z.ZodObject<z.ZodRawShape> } {
    const tool = vi.fn();
    register({ tool }, {} as OpsClient);
    const [registeredName, description, shape] = tool.mock.calls[0] as [string, string, z.ZodRawShape];
    expect(registeredName).toBe(name);
    return { description, schema: z.object(shape) };
  }

  it('publishes a complete map example that survives the registered schema', () => {
    const { description, schema } = contract();
    const summary = JSON.parse(description.split('Example summary: ')[1]?.split('. On multi-agent')[0] ?? '');
    const input = {
      project: 'contract-fixture', run_number: 1, workflow_type: 'exploration',
      agents: [{ name: 'explorer', decision: 'TRACED' }], analysis_summary: summary,
    };
    expect(schema.parse(input).analysis_summary).toEqual(summary);
    expect(schema.parse({ ...input, analysis_summary: [summary] }).analysis_summary).toEqual([summary]);
    expect(description).toContain('metadata.explorer_name');
    expect(description).toContain('metadata.framework');
    expect(description).toContain('Every section requires label and type');
  });

  it('still rejects incomplete metadata instead of weakening the schema', () => {
    const { schema } = contract();
    expect(schema.safeParse({
      project: 'contract-fixture', workflow_type: 'exploration', agents: [],
      analysis_summary: { decision: 'TRACED', exploration_maps: [{ metadata: {}, sections: [] }] },
    }).success).toBe(false);
  });

  it.each([false, true])('keeps metadata paths in the top-level issue message (array: %s)', array => {
    const { schema } = contract();
    const summary = { decision: 'TRACED', exploration_maps: [{ metadata: {}, sections: [] }] };
    const result = schema.safeParse({
      project: 'contract-fixture', workflow_type: 'exploration', agents: [],
      analysis_summary: array ? [summary] : summary,
    });
    expect(result.success).toBe(false);
    if (result.success) throw new Error('Invalid metadata unexpectedly accepted');
    const message = result.error.issues.map(issue => issue.message).join('; ');
    const path = `analysis_summary.${array ? '0.' : ''}exploration_maps.0.metadata`;
    expect(message).toContain(`${path}.explorer_name:`);
    expect(message).toContain(`${path}.framework:`);
    expect(message).not.toContain('Expected array');
  });

  it('documents nested tokens only on tools that accept that shape', () => {
    const { description, schema } = contract();
    if (!hasTokens) {
      expect(description).not.toContain('agents[].tokens');
      return;
    }
    const tokens = JSON.parse(description.split('Example: "tokens":')[1]?.split('. Omit tokens')[0] ?? '');
    const input = {
      project: 'contract-fixture', workflow_type: 'exploration',
      agents: [{ name: 'explorer', decision: 'TRACED', tokens }],
    };
    expect(schema.parse(input).agents).toEqual(input.agents);
    expect(schema.safeParse({ ...input, agents: [{ ...input.agents[0], tokens: { input_tokens: 120 } }] }).success).toBe(false);
    expect(schema.safeParse({ ...input, agents: [{ ...input.agents[0], tokens: { input_tokens: -1, output_tokens: 0 } }] }).success).toBe(false);
  });
});
