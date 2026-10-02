/**
 * Caveat appended to tools whose response reports quality for more than one
 * definition version side by side (here: get_agent_lifecycle).
 *
 * Why: each version's runs happen in their own period, on their own artifacts, and
 * their findings are triaged under whatever process held at the time, so a difference
 * between versions cannot be attributed to the edit. Source: definition-version-
 * dispositions spec v0.7.0, §4.1 (amendment AC). The same sentence ships in
 * @uluops/registry-mcp; each package's test pins it.
 */
export const CROSS_VERSION_CAVEAT =
  'Cross-version figures here are observational: each version ran in its own period, on its own artifacts, ' +
  'and its findings were triaged under the process of that time. Differences between versions are not evidence ' +
  'that an edit made the definition better or worse; do not rank versions or recommend one from these figures alone.';
