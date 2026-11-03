/**
 * The save_run rejection notice and the validate_run prediction notice
 * (ops-uluops-api analysis-never-loses-the-run spec v0.2.3 §3.5, phase R3).
 *
 * Since ops-api R2 an invalid analysis entry costs one agent's analysis, not the
 * run: the save answers 201 and lists the agent in `analysisWrite.rejected`. That
 * array sits inside a large JSON block, and the perverse-outcome read of the spec
 * named the two things a session then does (P1, P2): it reads the 201 as success
 * and moves on with the analysis lost, or it sees the problem and calls save_run
 * again, which creates a SECOND run. This notice is a separate text block that says
 * the run is saved, names each rejected agent, forbids the re-save, and names the
 * repair (update_run on this run).
 *
 * The wording also answers the R3 review (tracker run #3, project
 * analysis-never-loses-the-run-spec):
 *   - it is labelled as this server's own text (mcp-validator F1), because the
 *     untrusted-content notice that follows it warns about instruction-like data;
 *   - it gives a session that will not repair an honest exit: tell the user
 *     (perverse-outcome F2), as the attribution warnings already do;
 *   - an entry that is its own unit is repaired with record_write_mode "merge":
 *     under the default replace, a nameless repair supersedes the run default's
 *     other stored rows (perverse-outcome F3);
 *   - it says detail lists at most 10 issues, and to preview first, since an
 *     update is refused whole (perverse-outcome F7);
 *   - the units_omitted row points at get_run_analysis, because those agents are
 *     not named here (mcp-validator F2);
 *   - on a deduplicated replay the rejection is the original save's and may have
 *     been repaired since (code-auditor L1).
 *
 * Returns no notice when nothing was rejected (absent or empty `rejected`).
 */

interface RejectionLike {
  agentName?: unknown;
  reason?: unknown;
  recordsRejected?: unknown;
  summariesRejected?: unknown;
  detail?: unknown;
}

const NAME_MAX = 100;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** The label that sets this block apart from tracker data (see the untrusted-content notice). */
export const NOTICE_SOURCE = '[ops-mcp notice, computed by this MCP server from the tracker response]';

function quoteName(name: unknown): string {
  // The name is the caller's own payload echoed back; quoted and capped so an odd
  // value cannot run on into the instruction that follows it.
  return typeof name === 'string' ? JSON.stringify(name.slice(0, NAME_MAX)) : '(an entry that is its own unit)';
}

function count(n: unknown): number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0 ? n : 0;
}

function plural(n: number, one: string, many: string): string {
  return `${String(n)} ${n === 1 ? one : many}`;
}

function describeRejection(r: RejectionLike): string {
  const reason = typeof r.reason === 'string' ? r.reason.slice(0, 50) : 'unknown reason';
  const detail = r.detail !== null && typeof r.detail === 'object' ? (r.detail as Record<string, unknown>) : {};
  if (reason === 'units_omitted') {
    return `${plural(count(detail['unitsOmitted']), 'more agent', 'more agents')} not itemized ` +
      `(${plural(count(r.recordsRejected), 'record', 'records')}, ${plural(count(r.summariesRejected), 'summary', 'summaries')}; ` +
      'get_run_analysis on this run shows which agents have no analysis)';
  }
  const issues = typeof detail['issuesTotal'] === 'number' ? `, ${plural(count(detail['issuesTotal']), 'issue', 'issues')}` : '';
  return `${quoteName(r.agentName)} (${reason}${issues}; ${plural(count(r.recordsRejected), 'record', 'records')} and ` +
    `${plural(count(r.summariesRejected), 'summary', 'summaries')} not stored)`;
}

function rejectedOf(result: unknown, key: 'save' | 'validate'): unknown[] {
  if (result === null || typeof result !== 'object') return [];
  const r = result as { analysisWrite?: { rejected?: unknown } | null; wouldReject?: unknown };
  const list = key === 'save' ? r.analysisWrite?.rejected : r.wouldReject;
  return Array.isArray(list) ? list : [];
}

/**
 * Build the save notice from a save result (the SDK's `SaveRunResponseWithEcho`), or
 * return `[]`. Defensive throughout: it runs after the write landed, so it reads an
 * `unknown` and never throws on an unexpected shape.
 */
export function analysisRejectionNotice(result: unknown): string[] {
  const rejected = rejectedOf(result, 'save');
  if (rejected.length === 0) return [];
  const r = result as { run?: { runNumber?: unknown; id?: unknown }; deduplicated?: unknown };
  const runNumber = typeof r.run?.runNumber === 'number' ? String(r.run.runNumber) : undefined;
  const runRef = runNumber !== undefined ? `Run #${runNumber}` : 'The run';
  const runLower = runNumber !== undefined ? `run #${runNumber}` : 'this run';
  const runId = typeof r.run?.id === 'string' && UUID.test(r.run.id) ? r.run.id : undefined;
  const agents = rejected.map(x => describeRejection((x ?? {}) as RejectionLike)).join('; ');
  const ownUnit = rejected.some(x => {
    const row = (x ?? {}) as RejectionLike;
    return row.agentName === null && row.reason !== 'units_omitted';
  });
  const replay = r.deduplicated === true
    ? 'This response is a replay of an earlier identical save: the rejection is from that save and may have been repaired since; check get_run_analysis before repairing. '
    : '';
  return [
    `${NOTICE_SOURCE} ${runRef} is saved. ${replay}The server rejected the analysis of: ${agents}. ` +
    'Do not call save_run again: that creates a second run. ' +
    `To repair, add the corrected analysis to this run with update_run${runId !== undefined ? ` (run_id ${runId})` : ''}, ` +
    "sending each rejected agent's complete record set and summary under its agent_name: none of its entries were stored. " +
    (ownUnit ? 'For an entry that is its own unit, send it with record_write_mode "merge", so no stored record is retired. ' : '') +
    'Preview with preview_update_run first: an update is refused whole if any entry is invalid, and ' +
    'analysisWrite.rejected[].detail.issues lists at most 10 issues per agent (truncated: true means there are more). ' +
    `If you do not repair it now, tell the user which agents' analysis is missing from ${runLower}.`,
  ];
}

/**
 * validate_run's notice: the rejections a save of this payload WOULD record
 * (`wouldReject`). Without it the prediction sat in the JSON, and a session that
 * previewed as save_run's description asks read "no warnings block" as passed
 * (perverse-outcome F4). Nothing is saved by validate_run, so the advice is to fix
 * before saving.
 */
export function wouldRejectNotice(result: unknown): string[] {
  const rejected = rejectedOf(result, 'validate');
  if (rejected.length === 0) return [];
  const agents = rejected.map(x => describeRejection((x ?? {}) as RejectionLike)).join('; ');
  return [
    `${NOTICE_SOURCE} A save_run of this payload would reject the analysis of: ${agents}. ` +
    'Nothing has been saved. Fix those entries (the issues are in wouldReject[].detail.issues) before calling save_run.',
  ];
}
