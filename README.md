**[UluOps](https://uluops.ai)** · The operations layer for agentic work

---

# @uluops/ops-mcp

[![npm version](https://img.shields.io/npm/v/@uluops/ops-mcp.svg)](https://www.npmjs.com/package/@uluops/ops-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/node/v/@uluops/ops-mcp)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue.svg)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen)](src/__tests__/)

MCP (Model Context Protocol) server for the UluOps tracker API — runs, findings, issues, analytics, the project log (`get_project_log`, `get_log_stat`) and org management (`rehome_project`, `get_org_audit_feed`). Provides **55 tools** and **3 resources** (2 functional, 1 template placeholder) that let Claude Code, Claude Desktop, Codex, Cursor and other MCP hosts read and write the tracker.

## Analysis type attribution (Unreleased)

`save_run`, `update_run` and their preview schemas accept `agent_type` on analysis records and summaries. Use `agent_name` on each typed row in a multi-agent run. Registered agents are checked against their exact saved execution version; an explicit conflicting type is rejected. Unregistered agents may declare their type. Analysis reads retain the captured type, source and definition ID/version. `get_project_analysis` and `query_analysis_records` accept `agent_type: "unknown"` for unresolved or historical inferred attribution. The F02 API and SDK must ship together in the coordinated release.

## Table of Contents

- [Design Philosophy](#design-philosophy)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage with Claude Code](#usage-with-claude-code)
- [Quick Start Examples](#quick-start-examples)
- [Rate Limiting Configuration](#rate-limiting-configuration)
- [Available Tools](#available-tools)
- [Available Resources](#available-resources)
- [Development](#development)
- [License](#license)

## Design Philosophy

**Thin Client Pattern**: This MCP server contains **zero business logic**. All data processing, validation, storage, and analytics are handled by the backend API. The server's sole responsibility is protocol translation between MCP's stdio-based JSON-RPC and the backend's REST API.

## Installation

Requires **Node.js 18** or later.

**Option A — npx (no install):**

```bash
npx -y @uluops/ops-mcp
```

**Option B — global install:**

```bash
npm install -g @uluops/ops-mcp
```

This exposes the `uluops-ops-mcp` binary on your PATH.

After upgrading, restart the tracker MCP connection in your host so it loads the
new server and tool schemas.

### Agent metrics transport

`save_run`, `validate_run` and `update_run` preserve each agent's `harness` and
the optional `cached_input_tokens`, `reasoning_output_tokens`, `thinking_tokens`
and `tool_tokens` counters. For save/validate, counters belong in the agent's
`tokens` object; for update, they are flat agent fields. Supply only observed
components: missing measurements should not be invented as zero.

SDK 6.5.2 also preserves the API's optional, nullable `modelRaw` alongside the
normalized `model` in saved and retrieved agent snapshots.

## Configuration

Set environment variables in your MCP host configuration (see "Usage with Claude Code" below) or in a `.env` file when developing locally.

| Variable | Description | Required |
|----------|-------------|----------|
| `ULUOPS_API_KEY` | API authentication key (must start with `ulr_`, min 20 chars). Create and manage keys at [app.uluops.ai/settings/api-keys](https://app.uluops.ai/settings/api-keys) | Yes |
| `ULUOPS_ORG_SLUG` | Lowest-precedence org default (see *Which org a call lands in*) | No |
| `ULUOPS_ORG_ALLOW` | Comma-separated orgs this server may EVER target. Unset = unbounded, warned at boot | No (set it) |
| `ULUOPS_TRACKER_TIMEOUT` | Request timeout (ms) | No (default: 30000) |
| `ULUOPS_TRACKER_RETRIES` | Number of retry attempts on failure | No (default: 3) |
| `ULUOPS_BASE_URL` | Override the backend API base URL (e.g. a local or staging deployment). Non-HTTPS values log a cleartext-credentials warning | No (default: `@uluops/ops-sdk`'s production URL) |
| `NODE_ENV` | When `development`, `@uluops/ops-sdk` **defaults the base URL to localhost** if `ULUOPS_BASE_URL` is unset, and the non-HTTPS warning is silenced. Unset it (or set `ULUOPS_BASE_URL`) if tool calls unexpectedly target localhost | No |
| `LOG_LEVEL` | Logging level (`debug`, `info`, `warn`, `error`) | No (default: info) |

The backend URL is handled automatically by `@uluops/ops-sdk` — production by default; set `ULUOPS_BASE_URL` only when targeting a non-production deployment.

### Which org a call lands in

Every tool takes an optional `org` (slug) → `X-Org-Slug` on that request. Omit it and the server
resolves a default **per call**: the nearest `.uluops.json` above the process's launch directory
(`{ "org": "ulu-labs" }` at the root of a work checkout; `{ "org": "personal" }` in a personal repo
nested under it stops the walk — the walk never rises above your home directory and a file owned by
another user is refused), else `ULUOPS_ORG_SLUG`, else no org override. Bound keys resolve to
their bound org; unbound credentials may use a personal default. The API never infers an org
from a project name. The first result block keeps the data payload; a second JSON block reports
`requestedContext: { orgSlug, source }` separately from `effectiveContext: { version: 1,
orgSlug, source }`. Requested sources are `explicit`, `workspace`, `environment`, or `omitted`;
effective sources are `bound-key`, `request`, or `personal-default`. Old/malformed server
metadata yields `effectiveContext: null` with an unavailable note, while successful data stays
usable. Error results retain same-response context when available, without asserting that a
write committed. Logs describe the requested scope, not proof of the destination. The file may carry only `org`, `project` and `$schema` (the `@uluops/ops-sdk` ≥ 6.5.0
allowlist); anything else is refused. The startup log line names the resolved default and its source.

**The `org` value must come from the user.** Tool results carry text written by other tracker users
(issue notes, recommendations, descriptions) and come back indistinguishable from the operator's
words; every tool's `org` description says so, every successful result ends with a notice saying
so, and `ULUOPS_ORG_ALLOW` bounds what the server will accept regardless: an org outside the list —
whether it came from the argument, the workspace file or the env — is refused before any request
with a terminal `ORG_NOT_ALLOWED` that names the list. `personal` is always allowed. Leave it unset
and every org the key holder belongs to is reachable; the boot log warns. The bound covers **both
orgs of a two-org call**: `rehome_project`'s `target_org` is checked against the same list before
any request, so the server can neither read from nor move a project *into* an org the operator
excluded.

Five refusals are terminal and say so in the tool result: `INSUFFICIENT_ORG_ROLE` (your role in
that org is below `publisher` — do **not** retry without `org`, which changes the requested scope),
`ORG_ACCESS_DENIED` (not a member, or a bound key), `ORG_NOT_FOUND` and `ORG_SUSPENDED` (the named
org does not resolve / is suspended — same rule, do not drop `org`), and `PROJECT_REHOMED` (the
project moved orgs; the result names the org to pass). `ORG_NOT_ALLOWED` is the server-side sixth.

**Moving a project between orgs** is `rehome_project` — the member path of the spec's §4.1. Two
arguments name two orgs and both the description and the `org` field's own schema text say which
is which: `org` is where the project is *now* (the API looks it up there — omit it for a work-org
project and it looks in the resolved default org, moves a same-named project if
one lives there, and otherwise 404s; never a search), `target_org` is where it goes. Every result's
context block includes `requestedContext`, `effectiveContext`, and `targetOrg: "ulu-labs"`, and the per-call log
record carries `targetOrg`. A `same_org` 400 means "already there" and the result says so
(`terminal`, `applied: false`, with the API's `orgSlug`) — but note it is the idempotence signal
of the *admin* path only: the member path looks the project up in the **source**, so a re-run after
the move answers **404**, and the 404 text says so and tells the model to check the target with
`get_project` before doing anything else. The other refusals name their reason too
(`name_collision`, `soft_deleted_conflict`, `rehomed_away_conflict`, `project_soft_deleted`,
`export_in_progress`, `moved_during_request`, …) and a 402 `PROJECT_LIMIT` is described as the
target's cap, not a subscription gate. What moved, and who moved it into a personal org, is
readable by any member through `get_org_audit_feed` — **minus the operator's free-text `reason`**,
which this server never relays (spec §4.4a: it is text written by one member and read by another,
one line away from an instruction); the CLI, read by a human, shows it.

### Advanced Logging

By default this server logs only to stderr at `info` level. To enable structured file logging, set:

| Variable | Description | Default |
|----------|-------------|---------|
| `ENABLE_FILE_LOGGING` | Write JSON logs to disk | `false` |
| `LOG_DIR` | Directory for log files | `logs` |
| `VERBOSE_LOGGING` | Include extra diagnostic detail | `false` |
| `LOG_PERFORMANCE_METRICS` | Emit per-call timing metrics | `false` |

When `ENABLE_FILE_LOGGING=true`, a `logs/` directory is created in the process's working directory.

### Production Tightening

| Variable | Description | Default |
|----------|-------------|---------|
| `ENABLE_DETAILED_ERRORS` | Propagate redacted error reasons in `error.message` so callers can diagnose failures without parsing the data envelope. Set to `false` to suppress in tightened production deployments. | `true` |

## Usage with Claude Code

Add to your Claude Code MCP configuration (`.mcp.json`):

**Option 1: npx (lowest friction — no install)**
```json
{
  "mcpServers": {
    "uluops-ops": {
      "command": "npx",
      "args": ["-y", "@uluops/ops-mcp"],
      "env": {
        "ULUOPS_API_KEY": "ulr_your-api-key-here"
      }
    }
  }
}
```

**Option 2: Globally installed binary**
```json
{
  "mcpServers": {
    "uluops-ops": {
      "command": "uluops-ops-mcp",
      "args": [],
      "env": {
        "ULUOPS_API_KEY": "ulr_your-api-key-here"
      }
    }
  }
}
```


## Usage with Claude Desktop and Codex

The same server and env vars work in any MCP host; only the config file differs.

**Claude Desktop** — `claude_desktop_config.json` (macOS: `~/Library/Application Support/Claude/`):
```json
{
  "mcpServers": {
    "uluops-ops": {
      "command": "npx",
      "args": ["-y", "@uluops/ops-mcp"],
      "env": { "ULUOPS_API_KEY": "ulr_your-api-key-here" }
    }
  }
}
```
A Dock-launched Claude Desktop does not inherit a shell's `nvm` PATH; if `npx` is not found, put the absolute path from `which npx` in `command`.

**Codex** — `~/.codex/config.toml`:
```toml
[mcp_servers.uluops-ops]
command = "npx"
args = ["-y", "@uluops/ops-mcp"]
env = { ULUOPS_API_KEY = "ulr_your-api-key-here" }
```

## Quick Start Examples

Once configured, Claude Code can use the uluops tracker tools. These are MCP tool invocations (issued by the MCP host), not runnable TypeScript:

```text
// Save a run — the findings a pipeline produced against the project
save_run({
  project: "my-project",
  workflow_type: "ship",
  agents: [
    { name: "code-validator", score: 85, decision: "PASS" },
    // Scoreless agents (generators, executors) omit score and max_score —
    // do not fabricate a score. They are stored as null, not 0/100.
    { name: "aristotle-generator", decision: "ACTUALIZED" }
  ],
  recommendations: [
    { agent: "code-validator", title: "Fix lint error", priority: "suggested" },
    // Two agents, one adjudicated defect: give both rows the same cluster_key
    // (≤64 chars) so the tracker records within-run convergence instead of
    // two unrelated findings. Omit it when the pipeline has no adjudicating stage.
    { agent: "security-analyst", title: "Refresh token replayable", priority: "high", cluster_key: "auth-refresh-replay" },
    { agent: "circumvention-forecaster", title: "Refresh token reusable after rotation", priority: "high", cluster_key: "auth-refresh-replay" }
  ]
})

// Query open issues for a project
query_issues({ project: "my-project", status: "open", priority: "critical" })

// Get project summary with issue counts and trends
get_project_summary({ project: "my-project" })

// Consolidate a duplicate project into the canonical one.
// ALWAYS dry_run first — the merge is durable (no undo). The preview reports
// exactly what would move (runs, issues, dedupes) without changing anything.
merge_projects({ source: "-my-project", target: "@org/my-project", dry_run: true })
merge_projects({ source: "-my-project", target: "@org/my-project" }) // execute

// Enrich a saved run with analysis data. Analysis writes are PER-AGENT:
// under the default replace, each named agent's entire live set is superseded
// by these rows and omitting a record RETIRES it; under
// record_write_mode: "merge", matched (agent_name, record_id) keys are
// superseded, unmatched keys append, and nothing is retired. Preview first
// when updating an agent that already has records — would_retire_record_ids
// shows what a replace omission would destroy, without writing anything.
preview_update_run({
  project: "my-project", run_number: 5,
  analysis_records: [{ agent_name: "nietzsche-analyst", record_type: "convention",
                       record_id: "C-1", title: "Inherited convention", data: {} }]
})
update_run({
  project: "my-project", run_number: 5,
  analysis_records: [{ agent_name: "nietzsche-analyst", record_type: "convention",
                       record_id: "C-1", title: "Inherited convention", data: {} }]
})
```

```text
// The project's second history — runs and decisions interleaved, newest first
get_project_log({ project: "my-project", kind: ["decision", "regression"], limit: 20 })
// The rollup: examined / found / decided / cameBack for the last 30 days
get_log_stat({ project: "my-project" })

// Analytics and the failure taxonomy
get_taxonomy({})
get_burndown({ project: "my-project" })

// Org management — move a project to another org, then read the org's activity
rehome_project({ project: "my-project", target_org: "ulu-labs", reason: "work project, wrong org" })
get_org_audit_feed({ limit: 20 })
```

If an analysis-bearing `update_run` fails with `AnalysisEchoMismatchError`, the
update **was already applied** — the error means server and SDK disagree about
analysis-write semantics, not that the write failed. Do **not** retry (a retry
re-applies the write); re-read the run (`get_run_analysis`) instead.

## Rate Limiting Configuration

This server uses `mcp-secure-server` with configuration optimized for Claude Code's usage patterns.

### Claude Code Usage Patterns

| Operation | Typical Parallel Calls | Notes |
|-----------|------------------------|-------|
| Query context (summary, issues, runs) | 3-5 | Low burst |
| Create issues from validation workflow | 10-30 | High burst |
| Update agents with metrics | 6 | Medium burst |
| Save a run (`recommendations[]`) | 1 (with array) | Single call |

Claude Code issues tool calls in short, intense bursts (<2s) followed by "thinking" pauses. The default configuration accounts for this:

```typescript
{
  securityLevel: 'basic',
  maxRequestsPerMinute: 120,
  burstThreshold: 15,        // Covers 90% of parallel operations
  burstWindowMs: 5000,       // 5s window resets between thinking periods
  automationDetection: {
    enabled: false,          // Claude Code is trusted automation
  },
}
```

### Why These Settings

- **`burstThreshold: 15`** - Handles typical validation workflow bursts (10-15 parallel issue creates or queries)
- **`burstWindowMs: 5000`** - Short window resets between Claude's "thinking" periods, preventing false positives
- **`automationDetection: disabled`** - Claude Code IS automation with consistent timing patterns; detecting it as a "bot" would block legitimate use

### Payload Size Limits

`save_run`, `update_run`, and `preview_update_run` carry the largest payloads on the surface — long `raw_markdown` reports, plus 40+ recommendations with per-agent analysis summaries (the preview accepts the same analysis payload the write does). `mcp-secure-server` enforces payload size at several independent layers, and the defaults (tuned for small tool calls) sit far below the per-tool `maxArgsSize`. This server raises each to a common ceiling so the per-tool limit is the one that actually governs:

```typescript
{
  maxMessageSize: 500 * 1024,        // Layer 1 whole-message envelope
  maxStringLength: 128 * 1024,       // Layer 1 per-string cap (raw_markdown)
  maxParamBytes: 500 * 1024,         // Layer 2 serialized-params cap
  suspiciousMessageSize: 500 * 1024, // Layer 3 large-message block
  maxParamCount: 3000,               // supports ~150 issues per run
}
```

The per-tool `maxArgsSize` (2 MB for `save_run`) and the 500 KB message envelope remain the effective gates. When a payload is rejected, the error names which cap fired — for a per-string rejection, it names the offending field path (e.g. `raw_markdown`) and notes that `maxStringLength` is a separate, lower cap than the tool's `maxArgsSize` — so the fix (shorten a field vs. split the call) is unambiguous.

## Available Tools

### Core Tools (P0)
| Tool | Description |
|------|-------------|
| `save_run` | Save validation pipeline output with issue correlation |
| `query_issues` | Query issues with filtering by status, priority, validator |
| `update_status` | Update issue status (completed, deferred, wontfix) |
| `get_project_summary` | Get project overview with workflow and validator stats |
| `delete_project` | Delete project data (requires confirmation) |

### Extended Tools (P1)
| Tool | Description |
|------|-------------|
| `create_issue` | Create a user-submitted issue directly (outside validation runs) |
| `get_issue_details` | Full issue lifecycle with occurrences, notes, history |
| `get_run_details` | Run information with all recommendations and stats |
| `diff_runs` | Compare two validation runs (fixed, new, unchanged issues) |
| `archive_runs` | Archive old runs without deletion |
| `get_analytics` | Cross-project analytics (8 metric types; `cross_project_patterns` returns `[]` — placeholder until pattern aggregation ships) |
| `search_issues` | Search issues across projects with relevance ranking |
| `list_agents` | List canonical agents from manifest |
| `validate_run` | Preview save operation without modifying database |
| `get_issue_history` | Merged audit-event stream (occurrences, status, notes) as an envelope `{issueId, events[], totalEvents, truncated}` — includes undo tombstones (v0.4.0+) |
| `add_issue_note` | Add context, resolution, or blocker notes to issues |
| `edit_issue` | Edit issue metadata (title, file_path, severity, etc.) |
| `merge_issues` | Merge duplicate issues into a target issue |
| `bulk_update_status` | Bulk update multiple issue statuses in one transaction |
| `update_run` | Update run metadata post-hoc (tokens, scores, timestamps); per-agent analysis writes — replace (default) or merge via `record_write_mode`; analysis-bearing responses carry the `analysisWrite` echo (camelCase response key) |
| `preview_update_run` | Read-only preview of an analysis-bearing update under the requested mode: per agent, what the write would supersede, create, and (replace only) retire |
| `get_agent_reliability` | Analyze agent effectiveness: false-positive, declined (wontfix) and resolution rates plus reliability score |
| `get_agent_lifecycle` | Lifecycle metrics for an agent across runs |

### Project Tools (P2)
| Tool | Description |
|------|-------------|
| `list_projects` | List all active projects |
| `get_project` | Get a single project by ID or name |
| `get_project_trends` | Get issue trends over time for a project |
| `create_project` | Create a new project |
| `update_project` | Update a project name |
| `soft_delete_project` | Soft delete a project (can be restored later) |
| `restore_project` | Restore a soft-deleted project |
| `update_profile` | Update the authenticated user's profile (username, name, bio, timezone, websiteUrl). Setting `username` confirms it **one-time** — required before creating or publishing registry definitions |
| `merge_projects` | Merge one project into another — runs and issues re-keyed into the target, colliding issues deduplicated by fingerprint, source soft-deleted. Durable (no undo) — always `dry_run` first |
| `rehome_project` | Move a project and its whole history into another org (project-org-routing-and-rehome §4.1). **`org` is the SOURCE** (where the project is now), `target_org` the destination; admin/owner in both. The old `(org, name)` becomes a `410 PROJECT_REHOMED` tombstone, not a fork; reversible by moving back. Member path only — the platform-admin path is session-only (D20) and has no tool |
| `get_org_audit_feed` | Read an org's member-visible audit feed (D19): today, projects that left the org for someone's personal org — who, when, where to. `org` names the org whose feed to read (required in effect). Each re-home entry carries a one-line `summary`; the operator's `reason` is redacted; page with `next_cursor` (limit 1–100) |

### Log Tools — the project's second history (ulu log)
| Tool | Description |
|------|-------------|
| `get_project_log` | One page of the project log: `run` (what was examined), `decision` (what was decided, with reasons) and `regression` (what a run re-detected) events interleaved newest first; keyset-paged — pass `nextCursor` back as `cursor`. Filters: `since`/`until`, `limit` 1–500, `kind[]`, `workflow_type` (runs only), `agent`, `include_archived`. Never collapsed. Read it right: `reason: null` = no reason recorded (the ledger's silence, not a person's); `source: null` = unattributed, never "human"; a `regression` came back via a **run** (`viaRunNumber`), a `resolved → open` decision with no run was *reopened by decision*; a run's `counts: null` = saved before counts were recorded |
| `get_log_stat` | The rollup — examined / found / decided / cameBack / activity — for `project` when given, else for the org the call resolves to (`org`, else the workspace default, else your personal org — looked up, never guessed). Two frames on two clocks: `decided` is the *current* status of the window's findings (sums to `found.issues`; `completed` is what the CLI prints as "fixed"), `activity` is what changed in the window by ledger time (`byStatus.open` = reopens). The org rollup adds `projects[]` (capped at 100, `hasMoreProjects`) and `computedAt` — it is cached 60 s server-side |

Both read through `@uluops/ops-sdk` ≥ 6.5.0 and echo the SDK's parsed shapes (camelCase). Inputs are
snake_case as on every tool here. This release also moves the server's `.uluops.json` reader to the
6.5.0 allowlist (`org`, `project`, `$schema`): a checkout whose workspace file carries `project`
(read by `ulu log`) no longer makes this server refuse every call in that tree.

### Run Tools (P2)
| Tool | Description |
|------|-------------|
| `get_run` | Get a run by UUID |
| `list_runs` | List runs for a project |
| `get_latest_run` | Get the latest run for a project |
| `delete_run` | Delete a run (requires confirmation) |

### Issue Tools (P2)
| Tool | Description |
|------|-------------|
| `get_issue_by_fingerprint` | Get an issue by its SHA-256 fingerprint |
| `update_issue_by_fingerprint` | Update an issue status by its fingerprint |
| `restore_issue` | Restore a soft-deleted issue |
| `soft_delete_issue` | Soft delete an issue (can be restored later) |
| `undo_issue_status` | Undo the last status change on an issue |

### Taxonomy Tools (P2)
| Tool | Description |
|------|-------------|
| `get_taxonomy` | Get the failure taxonomy schema (domains, modes, severities) |
| `get_full_taxonomy_analytics` | Get full taxonomy analytics with distribution by domain |
| `get_burndown` | Get taxonomy burndown with time series and trend analysis per failure domain |
| `get_velocity` | Get velocity metrics per failure mode with sparkline data and trend reliability |
| `get_discovery` | Get discovery timeline showing new vs recurring issues over time |
| `get_agent_matrix` | Get agent-taxonomy coverage matrix with blind spot detection. `minIssues` filters rows by total qualifying issues per agent (default 5). `effectiveMinIssues` and `eligibility` explain the applied threshold and excluded rows. Single-point/overlap analysis uses canonical modes before threshold filtering; non-canonical codes are returned separately as `shadowModes` |

### Analysis Tools (P2)
| Tool | Description |
|------|-------------|
| `get_run_analysis` | Structured analysis records for a single run (decision, scoring, findings) |
| `get_project_analysis` | Aggregated analysis records across all runs in a project |
| `query_analysis_records` | Query analysis records by type, classification, severity |
| `get_agent_runs_analysis` | Per-run analysis records grouped by agent |

## Available Resources

MCP resources provide read-only access to validation data via the `validation://` URI scheme.

| Resource | URI | Description |
|----------|-----|-------------|
| Projects | `validation://projects` | List all tracked projects |
| Project Summary | `validation://projects/{project}` | Template placeholder (use `get_project_summary` tool) |
| Taxonomy | `validation://taxonomy` | Failure taxonomy schema for classifying issues |

### Resource Usage

```text
// List all projects (returns JSON array of project names)
read_resource("validation://projects")

// Get the failure taxonomy schema (domains, modes, severity codes)
read_resource("validation://taxonomy")
```

**Note:** For project-specific data, use the `get_project_summary` tool instead of resources. MCP resource templates with parameters are not fully supported by the SDK.

## Development

```bash
# Install dependencies
npm install

# Development mode with watch
npm run dev

# Run tests
npm test

# Type checking
npm run typecheck

# Linting
npm run lint

# Build for production
npm run build
```

## License

MIT


### Exact report replay checks (F20)

New submissions can explicitly select report comparison:

```json
{"project":"example","workflow_type":"explore","idempotency_key":"submission-1","idempotency_contract":"report-v2","agents":[{"name":"explorer","decision":"TRACED"}],"recommendations":[],"raw_markdown":"Report bytes"}
```

The SDK checks server capability support before writing. Omission retains `legacy-v1`,
which excludes report text; response `idempotency.excludedFields` makes that explicit.
V2 compares exact bytes, including newlines; omitted/null reports are equivalent.
The same key cannot change contracts or accepted payload. Refusals are `not_applied`;
read the original run before choosing a new key for an intentional new submission.
The accepted hash remains unchanged by later token enrichment. Supply an explicit
key for harness retries (the tool still defaults the timestamp on each call).
