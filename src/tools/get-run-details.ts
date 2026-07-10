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
    'Get detailed run information with all recommendations and summary stats. Each recommendation carries TWO status fields: `status` is correlation-in-run (new/recurring/regression/observed — frozen; it never changes when the issue is closed) and `issueStatus` is the linked issue\'s current lifecycle (open/completed/…) — read issueStatus to know whether the work is done. Omit run_number to get latest.',
    GetRunDetailsInputSchema.shape,
    createToolHandler(GetRunDetailsInputSchema, (n) =>
      opsClient.runs.getDetails(n['project'] as string, n['runNumber'] as number | undefined),
      { toolName: 'get_run_details' }
    )
  );
}
