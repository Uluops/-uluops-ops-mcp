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
    'Get a run by UUID. Includes actor-scoped editCapabilities when supported: camelCase API request fields, required role, immutable and mutable fields, unchanged-only and UUID-only fields, and analysis-only preview scope. Absence means unknown; writes recheck policy.',
    GetRunInputSchema.shape,
    createToolHandler(GetRunInputSchema, (n, scope) =>
      opsClient.runs.get(n['runId'] as string, scope),
      { toolName: 'get_run' }
    )
  );
}
