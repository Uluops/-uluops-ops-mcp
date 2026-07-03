# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.8.1] - 2026-07-02

### Dependencies

- **Bump `@uluops/ops-sdk` `^5.3.0` → `^5.4.0`** (brings `@uluops/sdk-core@0.14.0`
  transitively). Adopts the sdk-core security-observability release — redirect
  hardening, `baseUrl` embedded-credential rejection, sanitized `requestId`. The
  explicit floor bump (over relying on the caret to float) keeps the update
  reviewable and refreshes the committed lockfile. No MCP behavior change; 697
  tests pass.

## [0.8.0] - 2026-07-02

### Changed

- **Status-change `reason` max length widened from 500 to 1000** in the
  `update_status`, `bulk_update_status`, and `update_issue_by_fingerprint` tool
  input schemas (ports the change from the internal `ops-uluops-mcp` server).
  The cap is imported from `@uluops/ops-sdk` (`STATUS_REASON_MAX_LENGTH`) rather
  than hardcoded. Requires `@uluops/ops-sdk@5.3.0` and ops-api ≥ 1.63.0 deployed;
  against an older server a 501–1000 char reason is rejected with a 400 (fails
  safe, nothing written).

## [0.7.0] - 2026-06-26

### Changed

- **Analysis `record_id` max length widened from 20 to 100** in `AnalysisRecordBaseSchema`
  (shared by `save_run`, `validate_run`, `update_run`). The cap is imported from
  `@uluops/ops-sdk` (`ANALYSIS_RECORD_ID_MAX_LENGTH`) rather than hardcoded. Agent-local
  id — non-breaking. Requires `@uluops/ops-sdk@5.1.0` and ops-api ≥ 1.61.0 deployed.

## [0.6.0] - 2026-06-23

Completes the score-nullability transition at the public MCP boundary (ports the change from the internal `ops-uluops-mcp` server).

### Changed

- `save_run`/`update_run` agent input (`AgentResultSchema`): `max_score` is now `.optional().nullable()` (mirroring `score`). A scoreless agent (generator, executor) omits or nulls `max_score`, holding the invariant `score === null ⟺ max_score === null`. Existing callers that always provide a numeric `max_score` are unaffected.
- Bumped `@uluops/ops-sdk` 4.0.1 → 5.0.0 (makes response `maxScore` nullable end-to-end).

## [0.5.1] - 2026-06-18

Maintenance release: ports the ops-mcp triage batch and lint cleanup, and closes a pre-existing function-coverage gap. No runtime behavior changes for callers — the one tool-surface change (`get_issue_details`) removes two parameters that never did anything.

### Fixed

- `get_issue_details` no longer advertises `include_occurrences` / `include_related` parameters. The backend `/issues/:id/details` endpoint returns a fixed `{ issue, occurrences, notes, history }` envelope with no toggles and no "related issues" field, so both params were silently ignored. The schema now takes only `id`; the description matches the real envelope. Unknown keys are still stripped by the non-strict Zod object, so existing callers passing the old params are unaffected.
- `get_issue_history` `maxEgressBytes` raised 200KB → 500KB. A merged history of up to 1000 events spanning occurrences, status changes, and notes (note bodies are MySQL TEXT, up to 64KB each) could exceed a 200KB envelope and trip silent truncation. Now matches the other bulk read tools (`get_analytics`, `get_agent_lifecycle`).
- Eliminated a class of flaky tests in `index.test.ts`. The failure-mode tests re-`vi.doMock`'d a module already mocked in `beforeEach`; last-write-wins between the two registrations is nondeterministic, so `main()` intermittently ran with the success mock and resolved instead of rejecting. Lifted the relevant mocks (`SecureMcpServer.create`, `validateConfig`) to shared `vi.fn()`s overridden per-test, removing all in-test re-mocking. 0 failures over 15 file-level runs.

### Changed

- `get_issue_history` description shortened (~480 → ~270 chars) so it survives MCP-host description truncation, with the tombstone/undo semantics moved to the front rather than the truncation-prone tail. The full merged-event-stream contract remains documented on the SDK's `IssueHistoryEnvelope` type, and the description-accuracy guard test now asserts the reduced content plus a ≤430-char length budget.
- `get_analytics` and `get_issue_history` descriptions converted from the `[...].join(' ')` array style to single-string literals, matching the rest of the tool surface.

### Internal

- Resolved all 13 `strict-boolean-expressions` lint warnings in `sdk-error-mapper.ts` via explicit comparisons. No config changes; lint is clean.
- Added `tool-handlers-coverage.test.ts`, a table-driven behavioral suite covering the 28 P2 tool handlers that previously had only registration assertions, leaving their SDK-call callback uncovered. Function coverage 79.43% → 99.29%, restoring a green `test:coverage` gate (all four thresholds now pass).

