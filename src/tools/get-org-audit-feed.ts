/**
 * get_org_audit_feed tool (project-org-routing-and-rehome spec D19)
 *
 * The org-visible audit feed: rows a writer marked `visibility: 'org'`,
 * readable by ANY member of the org (the full audit log stays admin+ and is
 * not exposed here). Today the feed carries one class of fact — a project
 * leaving the org for someone's personal org — which is the one move an org
 * admin can make that the org's owner could not otherwise see.
 *
 * The org whose feed is read is the generic `org` argument, resolved like
 * every other tool's (explicit > nearest .uluops.json > ULUOPS_ORG_SLUG). It
 * is REQUIRED here in effect: the feed is a per-org path, and "personal" has
 * no slug the client can name, so a resolution that lands on personal is
 * refused with a 400 that says to pass `org` — never guessed. The D15
 * allowlist applies as on every tool.
 *
 * Rendering: each entry's `details` is narrowed with the SDK's
 * `readRehomeAuditDetails`; a re-home row is summarised in one line
 * (`summary`) beside the raw entry, anything else is returned raw.
 *
 * **`reason` is redacted from what this server relays** — from the summary
 * AND from the raw `details`. Spec §4.4a (security audit run #187, A4): the
 * re-home `reason` is operator-authored free text "one line away from an
 * agent-facing instruction" and is never relayed to an MCP client; D19 chose
 * to expose the destination SLUG, not the text. The first cut of this tool
 * interpolated it into the summary (pre-publish review, anxiety-reader F8).
 * The CLI, read by a human, keeps it.
 */

import { z } from 'zod';
import { InputValidationError, readRehomeAuditDetails, type OpsClient, type OrgAuditEntry } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler, mapContextData } from '../utils/tool-handler.js';

export const GetOrgAuditFeedInputSchema = z.object({
  cursor: z.string().min(1).max(200).optional()
    .describe('Opaque paging cursor — pass a previous page\'s `next_cursor` back verbatim'),
  // 1–100: the API's OrgVisibleAuditLogQuery is .min(1).max(100) and answers 400, it does not clamp.
  limit: z.number().int().min(1).max(100).optional()
    .describe('Page size (1–100; the API default is 50)'),
});

export type GetOrgAuditFeedInput = z.infer<typeof GetOrgAuditFeedInputSchema>;

/** One line a model can relay; null when the row is not a re-home fact. */
export function summarizeFeedEntry(entry: OrgAuditEntry): string | null {
  const d = readRehomeAuditDetails(entry);
  if (d === null) return null;
  const verb = d.action === 'project.rehome_in' ? 'arrived from' : d.action === 'project.rehome_out' ? 'moved to' : d.action;
  const other = d.action === 'project.rehome_in' ? d.from_org.slug : d.to_org.slug;
  const via = d.via_admin_path ? ' (platform admin)' : '';
  const personal = d.to_personal_org ? ' — a personal org' : '';
  return `${entry.createdAt}: project "${d.project_name}" ${verb} \`${other}\`${personal}${via}`;
}

/** Strip the operator-authored `reason` from a feed row before it leaves this server (spec §4.4a). */
export function redactFeedEntry(entry: OrgAuditEntry): OrgAuditEntry {
  if (!Object.hasOwn(entry.details, 'reason')) return entry;
  const details = Object.fromEntries(Object.entries(entry.details).filter(([k]) => k !== 'reason'));
  return { ...entry, details: { ...details, reason_redacted: true } };
}

export function registerGetOrgAuditFeedTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'get_org_audit_feed',
    'Read an org\'s member-visible audit feed: the events its writers marked org-visible — today, projects that left this org for someone\'s personal org (who, when, where to — the operator\'s free-text reason is not relayed). ' +
    'Any member may read it. `org` names the org whose feed you want and is required in effect (this route needs a named org slug). ' +
    'Returns raw entries plus a one-line `summary` per re-home entry; page with `next_cursor`.',
    GetOrgAuditFeedInputSchema.shape,
    createToolHandler(GetOrgAuditFeedInputSchema, async (n, scope) => {
      const slug = scope.org;
      if (slug === undefined) {
        throw new InputValidationError(
          'get_org_audit_feed needs an org: pass `org: "<slug>"` (the org whose feed to read). This route requires a named org slug; omission does not establish the effective org.',
          [{ code: 'custom', path: ['org'], message: 'required — the org whose audit feed to read' }],
        );
      }
      const feed = await opsClient.orgs.getVisibleAuditLog(slug, {
        ...(n['cursor'] !== undefined ? { cursor: n['cursor'] as string } : {}),
        ...(n['limit'] !== undefined ? { limit: n['limit'] as number } : {}),
      }, scope);
      return mapContextData(feed, data => ({
        org: slug,
        entries: data.data.entries.map((entry) => ({ ...redactFeedEntry(entry), summary: summarizeFeedEntry(entry) })),
        count: data.count,
        has_more: data.hasMore,
        next_cursor: data.nextCursor,
      }));
    },
    { toolName: 'get_org_audit_feed' })
  );
}
