/**
 * get_taxonomy tool
 *
 * Get the failure taxonomy schema.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const GetTaxonomyInputSchema = z.object({});

export type GetTaxonomyInput = z.infer<typeof GetTaxonomyInputSchema>;

/**
 * Register get_taxonomy tool
 */
export function registerGetTaxonomyTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'get_taxonomy',
    'Get the failure taxonomy schema (domains, modes, severities).',
    GetTaxonomyInputSchema.shape,
    createToolHandler(GetTaxonomyInputSchema, () => opsClient.taxonomy.get(), { toolName: 'get_taxonomy' })
  );
}
