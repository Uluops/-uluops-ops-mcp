/**
 * Get Discovery Tool
 *
 * Retrieves discovery timeline showing new vs recurring issues over time.
 * Helps track whether runs are finding new problems or re-detecting existing ones (fingerprint recurrence).
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const GetDiscoveryInputSchema = z.object({
  project: z.string().min(1).optional().describe('Project name or UUID to filter by'),
  days: z
    .number()
    .int()
    .min(1)
    .max(365)
    .optional()
    .describe('Time window in days (1-365, default 30)'),
  groupBy: z
    .enum(['day', 'week', 'month'])
    .optional()
    .describe("Time grouping: 'day' (default), 'week', or 'month'"),
});

export function registerGetDiscoveryTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'get_discovery',
    'Get discovery timeline from immutable occurrence classifications. Recurring includes regressions; additive regression, observed and unknown counters distinguish captured facts from legacy uncertainty.',
    GetDiscoveryInputSchema.shape,
    createToolHandler(GetDiscoveryInputSchema, (n, scope) => opsClient.analytics.getDiscovery(n, scope), { toolName: 'get_discovery' })
  );
}
