/**
 * Configuration loader for @uluops/ops-mcp.
 *
 * Loads configuration from environment variables with sensible defaults.
 */

import type { UluopsTrackerConfig, LogLevel, DestructiveMode } from '../types/index.js';

const DEFAULT_TIMEOUT = 30000;
const DEFAULT_RETRIES = 3;
const DEFAULT_LOG_LEVEL: LogLevel = 'info';

/** Where consumers obtain and manage API keys. Surfaced in auth error messages. */
const API_KEYS_URL = 'https://app.uluops.ai/settings/api-keys';

/**
 * Parse a log level string, returning a valid LogLevel.
 * @param value - Raw string from environment variable
 * @returns Valid LogLevel, defaults to 'info' if undefined or invalid
 */
function parseLogLevel(value: string | undefined): LogLevel {
  const validLevels: LogLevel[] = ['debug', 'info', 'warn', 'error'];
  if (value !== undefined && value !== '' && validLevels.includes(value as LogLevel)) {
    return value as LogLevel;
  }
  return DEFAULT_LOG_LEVEL;
}

/**
 * Parse a boolean environment variable ('true'/'1' = true).
 * @param value - Raw string from environment variable
 * @param defaultValue - Value to return if undefined
 * @returns Parsed boolean or default
 */
function parseBoolean(value: string | undefined, defaultValue: boolean): boolean {
  if (value === undefined) return defaultValue;
  return value.toLowerCase() === 'true' || value === '1';
}

/**
 * Parse an integer environment variable (base 10).
 * @param value - Raw string from environment variable
 * @param defaultValue - Value to return if undefined or NaN
 * @returns Parsed integer or default
 */
