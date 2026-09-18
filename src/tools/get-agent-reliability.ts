/**
 * get_agent_reliability tool
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const GetAgentReliabilityInputSchema = z.object({
  agent: z.string().optional(),
  project: z.string().optional(),
  days: z.number().int().positive().default(90),
});

export type GetAgentReliabilityInput = z.infer<typeof GetAgentReliabilityInputSchema>;

export function registerGetAgentReliabilityTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'get_agent_reliability',
    'Analyze agent effectiveness. Returns per agent: falsePositiveRate (false-positive share only), declinedRate (wontfix share — a judgment not to act, never scored), resolutionRate, avgTimeToResolveDays and reliabilityScore.',
    GetAgentReliabilityInputSchema.shape,
    createToolHandler(GetAgentReliabilityInputSchema, (n, scope) =>
      opsClient.analytics.getAgentReliability(n, scope),
      { toolName: 'get_agent_reliability' }
    )
  );
}
