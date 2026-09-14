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
  /**
   * D15 (spec v0.1.14, security audit run #187): the orgs this server may
   * EVER target — explicit `org`, workspace file or env. `undefined` = unset =
   * unbounded (every org the key holder belongs to; the boot log warns).
   * `personal` is always allowed. Bounds, never defaults: D13 stands.
   */
  orgAllow?: string[];
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
