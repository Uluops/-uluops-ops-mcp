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
  // `z.literal(true)`, not `z.boolean()`: until 0.20.2 `confirm: false` passed
  // the schema and the handler forwarded only run_id — the SDK synthesizes the
  // X-Confirm-Delete header from the id, so true and false produced the same
  // wire request and the description "Requires confirm=true" was false
  // (circumvention-forecaster run #9 A2 / explorer run #11 P23, falsified run
  // #12). The literal makes the refusal happen where the schema promises it.
  // Same shape the SDK uses for soft_delete_project (DeleteProjectInputSchema).
  confirm: z.literal(true).describe('Must be true to confirm deletion — any other value is refused before the SDK call'),
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
    'Permanently delete a run. Requires confirm=true — a false or missing confirm is refused by the schema, nothing is sent.',
    DeleteRunInputSchema.shape,
    createToolHandler(DeleteRunInputSchema, (n, scope) =>
      opsClient.runs.delete(n['runId'] as string, scope),
      { toolName: 'delete_run' }
    )
  );
}