## [0.5.0] - 2026-06-17

### Added

- **`update_profile` tool.** Lets an MCP client (human or LLM) set the
  authenticated user's profile fields — most importantly the **username**, which
  the ops-api fold-in treats as one-time confirmation. This is the prerequisite
  the registry enforces before creating or publishing definitions, previously
  only reachable via the web account page. Wraps `ops-sdk` `auth.updateProfile`;
  includes the required `ToolSpec` entry. Tool inventory 48 → 49.

### Changed

- Bumped `@uluops/ops-sdk` 4.0.0 → 4.0.1 (username slug validator accepts
  hyphenated slugs like `ulu-labs`).

## [0.4.7] - 2026-06-16

### Security

- **Bump `@uluops/ops-sdk` 3.3.0 → 3.4.0 (exact)**, which carries the CWE-20 `.max()` bounds on response-schema string fields shipped in ops-sdk 3.4.0. The MCP layer passes SDK return types through opaquely, so this propagates the bound to consumers receiving the JSON-serialized payloads. No API/tool-schema change.
- **Override transitive `hono` to 4.12.25** (GHSA-88fw-hqm2-52qc). `@modelcontextprotocol/sdk@1.29.0` pulls `hono <=4.12.24`, which carries a HIGH advisory the `prepublishOnly` audit gate blocks on. Pin an exact override to 4.12.25 (patched, within the MCP SDK's `^4.11.4` range). Removable once the MCP SDK ships a non-vulnerable `hono`.

## [0.4.6] - 2026-06-16

### Changed

- **Bump `@uluops/ops-sdk` 3.2.2 → 3.3.0** (exact), which re-pins `@uluops/sdk-core` to 0.13.0. Runtime fixes pulled in: `retries: 0` now makes one attempt and surfaces the real typed error (e.g. `NetworkError`) instead of a contextless `Error('Request failed')`; a 401 with credentials present yields an actionable `UnauthorizedError` (server reason preserved + guidance), distinct from the no-credentials case; `isApiKey()` enforces the minimum key length. No API/tool-schema change. 658 tests green.

## [0.4.5] - 2026-06-11

### Security

- **Bump `mcp-secure-server` 0.0.14-security → 0.0.16-security.** Picks up the `executionWrappers` word-boundary fix: the `System Call` (`/system\s*\(/`) and `Exec Call` (`/exec\s*\(/`) content-layer patterns were unanchored, so benign prose like `filesystem (` matched the `system (` substring and was rejected as a CRITICAL command-injection attempt. The new `\b`-anchored patterns still catch real `system(`/`exec(` calls. Drop-in patch, no API change; build + dist unchanged.

## [0.4.4] - 2026-06-08

Carries API v1.58.1 + SDK 3.2.2's dry-run completeness all the way to the MCP surface so consumers (Codex, Claude Code, custom agents) can pass `analysis_records` and `analysis_summary` to `validate_run` and get back faithful preview counts. No breaking changes; all additions optional.

### Added

- **`validate_run` tool accepts `analysis_records` and `analysis_summary`** with the same strict shape as `save_run`. Prior versions silently stripped these fields from the dry-run request because the MCP-layer Zod schema didn't declare them, so consumers couldn't predict whether analysis payloads would persist correctly — the symptom Codex hit on the 2026-06-08 foundations skill run. The new schema mirrors `save_run`'s shape: `record_id` (max 20), `record_type`, `title`, `data` required per record; single-object or per-agent-array `analysis_summary` accepted.
- **Tool description advertises the new return fields** (`would_create_analysis_records`, `would_create_analysis_summaries`) and the wider request shape, so MCP clients discover the capability from the schema rather than from failed real saves.

### Security

- **Bump `@uluops/ops-sdk` 3.2.1 → 3.2.2** for the matching wire-side change: the SDK's `validate()` now forwards `analysisRecords` and `analysisSummary` to the API, and `ValidateRunResponseSchema` accepts the new optional preview fields. Without this bump, the MCP layer would accept analysis fields from the client but the SDK would strip them on the way to the API — the exact failure mode Codex documented.

### Why

API v1.58.1 made the dry-run faithful at the source; SDK 3.2.2 carries it through the wire layer; this MCP release exposes it at the protocol surface. Tracker: `ops-uluops-api` `c29dd21e` (PRA-DRI/H — dry-run incomplete). Verified live end-to-end against API v1.58.1 + SDK 3.2.2 on 2026-06-08.

## [0.4.3] - 2026-06-08

### Internal

- **Add `prepublishOnly` script** matching the other public `@uluops/*` packages (ops-sdk, registry-sdk, cli): `npm run lint && npm test && npm audit --audit-level=high --omit=dev && npm run build`. Caught by wave-merge pre-publish verification — the prior `prepublishOnly` was absent, so `npm publish` would have skipped lint+test+audit entirely and relied on the developer to remember to run them manually. Aligning the safety net with the rest of the public surface. No behavior change in the runtime package.

## [0.4.2] - 2026-06-08

Post-implementation hardening on the 0.4.0/0.4.1 wave. No behavior change;
all improvements are defensive, security-dep, or doc-fix.

### Security

- **Bump `@uluops/ops-sdk` 3.2.0 → 3.2.1.** Picks up CWE-20 `.max()` bounds on `HistoryEvent` string fields in the history-envelope types (`agentName`/255, `description`/10k, `reason`/2k, `content`/10k, `createdBy`/200), plus `Extract<>` → `z.infer<>` for the constituent event type exports. No source changes in this package — the MCP layer passes SDK return types through opaquely; this carries the bound downstream to consumers receiving the JSON-serialized envelope.
- **Bump `vitest` 2.1.9 → 3.2.6 and `@vitest/coverage-v8` 2.1.9 → 3.2.6.** Closes a CVSS 9.8 CRITICAL CVE (arbitrary file read/exec when Vitest UI server is listening). Dev-only — not in the published package — but CI runs would expose it if `--ui` mode is ever enabled.

### Tests

- **Envelope-shape regression assertion fixed.** The r1 commit (`9232246`) added `expect(result).not.toHaveProperty('isError')` claiming to anchor the envelope-shape regression, but the assertion is a non-check — it passes for any object without an `isError` key, including the pre-F10 `{ history: [], notes: [] }` shape. Test-architect (82/100) caught this; r2 replaces the assertion with `JSON.parse(content[0].text)` and explicit field anchors (`issueId`, `events`, `totalEvents`, `truncated`).
- **`truncated: true` test added.** A sibling test with `totalEvents: 1001, truncated: true, events: [<status event>]` proves the envelope passes through without filtering — without it, a mutation that dropped the `truncated` field in `createSuccessResponse` would not be caught.

### Docs

- **README `get_issue_history` row updated** from "Full issue history with changes between runs" (the pre-F10 framing the CHANGELOG explicitly calls "aspirational — described what the tool should return, not what it did") to the post-F10 envelope shape with undo-tombstone note.
- **README `get_analytics` row** now flags `cross_project_patterns` as the placeholder metric.
- **CHANGELOG `[Unreleased]` compare base** corrected from `v0.2.1` (stale, spans the entire T2 wave) to `v0.4.2`. Added link definitions for `[0.4.2]`, `[0.4.1]`, `[0.4.0]`, `[0.3.1]`, `[0.3.0]` so the version headers are clickable on GitHub/npm.

## [0.4.1] - 2026-06-08

### Changed

- **`get_analytics` tool description now flags `cross_project_patterns` as the empty-by-default placeholder** (live-tests T2 §3.2, F8). The tracker API used to throw 501 NOT_IMPLEMENTED on this metric; it now returns `[]` so the metric behaves like every other one in the family (return data or empty array, never crash on the category itself). Without this description note the empty response is indistinguishable from "no patterns in your data" — a silent semantic gap that defeats the whole point of returning `[]` instead of 501.

  Per response-type-trust + thin-client architecture the handler itself is unchanged. No companion `@uluops/ops-sdk` bump is needed (this is a server-side behavior change, not a contract change).

## [0.4.0] - 2026-06-08

### Changed

- **`get_issue_history` tool description rewritten + dead `include_diffs` param dropped** (live-tests T2 §3.1, F10). Ports the description rewrite already live in the local `ops-uluops-mcp` source tree (commit 76550ed on its `live-tests/phase-1` branch) into the public package. The tracker API endpoint changed in Phase 2 from returning a bare `StatusHistory[]` (status transitions only, with destroyed rows on undo) to a merged envelope:
  ```typescript
  { issueId, events: HistoryEvent[], totalEvents, truncated }
  ```
  where `events` is a timestamp-sorted stream covering occurrences | status | notes (discriminated by `type`). Status events carry `transitionType` (`'change' | 'undo' | null`) and `revertedChangeId` for tombstone-aware audit reconstruction.

  The tool description now accurately documents the envelope shape, the `type` discriminator, the undo-tombstone semantics, and the 1000-event ceiling. The prior copy ("Get the full history... including all occurrences, changes between runs, and any notes") was aspirational — it described what the tool *should* return, not what it did. Per the response-type-trust + thin-client architecture the handler itself is unchanged; the full shape contract lives in `@uluops/ops-sdk` 3.2.0.

  The `include_diffs` parameter was removed. It was declared in the input schema, defaulted to true, and never wired through to the SDK. With the new envelope it has no meaning. Schema is now just `{ issue_id: uuid }`.

### Dependencies

- `@uluops/ops-sdk` 3.1.0 → 3.2.0 (envelope types: `IssueHistoryEnvelope`, `HistoryEvent`, `TransitionType`).

### Internal

- Updated 1 schema test + 1 tool-handler test to use the new envelope shape and assert the dropped param is silently stripped. Suite 655 → 655 (test count unchanged; same coverage, post-F10 semantics).

## [0.3.1] - 2026-06-07

Docs-only patch. Adds the standard UluOps tagline and the 5-badge set (npm version, MIT license, node engine, TypeScript 5.7+, tests passing) to the README, matching the `@uluops/core` package presentation. No behavioural change.

### Changed

- README header now opens with the **[UluOps](https://uluops.ai) · Operating Intelligence as Infrastructure** tagline and the five shields.io badges (npm/license/node/typescript/tests), all linking to canonical sources. Tests badge points to `src/__tests__/` (the actual test home in this repo, not the conventional `test/` directory the core package uses). Brings the npm package page in line with the rest of the public UluOps surface.

## [0.3.0] - 2026-06-07

Forward-ports the validation-drift fix from the internal `uluops-ops-mcp-client` v1.23.0 release. Pairs with ops-uluops-api v1.57.0 to resolve the opaque "Validation failed" experience that has been the dominant friction point on the MCP surface. Two coupled fixes share a single root cause across two layers — the error mapper was dropping per-field detail returned by the API, and the MCP-advertised schema was looser than the API-enforced schema for `failure_code` / `failure_mode` so bad codes round-tripped instead of failing at the boundary.

### Fixed

- `sdk-error-mapper.ts:155` `isValidationError` branch now extracts `details.errors` from the API ValidationError and surfaces per-field detail. Previously emitted only `error.message` ("Validation failed"), forcing clients into trial-and-error isolation to discover which field tripped which rule. The ops-uluops-api error handler (`src/middleware/error-handler.ts:258-279`) has always shipped a structured `errors: [{path, message}]` array; the SDK preserves it on `error.details.errors`; this branch was the only thing that wasn't forwarding it. Compare with `mapZodErrorToMcp` below — that branch always extracted per-field detail for Zod errors thrown in the MCP server itself, but the parallel branch for ValidationErrors returned from the API did not. Field errors now appear both inline in the message (`field.path: message; ...`) and as a structured `field_errors` array in the response envelope.
- The original ops-uluops-api a08391f1 bug report concluded `file_path`, `category`, and `line_number` were rejected by save_run/update_run/create_issue. Live reproduction (probe `0ef736c1`) showed they were always accepted — the actual trigger was almost certainly a `lineNumber` sent as string-not-number or a `failureCode`/`failureMode` outside its regex, and the error mapper hid which. With per-field detail now surfacing, the actual cause is self-diagnosing the first time a client hits it.

### Changed

- **BREAKING (observable, not type-level):** `create-issue.ts:failure_code` is now `z.string().regex(/^(STR|SEM|PRA|EPI)-[A-Z]{3}\/[CHMLI]$/)` matching CreateUserIssueSchema's `FailureCode`. Was `z.string().optional()` — the MCP boundary silently accepted bad codes and round-tripped them to a 400. Error message spells out the DOMAIN-MODE/SEVERITY breakdown so the rejection is self-explaining. Clients submitting malformed `failure_code` values that previously round-tripped to an API 400 will now fail at the MCP boundary with the same effective rejection but a much clearer message.
- **BREAKING (observable, not type-level):** `create-issue.ts:failure_mode` is now `z.string().regex(/^[A-Z]{3}$/)` matching `FailureModeCode`. Was `z.string().optional()`. Error message disambiguates from `failure_code`: "For the full code (e.g., SEM-VAL/H), use failure_code instead." — pointing at the exact mistake the original bug report stumbled into.
- **BREAKING (observable, not type-level):** `schemas.ts:RecommendationSchema.failure_mode` (shared by `save_run` and `update_run` recommendation arrays) gets the same regex. `failure_code` already enforced the pattern in this package. Both surfaces now reject the same garbage at the same boundary.
- Pair with ops-uluops-api v1.57.0's matching tightening of `RecommendationInputSchema` — both the MCP boundary AND the API boundary now enforce the same regexes. `POST /runs` recommendation payloads with malformed codes (which previously stored as-is) will now return a 400 with the specific failing field surfaced through the new error-mapper path.

## [0.2.1] - 2026-06-05

First post-ship hardening pass. Driven by the run #1 ship pipeline (which
failed Stage 3 public-interface at 56/100) and the run #2 anxiety reading
(which surfaced two silent runtime failures the static gates missed:
`tool-policies.json` never loaded by `npx` consumers, and `ULUOPS_API_KEY`
format documented but unvalidated). All 7 ship gates now pass; 34 of the 39
tracker findings closed (87%).

### Security

- **`tool-policies.json` now actually loaded.** The bundled policy file ships
  in `files[]` but mcp-secure-server's resolution order (env var, then
  `./tool-policies.json` in CWD, then `~/.config`) never found it for
  `npx -y @uluops/ops-mcp` invocations — CWD is the MCP host's project
  directory, not the package directory. Resolved via
  `require.resolve('../tool-policies.json')` passed as `toolPoliciesPath`.
  Without this fix every public consumer ran with default-level enforcement
  and the `relaxedFields` that suppress UUID-as-credit-card false positives
  were decorative.
