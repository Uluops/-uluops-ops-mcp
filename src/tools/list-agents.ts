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
    'List agents known to this org, derived from run history. ADVISORY ONLY — this is not an allowlist: save_run accepts any agent name, and a name absent here simply has no recorded runs yet.',
    ListAgentsInputSchema.shape,
    createToolHandler(ListAgentsInputSchema, async () => {
      // SDK returns AgentPerformance[] from analytics endpoint
      // Transform to match the expected list format
      const data = await opsClient.analytics.getAgentPerformance();
      if (!Array.isArray(data)) {
        return { success: true, agents: [] };
      }
      return {
        success: true,
        agents: data
          .filter((v: unknown): v is { name: string } =>
            typeof v === 'object' && v !== null && typeof (v as { name?: unknown }).name === 'string'
          )
          .map((v) => ({ name: v.name, enabled: true })),
      };
    }, { toolName: 'list_agents' })
  );
}
