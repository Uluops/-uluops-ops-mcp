/**
 * MCP Server interface types
 *
 * Defines the interface for SecureMcpServer to avoid using generic Function type.
 */

import type { ZodRawShape } from 'zod';
import type { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
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
 * Handler for a resource registered with a `ResourceTemplate`. The SDK passes
 * the requested URI and the variables it matched against the template.
 */
export type ResourceTemplateHandler = (
  uri: URL,
  variables: Record<string, string | string[]>
) => Promise<ResourceResponse>;

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
 * Supports two overloads, each with a fixed URI or a `ResourceTemplate`:
 * - resource(name, uriOrTemplate, handler)
 * - resource(name, uriOrTemplate, metadata, handler)
 */
export interface McpServerResourceRegistration {
  resource: (
    name: string,
    uri: string | ResourceTemplate,
    metadataOrHandler: ResourceMetadata | ResourceHandler | ResourceTemplateHandler,
    handler?: ResourceHandler | ResourceTemplateHandler
  ) => void;
}

/**
 * Combined interface for MCP server with both tools and resources
 */
export interface McpServer extends McpServerToolRegistration, McpServerResourceRegistration {}