- **`ULUOPS_API_KEY` format validated at startup.** README documented the
  `ulr_` prefix + 20-char minimum but `validateConfig` only checked for
  non-empty. Mis-prefixed keys silently routed through `sessionToken` auth
  and surfaced as opaque 401s. Now enforced via
  `/^ulr_[A-Za-z0-9_-]{16,}$/` with an actionable error message.
- **`NotFoundError` and `NetworkError` now pass through `sanitizeErrorMessage`.**
  Closed a credential-redaction gap where 2 of 7 typed error branches
  forwarded raw SDK error messages — low probability of leaking `ulr_*`
  keys today, but the redaction layer is now consistent across all branches.
- **402 tier-gating payload uses defensive type guards.** Previously cast
  `details.definitions`, `details.currentTier`, `details.upgradeUrl` without
  shape validation. Now `Array.isArray` + `typeof === 'string'` guards
  with graceful fallback to `'above-tier definitions'` / `'unknown'` when
  the API payload shape drifts.
- **HTTPS-only base URL warning.** `loadConfig` now warns when
  `ULUOPS_BASE_URL` uses a non-`https:` scheme outside `NODE_ENV=development`.
  Closes CWE-319 cleartext-credential-transmission visibility gap.
- **`ENABLE_DETAILED_ERRORS=false` env gate** for tightened production
  deployments that want mcp-secure-server to suppress redacted error
  reasons in `error.message`.
