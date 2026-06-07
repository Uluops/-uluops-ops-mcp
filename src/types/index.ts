/**
 * Type exports for uluops-tracker MCP client
 *
 * API types are now provided by @uluops/ops-sdk.
 * This barrel exports only MCP protocol types, config types, and Zod schemas.
 */

// Configuration types
export type {
  LogLevel,
  ApiClientConfig,
  SecurityConfig,
  UluopsTrackerConfig,
} from './config.js';

// MCP types
export type { McpTextContent, McpToolResponse } from './mcp.js';
export { createSuccessResponse, createErrorResponse } from './mcp.js';

// Server types
export type {
  ToolHandler,
  ResourceContent,
  ResourceResponse,
  ResourceHandler,
  ResourceMetadata,
  McpServerToolRegistration,
  McpServerResourceRegistration,
  McpServer,
} from './server.js';

// Shared Zod schemas for runtime validation
export {
  PrioritySchema,
  PriorityFilterSchema,
  SeveritySchema,
  IssueStatusSchema,
  IssueStatusFilterSchema,
  FailureDomainSchema,
  ConfidenceSchema,
  ClassifierSchema,
  NoteTypeSchema,
  MergeStrategySchema,
  AnalysisRecordTypeSchema,
  IssueTypeSchema,
  FilePathSchema,
  // Shared validation schemas
  TokenUsageSchema,
  AgentResultSchema,
  RecommendationSchema,
  ValidationSummarySchema,
} from './schemas.js';
