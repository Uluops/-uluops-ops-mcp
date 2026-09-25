import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import { registerGetAnalyticsTool } from '../tools/get-analytics.js';

describe('pricing contract transport', () => {
  it('advertises and forwards explicit coverage and estimate choices in the selected org', async () => {
    const tool = vi.fn();
    const getByMetric = vi.fn().mockResolvedValue({ pricingContract: 'coverage-v1', pricedCost: null });
    registerGetAnalyticsTool({ tool }, { analytics: { getByMetric } } as unknown as OpsClient);
    const [, , shape, handler] = tool.mock.calls[0];
    const payload = { metric: 'cost_analysis', pricing_contract: 'coverage-v1', estimate_model: 'sonnet', org: 'ulu-labs' };
    expect(z.object(shape).parse(payload)).toMatchObject({ metric: 'cost_analysis', pricing_contract: 'coverage-v1', estimate_model: 'sonnet' });
    const result = await handler(payload);
    expect(getByMetric).toHaveBeenCalledWith('cost_analysis', expect.objectContaining({
      pricingContract: 'coverage-v1', estimateModel: 'sonnet',
    }), expect.objectContaining({ org: 'ulu-labs' }));
    expect(JSON.parse(result.content[0].text)).toMatchObject({ pricedCost: null });
    expect(z.object(shape).safeParse({ metric: 'cost_analysis', pricing_contract: 'coverage-v2' }).success).toBe(false);
  });
});
