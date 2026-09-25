/**
 * get_analytics tool
 *
 * Get cross-project analytics and metrics.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const GetAnalyticsInputSchema = z.object({
  metric: z.enum([
    'agent_performance',
    'resolution_rates',
    'cross_project_patterns',
    'file_hotspots',
    'regression_analysis',
    'trend_summary',
    'cost_analysis',
    'taxonomy_distribution',
  ]),
  project: z.string().optional(),
  days: z.number().int().positive().default(30),
  limit: z.number().int().positive().default(20),
  pricing_contract: z.literal('coverage-v1').optional().describe('Opt-in pricing coverage for cost_analysis. Omission retains legacy estimates, including Sonnet fallback for unknown models.'),
  estimate_model: z.enum(['haiku', 'sonnet', 'opus']).optional().describe('Explicit estimate for unpriced snapshots only; requires pricing_contract=coverage-v1. Excluded from pricedCost.'),
});

export type GetAnalyticsInput = z.infer<typeof GetAnalyticsInputSchema>;

/**
 * Register get_analytics tool
 */
export function registerGetAnalyticsTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'get_analytics',
    'Get cross-project analytics. Agent performance scoreThresholdPassRate (legacy alias passRate) is a raw-score threshold percentage, not a gate rate; use its denominator, threshold and scale metadata. Metrics: agent_performance, resolution_rates, cross_project_patterns, file_hotspots, regression_analysis, trend_summary, cost_analysis, taxonomy_distribution. All list metrics return the {data, total} envelope (taxonomy_distribution joined it at API 2.0.0); cost_analysis keeps its object shape. Select pricing_contract=coverage-v1 for priced/unpriced coverage and nullable pricedCost; optional estimate_model estimates only unpriced snapshots separately. Omitted pricing_contract retains legacy Sonnet fallback. Rates are the disclosed configured table, not billing records. Note: cross_project_patterns currently returns [] — pattern aggregation across projects is on the roadmap but not yet implemented. The empty response is not "no patterns in your data"; it is the metric placeholder.',
    GetAnalyticsInputSchema.shape,
    createToolHandler(GetAnalyticsInputSchema, (n, scope) =>
      opsClient.analytics.getByMetric(n['metric'], n, scope),
      { toolName: 'get_analytics' }
    )
  );
}
