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
    'Get cross-project analytics. Metrics: agent_performance, resolution_rates, cross_project_patterns, file_hotspots, regression_analysis, trend_summary, cost_analysis, taxonomy_distribution. Note: cross_project_patterns currently returns [] — pattern aggregation across projects is on the roadmap but not yet implemented. The empty response is not "no patterns in your data"; it is the metric placeholder.',
    GetAnalyticsInputSchema.shape,
    createToolHandler(GetAnalyticsInputSchema, (n) =>
      opsClient.analytics.getByMetric(n['metric'], n),
      { toolName: 'get_analytics' }
    )
  );
}
