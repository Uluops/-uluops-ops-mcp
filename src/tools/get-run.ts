/**
 * get_run tool
 *
 * Get a run by UUID.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const GetRunInputSchema = z.object({
  run_id: z.string().uuid().describe('Run UUID'),
});

export type GetRunInput = z.infer<typeof GetRunInputSchema>;

/**
 * Register get_run tool
 */
export function registerGetRunTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'get_run',
    'Get a run by UUID.',
    GetRunInputSchema.shape,
    createToolHandler(GetRunInputSchema, (n) =>
      opsClient.runs.get(n['runId'] as string),
      { toolName: 'get_run' }
    )
  );
}
