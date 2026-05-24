/**
 * Shared response helpers for MCP resources
 *
 * Provides consistent response formatting across all resource handlers.
 */

import type { ResourceResponse } from '../types/index.js';

/**
 * Create a resource response with JSON content
 */
export function createResourceResponse(uri: string, data: unknown): ResourceResponse {
  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

/**
 * Create an error resource response
 */
export function createErrorResourceResponse(uri: string, error: string): ResourceResponse {
  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify({ error }),
      },
    ],
  };
}
