import { describe, it, expect, vi } from 'vitest';
import type { OpsClient } from '@uluops/ops-sdk';
import { registerGetAnalyticsTool, GetAnalyticsInputSchema } from '../tools/get-analytics.js';

function setup(): { tool: ReturnType<typeof vi.fn>; getByMetric: ReturnType<typeof vi.fn>; handler: (args: unknown) => Promise<{ content: Array<{ text: string }>; isError?: boolean }> } {
  const tool = vi.fn();
  const getByMetric = vi.fn().mockResolvedValue({ data: [], total: 0, limit: 50, offset: 0, hasMore: false, implemented: false, reason: 'Not implemented', future: true });
  registerGetAnalyticsTool({ tool }, { analytics: { getByMetric } } as unknown as OpsClient);
  return { tool, getByMetric, handler: tool.mock.calls[0][3] };
}

describe('analytics page adapter', () => {
  it('retains legacy defaults', async () => {
    const { handler, getByMetric } = setup();
    await handler({ metric: 'file_hotspots' });
    expect(getByMetric).toHaveBeenCalledWith('file_hotspots', { metric: 'file_hotspots', days: 30, limit: 20 }, { withResponseContext: true });
  });
  it('preserves numeric-string coercion', async () => {
    const { handler, getByMetric } = setup();
    await handler({ metric: 'file_hotspots', format: 'page', limit: '2', offset: '3' });
    expect(getByMetric).toHaveBeenCalledWith('file_hotspots', expect.objectContaining({ limit: 2, offset: 3 }), expect.anything());
  });
  it('uses page defaults and preserves placeholder metadata', async () => {
    const { handler, getByMetric } = setup();
    const result = await handler({ metric: 'cross_project_patterns', format: 'page' });
    expect(getByMetric).toHaveBeenCalledWith('cross_project_patterns', { metric: 'cross_project_patterns', format: 'page', days: 30, limit: 50, offset: 0 }, { withResponseContext: true });
    expect(JSON.parse(result.content[0].text)).toMatchObject({ implemented: false, reason: 'Not implemented', future: true });
  });
  it('forwards explicit page controls and scope', async () => {
    const { handler, getByMetric } = setup();
    await handler({ metric: 'file_hotspots', format: 'page', project: 'p', limit: 1, offset: 100, org: 'acme' });
    expect(getByMetric).toHaveBeenCalledWith('file_hotspots', { metric: 'file_hotspots', format: 'page', project: 'p', days: 30, limit: 1, offset: 100 }, { org: 'acme', withResponseContext: true });
  });
  for (const input of [
    { metric: 'cost_analysis', format: 'page' }, { metric: 'regression_analysis', format: 'page' },
    { metric: 'file_hotspots', offset: 0 }, { metric: 'file_hotspots', format: 'page', limit: 101 },
    { metric: 'file_hotspots', format: 'page', offset: -1 },
  ]) it(`rejects unsupported input ${JSON.stringify(input)} before SDK`, async () => {
    const { handler, getByMetric } = setup();
    expect(GetAnalyticsInputSchema.safeParse(input).success).toBe(false);
    expect(await handler(input)).toMatchObject({ isError: true });
    expect(getByMetric).not.toHaveBeenCalled();
  });
  it('keeps page bounds out of legacy limit behavior', () => {
    expect(GetAnalyticsInputSchema.safeParse({ metric: 'file_hotspots', limit: 101 }).success).toBe(true);
  });
  it('exposes page controls in the registered schema', () => {
    const { tool } = setup();
    expect(Object.keys(tool.mock.calls[0][2])).toEqual(expect.arrayContaining(['format', 'limit', 'offset']));
  });
});
