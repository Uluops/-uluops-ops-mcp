/**
 * The save_run rejection notice (ops-uluops-api analysis-never-loses-the-run spec
 * v0.2.3 §3.5, phase R3).
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
      `(${plural(count(r.recordsRejected), 'record', 'records')}, ${plural(count(r.summariesRejected), 'summary', 'summaries')})`;
  }
  const issues = typeof detail['issuesTotal'] === 'number' ? `, ${plural(count(detail['issuesTotal']), 'issue', 'issues')}` : '';
  return `${quoteName(r.agentName)} (${reason}${issues}; ${plural(count(r.recordsRejected), 'record', 'records')} and ` +
    `${plural(count(r.summariesRejected), 'summary', 'summaries')} not stored)`;
}

/**
 * Build the notice from a save result (the SDK's `SaveRunResponseWithEcho`), or
 * return `[]`. Defensive throughout: it runs after the write landed, so it reads an
 * `unknown` and never throws on an unexpected shape.
 */
export function analysisRejectionNotice(result: unknown): string[] {
  if (result === null || typeof result !== 'object') return [];
  const r = result as { run?: { runNumber?: unknown; id?: unknown }; analysisWrite?: { rejected?: unknown } | null };
  const rejected = r.analysisWrite?.rejected;
  if (!Array.isArray(rejected) || rejected.length === 0) return [];
  const runNumber = typeof r.run?.runNumber === 'number' ? `#${String(r.run.runNumber)}` : '';
  const runId = typeof r.run?.id === 'string' ? r.run.id : undefined;
  const agents = rejected.map(x => describeRejection((x ?? {}) as RejectionLike)).join('; ');
  return [
    `Run ${runNumber} is saved. The server rejected the analysis of: ${agents}. ` +
    'Do not call save_run again: that creates a second run. ' +
    `Add the corrected analysis to this run with update_run${runId !== undefined ? ` (run_id ${runId})` : ''}, ` +
    "sending each rejected agent's complete record set and summary: none of its entries were stored. " +
    'The issues are in analysisWrite.rejected[].detail.',
  ];
}
