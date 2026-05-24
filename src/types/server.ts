/**
 * MCP Server interface types
 *
 * Defines the interface for SecureMcpServer to avoid using generic Function type.
 */

import type { ZodRawShape } from 'zod';
import type { McpToolResponse } from './mcp.js';

/**
 * Tool handler function signature
 */
export type ToolHandler = (args: unknown) => Promise<McpToolResponse>;

/**
 * Resource content item in MCP resource response
 */
export interface ResourceContent {
  uri: string;
  mimeType?: string;
  text?: string;
  blob?: string;
}

/**
 * Resource response format returned by resource handlers
 */
export interface ResourceResponse {
  contents: ResourceContent[];
}

/**
 * Resource handler function signature
 */
export type ResourceHandler = () => Promise<ResourceResponse>;

/**
 * Resource metadata for registration
 */
export interface ResourceMetadata {
  description?: string;
  mimeType?: string;
}

/**
 * Interface for MCP server tool registration
 */
export interface McpServerToolRegistration {
  tool: (name: string, description: string, schema: ZodRawShape, handler: ToolHandler) => void;
}

/**
 * Interface for MCP server resource registration
 *
 * Supports two overloads:
 * - resource(name, uri, handler)
 * - resource(name, uri, metadata, handler)
 */
export interface McpServerResourceRegistration {
  resource: (
    name: string,
    uri: string,
    metadataOrHandler: ResourceMetadata | ResourceHandler,
    handler?: ResourceHandler
  ) => void;
}

/**
 * Combined interface for MCP server with both tools and resources
 */
export interface McpServer extends McpServerToolRegistration, McpServerResourceRegistration {}
