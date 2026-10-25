#!/usr/bin/env node
/**
 * @uluops/ops-mcp
 *
 * MCP server that enables Claude Code, Cursor, and other MCP hosts to
 * interact with the UluOps Platform API via @uluops/ops-sdk.
 */

import { SecureMcpServer } from 'mcp-secure-server';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { OpsClient, resolveWorkspaceOrg } from '@uluops/ops-sdk';
import { createRequire } from 'module';

import { loadConfig, validateConfig, apiKeyFingerprint } from './config/index.js';
import { toolRegistry } from './config/tool-registry.js';
import { buildServerOptions } from './config/server-options.js';
import { registerAllTools } from './tools/index.js';
import { registerAllResources } from './resources/index.js';
import { createLogger } from './utils/logger.js';
import { setOrgCallSink, setOrgAllowlist, setUnboundedOrgSink } from './utils/org-call-log.js';
import { setDestructiveMode, setDestructiveRefusalSink, toolRegistrationConfig, DESTRUCTIVE_ENV, DESTRUCTIVE_TOOLS } from './utils/destructive-gate.js';
import type { Logger } from './utils/logger.js';
import type { McpServerToolRegistration, ToolHandler } from './types/index.js';
import type { ZodRawShape } from 'zod';

// Read version from package.json dynamically
const require = createRequire(import.meta.url);
const { version } = require('../package.json') as { version: string };


/**
 * Wrap a tool-registration surface so every registered handler name is
 * recorded, then cross-check the recorded set against the ToolSpec registry.
 *
 * A handler with no matching ToolSpec is accepted here but rejected by
 * mcp-secure-server's semantic layer at first invocation with a bare
 * JSON-RPC -32602 (Invalid params) — a protocol-layer vocabulary that gives
 * the developer no route back to the file they forgot to edit. This check
 * surfaces the omission at boot, by name, in the registry's own terms.
 *
 * @param registeredNames - Tool names recorded at registration
 * @param specNames - Names in the ToolSpec registry (src/config/tool-registry.ts)
 * @param logger - Receives one warning per mismatch
 * @returns Names registered without a spec (`missingSpecs`) and specs with no handler (`orphanSpecs`)
 * @example
 * const { missingSpecs } = checkToolSpecParity(['save_run', 'new_tool'], ['save_run'], logger);
 * // missingSpecs = ['new_tool'] — would be refused with -32602 on first call
 *
 * @internal Boot-time diagnostic. Exported so `tool-spec-parity.test.ts` can exercise it; not part of the MCP surface and not a supported import. Stripped from the published `.d.ts` (`stripInternal`).
 */
export function checkToolSpecParity(
  registeredNames: readonly string[],
  specNames: readonly string[],
  logger: Pick<Logger, 'warn'>
): { missingSpecs: string[]; orphanSpecs: string[] } {
  const specSet = new Set(specNames);
  const registeredSet = new Set(registeredNames);
  const missingSpecs = registeredNames.filter((n) => !specSet.has(n));
  const orphanSpecs = specNames.filter((n) => !registeredSet.has(n));

  for (const name of missingSpecs) {
    logger.warn(
      `Tool handler '${name}' is registered but has no ToolSpec in src/config/tool-registry.ts — ` +
        `calls will be rejected at the protocol layer with -32602 (Invalid params). ` +
        `Add a ToolSpec entry (sideEffects, maxArgsSize, maxEgressBytes, quotas).`
    );
  }
  for (const name of orphanSpecs) {
    logger.warn(
      `ToolSpec '${name}' in src/config/tool-registry.ts has no registered handler — ` +
        `stale entry, or the handler registration in src/tools/index.ts was missed.`
    );
  }

  return { missingSpecs, orphanSpecs };
}

/**
 * Resources surfaced in the startup log. Short and stable; parity is covered
 * by resources tests. (The tool listing that used to sit beside this was
 * hand-maintained and had silently drifted to 48 of the 51 registered tools —
 * its own docblock still claimed "count assertion: 48" — omitting, among
 * others, this release's new preview_update_run. It is now DERIVED from the
 * recorded registrations at the log site; a list that does not exist cannot
 * drift.)
 */
