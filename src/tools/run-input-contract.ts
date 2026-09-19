import type { z } from 'zod';

/**
 * SDK 1.30 formats only top-level issues. Preserve nested summary diagnostics
 * in the union's message via Zod's public per-schema error map, before that
 * boundary. This does not parse again or change the emitted JSON Schema.
 */
export const runSummaryErrorMap: z.ZodErrorMap = (issue, context) => {
  if (issue.code !== 'invalid_union') return { message: context.defaultError };
  const branches = issue.unionErrors.map(error => error.issues);
  const depths = branches.map(branch => branch.reduce((depth, child) => Math.max(depth, child.path.length), 0));
  const deepest = Math.max(...depths);
  const candidates = branches.filter((_, index) => depths[index] === deepest);
  const selected = candidates[0];
  if (candidates.length !== 1 || selected === undefined || deepest <= issue.path.length) {
    return { message: context.defaultError };
  }
  return { message: selected.map(child => `${child.path.join('.')}: ${child.message}`).join('; ') };
};

/** Kept in top-level descriptions because hosts may abbreviate nested schemas. */
export const RUN_TOKEN_CONTRACT =
  ' If agents[].tokens is supplied, input_tokens and output_tokens are both required nonnegative integers. Example: "tokens":{"input_tokens":120,"output_tokens":30}. Omit tokens when unknown; zero means measured zero.';

export const RUN_MAP_CONTRACT =
  ' analysis_summary accepts one object or an array of up to 20 summaries. Each summary requires decision. exploration_maps is an optional array (or null); each map requires metadata.explorer_name, metadata.framework, and sections (up to 50). Every section requires label and type; type is inventory, topology, landscape, classification, mapping, synthesis, limitation, or agenda. Example summary: {"agent_name":"explorer","agent_type":"explorer","decision":"TRACED","exploration_maps":[{"metadata":{"explorer_name":"explorer","framework":"structural"},"sections":[{"type":"inventory","label":"Components","items":[{"name":"API"}]}]}]}. On multi-agent runs, name and type each summary explicitly. Execution tokens belong in agents[], not system_metrics.';
