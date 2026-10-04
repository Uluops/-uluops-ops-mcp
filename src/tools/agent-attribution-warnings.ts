/**
 * Save-time attribution warnings (definition-version-comparison checklist X4-9).
 *
 * The tracker credits a run to an agent version only when the caller sends that agent's
 * own `definition_version`. When it is absent the server stores a fallback
 * (`inferred-latest`, or nothing when the name resolves to no published definition) that
 * no version record counts; an orchestrator that copies the run's version onto every
 * agent (tracker c18f1ab1) credits the wrong version or none. agent-metrics now captures
 * the version deterministically (X4-1/X4-2), so a payload spliced from
 * `agent-metrics … -f tracker` carries it. These warnings are the net for the payloads
 * that were not spliced.
 *
 * Warn only — never refuse, never fill (Alex, 2026-10-04). A fill here would be a guess,
 * and a wrong version is worse than a missing one: a missing one is counted, a wrong one
 * credits another version silently. The warnings ride in the tool's response text, not
 * the API contract, so no consumer of the API sees a change.
 *
 * ## The reader optimizes against these strings (review of 2026-10-04)
 *
 * The first draft was read by perverse-outcome-detector, heidegger-analyst and
 * code-auditor as what it is: text an orchestrating model will try to make go away. Each
 * rule below closes a route they named.
 *  - **The cost of a WRONG value is stated in the text**, not only in this comment. The
 *    draft told the model what an omission costs and nothing about a fabrication, so the
 *    only way to clear the block was to read a version from the agent file or look up
 *    "latest" in the registry — turning a counted miss into a silent wrong credit.
 *  - **A legitimate omission has a compliant exit.** agent-metrics omits the version by
 *    design (built-in or plugin agents, no `version:`, a file changed around spawn). An
 *    entry with an `agent_id` and no version is that case: it is reported as a note that
 *    asks for no action, not as a defect to fix.
 *  - **Tense follows the tool.** `save_run` responses are built after the write, so they
 *    say the run is recorded and must not be re-saved (a corrected re-save is a different
 *    payload, so a different content-derived idempotency key, so a second run).
 *    `validate_run` says fix before saving.
 *  - **Placeholders count as missing.** `''`, whitespace and `'unknown'` lose attribution
 *    on the server exactly as an absent value does (`ops-uluops-api` run mutations: a falsy
 *    version is replaced with latest; `'unknown'` is not a label), so they warn too.
 *  - **`agent_id` is never to be invented.** Absence is the mark of a hand-built entry;
 *    filling it erases the mark and corrupts the only join key to the transcript.
 *  - **The copy check trusts captured versions.** Entries with an `agent_id` came from
 *    agent-metrics, whose version is the one captured at spawn; a label that merely
 *    coincides with the run's (29 corpus definitions share `1.0.2`) is not a copy. The
 *    check looks at hand-built entries only, and also catches the copy when the run-level
 *    fields were dropped (several differently named hand-built agents sharing one version).
 */

export interface AttributionWarningInput {
  agents: ReadonlyArray<{ name: string; definition_version?: string; agent_id?: string }>;
  definition_type?: string;
  definition_name?: string;
  definition_version?: string;
}

/** `'preview'` before anything is written (validate_run); `'saved'` after the write (save_run). */
export type WarningMoment = 'preview' | 'saved';

const unique = (names: string[]): string[] => [...new Set(names)];
const list = (names: string[]): string => unique(names).join(', ');
/** "1 agent carries" / "3 agents carry". */
const agentsVerb = (n: number, singular: string, plural: string): string =>
  `${String(n)} agent${n === 1 ? '' : 's'} ${n === 1 ? singular : plural}`;

/** A version the server would not treat as a label. */
export function isMissingVersion(v: string | undefined): boolean {
  return v === undefined || v.trim() === '' || v.trim().toLowerCase() === 'unknown';
}
/** An agent_id that joins to nothing. */
export function isMissingAgentId(v: string | undefined): boolean {
  return v === undefined || v.trim() === '';
}

const WRONG_IS_WORSE =
  'Never read a version from the agent file, look one up in the registry, or copy the run\'s: an omitted version is counted as a miss, ' +
  'while a guessed one can credit the wrong version and hides the miss.';

