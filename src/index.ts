#!/usr/bin/env node
/**
 * Uluops Tracker MCP Client
 *
 * Thin protocol adapter that enables Claude Code to interact with
 * the uluops-tracker backend API via MCP, using @uluops/ops-sdk.
 */

import { SecureMcpServer } from 'mcp-secure-server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { OpsClient } from '@uluops/ops-sdk';
import { createRequire } from 'module';

import { loadConfig, validateConfig } from './config/index.js';
import { toolRegistry } from './config/tool-registry.js';
import { registerAllTools } from './tools/index.js';
import { registerAllResources } from './resources/index.js';
import { createLogger } from './utils/logger.js';

// Read version from package.json dynamically
const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };

/**
 * Main entry point for uluops-tracker MCP client
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

  logger.info('Starting uluops-tracker MCP client', {
    version,
    apiUrl: config.api.baseUrl,
  });

  // Initialize SDK client (replaces hand-rolled BackendApiClient)
  // Detect auth type: ulr_ prefix = API key, otherwise = session token
  const isApiKey = config.api.apiKey?.startsWith('ulr_');
  const opsClient = new OpsClient({
    baseUrl: config.api.baseUrl,
    ...(isApiKey ? { apiKey: config.api.apiKey } : { sessionToken: config.api.apiKey }),
    orgSlug: config.api.orgSlug,
    timeout: config.api.timeout,
    retries: config.api.retries,
  });

  // Create MCP server with security configuration
  // Optimized for Claude Code's parallel tool call patterns
  // Uses create() factory to load tool-policies.json from TOOL_POLICIES_PATH
  const server = await SecureMcpServer.create(
    {
      name: 'uluops-tracker-client',
      version,
    },
    {
      // Use 'basic' preset with higher rate limits for parallel validation workflows
      securityLevel: 'basic',
      maxRequestsPerMinute: 120,

      // Override maxMessageSize for large validation payloads (default 'basic' is 100KB)
      // Large workflows with many recommendations + raw_markdown can exceed 100KB
      maxMessageSize: 500 * 1024, // 500KB

      // Override maxParamCount for save_run which can have
      // many nested parameters: agents × fields + recommendations × fields
      // With 70 issues × 15 fields + 8 agents × 10 fields = 1150+ params
      // Set to 3000 to support up to ~150 issues in validation runs
      maxParamCount: 3000,

      // Behavior layer tuned for Claude Code usage patterns:
      // - Validation workflows issue 10-30 parallel calls in short bursts
      // - Calls cluster in <2s bursts, then pause for "thinking" periods
      // - Claude Code IS automation, but trusted - disable bot detection
      burstThreshold: 15, // Covers 90% of parallel query/update scenarios
      burstWindowMs: 5000, // 5s window resets between thinking periods
      automationDetection: {
        enabled: false, // Disable - Claude Code is trusted automation
      },

      // Tool registry - required for semantic validation layer
      toolRegistry,

      // Default policy - allow writes since this is a validation tracker
      defaultPolicy: {
        allowWrites: true,
        allowNetwork: true,
      },

      // Resource policy - allow our custom validation:// scheme
      resourcePolicy: {
        allowedSchemes: ['validation'],
      },

      // Error diagnostics — propagate redacted reasons in error.message
      // so callers (humans, LLMs, logs) can see what failed without
      // digging into the data envelope
      enableDetailedErrors: true,

      // Logging configuration
      enableLogging: config.security.enableLogging,
      verboseLogging: config.security.verboseLogging,
      logPerformanceMetrics: config.security.logPerformanceMetrics,
    }
  );

  // Register all tools and resources
  registerAllTools(server, opsClient);
  registerAllResources(server, opsClient);

  // Setup graceful shutdown
  const shutdown = (signal: string): void => {
    logger.info(`Received ${signal}, shutting down gracefully`);
    process.exit(0);
  };

  process.on('SIGINT', () => {
    shutdown('SIGINT');
  });
  process.on('SIGTERM', () => {
    shutdown('SIGTERM');
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
  await server.connect(transport as Parameters<typeof server.connect>[0]);

  logger.info('MCP server connected and ready', {
    tools: {
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
        'undo_issue_status',
      ],
      p2_taxonomy: [
        'get_taxonomy',
        'get_full_taxonomy_analytics',
        'get_burndown',
        'get_velocity',
        'get_discovery',
        'get_agent_matrix',
      ],
    },
    resources: [
      'validation://projects',
      'validation://projects/{project}',
      'validation://taxonomy',
    ],
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
