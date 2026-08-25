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
    'List agents known to this org, derived from run history — {data, total}. ADVISORY ONLY — this is not an allowlist: save_run accepts any agent name, and a name absent here simply has no recorded runs yet.',
    ListAgentsInputSchema.shape,
    createToolHandler(ListAgentsInputSchema, async () => {
      // T13 (breaking train, Train C): family list envelope {data, total} —
      // the {success, agents} wrapper was hand-built here (the only success
      // flag in the server) and is gone. getAgentPerformance returns
      // AgentPerformance[]; guard shape defensively before projecting.
      const perf = await opsClient.analytics.getAgentPerformance();
      const agents = (Array.isArray(perf) ? perf : [])
        .filter((v: unknown): v is { name: string } =>
          typeof v === 'object' && v !== null && typeof (v as { name?: unknown }).name === 'string'
        )
        .map((v) => ({ name: v.name, enabled: true }));
      return { data: agents, total: agents.length };
    }, { toolName: 'list_agents' })
  );
}
