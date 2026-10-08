/**
 * CROSS_VERSION_CAVEAT: tools whose response reports quality for more than one
 * definition version side by side (here: get_agent_lifecycle).
 * UNVERSIONED_FIGURES_CAVEAT (below): tools whose figures carry no version identity.
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

/**
 * Figures with no version identity (definition-version-dispositions spec v0.11.2 §4.1, amendment CM; P0m-3).
 *
 * AK (2026-10-02) left these uncaveated as "an overall picture of the definition". CM withdrew that: the exemption
 * made the defect state (no version on the wire) the one with no caveat, so restoring a version to a response would
 * have added a caveat and dropping one removed it (run #73, tracker bd7282be). The tools are the inventory's
 * no-identity rows (version-comparison-surfaces-inventory v0.1.0, a7221ebb): four in @uluops/ops-mcp
 * (get_agent_reliability, get_analytics, get_agent_matrix, get_agent_runs_analysis) and two in @uluops/registry-mcp
 * (get_execution_stats, get_ecosystem_overview).
 *
 * Why its own constant and not POOLED_VERSIONS_CAVEAT: that sentence (registry-mcp, get_effectiveness/get_health)
 * speaks of "the requested version", and these figures sit under no version. The checklist named ops-mcp's constant
 * POOLED_VERSIONS_CAVEAT; one name carrying two different sentences across the two packages would defeat the
 * word-for-word pins, so the name is new.
 *
 * Why "may" twice: the class holds two shapes. Some figures pool every version (agent reliability, execution counts,
 * the agent matrix across definitions); others are one version's rows serialized without the version (grouped agent
 * performance until bd7282be restores the field, unresolved runs-analysis items). "Even when the request named a
 * version" covers get_execution_stats, whose URL names a version and whose body counts every version and org. The
 * qualifier "that carry no definition version" leaves runs-analysis items with a resolved version outside it (CJ).
 *
 * The sentence is identical in @uluops/ops-mcp and @uluops/registry-mcp; each package's test pins it word for word,
 * and spec §4.1 records its sha256 (BA).
 */
export const UNVERSIONED_FIGURES_CAVEAT =
  'Figures here that carry no definition version are not evidence about any one version: each may pool every ' +
  'version of the agent or definition it describes (some also span several definitions or orgs), even when the ' +
  'request named a version, or may come from a single version the response does not name. Do not attribute such a ' +
  'figure to a version, compare it with a version\'s own figures, or read a change in it as evidence that an edit ' +
  'made a definition better or worse.';

/** Tools whose descriptions and responses must carry UNVERSIONED_FIGURES_CAVEAT. */
export const UNVERSIONED_FIGURES_TOOLS = [
  'get_agent_reliability',
  'get_analytics',
  'get_agent_matrix',
  'get_agent_runs_analysis',
] as const;
