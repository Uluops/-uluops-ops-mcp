/**
 * Get Agent Matrix Tool
 *
 * Retrieves agent-taxonomy matrix showing which agents detect which failure domains.
 * Includes coverage analysis, blind spots, single points of failure, and high overlap detection.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const GetAgentMatrixInputSchema = z.object({
  project: z.string().min(1).optional().describe('Project name or UUID to filter by'),
  days: z
    .number()
    .int()
    .min(1)
    .max(365)
    .optional()
    .describe('Time window in days (1-365, default 90)'),
  minIssues: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .describe('Minimum total qualifying issues per agent across domains (default 5). Single-point and overlap analysis use canonical modes before this threshold; eligibility metadata explains excluded matrix rows.'),
});

export function registerGetAgentMatrixTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'get_agent_matrix',
    'Get agent-taxonomy matrix showing coverage analysis. Identifies blind spots (missing domains), single points of failure (only one agent detects a mode), and high overlap (3+ agents detect same mode).',
    GetAgentMatrixInputSchema.shape,
    createToolHandler(GetAgentMatrixInputSchema, (n, scope) => opsClient.analytics.getAgentMatrix(n, scope), { toolName: 'get_agent_matrix' })
  );
}
