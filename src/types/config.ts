/**
 * Configuration types for uluops-tracker MCP client
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ApiClientConfig {
  /** Base URL for the uluops-tracker API */
  baseUrl: string;
  /** API key for authentication */
  apiKey?: string;
  /** Org slug for multi-tenancy — sets X-Org-Slug header on all requests */
  orgSlug?: string;
  /** Request timeout in milliseconds (default: 30000) */
  timeout: number;
  /** Number of retry attempts (default: 3) */
  retries: number;
}

export interface ServerConfig {
  /** MCP server name */
  name: string;
  /** MCP server version */
  version: string;
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
  server: ServerConfig;
  security: SecurityConfig;
}
