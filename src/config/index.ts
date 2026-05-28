/**
 * Configuration loader for uluops-tracker MCP client
 *
 * Loads configuration from environment variables with sensible defaults.
 */

import type { UluopsTrackerConfig, LogLevel } from '../types/index.js';

const DEFAULT_BASE_URL = 'https://api.uluops.ai/api/v1';
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

  const apiUrl = process.env['ULUOPS_BASE_URL'] ?? DEFAULT_BASE_URL;
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
    server: {
      name: 'uluops-tracker-client',
      version: '1.0.0',
    },
    security: {
      logLevel: parseLogLevel(process.env['LOG_LEVEL']),
      enableLogging: parseBoolean(process.env['ENABLE_FILE_LOGGING'], true),
      logDir: process.env['LOG_DIR'],
      verboseLogging: parseBoolean(process.env['VERBOSE_LOGGING'], true),
      logPerformanceMetrics: parseBoolean(process.env['LOG_PERFORMANCE_METRICS'], true),
    },
  };

  return { config, warnings };
}

/**
 * Validate that required configuration is present and well-formed.
 */
export function validateConfig(config: UluopsTrackerConfig): void {
  if (!config.api.baseUrl) {
    throw new Error('API base URL is required');
  }

  // Validate URL format
  try {
    new URL(config.api.baseUrl);
  } catch {
    throw new Error(`Invalid API URL: ${config.api.baseUrl}`);
  }

  if (config.api.apiKey === undefined || config.api.apiKey === '') {
    throw new Error(
      'API key is required. Set ULUOPS_API_KEY'
    );
  }

  if (config.api.timeout <= 0) {
    throw new Error('Timeout must be a positive number');
  }

  if (config.api.retries < 0) {
    throw new Error('Retries must be a non-negative number');
  }
}
