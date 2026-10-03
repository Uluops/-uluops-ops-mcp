# Mutation pass — P0m-1 (cross-version caveats)

Definition-version-dispositions spec v0.10.0 §11.20: every §11 control a phase owns is run against the defect it names, and must fail. The merged diff cannot show a reverted mutation, so each failing run below is a pushed branch holding the mutated tree; check one out and run `npx vitest run src/__tests__/cross-version-caveat.test.ts` to reproduce. Every branch is one commit on top of `main` at `0b8a60c` and must never be merged.

Baseline (unmutated `main` `0b8a60c`, 2026-10-03): 3 passed (3).

| Control | Defect it names | Failing run (branch @ sha) | Test that fails |
|---|---|---|---|
| Description carries the caveat | `get_agent_lifecycle` description loses `CROSS_VERSION_CAVEAT` | `mutation/p0m/description-drops-caveat` @ `30c4267` | get_agent_lifecycle carries the caveat in its description |
| Response carries the caveat | `get_agent_lifecycle` handler loses its `responseNote` | `mutation/p0m/response-drops-note` @ `3ead671` | get_agent_lifecycle carries the caveat in every success response |
| Cross-version sentence pinned word for word (the same literal is pinned in `@uluops/registry-mcp`) | one word changed in the constant ("observational" → "informational") | `mutation/p0m/cross-caveat-one-word` @ `dd65b8e` | pins the shared sentence word for word |

Each mutation failed exactly one test (1 failed, 2 passed); the commit body on each branch carries the vitest summary.

**No tool-set control here.** This package carries the caveat on one tool, `get_agent_lifecycle`, and has no tool-list constant to shrink; the description and response controls cover that tool directly. The pooled-versions caveat lives only in `@uluops/registry-mcp`.
