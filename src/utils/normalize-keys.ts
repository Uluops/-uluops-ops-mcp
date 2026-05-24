/**
 * Key normalization utilities for snake_case → camelCase conversion
 *
 * MCP tool inputs use snake_case (matching the MCP protocol convention).
 * The SDK expects camelCase. This module provides recursive conversion.
 *
 * Same pattern used by the CLI (utils.ts) and API (case-transform.ts).
 */

/**
 * Convert a single snake_case string to camelCase
 */
function toCamelCase(str: string): string {
  return str.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase());
}

/**
 * Recursively convert all object keys from snake_case to camelCase.
 *
 * - Arrays are recursed into (each element is normalized)
 * - Primitives and null pass through unchanged
 * - Nested objects are recursed
 *
 * @param input - The value to normalize
 * @returns The value with all object keys converted to camelCase
 */
export function normalizeKeys(input: unknown): unknown {
  if (Array.isArray(input)) {
    return input.map(normalizeKeys);
  }
  if (input !== null && typeof input === 'object') {
    const result: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
      result[toCamelCase(key)] = normalizeKeys(value);
    }
    return result;
  }
  return input;
}