- **`Number.isFinite` coercion guard.** `coerceNumericFields` now rejects
  `Infinity` / `-Infinity` / `NaN` from string-typed numeric inputs.
- **Input size bounds.** `delete_project.confirmation_phrase` and
  `search_issues.query` now have `.max()` constraints (200 / 500 chars).

### Changed

- **Server protocol identity is now `@uluops/ops-mcp`.** Three call sites
  still said `uluops-tracker-client` from before the package rename
  (`SecureMcpServer.create` name, internal config default, startup log).
  MCP host UIs now display the correct identity and bug reports can be
  correlated to the npm package name.
- **Verbose file logging defaults to `false`.** `ENABLE_FILE_LOGGING`,
  `VERBOSE_LOGGING`, and `LOG_PERFORMANCE_METRICS` previously defaulted
  to `true`, which created a `logs/` directory in every consumer's working
  directory without opt-in. All three now default `false`; opt in
  explicitly via env vars.
- **README rewritten for npm/npx consumers.** Installation section was
  the contributor `npm install` + `npm run build` workflow; now leads
  with `npx -y @uluops/ops-mcp` and `npm install -g @uluops/ops-mcp`.
  `.mcp.json` example uses the correct binary name (`uluops-ops-mcp`,
  not the stale `uluops-tracker-client`). Quick Start field names
  corrected (`agents`/`decision`/`agent`, not the pre-rename
  `validators`/`status`/`validator`).