/** The warnings for a save_run / validate_run payload; empty when nothing is wrong. */
export function agentAttributionWarnings(input: AttributionWarningInput, moment: WarningMoment): string[] {
  const warnings: string[] = [];
  const recorded = moment === 'saved'
    ? 'This run is already recorded as sent; do not re-save it to change this (a re-save creates a second run) — tell the user which agents are unattributed.'
    : 'Fix this before calling save_run: a saved run cannot be relabelled (update_run does not carry the version).';

  // The server inherits the run-level version for the agent named after a type-`agent`
  // run, so that agent is not unattributed. Mirrors ops-uluops-api run mutations exactly:
  // type and name are inferred (`agent`, agents[0].name) only when BOTH are omitted on a
  // single-agent run; a name with no type leaves the type null, and nothing inherits.
  // (public-interface-validator handoff, 2026-10-04: the first rework exempted name-only
  // runs, which the server does not credit, and warned on inferred runs, which it does.)
  const inferred = input.definition_type === undefined;
  const runType = inferred ? (input.agents.length === 1 ? 'agent' : undefined) : input.definition_type;
  const runName = inferred ? (input.agents.length === 1 ? input.agents[0]?.name : undefined) : input.definition_name;
  const inherits = (name: string): boolean =>
    runType === 'agent' && name === runName && !isMissingVersion(input.definition_version);

  const unversioned = input.agents.filter(a => isMissingVersion(a.definition_version) && !inherits(a.name));
  const handBuiltNoVersion = unversioned.filter(a => isMissingAgentId(a.agent_id)).map(a => a.name);
  const splicedNoVersion = unversioned.filter(a => !isMissingAgentId(a.agent_id)).map(a => a.name);

  if (handBuiltNoVersion.length > 0) {
    warnings.push(
      `${agentsVerb(handBuiltNoVersion.length, 'carries', 'carry')} no definition_version and no agent_id (${list(handBuiltNoVersion)}): ` +
      'the server records a fallback (inferred-latest, or nothing), and no version record counts the run. ' +
      'Splice agents[] verbatim from `agent-metrics extract … -f tracker` or `agent-metrics buffer list -f tracker`, which carry the version captured at spawn. ' +
      `If there is no agent-metrics output for these agents, leave the version out. ${WRONG_IS_WORSE} ${recorded}`,
    );
  }
  if (splicedNoVersion.length > 0) {
    // A note, not a defect: agent-metrics omitted the version because it could not name
    // the definition that ran. The compliant action is none.
    warnings.push(
      `Note, no action needed: ${agentsVerb(splicedNoVersion.length, 'has', 'have')} no definition_version (${list(splicedNoVersion)}). ` +
      'agent-metrics omits it when it cannot name the definition that ran (a built-in or plugin agent, no version in the file, or a file changed around spawn); ' +
      `the run is counted as unattributed for these agents. Leave it omitted. ${WRONG_IS_WORSE}`,
    );
  }

  const noAgentId = input.agents.filter(a => isMissingAgentId(a.agent_id)).map(a => a.name);
  if (noAgentId.length > 0) {
    warnings.push(
      `${agentsVerb(noAgentId.length, 'carries', 'carry')} no agent_id (${list(noAgentId)}): ` +
      'agent-metrics output always includes it, so these entries were probably built by hand, and their tokens, duration and version are unverified. ' +
      'Never invent or reuse an agent_id — it is the only join key to the buffer entry and transcript; leave it out when no agent-metrics output exists for the agent (inline execution, Codex, ulu exec).',
    );
  }

  const ids = input.agents.map(a => a.agent_id?.trim()).filter((id): id is string => id !== undefined && id !== '');
  const dupIds = unique(ids.filter((id, i) => ids.indexOf(id) !== i));
  if (dupIds.length > 0) {
    warnings.push(
      `agent_id ${dupIds.join(', ')} appears on more than one agent: each agent instance has its own id, so at least one entry was not spliced from its own agent-metrics output.`,
    );
  }

  // The c18f1ab1 signature, on hand-built entries only (a spliced version was captured at
  // spawn, so a label that coincides with the run's is not a copy).
  const handBuilt = input.agents.filter(a => isMissingAgentId(a.agent_id) && !isMissingVersion(a.definition_version));
  const copied = new Set<string>();
  if (input.definition_name !== undefined && !isMissingVersion(input.definition_version)) {
    for (const a of handBuilt) {
      if (a.definition_version === input.definition_version && a.name !== input.definition_name) copied.add(a.name);
    }
  }
  // Without the run-level fields: several differently named hand-built agents sharing one version.
  const byVersion = new Map<string, Set<string>>();
  for (const a of handBuilt) {
    const v = a.definition_version as string;
    byVersion.set(v, (byVersion.get(v) ?? new Set()).add(a.name));
  }
  for (const names of byVersion.values()) if (names.size > 1) for (const n of names) copied.add(n);
  if (copied.size > 0) {
    const names = [...copied];
    warnings.push(
      `${agentsVerb(names.length, 'has', 'have')} a hand-built definition_version that may have been copied (${list(names)}): ` +
      'it matches the run\'s definition_version under a different name, or is shared by differently named agents. ' +
      'Each agent\'s definition_version must be that agent\'s own, from agent-metrics output; if it is not known, remove it from these agents. ' +
      `Keep the run-level definition_version and definition_name — they describe the run's own definition. ${recorded}`,
    );
  }

  return warnings;
}
