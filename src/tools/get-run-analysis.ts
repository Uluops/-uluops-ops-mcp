/**
 * get_run_analysis tool
 *
 * Get structured analysis records and summaries for a specific run.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const GetRunAnalysisInputSchema = z.object({
  run_id: z.string().uuid().describe('Run UUID'),
});

export type GetRunAnalysisInput = z.infer<typeof GetRunAnalysisInputSchema>;

/**
 * Register get_run_analysis tool
 */
export function registerGetRunAnalysisTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'get_run_analysis',
    'Get structured analysis records and summaries for a specific run. Returns convention inventories, tension maps, decay vectors, system metrics, and epistemic assessments.',
    GetRunAnalysisInputSchema.shape,
    createToolHandler(GetRunAnalysisInputSchema, (n) =>
      opsClient.runs.getAnalysis(n['runId'] as string),
      { toolName: 'get_run_analysis' }
    )
  );
}