- **Backend URL resolution deferred to the SDK.** Previously the MCP server
  shadowed `@uluops/ops-sdk`'s `DEFAULT_BASE_URL` with its own copy and
  enforced it as a required env var. The SDK already resolves the correct
  production URL by default; the MCP now passes `baseUrl` through unchanged.
  Public consumers no longer set anything but `ULUOPS_API_KEY`. README's
  configuration table reduced to consumer-relevant variables and `.mcp.json`
  examples slimmed to the single required key.
- **Documentation parity with 48 registered tools.** README previously
  documented 47 (off-by-one from `soft_delete_issue` addition) and
  4 stale tool names from the validator→agent rename (`list_validators`,
  `validate_features_list`, `get_validator_reliability`,
  `get_validator_matrix`). All corrected; 10 previously-undocumented
  tools added (the full Analysis Tools group plus `get_agent_lifecycle`,
  `soft_delete_issue`, and renames).
- **Six previously-undocumented environment variables documented**:
  `ULUOPS_ORG_SLUG`, `ULUOPS_TRACKER_RETRIES`, `ENABLE_FILE_LOGGING`,
  `LOG_DIR`, `VERBOSE_LOGGING`, `LOG_PERFORMANCE_METRICS`.
- **Graceful shutdown awaits server close.** `SIGINT`/`SIGTERM` handlers
  now `await Promise.race([server.close(), 2s timeout])` before
  `process.exit(0)` so in-flight tool responses can flush back through
  stdio.

