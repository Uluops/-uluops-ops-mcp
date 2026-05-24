/**
 * Get Discovery Tool
 *
 * Retrieves discovery timeline showing new vs recurring issues over time.
 * Helps track whether validation is finding new problems or re-detecting existing ones.
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
    'Get discovery timeline showing new vs recurring issues over time. Helps track whether validation is finding new problems or re-detecting existing ones.',
    GetDiscoveryInputSchema.shape,
    createToolHandler(GetDiscoveryInputSchema, (n) => opsClient.analytics.getDiscovery(n), { toolName: 'get_discovery' })
  );
}
