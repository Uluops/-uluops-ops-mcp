/**
 * MCP-specific types for tool responses
 */

// `type`, not `interface`: the SDK's CallToolResult carries an index signature,
// which TypeScript grants type aliases implicitly and interfaces never. Since
// mcp-secure-server 0.0.24-security types server.tool() as McpServer's own, an
// interface-typed handler result no longer type-checks against it.
export type McpTextContent = {
  type: 'text';
  text: string;
};

export type McpToolResponse = {
  content: McpTextContent[];
  isError?: boolean;
};

/**
 * Create a successful MCP tool response.
 * Handles void/undefined SDK responses (e.g., delete operations).
 */
export function createSuccessResponse(data: unknown): McpToolResponse {
  const text = data === undefined || data === null
    ? JSON.stringify({ success: true })
    : JSON.stringify(data, null, 2);
  return {
    content: [{ type: 'text', text }],
  };
}

/**
 * Create an error MCP tool response
 */
export function createErrorResponse(message: string): McpToolResponse {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify({ error: message }),
      },
    ],
    isError: true,
  };
}