### Added

- **API key fingerprint in startup log.** `apiKeyFingerprint(apiKey)`
  emits `ulr_…XXXX` (last 4 chars) so operators can distinguish which
  key the server loaded across multiple deployments without leaking
  the secret.
- **7 tests covering the 402 tier-gating error path** (`sdk-error-mapper.test.ts`)
  including happy path, `?source=mcp` vs `&source=mcp` upgrade-URL tracking,
  missing-details fallback, malformed-definitions tolerance,
  non-array/non-string defensive handling, and credential-not-leaked check.
- **`coerceNumericFields` boundary tests** verifying MCP JSON-RPC string-typed
  numerics are coerced and `Infinity`/`NaN` rejected.
- **`save_run` timestamp injection tests** verifying ISO-8601 timestamp is
  injected when the caller omits one and caller-supplied timestamps are
  preserved verbatim.

### Removed

- **Dead `config.server` stanza.** `ServerConfig` interface, the
  `server: { name, version: '1.0.0' }` block in `loadConfig`, and the
  matching test assertion. The static `'1.0.0'` was a pinned falsehood
  (package was at 0.2.0); the dynamic version path at `src/index.ts:22`
  reads from `package.json` and remains.
- **`ValidatorResultSchema` / `ValidatorResult` deprecated aliases**
  removed from `src/types/schemas.ts`. All consumers migrated to
  `AgentResultSchema` / `AgentResult`. Deprecation introduced post-rename
  in 0.2.0; alias dropped now to reduce surface.

### Internal

- 10 ESLint errors fixed (3× `restrict-template-expressions`,
  3× `no-deprecated`, 3× `no-unnecessary-type-assertion`,
  1× `no-unnecessary-type-assertion`). Lint now exits clean.
- Shared run-related schemas extracted to `src/types/run-schemas.ts`
  (`CategoryScoreSchema`, `ExplorationSectionSchema`,
  `ExplorationMapSchema`, `AnalysisRecordBaseSchema`,
  `AnalysisSummaryBaseSchema`). `save-run.ts` shrank 173 → 76 lines;
  `update-run.ts` shrank 167 → 80 lines.
- `main()` body extracted into `buildServerOptions()` plus
  `STARTUP_TOOL_GROUPS` / `STARTUP_RESOURCES` constants. Function body
  shrank 197 → 88 lines.
- `EXPECTED_TOOLS` unified to a single fixture
  (`src/__tests__/fixtures/expected-tools.ts`) consumed by both
  `tools-integration.test.ts` and `tool-registry.test.ts`.
- `createToolHandler` `preProcess` discriminates on a `Symbol`
  marker (`shortCircuit()`) instead of `'content' in result`
  duck-typing. Future tool schemas with top-level `content` fields
  no longer trigger an accidental error-response interpretation.
- `isNumericSchema` uses Zod's public `unwrap()` /
  `removeDefault()` API instead of accessing `_def.innerType`
  via `as any`. Stable across Zod minor versions.
- `list_agents` handler now guards SDK return shape with
  `Array.isArray` + a type predicate filter. Previously cast
  `data as Array<{ name: string }>` blind.
- `assertion` guarding `toolPoliciesPath` argument added to
  `index.test.ts` — the fix above would otherwise have no test
  coverage protecting it from refactor regression.
- Stale `tool-policies.json` CWD-fallback comment in `src/index.ts`
  replaced with an accurate description of the bundled-file lookup.
- LICENSE file added (MIT, matching sibling `@uluops/*` packages)
  and `LICENSE` added to `files[]`.
- CHANGELOG `[Unreleased]` compare base corrected from `v1.21.0`
  (pre-rename) to `v0.2.0` and `[0.2.0]` tag link added in 0.2.0
  release; this release adds `[0.2.1]` link.

### Test count

655 passing (up from 645 in 0.2.0). Net +10: +7 tier-gating, +2
`coerceNumericFields` boundary, +2 `save_run` timestamp, +2 ulr_
format validation, −5 retired (one `loadConfig` server-defaults
test deleted with the dead stanza, removed assertions migrated).

## [0.2.0] - 2026-06-05

First release under the scoped name `@uluops/ops-mcp`. Forward-ports the
operational drift from the legacy `uluops-ops-mcp-client` 1.22.0 codebase
and aligns the package with the broader UluOps supply-chain policy.

