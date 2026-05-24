# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/Uluops/ops-uluops-mcp/compare/v1.21.0...HEAD
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
