/**
 * Caveat for tools whose response reports quality for more than one definition
 * version side by side (here: get_agent_lifecycle).
 *
 * Why: each version's runs happen in their own period, on their own artifacts, and
 * their findings are triaged under whatever process held at the time, and pass rates
 * and scores are the agent's own grades, so a difference between versions cannot be
 * attributed to the edit. Source: definition-version-dispositions spec §4.1
 * (amendments AC and AH). The same sentence ships in @uluops/registry-mcp; each
 * package's test pins it word for word.
 *
 * The wording says "alone or combined with other figures" because the first draft's
 * "from these figures alone" licensed a ranking as soon as any second source was added
 * (A31 review, tracker run #65). It rides in the response as well as the description:
 * a model reads the payload, not the description, when it writes the answer.
 *
 * Why it names the pooled figures: 0.11.2 said "each version ran in its own period, on its own artifacts" of
 * every figure. Health, failure-domain and taxonomy figures are computed over every version and persisted under
 * whichever version was requested (registry-api getEffectiveness → definition_metrics), so lineage, evolution and
 * compare show one pooled figure stamped per version; a difference there reflects recompute time, not the version
 * (A33 review, run #66). The sentence is identical in @uluops/registry-mcp and @uluops/ops-mcp; each package's test
 * pins it word for word.
 */
export const CROSS_VERSION_CAVEAT =
  'Cross-version figures here are observational. Some are not per-version at all: health, failure-domain and ' +
  'taxonomy figures, where present, pool every version of the definition and are re-stamped onto a version whenever ' +
  'it is recomputed, so a difference between versions there only reflects when each was recomputed. Pass rates and ' +
  'scores, where per-version, come from each version\'s own runs in its own period, on its own artifacts, and are the ' +
  'agent\'s own assessments of those artifacts, so an edit that changes how lenient it is moves them without changing ' +
  'quality. No difference between versions here is evidence that an edit made the definition better or worse; do not ' +
  'rank versions or recommend one on the basis of these figures, alone or combined with other figures.';
