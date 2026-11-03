/**
 * Save-time warning for unattributed analysis entries on a multi-agent run
 * (R3 review, tracker run #3, perverse-outcome F5).
 *
 * Alex ruled (2026-11-03) that save_run and validate_run accept an empty or
 * whitespace-only agent_name, as the tracker's save path does: it treats the name
 * as absent and stores the entry under the run's default name. On a single-agent
 * run that default is right. On a multi-agent run it is the run #4 failure
 * (2026-08-09: 32 records from two analysts stored under one definition name),
 * which the old refusal used to prevent interactively. This warns instead of
 * refusing: the entry is saved, and the caller is told which entries carry no
 * name. It never fills a name.
 */

type Moment = 'saved' | 'preview';

interface NamedEntry { agent_name?: string | undefined }

export interface AnalysisNameWarningInput {
  agents: Array<{ name: string }>;
  analysis_records?: NamedEntry[] | undefined;
  analysis_summary?: NamedEntry | NamedEntry[] | undefined;
}

function unnamed(entries: NamedEntry[]): number {
  return entries.filter(e => typeof e.agent_name !== 'string' || e.agent_name.trim() === '').length;
}

/** The warning, or `[]`: nothing on a single-agent run, nothing when every entry is named. */
export function analysisNameWarnings(input: AnalysisNameWarningInput, moment: Moment): string[] {
  if (new Set(input.agents.map(a => a.name)).size < 2) return [];
  const records = unnamed(input.analysis_records ?? []);
  const summary = input.analysis_summary;
  const summaries = summary === undefined ? 0 : unnamed(Array.isArray(summary) ? summary : [summary]);
  if (records + summaries === 0) return [];
  const what = [
    records > 0 ? `${String(records)} analysis record${records === 1 ? '' : 's'}` : '',
    summaries > 0 ? `${String(summaries)} summar${summaries === 1 ? 'y' : 'ies'}` : '',
  ].filter(Boolean).join(' and ');
  const tail = moment === 'saved'
    ? 'They were saved that way. Correct them with update_run (record_write_mode "merge", agent_name set); do not re-save the run.'
    : 'Set agent_name on each before calling save_run.';
  return [
    `${what} on this multi-agent run ${records + summaries === 1 ? 'has' : 'have'} no agent_name (empty counts as absent): ` +
    `the tracker stores ${records + summaries === 1 ? 'it' : 'them'} under the run's default name, not under the agent that produced ${records + summaries === 1 ? 'it' : 'them'}. ${tail}`,
  ];
}
