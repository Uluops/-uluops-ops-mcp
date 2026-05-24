/**
 * get_agent_runs_analysis tool
 *
 * Get analysis summaries with run context for a specific agent.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const GetAgentRunsAnalysisInputSchema = z.object({
  agent_name: z.string().min(1).describe('Agent name (e.g., epictetus-validator)'),
  project: z.string().min(1).describe('Project name or UUID'),
  decision: z.string().max(50).optional().describe('Filter by decision (e.g., ALIGNED, FACTUAL)'),
  limit: z.number().int().min(1).max(100).optional().describe('Max results (default 20)'),
  offset: z.number().int().min(0).optional().describe('Pagination offset'),
});

export type GetAgentRunsAnalysisInput = z.infer<typeof GetAgentRunsAnalysisInputSchema>;

/**
 * Register get_agent_runs_analysis tool
 */
export function registerGetAgentRunsAnalysisTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'get_agent_runs_analysis',
    'Get analysis summaries with run context for a specific agent. Returns decision, score, category scores, system metrics, epistemic assessment alongside run number, timestamp, and workflow type.',
    GetAgentRunsAnalysisInputSchema.shape,
    createToolHandler(GetAgentRunsAnalysisInputSchema, (n) =>
      opsClient.runs.getAgentRunsAnalysis(
        n['agentName'] as string,
        {
          project: n['project'] as string,
          decision: n['decision'] as string | undefined,
          limit: n['limit'] as number | undefined,
          offset: n['offset'] as number | undefined,
        }
      ),
      { toolName: 'get_agent_runs_analysis' }
    )
  );
}