const STARTUP_RESOURCES = [
  'validation://projects',
  'validation://projects/{project}',
  'validation://taxonomy',
] as const;


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

  const orgDefault = ((): { org: string | undefined; source: string; path?: string; error?: string } => {

    try {

      return resolveWorkspaceOrg({ cwd: process.cwd(), env: process.env });

    } catch (err) {

      return { org: undefined, source: 'invalid' as const, error: err instanceof Error ? err.message : String(err) };

    }

  })();

  // Per-call org provenance → the structured log (security audit run #187 F8).

  setOrgCallSink((record) => { logger.info('tool call org', { ...record }); });

  // Spec v0.2.0 D4: per-call warning while ULUOPS_ORG_ALLOW is unset.
  setUnboundedOrgSink((w) => { logger.warn('tool call org is unbounded: ULUOPS_ORG_ALLOW is unset', { ...w }); });

  // D15: bound the orgs this process may ever target. Unset = unbounded, and

  // that is worth a warning every boot — the key is unbound and the `org`

  // argument is model-chosen, so without a list every member org is reachable.

  setOrgAllowlist(config.api.orgAllow);

  if (config.api.orgAllow === undefined) {

    logger.warn('ULUOPS_ORG_ALLOW is not set: this server may target ANY org the key holder is a member of (D15). Set it in the registration to bound that.');

  }

  // Spec v0.2.0 D1: destructive tools are armed unless the operator disarms
  // them. Unset is warned every boot, like the allowlist above; an explicit
  // `true` is a choice and is not.
  setDestructiveMode(config.api.destructive);
  setDestructiveRefusalSink((tool) => { logger.warn('destructive tool refused: disabled by operator', { tool, code: 'DESTRUCTIVE_NOT_ARMED' }); });
  if (config.api.destructive === 'default') {
    logger.warn(`${DESTRUCTIVE_ENV} is not set: these destructive tools are enabled — ${[...DESTRUCTIVE_TOOLS].join(', ')}. Set ${DESTRUCTIVE_ENV}=false in the registration to disable them (pipelines that use update_status / bulk_update_status / update_run / archive_runs will then be refused), or =true to silence this warning.`);
  }

  logger.info('Starting @uluops/ops-mcp server', {

    // Where org-less calls will land, and why. `cwd` is the SESSION LAUNCH

    // directory (S11): a session that wanders into another repo keeps this

    // default until relaunched; the per-call `org` argument is the override.

    orgDefault: orgDefault.org ?? 'personal',

    orgSource: orgDefault.source,

    orgAllow: config.api.orgAllow === undefined ? '(unbounded)' : config.api.orgAllow.join(','),

    destructive: config.api.destructive,

    ...(orgDefault.path !== undefined ? { orgFile: orgDefault.path } : {}),

    ...(orgDefault.error !== undefined ? { orgError: orgDefault.error } : {}),

    cwd: process.cwd(),
    version,
    apiUrl: config.api.baseUrl ?? '(SDK default)',
    apiKeyFingerprint: apiKeyFingerprint(config.api.apiKey),
  });

  // validateConfig guarantees apiKey matches /^ulr_.../, so it is always an API key.
  const opsClient = new OpsClient({
    baseUrl: config.api.baseUrl,
    apiKey: config.api.apiKey,
    // NOT orgSlug here (spec §3.3 / D13): the org is resolved PER CALL by the
    // tool handler (explicit > nearest .uluops.json above this process's launch
    // directory > ULUOPS_ORG_SLUG > personal). A constructor-level org could not
    // be undone by a workspace file that says "personal", so the env fallback
    // lives in the resolver instead. config.api.orgSlug is logged only.
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

  // Register all tools and resources.
  // The recording wrapper captures every handler name so the handler set can
  // be cross-checked against toolRegistry below — the two registrations live
  // in separate files joined only by string name, and a missing ToolSpec
  // otherwise surfaces only as -32602 at first invocation.
  const registeredToolNames: string[] = [];
  const recordingServer: McpServerToolRegistration = {
    tool: (name: string, description: string, schema: ZodRawShape, handler: ToolHandler): void => {
      registeredToolNames.push(name);
      // registerTool(), the SDK's current API (tool() is @deprecated). Same
      // registration: description + raw Zod shape as inputSchema; SecureMcpServer
      // wraps the handler for Layer 5 exactly as it does for tool(). Through
      // 0.21.x the advertised tools/list was byte-identical to the tool() form;
      // since 0.22.0 it is not — `config` also carries annotations (spec v0.2.1
      // D3, derived from the tool registry) and, for five tools, `_meta` (D5).
      // SecureMcpServer passes `config` through unchanged; tools-wire.test.ts
      // guards that path against the built server.
      server.registerTool(name, toolRegistrationConfig(name, description, schema), handler);
    },
  };
  registerAllTools(recordingServer, opsClient);
  registerAllResources(server, opsClient);

  checkToolSpecParity(
    registeredToolNames,
    toolRegistry.map((spec) => spec.name),
    logger
  );

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

  // Tool inventory DERIVED from the recorded registrations — see the
  // STARTUP_RESOURCES docblock for why the hand-maintained grouping is gone.
  logger.info('MCP server connected and ready', {
    toolCount: registeredToolNames.length,
    tools: [...registeredToolNames].sort(),
    resources: STARTUP_RESOURCES,
  });
}

/**
 * @internal Exported for `index.test.ts` only; the package is run as the `uluops-ops-mcp`
 * bin, not imported. Stripped from the published `.d.ts` (`stripInternal`).
 */
export { main };

// Run main function (skip in test environment)
if (process.env.NODE_ENV !== 'test') {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Failed to start MCP server:', message);
    process.exit(1);
  });
}
