/**
 * get_project_analysis tool
 *
 * Get analysis summaries for a project over time.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const GetProjectAnalysisInputSchema = z.object({
  project: z.string().min(1).describe('Project name or UUID'),
  agent_name: z.string().max(100).optional().describe('Filter by agent (e.g., nietzsche-analyst)'),
  agent_type: z.enum(['validator', 'analyst', 'explorer', 'forecaster', 'executor', 'generator']).optional().describe('Filter by agent type'),
  decision: z.string().max(50).optional().describe('Filter by decision (e.g., VITAL, FLOWING)'),
  limit: z.number().int().min(1).max(100).optional().describe('Max results (default 50)'),
  offset: z.number().int().min(0).optional().describe('Pagination offset'),
});

export type GetProjectAnalysisInput = z.infer<typeof GetProjectAnalysisInputSchema>;

/**
 * Register get_project_analysis tool
 */
export function registerGetProjectAnalysisTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'get_project_analysis',
    'Get analysis summaries for a project over time. Shows system metrics, category scores, epistemic assessments, and audit implications from cognitive lens runs.',
    GetProjectAnalysisInputSchema.shape,
    createToolHandler(GetProjectAnalysisInputSchema, (n) =>
      opsClient.runs.getProjectAnalysis(
        n['project'] as string,
        {
          agentName: n['agentName'] as string | undefined,
          agentType: n['agentType'] as string | undefined,
          decision: n['decision'] as string | undefined,
          limit: n['limit'] as number | undefined,
          offset: n['offset'] as number | undefined,
        }
      ),
      { toolName: 'get_project_analysis' }
    )
  );
}
