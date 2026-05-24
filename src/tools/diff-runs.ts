/**
 * diff_runs tool
 *
 * Compare two validation runs to see fixed, new, and unchanged issues.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const DiffRunsInputSchema = z.object({
  project: z.string().min(1),
  base_run: z.number().int().positive(),
  compare_run: z.number().int().positive(),
  workflow_type: z.string().optional(),
});

export type DiffRunsInput = z.infer<typeof DiffRunsInputSchema>;

/**
 * Register diff_runs tool
 */
export function registerDiffRunsTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'diff_runs',
    'Compare two validation runs. Returns fixed issues (in base but not compare), new issues (in compare but not base), unchanged issues, and agent score changes.',
    DiffRunsInputSchema.shape,
    createToolHandler(DiffRunsInputSchema, (n) => opsClient.runs.diff(n), { toolName: 'diff_runs' })
  );
}
