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
 *
 * Why "may" and "possibly" (0.11.4 / 0.27.1): 0.11.3 / 0.26.2 said these figures "pool every version". The
 * issue-derived parts are not pooled: getEffectiveness filters issues to the definitionId of whichever run carries one
 * first (registry-api analytics-service.ts, tracker issue 7ed97aa5), and its runs carry no org filter. The fix for
 * 7ed97aa5 is not yet chosen, so the sentence is written to stay true both before and after it (A35 review, run #67,
 * amendment AS). Execution counts are named because AN put volumes into the class rule (they are the same pooled
 * count stamped per version row).
 */
export const CROSS_VERSION_CAVEAT =
  'Cross-version figures here are observational. Some may not be per-version at all: health, failure-domain, ' +
  'taxonomy and execution-count figures, where present, may be computed for the definition rather than the ' +
  'version they are shown under (pooling its runs across versions, and possibly across orgs, or taking ' +
  'issue-derived parts from a single version that need not be the one shown) and are stored against a version ' +
  'whenever it is recomputed, so a difference between versions there can reflect when and how each was recomputed ' +
  'rather than the versions. Pass rates and scores, where per-version, come from each version\'s own runs in its ' +
  'own period, on its own artifacts, and are the agent\'s own assessments of those artifacts, so an edit that ' +
  'changes how lenient it is moves them without changing quality. No difference between versions here is evidence ' +
  'that an edit made the definition better or worse; do not rank versions or recommend one on the basis of these ' +
  'figures, alone or combined with other figures.';
