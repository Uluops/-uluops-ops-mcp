/**
 * validate_run tool
 *
 * Preview what save_run would do without modifying the database.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import {
  ValidatorResultSchema,
  RecommendationSchema,
  type McpServerToolRegistration,
} from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const ValidateRunInputSchema = z.object({
  project: z.string().min(1).max(200).describe('Project name'),
  workflow_type: z
    .string()
    .min(1)
    .max(100)
    .describe('Workflow type (e.g., post-implementation, ship)'),
  agents: z.array(ValidatorResultSchema).describe('Array of agent results'),
  recommendations: z.array(RecommendationSchema).describe('Array of issues/recommendations'),
});

export type ValidateRunInput = z.infer<typeof ValidateRunInputSchema>;

/**
 * Register validate_run tool
 */
export function registerValidateRunTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'validate_run',
    'Preview what save_run would do without modifying the database. Returns would_create, would_update, would_regress, and validation_errors.',
    ValidateRunInputSchema.shape,
    createToolHandler(ValidateRunInputSchema, (n) => opsClient.runs.validate(n), { toolName: 'validate_run' })
  );
}
