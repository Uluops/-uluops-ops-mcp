/**
 * get_analytics tool
 *
 * Get cross-project analytics and metrics.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';
import { UNVERSIONED_FIGURES_CAVEAT } from './cross-version-caveat.js';

const GetAnalyticsInputObject = z.object({
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
  limit: z.number().int().positive().optional(),
  format: z.literal('page').optional().describe('Opt in to a negotiated list page; object metrics reject this selector.'),
  offset: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER).optional(),
  pricing_contract: z.literal('coverage-v1').optional().describe('Opt-in pricing coverage for cost_analysis. Omission retains legacy estimates, including Sonnet fallback for unknown models.'),
  estimate_model: z.enum(['haiku', 'sonnet', 'opus']).optional().describe('Explicit estimate for unpriced snapshots only; requires pricing_contract=coverage-v1. Excluded from pricedCost.'),
});

export const GetAnalyticsInputSchema = GetAnalyticsInputObject.superRefine((value, context) => {
  if (value.format === 'page') {
    if (value.metric === 'cost_analysis' || value.metric === 'regression_analysis') context.addIssue({ code: 'custom', path: ['format'], message: 'format=page requires a list metric' });
    if (value.limit !== undefined && value.limit > 100) context.addIssue({ code: 'custom', path: ['limit'], message: 'Page limit cannot exceed 100' });
  } else if (value.offset !== undefined) {
    context.addIssue({ code: 'custom', path: ['offset'], message: 'offset requires format=page' });
  }
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
    'Get cross-project analytics. Agent performance scoreThresholdPassRate (legacy alias passRate) is a raw-score threshold percentage, not a gate rate; use its denominator, threshold and scale metadata. Metrics: agent_performance, resolution_rates, cross_project_patterns, file_hotspots, regression_analysis, trend_summary, cost_analysis, taxonomy_distribution. Legacy agent_performance and taxonomy_distribution return {data,total}; resolution_rates, file_hotspots, trend_summary and cross_project_patterns return arrays. regression_analysis and cost_analysis retain domain objects. List metrics accept format=page for {data,total,limit,offset,hasMore,implemented,reason?}; default limit50/offset0, maximum100, authorized filtered totals and stable ordering. Legacy limit defaults to20. Unsupported servers return an unsupported-contract error. Select pricing_contract=coverage-v1 for priced/unpriced coverage and nullable pricedCost; optional estimate_model estimates only unpriced snapshots separately. Omitted pricing_contract retains legacy Sonnet fallback. Rates are the disclosed configured table, not billing records. Note: cross_project_patterns currently returns [] — pattern aggregation across projects is on the roadmap but not yet implemented. The empty response is not "no patterns in your data"; it is the metric placeholder. Its opted-in page reports implemented=false and a reason.' + ' ' + UNVERSIONED_FIGURES_CAVEAT,
    GetAnalyticsInputObject.shape,
    createToolHandler(GetAnalyticsInputObject, (n, scope) => {
      GetAnalyticsInputSchema.parse(n);
      return opsClient.analytics.getByMetric(n['metric'], { ...n, limit: n['limit'] ?? (n['format'] === 'page' ? 50 : 20), ...(n['format'] === 'page' && { offset: n['offset'] ?? 0 }) }, scope);
    },
      { toolName: 'get_analytics', responseNote: UNVERSIONED_FIGURES_CAVEAT }
    )
  );
}
