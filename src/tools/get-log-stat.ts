/**
 * get_log_stat tool (ulu log spec v0.1.13 §3.3 D3/D12/D13/D14, §3.6 D6/D15/D16, §3.8 D8)
 *
 * The log's rollup — examined / found / decided / cameBack / activity — for a
 * PROJECT when `project` is given, else for the ORG the call resolves to (the
 * generic `org` argument: explicit > nearest .uluops.json > ULUOPS_ORG_SLUG >
 * personal). The org rollup adds `projects[]` (the summary shape, capped at
 * 100 with `hasMoreProjects`) and `computedAt` — it is served from a 60 s TTL
 * cache per (org, window) on the API (D16), and `computedAt` says how old the
 * numbers are.
 *
 * Two frames on two clocks (§3.3): `examined` / `found` / `decided` window on
 * RUN timestamps; `activity` / `cameBack` on LEDGER timestamps. `decided` is
 * the CURRENT status of each found issue and sums to `found.issues` — it is
 * not "decisions made in the window" (that is `activity.decisions`).
 * `activity.byStatus.open` counts transitions INTO open (reopens). `cameBack`
 * counts DISTINCT issues, `detected` (a run re-detected it) apart from
 * `reopened` (by decision). `lastDetectedAtAllTime` ignores the window.
 *
 * When the resolution lands on the caller's personal org there is no slug to
 * name on the path, so the tool looks the personal org up (`orgs.list`,
 * `isPersonal`) rather than guessing — the same posture as get_org_audit_feed,
 * one step friendlier because a personal rollup is a real thing to ask for.
 * The result is the SDK's parsed rollup as-is (camelCase keys).
 */

import { z } from 'zod';
import { InputValidationError, type LogStatQuery, type OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

const ISO = z.string().min(1).max(40);

export const GetLogStatInputSchema = z.object({
  project: z.string().min(1).optional()
    .describe('Project name or UUID for the project rollup. Omit it for the ORG rollup of the org this call resolves to (`org`, else the workspace default, else your personal org)'),
  since: ISO.optional().describe('Window start, ISO 8601; both frames are windowed (runs by run time, ledger rows by ledger time). Omit both for all time'),
  until: ISO.optional().describe('Window end, ISO 8601; the API answers 400 when since > until'),
});

export type GetLogStatInput = z.infer<typeof GetLogStatInputSchema>;

export function registerGetLogStatTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'get_log_stat',
    'The log\'s rollup: examined (runs) / found (findings first seen in the window) / decided (their CURRENT status — sums to found; `completed` is what the CLI prints as "fixed") / cameBack (distinct findings a run re-detected, apart from those reopened by decision) / activity (what changed in the window, by ledger time). ' +
    'With `project`: that project\'s rollup. Without it: the rollup of the org the call resolves to, org-wide, plus `projects[]` (name, runs, issues, fixed, regressions; last run first, capped at 100 — `hasMoreProjects` says when) and `computedAt` (the org rollup is cached 60 s server-side; this is how old the numbers are). ' +
    'Two clocks: `decided` is a current-status snapshot of the window\'s cohort, not "decisions in the window" — that is `activity.decisions`; `activity.byStatus.open` counts reopens.',
    GetLogStatInputSchema.shape,
    createToolHandler(GetLogStatInputSchema, async (n, scope) => {
      const { project, ...query } = n;
      const window = query as LogStatQuery;
      if (project !== undefined) {
        return opsClient.projects.getLogStat(project as string, window, scope);
      }
      let slug = scope.org;
      if (slug === undefined) {
        // Personal: the API needs a slug on the path. Look it up, never guess.
        const personal = (await opsClient.orgs.list()).find((o) => o.isPersonal);
        if (personal === undefined) {
          throw new InputValidationError(
            'get_log_stat without `project` needs an org: pass `org: "<slug>"` or `project`. No org slug was requested and this key lists no personal org for the legacy lookup; effective context is unavailable.',
            [{ code: 'custom', path: ['org'], message: 'required — the org whose rollup to read, or pass project' }],
          );
        }
        slug = personal.slug;
      }
      return opsClient.orgs.getLogStat(slug, window, scope);
    }, { toolName: 'get_log_stat' })
  );
}
