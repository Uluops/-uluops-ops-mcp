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
 */
export const CROSS_VERSION_CAVEAT =
  'Cross-version figures here are observational: each version ran in its own period, on its own artifacts, ' +
  'and its findings were triaged under the process of that time. Pass rates and scores are the agent\'s own grades, ' +
  'so an edit that changes how lenient it is moves them without changing quality. Differences between versions are ' +
  'not evidence that an edit made the definition better or worse; do not rank versions or recommend one on the basis ' +
  'of these figures, alone or combined with other figures.';
