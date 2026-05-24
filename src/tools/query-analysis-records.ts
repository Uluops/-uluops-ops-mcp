/**
 * query_analysis_records tool
 *
 * Cross-project query for analysis records with filters.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const QueryAnalysisRecordsInputSchema = z.object({
  record_type: z.string().max(50).optional().describe('Filter by record type (convention, tension, decay_vector, power_map, stagnation, four_cause, commitment, etc.)'),
  classification: z.string().max(50).optional().describe('Filter by classification (LIVING, CALCIFIED, CONSTITUTIVE, IMMINENT, ACTIVE, DEGRADED, etc.)'),
  agent_name: z.string().max(100).optional().describe('Filter by agent name (e.g., nietzsche-analyst)'),
  agent_type: z.enum(['validator', 'analyst', 'explorer', 'forecaster', 'executor', 'generator']).optional().describe('Filter by agent type'),
  severity: z.enum(['critical', 'high', 'medium', 'low', 'info']).optional().describe('Filter by severity'),
  limit: z.number().int().min(1).max(100).optional().describe('Max results (default 50)'),
  offset: z.number().int().min(0).optional().describe('Pagination offset'),
});

export type QueryAnalysisRecordsInput = z.infer<typeof QueryAnalysisRecordsInputSchema>;

/**
 * Register query_analysis_records tool
 */
export function registerQueryAnalysisRecordsTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'query_analysis_records',
    'Query analysis records across all projects. Find calcified conventions, degraded tensions, imminent decay vectors, and other structured findings from cognitive lens agents.',
    QueryAnalysisRecordsInputSchema.shape,
    createToolHandler(QueryAnalysisRecordsInputSchema, (n) =>
      opsClient.runs.queryAnalysisRecords({
        recordType: n['recordType'] as string | undefined,
        classification: n['classification'] as string | undefined,
        agentName: n['agentName'] as string | undefined,
        agentType: n['agentType'] as string | undefined,
        severity: n['severity'] as string | undefined,
        limit: n['limit'] as number | undefined,
        offset: n['offset'] as number | undefined,
      }),
      { toolName: 'query_analysis_records' }
    )
  );
}
