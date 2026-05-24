/**
 * MCP-specific types for tool responses
 */

export interface McpTextContent {
  type: 'text';
  text: string;
}

export interface McpToolResponse {
  content: McpTextContent[];
  isError?: boolean;
}

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