### Added

- **`soft_delete_issue` tool** — write-side tool for soft-deleting issues
  with standard 10KB/10KB size budgets and 60/min, 1000/hr rate limits.
  Brings total tool count to 48.
- **`add_issue_note` size relaxation** — `maxArgsSize` 50→80 KB and
  `maxEgressBytes` 20→100 KB. The MySQL `TEXT` content column tolerates
  64KB; the prior 20KB egress was too tight for stack-trace-heavy notes.

### Changed

- **`@uluops/ops-sdk` bumped `^2.0.0` → `3.1.0`** (two major versions).
  All tool source compiles unchanged against the new SDK surface.
- **All runtime and dev dependencies pinned to exact versions** — removed
  caret ranges across the board per the 2026-06-01 UluOps supply-chain
  hardening policy.

### Historical lineage (legacy `uluops-ops-mcp-client` versions below)

## [1.21.0] - 2026-05-21

### Changed
- Score field now optional/nullable across MCP schemas to support generator/executor agents

## [1.20.0] - 2026-05-20

### Changed
- `save_run` and `update_run` pass `{ _skipClientValidation: true }` to SDK — eliminates redundant double validation

### Fixed
- `edit_issue` tool aligned with SDK rename (`issues.edit()` → `issues.update()`)
- `ConflictError` details (`nextAvailable`, `status`) forwarded to MCP response
- Tool count assertions updated from 45 → 47

## [1.19.0] - 2026-05-18

### Fixed
- `ExplorationSection` schemas aligned with API discriminated union type

## [1.18.0] - 2026-05-11

### Added
- `get_agent_runs_analysis` MCP tool for per-agent analysis history
- `exploration_maps` on `save_run` and `update_run` tool schemas
- Per-agent analysis summary array on `save_run`

## [1.17.0] - 2026-05-10

### Added
- Per-agent analysis attribution on `update_run` tool
- `analysis_records` and `analysis_summary` exposed on `update_run` tool

## [1.16.0] - 2026-05-06

### Added
- `high` priority level added to MCP schemas

### Changed
- Legacy `ULUOPS_TRACKER_API_KEY`/`ULUOPS_TRACKER_URL` env var support removed

## [1.15.0] - 2026-05-03

### Added
- `get_agent_lifecycle` tool with `definition_version` on agent snapshots

### Fixed
- `save_features_list` references replaced with `save_run` in docs

## [1.14.0] - 2026-05-01

### Fixed
- `classified_by` enum value renamed from `validator` to `agent` in MCP schema

## [1.13.0] - 2026-04-28

### Added
- 402 `SubscriptionRequired` error handling with `source=mcp` tracking

## [1.12.0] - 2026-04-19

### Added
- `definition_id` field on `save_run` MCP tool input schema

## [1.11.0] - 2026-04-16

### Added
- `summary` field on `AgentResultSchema`

### Fixed
- `mcp-secure-server` upgraded to 0.0.13-security (UUID false-positive fix)

## [1.10.0] - 2026-04-15

### Added
- Detailed error diagnostics from `mcp-secure-server`

## [1.9.0] - 2026-04-12

### Added
- Session token authentication as alternative to API keys

## [1.8.0] - 2026-04-10

### Added
- `observation` as first-class issue status

### Changed
- Divergent taxonomy resource replaced with SDK-fetched data

## [1.7.0] - 2026-04-04

### Added
- Structured error context with tool name, type, and suggestions
- `recommendations` field on `update_run` tool

## [1.6.0] - 2026-03-29

### Added
- Org context support via `ULUOPS_ORG_SLUG` env var

### Fixed
- Error handling overhauled for actionable agent-facing messages
- Analysis record type enum enforced at MCP layer on `save_run`

## [1.5.0] - 2026-03-14

### Added
- Analysis query tools: `get_run_analysis`, `get_project_analysis`, `query_analysis_records`
- `analysis_records` and `analysis_summary` fields on `save_run`

### Fixed
- `get_project_analysis` uses project name instead of UUID

## [1.4.0] - 2026-03-08

### Changed
- `save_features_list` renamed to `save_run`
- `validator` renamed to `agent` across Zod schemas, tool descriptions, and tracker tools

### Fixed
- Test data updated for validators→agents schema rename
- String-typed numeric params coerced before Zod validation

## [1.3.0] - 2026-03-01

### Added
- Definition metadata enrichment and background registry sync

## [1.2.0] - 2026-02-15

### Changed
- `BackendApiClient` replaced with `@uluops/ops-sdk`
- Production URL default added so users only need API key

