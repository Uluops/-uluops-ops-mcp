/**
 * delete_run tool
 *
 * Delete a run (requires confirmation).
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const DeleteRunInputSchema = z.object({
  run_id: z.string().uuid().describe('Run UUID to delete'),
  confirm: z.boolean().describe('Must be true to confirm deletion'),
});

export type DeleteRunInput = z.infer<typeof DeleteRunInputSchema>;

/**
 * Register delete_run tool
 */
export function registerDeleteRunTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'delete_run',
    'Delete a run. Requires confirm=true.',
    DeleteRunInputSchema.shape,
    createToolHandler(DeleteRunInputSchema, (n) =>
      opsClient.runs.delete(n['runId'] as string),
      { toolName: 'delete_run' }
    )
  );
}
