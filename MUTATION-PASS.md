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

# Mutation pass — X4-9 (save-time attribution warnings)

Definition-version-comparison checklist v0.12.6 X4-9: "each warning fires on its fixture; a clean payload produces none (a reference that always warns fails the clean case)". Each failing run below is a pushed branch holding the mutated tree, one commit on top of `feat/x4-9-attribution-warnings` at `de05fbb`; check one out and run `npx vitest run src/__tests__/agent-attribution-warnings.test.ts`. Never merge them.

Baseline (unmutated `de05fbb`, 2026-10-04): 10 passed (10).

| Branch | Mutation | Result |
|---|---|---|
| `mutation/x4-9-always-warn` | every payload warns | 8 failed — the clean-case control |
| `mutation/x4-9-no-name-check` | c18f1ab1 check ignores the agent name | 1 failed — single-agent run carrying its own version |
| `mutation/x4-9-no-definition-name-guard` | copy inference without `definition_name` | 1 failed |
| `mutation/x4-9-handler-drops-warnings` | handler never appends the block | 2 failed — response-level tests |
| `mutation/x4-9-validate-run-unwired` | `validate_run` loses the option | 1 failed |
| `mutation/x4-9-agent-id-check-off` | missing `agent_id` never detected | 2 failed |

Found on the way: the first draft's clean fixture lacked `decision`, so the "no warnings on a clean save" test passed against a Zod refusal. Every response test now asserts success before asserting the absence of warnings.
