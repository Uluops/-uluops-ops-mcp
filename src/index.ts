#!/usr/bin/env node
/**
 * @uluops/ops-mcp
 *
 * MCP server that enables Claude Code, Cursor, and other MCP hosts to
 * interact with the UluOps Platform API via @uluops/ops-sdk.
 */

import { SecureMcpServer } from 'mcp-secure-server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { OpsClient } from '@uluops/ops-sdk';
import { createRequire } from 'module';

import { loadConfig, validateConfig, apiKeyFingerprint } from './config/index.js';
import { toolRegistry } from './config/tool-registry.js';
import { registerAllTools } from './tools/index.js';
import { registerAllResources } from './resources/index.js';
import { createLogger } from './utils/logger.js';

// Read version from package.json dynamically
const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

// Resolve the bundled tool-policies.json file shipped with this package.
// Without this, mcp-secure-server falls back to CWD / ~/.config — which
// does NOT contain the bundled policies for npx / global-install consumers.
const TOOL_POLICIES_PATH = require.resolve('../tool-policies.json');

/**
 * Tool groups surfaced in the startup log. Kept in sync with src/tools/index.ts;
 * a drift between this listing and the actual registration is caught by
 * src/__tests__/tools-integration.test.ts (count assertion: 48).
 */
const STARTUP_TOOL_GROUPS = {
  p0_core: [
    'save_run',
    'query_issues',
    'update_status',
    'get_project_summary',
    'delete_project',
  ],
  p1_extended: [
    'get_issue_details',
    'get_run_details',
    'diff_runs',
    'archive_runs',
    'get_analytics',
    'search_issues',
    'list_agents',
    'get_agent_lifecycle',
    'validate_run',
    'get_issue_history',
    'add_issue_note',
    'edit_issue',
    'merge_issues',
    'bulk_update_status',
    'update_run',
    'get_agent_reliability',
    'create_issue',
  ],
  p2_projects: [
    'list_projects',
    'get_project',
    'get_project_trends',
    'create_project',
    'update_project',
    'soft_delete_project',
    'restore_project',
  ],
  p2_runs: ['get_run', 'list_runs', 'get_latest_run', 'delete_run'],
  p2_issues: [
    'get_issue_by_fingerprint',
    'update_issue_by_fingerprint',
    'restore_issue',
    'soft_delete_issue',
    'undo_issue_status',
  ],
  p2_analysis: [
    'get_run_analysis',
    'get_project_analysis',
    'query_analysis_records',
    'get_agent_runs_analysis',
  ],
  p2_taxonomy: [
    'get_taxonomy',
    'get_full_taxonomy_analytics',
    'get_burndown',
    'get_velocity',
    'get_discovery',
    'get_agent_matrix',
  ],
} as const;

const STARTUP_RESOURCES = [
  'validation://projects',
  'validation://projects/{project}',
  'validation://taxonomy',
] as const;

/**
 * Build SecureMcpServer options.
 *
 * Extracted from main() to keep the entry point readable and to make the
 * configuration block testable in isolation. Defaults are tuned for
 * Claude Code's parallel tool call patterns; tier-gating policy lives in
 * the bundled tool-policies.json (TOOL_POLICIES_PATH).
 */
