/**
 * get_latest_run tool
 *
 * Get the latest run for a project.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler, mapContextData } from '../utils/tool-handler.js';

export const GetLatestRunInputSchema = z.object({
  project: z.string().min(1).describe('Project name or UUID'),
  workflow_type: z.string().optional().describe('Filter by workflow type'),
});

export type GetLatestRunInput = z.infer<typeof GetLatestRunInputSchema>;

/**
 * Register get_latest_run tool
 */
export function registerGetLatestRunTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'get_latest_run',
    'Get the latest run for a project. Includes actor-scoped editCapabilities when supported: camelCase API request fields, required role, immutable and mutable fields, unchanged-only and UUID-only fields, and analysis-only preview scope. Absence means unknown; writes recheck policy. When the project exists but has no matching run, returns { run: null, message } rather than an error; a project that does not exist is still an error.',
    GetLatestRunInputSchema.shape,
    createToolHandler(GetLatestRunInputSchema, async (n, scope) => {
      const project = n['project'] as string;
      const workflowType = n['workflowType'] as string | undefined;
      // findLatest (ops-sdk >= 7.1.0) returns null for "no runs yet", which the API answers on
      // purpose. Through 0.33.0 this tool called getLatest, whose SDK parsed that null as a
      // malformed response and surfaced SDK_RESPONSE_SHAPE_MISMATCH (registry-mcp
      // consumer-validate run #4, 2026-10-25). An empty project is an answer, not a failure.
      // `scope` asks for the response context, so the SDK answers { data, context }; project the
      // data and keep the context (mapContextData), as the other projecting tools do.
      const result = await opsClient.runs.findLatest(project, workflowType, scope);
      return mapContextData(result, (run) => run ?? {
        run: null,
        project,
        ...(workflowType !== undefined ? { workflow_type: workflowType } : {}),
        message: `No runs yet for project '${project}'${workflowType !== undefined ? ` with workflow type '${workflowType}'` : ''}.`,
      });
    },
      { toolName: 'get_latest_run' }
    )
  );
}
