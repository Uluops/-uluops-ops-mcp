/**
 * SecureMcpServer options for @uluops/ops-mcp.
 *
 * Moved out of index.ts (2026-10-25) so tests can build the exact production
 * options without starting the server. message-limits.test.ts runs a largest
 * valid save_run through a real pipeline built from these options.
 */

import { createRequire } from 'module';
import type { SecureMcpServer } from 'mcp-secure-server';
import { toolRegistry } from './tool-registry.js';
import { MESSAGE_LIMITS } from './message-limits.js';

const require = createRequire(import.meta.url);

// Resolve the bundled tool-policies.json file shipped with this package.
// Without this, mcp-secure-server falls back to CWD / ~/.config — which
// does NOT contain the bundled policies for npx / global-install consumers.
// (Two levels up: this module builds to dist/config/.)
export const TOOL_POLICIES_PATH = require.resolve('../../tool-policies.json');

/**
 * Build SecureMcpServer options.
 *
 * Extracted from main() to keep the entry point readable and to make the
 * configuration block testable in isolation. Defaults are tuned for
 * Claude Code's parallel tool call patterns; tier-gating policy lives in
 * the bundled tool-policies.json (TOOL_POLICIES_PATH).
 */
export function buildServerOptions(
  security: { enableLogging: boolean; verboseLogging: boolean; logPerformanceMetrics: boolean },
): Parameters<typeof SecureMcpServer.create>[1] {
  return {
    toolPoliciesPath: TOOL_POLICIES_PATH,

    // Use 'basic' preset with higher rate limits for parallel validation workflows
    securityLevel: 'basic',
    maxRequestsPerMinute: 120,

    // Transport size limits, derived from what the tracker API ingests. The
    // derivation and what breaks if they drift: config/message-limits.ts.
    ...MESSAGE_LIMITS,

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