function buildServerOptions(
  security: { enableLogging: boolean; verboseLogging: boolean; logPerformanceMetrics: boolean },
): Parameters<typeof SecureMcpServer.create>[1] {
  return {
    toolPoliciesPath: TOOL_POLICIES_PATH,

    // Use 'basic' preset with higher rate limits for parallel validation workflows
    securityLevel: 'basic',
    maxRequestsPerMinute: 120,

    // Override maxMessageSize for large validation payloads (default 'basic' is 100KB).
    // Large workflows with many recommendations + raw_markdown can exceed 100KB.
    maxMessageSize: 500 * 1024, // 500KB

    // Override maxParamCount for save_run which can have many nested parameters:
    // agents × fields + recommendations × fields. With 70 issues × 15 fields +
    // 8 agents × 10 fields = 1150+ params. Set to 3000 to support up to ~150
    // issues in validation runs.
    maxParamCount: 3000,

    // Behavior layer tuned for Claude Code usage patterns:
    // - Validation workflows issue 10-30 parallel calls in short bursts
    // - Calls cluster in <2s bursts, then pause for "thinking" periods
    // - Claude Code IS automation, but trusted — disable bot detection
    burstThreshold: 15, // Covers 90% of parallel query/update scenarios
    burstWindowMs: 5000, // 5s window resets between thinking periods
    automationDetection: {
      enabled: false, // Disable — Claude Code is trusted automation
    },

    // Tool registry — required for semantic validation layer
    toolRegistry,

    // Default policy — allow writes since this is a validation tracker
    defaultPolicy: {
      allowWrites: true,
      allowNetwork: true,
    },

    // Resource policy — allow our custom validation:// scheme
    resourcePolicy: {
      allowedSchemes: ['validation'],
    },

    // Error diagnostics — propagate redacted reasons in error.message so callers
    // (humans, LLMs, logs) can see what failed without digging into the data
    // envelope. Set ENABLE_DETAILED_ERRORS=false to suppress for tightened
    // production deployments.
    enableDetailedErrors: process.env['ENABLE_DETAILED_ERRORS'] !== 'false',

    // Logging configuration
    enableLogging: security.enableLogging,
    verboseLogging: security.verboseLogging,
    logPerformanceMetrics: security.logPerformanceMetrics,
  };
}

/**
 * Main entry point for the @uluops/ops-mcp server.
 */
async function main(): Promise<void> {
  // Load and validate configuration
  const { config, warnings } = loadConfig();
  validateConfig(config);

  // Initialize logger with full config object
  const logger = createLogger({
    level: config.security.logLevel,
    enableFileLogging: config.security.enableLogging,
    logDir: config.security.logDir,
  });

  // Emit deferred deprecation warnings through structured logger
  for (const warning of warnings) {
    logger.warn(warning);
  }

  logger.info('Starting @uluops/ops-mcp server', {
    version,
    apiUrl: config.api.baseUrl ?? '(SDK default)',
    apiKeyFingerprint: apiKeyFingerprint(config.api.apiKey),
  });

  // Detect auth type: ulr_ prefix = API key, otherwise = session token
  const isApiKey = config.api.apiKey?.startsWith('ulr_');
  const opsClient = new OpsClient({
    baseUrl: config.api.baseUrl,
    ...(isApiKey ? { apiKey: config.api.apiKey } : { sessionToken: config.api.apiKey }),
    orgSlug: config.api.orgSlug,
    timeout: config.api.timeout,
    retries: config.api.retries,
  });

  // Create MCP server with security configuration optimized for Claude Code's
  // parallel tool call patterns. Options live in buildServerOptions() for
  // testability and to keep main() readable.
  const server = await SecureMcpServer.create(
    {
      name: '@uluops/ops-mcp',
      version,
    },
    buildServerOptions(config.security),
  );

  // Register all tools and resources
  registerAllTools(server, opsClient);
  registerAllResources(server, opsClient);

  // Setup graceful shutdown. Awaits server.close() so any in-flight tool call
  // response can flush back through the stdio transport before exit. Capped
  // at 2 seconds to avoid hanging if the transport is wedged.
  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}, shutting down gracefully`);
    try {
      await Promise.race([
        server.close(),
        new Promise<void>((resolve) => setTimeout(resolve, 2000)),
      ]);
    } catch (error) {
      logger.warn('Error during server.close()', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
    process.exit(0);
  };

  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });

  // Handle uncaught errors
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught exception', {
      error: error.message,
      stack: error.stack,
    });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('Unhandled rejection', { reason: String(reason) });
    process.exit(1);
  });

  // Connect stdio transport and start serving
  // Type assertion needed: StdioServerTransport from @modelcontextprotocol/sdk
  // has a slightly different type signature than mcp-secure-server expects.
  // Both implement the same Transport protocol at runtime; this is a compile-time
  // type variance issue only. Using Parameters<> extracts the expected type.
  const transport = new StdioServerTransport();
  await server.connect(transport);

  logger.info('MCP server connected and ready', {
    tools: STARTUP_TOOL_GROUPS,
    resources: STARTUP_RESOURCES,
  });
}

// Export main for testing
export { main };

// Run main function (skip in test environment)
if (process.env.NODE_ENV !== 'test') {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Failed to start MCP client:', message);
    process.exit(1);
  });
}
