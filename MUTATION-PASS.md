# Mutation pass — P0m-3 (unversioned-figures caveat, CM)

Definition-version-dispositions spec v0.11.2 §4.1 (amendment CM), checklist P0m-3: "dropping a tool from the list, the description caveat or the response note fails; a one-word change in the new constant fails". Each failing run is a pushed branch holding the mutated tree, one commit on `feat/p0m-3-unversioned-caveat` at `0c8dbcc`; the commit body carries the vitest summary. **Never merge a `mutation/p0m-3/*` branch.** Reproduce: `git checkout mutation/p0m-3/<slug>` and run `npx vitest run src/__tests__/cross-version-caveat.test.ts`.

Baseline (`0c8dbcc`, 2026-10-08): 10 passed (10); `prepublishOnly` green.

| Control | Defect it names | Failing run (branch @ sha) | Test that fails |
|---|---|---|---|
| Tool set pinned independently of the array under test | `get_agent_matrix` silently dropped from `UNVERSIONED_FIGURES_TOOLS` | `mutation/p0m-3/tool-list-drops-get-agent-matrix` @ `00536ee` | the tool list matches the pinned set |
| Description carries the caveat | `get_agent_reliability` description loses `UNVERSIONED_FIGURES_CAVEAT` | `mutation/p0m-3/description-drops-caveat-get-agent-reliability` @ `493916d` | get_agent_reliability carries the caveat in description and response |
| Response carries the caveat | `get_analytics` handler loses its `responseNote` | `mutation/p0m-3/response-drops-note-get-analytics` @ `b824aad` | get_analytics carries the caveat in description and response |
| Sentence pinned word for word (the same literal is pinned in `@uluops/registry-mcp`) | one word changed in the constant ("compare" → "contrast") | `mutation/p0m-3/unversioned-caveat-one-word` @ `af957c1` | pins the shared sentence word for word |

Each mutation failed exactly one test (1 failed, 9 passed). The one-word control edits the exported string in `src/tools/cross-version-caveat.ts`, not a quotation of it. The first wording's sha256 was `1797c766…533f8e` (469 chars).

**Reworded before publish (`81b986c`, review 2026-10-08).** The first sentence opened "Figures here that carry no definition version", exempting any figure with a version field: the CJ reading CL replaced (perverse-outcome P1, anxiety-reader F4). Alex chose provenance wording. New sha256, identical in both packages' built output: `1a674289ce2961c23009074bfd8577a9818aa81763f2234725dc965f24c4b3fc` (632 chars), recorded in spec §4.1 (BA). The list, description and response controls above are unaffected by wording; the one-word control is re-cut, and a guard gets its own:

| Control | Defect | Branch @ sha | Fails |
|---|---|---|---|
| Reworded sentence pinned word for word | one word changed ("compare" → "contrast") | `mutation/p0m-3/unversioned-caveat-one-word-v2` @ `b0db6f5` | the word-for-word pin (1 failed, 9 passed) |
| No presence-keyed exemption (CL) | a deliberate rewording back to "that carry no definition version", **constant and pin edited together**, which the pin alone cannot catch | `mutation/p0m-3/presence-keyed-exemption` @ `7ed008f` | the guard assertion `not.toMatch(/(that\|which) carry no (definition )?version/i)` |


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

## X4-9 rework (after the five-agent review)

The table above recorded the first draft (`de05fbb`, 10 tests). The review crew found it materially wrong: code-auditor, test-architect, public-interface-validator, heidegger-analyst and perverse-outcome-detector. The CHANGELOG section "Why the warnings read the way they do" lists what changed. The `mutation/x4-9-*` branches remain as the record of that draft.

The branches below are one commit each on top of `1d7c209`. Reproduce a result with `npx vitest run src/__tests__/agent-attribution-warnings.test.ts`. Never merge them.

Baseline (unmutated `1d7c209`, 2026-10-04): 18 passed (18).

| Branch | Mutation | Result |
|---|---|---|
| `mutation/x4-9r-always-warn` | every payload warns (the clean-case control) | 8 failed, 10 passed |
| `mutation/x4-9r-placeholder-not-missing` | `''`, whitespace and `unknown` treated as present | 1 failed |
| `mutation/x4-9r-no-inherit-exemption` | the self-named type-`agent` agent reported as unattributed | 1 failed |
| `mutation/x4-9r-spliced-omission-as-defect` | a spliced omission (`agent_id`, no version) reported as a defect, not a note | 2 failed |
| `mutation/x4-9r-drop-wrong-is-worse` | version warnings lose the "a guess miscredits; an omission is counted" clause | 2 failed |
| `mutation/x4-9r-drop-no-invent` | the `agent_id` warning loses "never invent or reuse" | 1 failed |
| `mutation/x4-9r-no-dup-id-check` | a reused `agent_id` is never reported | 1 failed |
| `mutation/x4-9r-copy-flags-spliced` | the copy check is applied to spliced (captured) versions | 1 failed |
| `mutation/x4-9r-no-shared-version-check` | the copy check works only through the run-level fields, so dropping them evades it | 1 failed |
| `mutation/x4-9r-saved-tense-wrong` | tenses swapped between `save_run` and `validate_run` | 3 failed |
| `mutation/x4-9r-save-run-preview-tense` | `save_run` wired with the pre-write wording | 1 failed |
| `mutation/x4-9r-validate-drops-run-fields` | `validate_run` loses `definition_name`, so the preview cannot run the copy check | 1 failed |
| `mutation/x4-9r-unguarded-hook` | the warning hook is unguarded, so a throw fails a write that landed | 1 failed |
| `mutation/x4-9r-no-provenance` | the block loses its `from` provenance | 1 failed |
| `mutation/x4-9r-verb-not-inflected` | "1 agent carry" | 4 failed |
| `mutation/x4-9r-inherit-name-only` | a name with no type is treated as inferred (the server does not inherit) | 1 failed |
| `mutation/x4-9r-no-single-agent-inference` | single-agent runs with both fields omitted are not inferred (the server does inherit) | 1 failed |

Found on the way:

- **The first in-place run left one survivor, `drop-wrong-is-worse`.** The test pinned the half of the sentence that lists the forbidden sources. It did not pin the asymmetry that makes them forbidden, and that is the clause perverse-outcome-detector P1 says the model needs. The assertion now pins the whole sentence.
- **The rework's inheritance rule was wrong in both directions** until it was checked against the run mutations in `ops-uluops-api` (a public-interface-validator handoff). The last two rows guard it.
