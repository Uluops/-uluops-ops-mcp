/**
 * archive_runs tool
 *
 * Archive old runs without deletion.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const ArchiveRunsInputSchema = z.object({
  project: z.string().min(1),
  before_run_number: z.number().int().positive().optional(),
  before_date: z.string().optional(),
  keep_last: z.number().int().positive().optional(),
  reason: z.string().optional(),
});

export type ArchiveRunsInput = z.infer<typeof ArchiveRunsInputSchema>;

/**
 * Register archive_runs tool
 */
export function registerArchiveRunsTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'archive_runs',
    'Archive old runs without deletion. Specify before_run_number, before_date, or keep_last to select runs. Archived runs remain queryable.',
    ArchiveRunsInputSchema.shape,
    createToolHandler(ArchiveRunsInputSchema, (n) => opsClient.runs.archive(n), { toolName: 'archive_runs' })
  );
}
