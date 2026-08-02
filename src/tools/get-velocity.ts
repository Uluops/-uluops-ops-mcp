/**
 * Get Velocity Tool
 *
 * Retrieves velocity metrics per failure mode showing rate of change
 * in issue counts with sparkline data for visualization.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const GetVelocityInputSchema = z.object({
  project: z.string().min(1).optional().describe('Project name or UUID to filter by'),
  days: z
    .number()
    .int()
    .min(1)
    .max(365)
    .optional()
    .describe('Time window in days (1-365, default 30)'),
  alertThreshold: z
    .number()
    .min(0)
    .max(1000)
    .optional()
    .describe('Velocity threshold (%) for alerts (default 50)'),
});

export function registerGetVelocityTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'get_velocity',
    'Get velocity metrics per failure mode (e.g., STR-OMI, PRA-FRA) showing rate of change with sparkline data and trend reliability assessment.',
    GetVelocityInputSchema.shape,
    createToolHandler(GetVelocityInputSchema, (n) => opsClient.analytics.getVelocity(n), { toolName: 'get_velocity' })
  );
}
