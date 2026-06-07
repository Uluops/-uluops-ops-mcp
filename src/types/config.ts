/**
 * Configuration types for uluops-tracker MCP client
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ApiClientConfig {
  /**
   * Base URL for the UluOps Platform API. Optional — when undefined, the
   * SDK's `DEFAULT_BASE_URL` is used (prod by default; localhost when
   * `NODE_ENV=development`).
   */
  baseUrl?: string;
  /** API key for authentication */
  apiKey?: string;
  /** Org slug for multi-tenancy — sets X-Org-Slug header on all requests */
  orgSlug?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout: number;
  /** Number of retry attempts (default: 3) */
  retries: number;
}

export interface SecurityConfig {
  /** Log level for structured logging */
  logLevel: LogLevel;
  /** Enable file logging */
  enableLogging: boolean;
  /** Directory for log files */
  logDir?: string;
  /** Enable verbose security decision logging */
  verboseLogging: boolean;
  /** Enable performance metrics logging */
  logPerformanceMetrics: boolean;
}

export interface UluopsTrackerConfig {
  api: ApiClientConfig;
  security: SecurityConfig;
}
