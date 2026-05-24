/**
 * get_agent_lifecycle tool
 *
 * Get version lifecycle trajectory for an agent definition.
 * Shows performance metrics per version epoch, ordered chronologically.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

const GetAgentLifecycleInputSchema = z.object({
  name: z.string().min(1).describe('Agent name (e.g., code-validator, nagarjuna-analyst)'),
  project: z.string().optional().describe('Filter to specific project'),
  days: z.number().int().min(1).max(365).optional().describe('Time window in days (default: all)'),
});

export function registerGetAgentLifecycleTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient,
): void {
  server.tool(
    'get_agent_lifecycle',
    'Get version lifecycle trajectory for an agent. Shows performance per definition version, ordered chronologically.',
    GetAgentLifecycleInputSchema.shape,
    createToolHandler(
      GetAgentLifecycleInputSchema,
      (input) => opsClient.analytics.getAgentLifecycle(input.name as string, {
        project: input.project as string | undefined,
        days: input.days as number | undefined,
      }),
      { toolName: 'get_agent_lifecycle' },
    ),
  );
}
