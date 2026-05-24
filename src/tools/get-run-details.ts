/**
 * get_run_details tool
 *
 * Get detailed run information with all recommendations and summary stats.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const GetRunDetailsInputSchema = z.object({
  project: z.string().min(1),
  run_number: z.number().int().positive().optional(),
  workflow_type: z.string().optional(),
});

export type GetRunDetailsInput = z.infer<typeof GetRunDetailsInputSchema>;

/**
 * Register get_run_details tool
 */
export function registerGetRunDetailsTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'get_run_details',
    'Get detailed run information with all recommendations, correlation status (new/recurring/regression), and summary stats. Omit run_number to get latest.',
    GetRunDetailsInputSchema.shape,
    createToolHandler(GetRunDetailsInputSchema, (n) =>
      opsClient.runs.getDetails(n['project'] as string, n['runNumber'] as number | undefined),
      { toolName: 'get_run_details' }
    )
  );
}
