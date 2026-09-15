/**
 * get_project_log tool (ulu log spec v0.1.13 §3.2 D2/D10/D12/D13, §3.8 D8)
 *
 * The project's second history: runs (what was examined) and decisions (what
 * was decided, with reasons) interleaved, newest first — plus what came back.
 * One page of the API stream, keyset-paged: pass `nextCursor` back verbatim as
 * `cursor`. The result is the SDK's parsed page as-is (camelCase keys).
 *
 * What a model must keep straight when it reads a page (the ledger facts,
 * spec §2): `reason: null` is *no reason recorded* — the ledger's silence, not
 * a person's; `source: 'agent'` is attributed to an agent and `null` is
 * *unattributed*, never "human"; a `regression` event is a row a RUN
 * re-detected (`viaRunNumber`), while a `resolved → open` `decision` with
 * no run is *reopened by decision* (D12) — two different facts. `counts` on a
 * `run` is `null` for runs saved before migration 065 — unknown, not zero.
 *
 * Inputs are snake_case and normalised to the SDK's camelCase by
 * `createToolHandler`; the SDK sends them to the API as named. The stream is
 * NEVER collapsed here (D11 is a CLI rendering rule) — every row is returned.
 * The org is the generic `org` argument (explicit > nearest .uluops.json >
 * ULUOPS_ORG_SLUG > personal), like every project tool.
 */

import { z } from 'zod';
import type { OpsClient, ProjectLogQuery } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

const ISO = z.string().min(1).max(40);

export const GetProjectLogInputSchema = z.object({
  project: z.string().min(1).describe('Project name or UUID'),
  since: ISO.optional().describe('Window start, ISO 8601 (e.g. 2026-09-01T00:00:00Z); the API answers 400 when since > until'),
  until: ISO.optional().describe('Window end, ISO 8601'),
  // 1–500: the API's ProjectLogQuerySchema is .min(1).max(500) and answers 400, it does not clamp.
  limit: z.number().int().min(1).max(500).optional().describe('Events per page (1–500; the API default is 50)'),
  cursor: z.string().min(1).max(500).optional().describe('Opaque paging cursor — pass a previous page\'s `nextCursor` back verbatim'),
  kind: z.array(z.enum(['run', 'decision', 'regression'])).min(1).optional()
    .describe('Subset of event kinds to return (default all three)'),
  workflow_type: z.string().min(1).max(100).optional()
    .describe('Only runs of this workflow type — filters `run` events only; decisions and regressions have no workflow'),
  agent: z.string().min(1).max(100).optional()
    .describe('Runs by agent name (snapshots); decisions and regressions by the issue\'s agent'),
  include_archived: z.boolean().optional().describe('Include archived runs (excluded by default)'),
});

export type GetProjectLogInput = z.infer<typeof GetProjectLogInputSchema>;

export function registerGetProjectLogTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'get_project_log',
    'The project\'s second history: runs (what was examined) and decisions (what was decided, with reasons) interleaved, newest first — plus what came back. ' +
    'One page of events (`run` | `decision` | `regression`), keyset-paged (`data[]`, `count`, `hasMore`, `nextCursor`): pass `nextCursor` back as `cursor`. ' +
    'Read it right: a `decision` with `reason: null` has NO reason recorded (the ledger\'s silence, not a person\'s); `source: null` is unattributed, never "human"; ' +
    'a `regression` is a finding a RUN re-detected (`viaRunNumber`), while a `resolved → open` decision with no run is reopened by decision — two different facts; ' +
    'a run\'s `counts: null` means saved before counts were recorded, not zero. Never collapsed — every row is returned.',
    GetProjectLogInputSchema.shape,
    createToolHandler(GetProjectLogInputSchema, (n, scope) => {
      const { project, ...query } = n;
      return opsClient.projects.getLog(project as string, query as ProjectLogQuery, scope);
    }, { toolName: 'get_project_log' })
  );
}
