/**
 * list_agents tool
 *
 * List canonical agents accepted by save_run.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

// No input required for this tool
export const ListAgentsInputSchema = z.object({});

export type ListAgentsInput = z.infer<typeof ListAgentsInputSchema>;

/**
 * Register list_agents tool
 */
export function registerListAgentsTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'list_agents',
    'List canonical agents accepted by save_run. Returns enabled status, agent names, and manifest path.',
    ListAgentsInputSchema.shape,
    createToolHandler(ListAgentsInputSchema, async () => {
      // SDK returns AgentPerformance[] from analytics endpoint
      // Transform to match the expected list format
      const data = await opsClient.analytics.getAgentPerformance();
      return {
        success: true,
        agents: (data as Array<{ name: string }>).map((v) => ({
          name: v.name,
          enabled: true,
        })),
      };
    }, { toolName: 'list_agents' })
  );
}