### Fixed
- 9 DX validator issues resolved
- 4 live-testing bugs in MCP tools fixed
- Missing `get_discovery` and `get_validator_matrix` tool specs added
- Deferred deprecation logging, `apiKey` validation, and tool description enrichment
- Post-implementation validation issues resolved

## [1.1.0] - 2026-02-07

### Added
- `false-positive` status added to issue lifecycle
- `IssueType` classification on MCP tool schemas
- Domain-specific issue types accepted
- Discovery timeline and validator-matrix analytics tools
- Burndown and velocity MCP tools

### Fixed
- `workflow_type` included in run update path
- Null `line_number` allowed in recommendation and issue inputs
- `type` field included in `createIssue` request body
- `run_id` sent in `X-Confirm-Delete` header instead of `'true'`

## [1.0.0] - 2026-01-19

### Added
- Core MCP tools (P0): `save_run`, `query_issues`, `update_status`, `get_project_summary`, `delete_project`
- Extended MCP tools (P1): `get_issue_details`, `get_run_details`, `diff_runs`, `archive_runs`, `get_analytics`, `search_issues`
- P2 MCP tools: 17 additional tools for full API coverage (projects, runs, issues, taxonomy)
- MCP resources for `validation://` URI scheme
- API client with retry logic and error mapping
- Structured logging with optional file output
- Configuration for `mcp-secure-server` framework
- Initial project setup with TypeScript, ESLint, Prettier, and Vitest

### Fixed
- Security limits increased for large validation payloads
- `id` field handling standardized in status update tools

[Unreleased]: https://github.com/Uluops/ops-uluops-mcp/compare/v0.4.7...HEAD
[0.4.7]: https://github.com/Uluops/ops-uluops-mcp/compare/v0.4.6...v0.4.7
[0.4.6]: https://github.com/Uluops/ops-uluops-mcp/compare/v0.4.5...v0.4.6
[0.4.5]: https://github.com/Uluops/ops-uluops-mcp/compare/v0.4.4...v0.4.5
[0.4.4]: https://github.com/Uluops/ops-uluops-mcp/compare/v0.4.3...v0.4.4
[0.4.3]: https://github.com/Uluops/ops-uluops-mcp/compare/v0.4.2...v0.4.3
[0.4.2]: https://github.com/Uluops/ops-uluops-mcp/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/Uluops/ops-uluops-mcp/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/Uluops/ops-uluops-mcp/compare/v0.3.1...v0.4.0
[0.3.1]: https://github.com/Uluops/ops-uluops-mcp/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/Uluops/ops-uluops-mcp/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/Uluops/ops-uluops-mcp/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/Uluops/ops-uluops-mcp/compare/v1.21.0...v0.2.0
[1.21.0]: https://github.com/Uluops/ops-uluops-mcp/compare/v1.20.0...v1.21.0
[1.20.0]: https://github.com/Uluops/ops-uluops-mcp/compare/v1.19.0...v1.20.0
[1.19.0]: https://github.com/Uluops/ops-uluops-mcp/compare/v1.18.0...v1.19.0
[1.18.0]: https://github.com/Uluops/ops-uluops-mcp/compare/v1.17.0...v1.18.0
[1.17.0]: https://github.com/Uluops/ops-uluops-mcp/compare/v1.16.0...v1.17.0
[1.16.0]: https://github.com/Uluops/ops-uluops-mcp/compare/v1.15.0...v1.16.0
[1.15.0]: https://github.com/Uluops/ops-uluops-mcp/compare/v1.14.0...v1.15.0
[1.14.0]: https://github.com/Uluops/ops-uluops-mcp/compare/v1.13.0...v1.14.0
[1.13.0]: https://github.com/Uluops/ops-uluops-mcp/compare/v1.12.0...v1.13.0
[1.12.0]: https://github.com/Uluops/ops-uluops-mcp/compare/v1.11.0...v1.12.0
[1.11.0]: https://github.com/Uluops/ops-uluops-mcp/compare/v1.10.0...v1.11.0
[1.10.0]: https://github.com/Uluops/ops-uluops-mcp/compare/v1.9.0...v1.10.0
[1.9.0]: https://github.com/Uluops/ops-uluops-mcp/compare/v1.8.0...v1.9.0
[1.8.0]: https://github.com/Uluops/ops-uluops-mcp/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/Uluops/ops-uluops-mcp/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/Uluops/ops-uluops-mcp/compare/v1.5.0...v1.6.0
[1.5.0]: https://github.com/Uluops/ops-uluops-mcp/compare/v1.4.0...v1.5.0
[1.4.0]: https://github.com/Uluops/ops-uluops-mcp/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/Uluops/ops-uluops-mcp/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/Uluops/ops-uluops-mcp/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/Uluops/ops-uluops-mcp/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/Uluops/ops-uluops-mcp/releases/tag/v1.0.0
