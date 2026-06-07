/**
 * Configuration loader for @uluops/ops-mcp.
 *
 * Loads configuration from environment variables with sensible defaults.
 */

import type { UluopsTrackerConfig, LogLevel } from '../types/index.js';

const DEFAULT_TIMEOUT = 30000;
const DEFAULT_RETRIES = 3;
const DEFAULT_LOG_LEVEL: LogLevel = 'info';

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

  const config: UluopsTrackerConfig = {
    api: {
      baseUrl: apiUrl,
      apiKey,
      orgSlug,
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
          `ULUOPS_BASE_URL uses ${parsed.protocol} (not HTTPS). Your API key will be transmitted in cleartext. Set NODE_ENV=development to silence this warning for local testing.`,
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
 * without leaking the secret. Returns "ulr_…XXXX" using the last 4 chars.
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
      'API key is required. Set ULUOPS_API_KEY to a value starting with "ulr_" (min 20 chars).'
    );
  }

  if (!/^ulr_[A-Za-z0-9_-]{16,}$/.test(config.api.apiKey)) {
    throw new Error(
      'ULUOPS_API_KEY must start with "ulr_" and be at least 20 characters. Check for typos or leading whitespace.'
    );
  }

  if (config.api.timeout <= 0) {
    throw new Error('Timeout must be a positive number');
  }

  if (config.api.retries < 0) {
    throw new Error('Retries must be a non-negative number');
  }
}
