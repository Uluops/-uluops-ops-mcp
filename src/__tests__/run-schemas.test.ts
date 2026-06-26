import { describe, it, expect } from 'vitest';
import { ANALYSIS_RECORD_ID_MAX_LENGTH } from '@uluops/ops-sdk';
import { AnalysisRecordBaseSchema } from '../types/run-schemas.js';

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
