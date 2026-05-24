/**
 * get_full_taxonomy_analytics tool
 *
 * Get full taxonomy analytics with distribution data.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const GetFullTaxonomyAnalyticsInputSchema = z.object({
  project: z.string().optional().describe('Filter by project name or UUID'),
  days: z.number().int().min(1).max(365).optional().describe('Number of days to include (1-365)'),
  limit: z.number().int().min(1).max(100).optional().describe('Results limit'),
});

export type GetFullTaxonomyAnalyticsInput = z.infer<typeof GetFullTaxonomyAnalyticsInputSchema>;

/**
 * Register get_full_taxonomy_analytics tool
 */
export function registerGetFullTaxonomyAnalyticsTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'get_full_taxonomy_analytics',
    'Get full taxonomy analytics with distribution by domain, severity, mode, and agent.',
    GetFullTaxonomyAnalyticsInputSchema.shape,
    createToolHandler(GetFullTaxonomyAnalyticsInputSchema, (n) =>
      opsClient.analytics.getFullTaxonomy(n),
      { toolName: 'get_full_taxonomy_analytics' }
    )
  );
}
