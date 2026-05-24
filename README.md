# Uluops Tracker MCP Client

MCP (Model Context Protocol) client for the uluops-tracker API. Provides **47 tools** and **3 resources** (2 functional, 1 template placeholder) that enable Claude Code to interact with the uluops-tracker backend API.

## Design Philosophy

**Thin Client Pattern**: This MCP client contains **zero business logic**. All data processing, validation, storage, and analytics are handled by the backend API. The client's sole responsibility is protocol translation between MCP's stdio-based JSON-RPC and the backend's REST API.

## Installation

Requires **Node.js 18** or later.

```bash
npm install
npm run build
```

## Configuration

Create a `.env` file based on `.env.example`:

```bash
cp .env.example .env
```

Required environment variables:

| Variable | Description | Required |
|----------|-------------|----------|
| `ULUOPS_BASE_URL` | Backend API URL (preferred) | Yes |
| `ULUOPS_API_KEY` | API authentication key (must start with `ulr_`, min 20 chars) | Yes |
| `ULUOPS_TRACKER_TIMEOUT` | Request timeout (ms) | No (default: 30000) |
| `LOG_LEVEL` | Logging level | No (default: info) |

## Usage with Claude Code

Add to your Claude Code MCP configuration (`.mcp.json`):

**Option 1: Using installed binary** (recommended after `npm link` or global install)
```json
{
  "mcpServers": {
    "uluops-tracker": {
      "command": "uluops-tracker-client",
      "args": [],
      "env": {
        "ULUOPS_BASE_URL": "http://localhost:3100/api/v1",
        "ULUOPS_API_KEY": "ulr_your-api-key-here"
      }
    }
  }
}
```

**Option 2: Using node directly** (for development)
```json
{
  "mcpServers": {
    "uluops-tracker": {
      "command": "node",
      "args": ["/path/to/uluops-tracker-mcp-client/dist/index.js"],
      "env": {
        "ULUOPS_BASE_URL": "http://localhost:3100/api/v1",
        "ULUOPS_API_KEY": "ulr_your-api-key-here"
      }
    }
  }
}
```

## Quick Start Examples

Once configured, Claude Code can use the uluops tracker tools:

```typescript
// Save validation results from a workflow run
save_run({
  project: "my-project",
  workflow_type: "ship",
  validators: [{ name: "code-validator", score: 85, status: "PASS" }],
  recommendations: [{ validator: "code-validator", title: "Fix lint error", priority: "suggested" }]
})

// Query open issues for a project
query_issues({ project: "my-project", status: "open", priority: "critical" })

// Get project summary with issue counts and trends
get_project_summary({ project: "my-project" })
```

## Rate Limiting Configuration

This client uses [mcp-secure-server](https://github.com/anthropics/mcp-secure-server) with configuration optimized for Claude Code's usage patterns.

### Claude Code Usage Patterns

| Operation | Typical Parallel Calls | Notes |
|-----------|------------------------|-------|
| Query context (summary, issues, runs) | 3-5 | Low burst |
| Create issues from validation workflow | 10-30 | High burst |
| Update validators with metrics | 6 | Medium burst |
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
| `get_analytics` | Cross-project analytics (8 metric types available) |
| `search_issues` | Search issues across projects with relevance ranking |
| `list_validators` | List canonical validators from manifest |
| `validate_features_list` | Preview save operation without modifying database |
| `get_issue_history` | Full issue history with changes between runs |
| `add_issue_note` | Add context, resolution, or blocker notes to issues |
| `edit_issue` | Edit issue metadata (title, file_path, severity, etc.) |
| `merge_issues` | Merge duplicate issues into a target issue |
| `bulk_update_status` | Bulk update multiple issue statuses in one transaction |
| `update_run` | Update run metadata post-hoc (tokens, scores, timestamps) |
| `get_validator_reliability` | Analyze validator effectiveness and reliability scores |

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
| `undo_issue_status` | Undo the last status change on an issue |

### Taxonomy Tools (P2)
| Tool | Description |
|------|-------------|
| `get_taxonomy` | Get the failure taxonomy schema (domains, modes, severities) |
| `get_full_taxonomy_analytics` | Get full taxonomy analytics with distribution by domain |
| `get_burndown` | Get taxonomy burndown with time series and trend analysis per failure domain |
| `get_velocity` | Get velocity metrics per failure mode with sparkline data and trend reliability |
| `get_discovery` | Get discovery timeline showing new vs recurring issues over time |
| `get_validator_matrix` | Get validator-taxonomy coverage matrix with blind spot detection |

## Available Resources

MCP resources provide read-only access to validation data via the `validation://` URI scheme.

| Resource | URI | Description |
|----------|-----|-------------|
| Projects | `validation://projects` | List all tracked projects |
| Project Summary | `validation://projects/{project}` | Template placeholder (use `get_project_summary` tool) |
| Taxonomy | `validation://taxonomy` | Failure taxonomy schema for classifying issues |

### Resource Usage

```typescript
// List all projects (returns JSON array of project names)
read_resource("validation://projects")

// Get the failure taxonomy schema (domains, modes, severity codes)
read_resource("validation://taxonomy")
```

**Note:** For project-specific data, use the `get_project_summary` tool instead of resources. MCP resource templates with parameters are not fully supported by the SDK.

## Development

**Note:** This project uses a local file dependency for `mcp-secure-server` (see `package.json`). Ensure the sibling project exists at `../../ongoing-projects/mcp-secure-server` before running `npm install`.

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