function parseInteger(value: string | undefined, defaultValue: number): number {
  if (value === undefined) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/** Same pattern as the SDK's ORG_SLUG_PATTERN (not exported from its root); a slug is a header value. */
const ORG_SLUG_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/;

/**
 * `ULUOPS_ORG_ALLOW` — D15. Comma-separated slugs; whitespace tolerated;
 * `personal` may be listed but is implied. Unset or empty → `undefined`
 * (unbounded). An invalid slug REFUSES TO START: an allowlist that silently
 * dropped a misspelt entry would silently widen the bound.
 *
 * @param raw - The raw `ULUOPS_ORG_ALLOW` value
 * @returns The slugs, or `undefined` when unset or empty
 * @throws Error listing every invalid slug
 */
export function parseOrgAllow(raw: string | undefined): string[] | undefined {
  if (raw === undefined) return undefined;
  const entries = raw.split(',').map((e) => e.trim()).filter((e) => e !== '');
  if (entries.length === 0) return undefined;
  const bad = entries.filter((e) => e !== 'personal' && !ORG_SLUG_PATTERN.test(e));
  if (bad.length > 0) {
    throw new Error(`ULUOPS_ORG_ALLOW contains invalid org slug(s): ${bad.map((b) => JSON.stringify(b)).join(', ')} — 1-100 alphanumeric characters, hyphens, or underscores, comma-separated`);
  }
  return [...new Set(entries.filter((e) => e !== 'personal'))];
}

/**
 * `ULUOPS_ALLOW_DESTRUCTIVE` — spec v0.2.0 D1. Unset or empty → `default`
 * (armed, and the boot log says how to disarm); `true`/`1` → `armed`;
 * `false`/`0` → `disarmed`. Anything else REFUSES TO START, for the same
 * reason as `parseOrgAllow`: a typo in a disarm (`flase`) that silently
 * read as armed would leave the operator believing the gate is shut.
 *
 * @param raw - The raw `ULUOPS_ALLOW_DESTRUCTIVE` value
 * @returns The resolved mode
 * @throws Error naming the value and the accepted spellings
 */
export function parseAllowDestructive(raw: string | undefined): DestructiveMode {
  const v = raw?.trim().toLowerCase();
  if (v === undefined || v === '') return 'default';
  if (v === 'true' || v === '1') return 'armed';
  if (v === 'false' || v === '0') return 'disarmed';
  throw new Error(`ULUOPS_ALLOW_DESTRUCTIVE must be true, false, 1 or 0 (got ${JSON.stringify(raw)})`);
}

/**
 * Load configuration from environment variables.
 *
 * @returns Object with `config` and `warnings` (deprecation messages for deferred logging)
 */
export function loadConfig(): { config: UluopsTrackerConfig; warnings: string[] } {
  const warnings: string[] = [];

  // ULUOPS_BASE_URL is optional. When unset, OpsClient falls back to
  // @uluops/ops-sdk's DEFAULT_BASE_URL (prod by default, localhost when
  // NODE_ENV=development).
  const apiUrl = process.env['ULUOPS_BASE_URL'];
  const apiKey = process.env['ULUOPS_API_KEY'];

  const orgSlug = process.env['ULUOPS_ORG_SLUG'];
  const orgAllow = parseOrgAllow(process.env['ULUOPS_ORG_ALLOW']);

  const config: UluopsTrackerConfig = {
    api: {
      baseUrl: apiUrl,
      apiKey,
      orgSlug,
      ...(orgAllow !== undefined ? { orgAllow } : {}),
      destructive: parseAllowDestructive(process.env['ULUOPS_ALLOW_DESTRUCTIVE']),
      timeout: parseInteger(process.env['ULUOPS_TRACKER_TIMEOUT'], DEFAULT_TIMEOUT),
      retries: parseInteger(process.env['ULUOPS_TRACKER_RETRIES'], DEFAULT_RETRIES),
    },
    security: {
      logLevel: parseLogLevel(process.env['LOG_LEVEL']),
      enableLogging: parseBoolean(process.env['ENABLE_FILE_LOGGING'], false),
      logDir: process.env['LOG_DIR'],
      verboseLogging: parseBoolean(process.env['VERBOSE_LOGGING'], false),
      logPerformanceMetrics: parseBoolean(process.env['LOG_PERFORMANCE_METRICS'], false),
    },
  };

  // Warn on non-HTTPS base URL outside development — ULUOPS_API_KEY would be
  // transmitted in cleartext. Only checks when the operator explicitly set
  // a URL; the SDK default is HTTPS in prod.
  if (apiUrl !== undefined) {
    try {
      const parsed = new URL(apiUrl);
      if (parsed.protocol !== 'https:' && process.env['NODE_ENV'] !== 'development') {
        warnings.push(
          `ULUOPS_BASE_URL uses ${parsed.protocol} (not HTTPS). Your API key would be transmitted in cleartext. The SDK accepts plain HTTP only for localhost, 127.0.0.1, [::1] and RFC1918 IPv4 literals and refuses any other host at startup; for those local targets, set NODE_ENV=development to silence this warning.`,
        );
      }
    } catch {
      // URL parse failure is handled in validateConfig with a clearer error.
    }
  }

  return { config, warnings };
}

/**
 * Build a short, redacted fingerprint for the API key so operators can
 * distinguish which key the server loaded across multiple deployments
 * without leaking the secret.
 *
 * @param apiKey - The loaded key, if any
 * @returns `"ulr_…XXXX"` from the last 4 chars, or `"unknown"` for a missing/short key
 */
export function apiKeyFingerprint(apiKey: string | undefined): string {
  if (apiKey === undefined || apiKey.length < 4) return 'unknown';
  return `ulr_…${apiKey.slice(-4)}`;
}

/**
 * Validate that required configuration is present and well-formed.
 *
 * `baseUrl` is optional — when undefined, OpsClient falls back to
 * `@uluops/ops-sdk`'s `DEFAULT_BASE_URL` (prod by default, localhost
 * when `NODE_ENV=development`). When set, it must be a valid URL.
 *
 * @param config - The result of loadConfig()
 * @throws Error naming the missing or malformed setting (never the key value)
 */
export function validateConfig(config: UluopsTrackerConfig): void {
  if (config.api.baseUrl !== undefined) {
    try {
      new URL(config.api.baseUrl);
    } catch {
      throw new Error(`Invalid API URL: ${config.api.baseUrl}`);
    }
  }

  if (config.api.apiKey === undefined || config.api.apiKey === '') {
    throw new Error(
      `API key is required. Set ULUOPS_API_KEY to a value starting with "ulr_" (min 20 chars). Get one at ${API_KEYS_URL}.`
    );
  }

  if (!/^ulr_[A-Za-z0-9_-]{16,}$/.test(config.api.apiKey)) {
    throw new Error(
      `ULUOPS_API_KEY must start with "ulr_" and be at least 20 characters. Check for typos or leading whitespace. Manage your keys at ${API_KEYS_URL}.`
    );
  }

  if (config.api.timeout <= 0) {
    throw new Error(`ULUOPS_TRACKER_TIMEOUT must be a positive number (got ${String(config.api.timeout)}).`);
  }

  if (config.api.retries < 0) {
    throw new Error(`ULUOPS_TRACKER_RETRIES must be a non-negative number (got ${String(config.api.retries)}).`);
  }
}
