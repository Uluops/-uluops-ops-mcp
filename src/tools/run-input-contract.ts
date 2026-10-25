/**
 * SDK 1.30 formats only top-level issues. Preserve nested summary diagnostics
 * in the union's message via Zod's public per-schema error customization,
 * before that boundary. This does not parse again or change the emitted JSON Schema.
 *
 * zod 4 (T4): the hook is the `error` param (was `errorMap`); branches arrive as
 * `issue.errors` (issue arrays, was `unionErrors`); and branch paths are RELATIVE
 * to the union (zod 3's were absolute). The callback runs when the error's issues
 * are first read, by which time `issue.path` is the union's absolute path, so each
 * reported path is the union's path plus the branch path: the message text is the
 * same as on zod 3 (pinned in run-schemas.test.ts, "keeps metadata paths").
 * Returning undefined defers to zod's default message.
 */
type UnionIssue = { code: string; path?: PropertyKey[]; errors?: Array<Array<{ path: PropertyKey[]; message: string }>> };

export const runSummaryError = (issue: UnionIssue): string | undefined => {
  if (issue.code !== 'invalid_union') return undefined;
  const branches = issue.errors ?? [];
  const depths = branches.map(branch => branch.reduce((depth, child) => Math.max(depth, child.path.length), 0));
  const deepest = Math.max(...depths);
  const candidates = branches.filter((_, index) => depths[index] === deepest);
  const selected = candidates[0];
  // A branch that failed only at the union's own level (relative depth 0) carries no nested detail.
  if (candidates.length !== 1 || selected === undefined || deepest <= 0) return undefined;
  const at = issue.path ?? [];
  return selected.map(child => `${[...at, ...child.path].map(String).join('.')}: ${child.message}`).join('; ');
};

/** Kept in top-level descriptions because hosts may abbreviate nested schemas. */
export const RUN_TOKEN_CONTRACT =
  ' If agents[].tokens is supplied, input_tokens and output_tokens are both required nonnegative integers. Example: "tokens":{"input_tokens":120,"output_tokens":30}. Omit tokens when unknown; zero means measured zero.';

export const RUN_MAP_CONTRACT =
  ' analysis_summary accepts one object or an array of up to 20 summaries. Each summary requires decision. exploration_maps is an optional array (or null); each map requires metadata.explorer_name, metadata.framework, and sections (up to 50). Every section requires label and type; type is inventory, topology, landscape, classification, mapping, synthesis, limitation, or agenda. Example summary: {"agent_name":"explorer","agent_type":"explorer","decision":"TRACED","exploration_maps":[{"metadata":{"explorer_name":"explorer","framework":"structural"},"sections":[{"type":"inventory","label":"Components","items":[{"name":"API"}]}]}]}. On multi-agent runs, name and type each summary explicitly. Execution tokens belong in agents[], not system_metrics.';
