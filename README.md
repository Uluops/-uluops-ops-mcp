**[UluOps](https://uluops.ai)** · Operating Intelligence as Infrastructure

---

# @uluops/ops-mcp

[![npm version](https://img.shields.io/npm/v/@uluops/ops-mcp.svg)](https://www.npmjs.com/package/@uluops/ops-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/node/v/@uluops/ops-mcp)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7+-blue.svg)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/tests-passing-brightgreen)](src/__tests__/)

MCP (Model Context Protocol) server for the UluOps Platform API. Provides **48 tools** and **3 resources** (2 functional, 1 template placeholder) that enable Claude Code, Cursor, and other MCP hosts to interact with the UluOps Platform.

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

## Configuration

Set environment variables in your MCP host configuration (see "Usage with Claude Code" below) or in a `.env` file when developing locally.

| Variable | Description | Required |
|----------|-------------|----------|
| `ULUOPS_API_KEY` | API authentication key (must start with `ulr_`, min 20 chars). Create and manage keys at [app.uluops.ai/settings/api-keys](https://app.uluops.ai/settings/api-keys) | Yes |
| `ULUOPS_ORG_SLUG` | Organization slug for multi-org contexts | No |
| `ULUOPS_TRACKER_TIMEOUT` | Request timeout (ms) | No (default: 30000) |
| `ULUOPS_TRACKER_RETRIES` | Number of retry attempts on failure | No (default: 3) |
| `LOG_LEVEL` | Logging level (`debug`, `info`, `warn`, `error`) | No (default: info) |

The backend URL is handled automatically by `@uluops/ops-sdk` — production by default, no configuration needed.

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


## Quick Start Examples

Once configured, Claude Code can use the uluops tracker tools. These are MCP tool invocations (issued by the MCP host), not runnable TypeScript:

```text
// Save validation results from a workflow run
save_run({
  project: "my-project",
  workflow_type: "ship",
  agents: [
    { name: "code-validator", score: 85, decision: "PASS" },
    // Scoreless agents (generators, executors) omit score and max_score —
    // do not fabricate a score. They are stored as null, not 0/100.
    { name: "aristotle-generator", decision: "ACTUALIZED" }
  ],
  recommendations: [{ agent: "code-validator", title: "Fix lint error", priority: "suggested" }]
})

// Query open issues for a project
query_issues({ project: "my-project", status: "open", priority: "critical" })

// Get project summary with issue counts and trends
get_project_summary({ project: "my-project" })
```

## Rate Limiting Configuration

This server uses `mcp-secure-server` with configuration optimized for Claude Code's usage patterns.

### Claude Code Usage Patterns

| Operation | Typical Parallel Calls | Notes |
|-----------|------------------------|-------|
| Query context (summary, issues, runs) | 3-5 | Low burst |
| Create issues from validation workflow | 10-30 | High burst |
| Update agents with metrics | 6 | Medium burst |
| Save recommendations | 1 (with array) | Single call |

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
| `update_run` | Update run metadata post-hoc (tokens, scores, timestamps) |
| `get_agent_reliability` | Analyze agent effectiveness and reliability scores |
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
| `get_agent_matrix` | Get agent-taxonomy coverage matrix with blind spot detection |

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
