/**
 * Get Burndown Tool
 *
 * Retrieves taxonomy burndown data with time series and trend analysis
 * for tracking issue resolution progress across failure domains.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const GetBurndownInputSchema = z.object({
  project: z.string().min(1).optional().describe('Project name or UUID to filter by'),
  days: z
    .number()
    .int()
    .min(1)
    .max(365)
    .optional()
    .describe('Time window in days (1-365, default 30)'),
  granularity: z
    .enum(['daily', 'weekly'])
    .optional()
    .describe("Time granularity: 'daily' (default) or 'weekly' (final available stock snapshot per UTC ISO week; never a sum)"),
});

export function registerGetBurndownTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'get_burndown',
    'Get taxonomy burndown with time series and trend analysis per failure domain (STR, SEM, PRA, EPI). Includes UTC interval, as-of time and partial-bucket boundaries. Trends and statistical diagnostics always use daily samples (issues/day).',
    GetBurndownInputSchema.shape,
    createToolHandler(GetBurndownInputSchema, (n, scope) => opsClient.analytics.getBurndown(n, scope), { toolName: 'get_burndown' })
  );
}
