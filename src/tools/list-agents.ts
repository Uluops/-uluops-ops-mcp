/**
 * list_agents tool
 *
 * Discover agent names recorded in run history.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler, mapContextData } from '../utils/tool-handler.js';

const ListAgentsInputObject = z.object({
  format: z.enum(['page']).optional(),
  project: z.string().min(1).optional(),
  days: z.number().int().min(1).max(365).optional(),
  search: z.string().max(200).optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
}).strict();

export const ListAgentsInputSchema = ListAgentsInputObject.superRefine((value, context) => {
  if (value.format !== 'page' && (value.project !== undefined || value.days !== undefined || value.search !== undefined || value.limit !== undefined || value.offset !== undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ['format'], message: 'Select format=page to use agent discovery filters or pagination' });
  }
});

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
    'List agent names recorded in recent run history. By default, collects every page for the last 30 days and returns {data, total}; set format=page to traverse a page with optional project, days, search, limit, or offset filters. Search is a case-insensitive literal substring of the agent name. ADVISORY ONLY — this is not an allowlist: save_run accepts any agent name.',
    ListAgentsInputObject.shape,
    createToolHandler(ListAgentsInputSchema, async (n, scope) => {
      const query = {
        ...(n.project !== undefined && { project: n.project }),
        ...(n.days !== undefined && { days: n.days }),
        ...(n.search !== undefined && { search: n.search }),
        ...(n.limit !== undefined && { limit: n.limit }),
        ...(n.offset !== undefined && { offset: n.offset }),
      };
      if (n.format === 'page') {
        const result = await opsClient.discovery.listAgents(query, scope);
        return mapContextData(result, data => data);
      }

      const first = await opsClient.discovery.listAgents({ limit: 100 }, scope);
      const firstEnvelope = 'context' in first ? first : { data: first, context: null };
      let current = firstEnvelope.data;
      const total = current.total;
      const agents = [...current.data];
      while (current.hasMore) {
        if (current.data.length === 0) throw new Error('Agent discovery page made no progress while hasMore=true');
        const next = await opsClient.discovery.listAgents({ limit: 100, offset: current.offset + current.data.length }, scope);
        current = 'context' in next ? next.data : next;
        if (current.total !== total) throw new Error('Agent discovery totals changed while collecting pages; retry with format=page');
        agents.push(...current.data);
      }
      return { data: { data: agents.map(agent => ({ ...agent, enabled: true })), total }, context: firstEnvelope.context };
    }, { toolName: 'list_agents' })
  );
}
