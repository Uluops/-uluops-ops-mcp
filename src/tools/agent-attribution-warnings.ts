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
 */

export interface AttributionWarningInput {
  agents: ReadonlyArray<{ name: string; definition_version?: string; agent_id?: string }>;
  definition_name?: string;
  definition_version?: string;
}

const list = (names: string[]): string => names.join(', ');
/** "1 agent" / "3 agents". */
const count = (n: number): string => `${String(n)} agent${n === 1 ? '' : 's'}`;

/** The warnings for a save_run / validate_run payload; empty when nothing is wrong. */
export function agentAttributionWarnings(input: AttributionWarningInput): string[] {
  const warnings: string[] = [];

  const noVersion = input.agents.filter(a => a.definition_version === undefined).map(a => a.name);
  if (noVersion.length > 0) {
    warnings.push(
      `${count(noVersion.length)} carry no definition_version (${list(noVersion)}): ` +
      'the server records a fallback (inferred-latest, or nothing), and no version record counts the run. ' +
      'Splice agents[] from `agent-metrics extract … -f tracker` or `agent-metrics buffer list -f tracker`, which carry the version captured at spawn; never type one. ' +
      'A saved run cannot be relabelled (update_run does not carry the version), so fix it before saving.',
    );
  }

  const noAgentId = input.agents.filter(a => a.agent_id === undefined).map(a => a.name);
  if (noAgentId.length > 0) {
    warnings.push(
      `${count(noAgentId.length)} carry no agent_id (${list(noAgentId)}): ` +
      'agent-metrics output always includes it, so these entries were probably built by hand, and their tokens, duration and version are unverified.',
    );
  }

  // The c18f1ab1 signature. Needs both run-level fields: without definition_name a run-level
  // version cannot be told apart from a single agent's own version, so no inference is made.
  if (input.definition_name !== undefined && input.definition_version !== undefined) {
    const copied = input.agents
      .filter(a => a.definition_version === input.definition_version && a.name !== input.definition_name)
      .map(a => a.name);
    if (copied.length > 0) {
      warnings.push(
        `${count(copied.length)} (${list(copied)}) carry the run's definition_version ` +
        `(${input.definition_version}, which belongs to ${input.definition_name}) under a different name: ` +
        "this is the signature of the run's version being copied onto its agents. Each agent's definition_version must be that agent's own; " +
        'if it is not known, omit it rather than copy.',
      );
    }
  }

  return warnings;
}
