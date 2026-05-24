/**
 * Tool handler factory
 *
 * Creates standardized MCP tool handlers with consistent error handling.
 * Eliminates boilerplate across tool implementations.
 */

import { z } from 'zod';
import { mapSdkErrorToMcp, mapZodErrorToMcp } from '../client/sdk-error-mapper.js';
import { normalizeKeys } from './normalize-keys.js';
import { createSuccessResponse, type McpToolResponse } from '../types/index.js';

/**
 * Coerce string values to numbers for fields that the Zod schema expects as numeric.
 * MCP JSON-RPC sometimes serializes numeric parameters as strings (e.g., "50" instead of 50).
 * This runs before Zod validation to prevent spurious type errors at the boundary.
 */
function coerceNumericFields(args: unknown, schema: z.ZodSchema): unknown {
  if (typeof args !== 'object' || args === null) return args;
  if (!(schema instanceof z.ZodObject)) return args;

  const shape = schema.shape as Record<string, z.ZodTypeAny>;
  const obj = { ...(args as Record<string, unknown>) };

  for (const [key, fieldSchema] of Object.entries(shape)) {
    if (key in obj && typeof obj[key] === 'string') {
      if (isNumericSchema(fieldSchema)) {
        const num = Number(obj[key]);
        if (!isNaN(num)) {
          obj[key] = num;
        }
      }
    }
  }
  return obj;
}

/** Check if a Zod schema (possibly wrapped in optional/nullable/default) expects a number. */
function isNumericSchema(schema: z.ZodTypeAny): boolean {
  if (schema instanceof z.ZodNumber) return true;
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable || schema instanceof z.ZodDefault) {
    return isNumericSchema((schema as any)._def.innerType);
  }
  return false;
}

/**
 * Creates a standardized tool handler with Zod validation, key normalization,
 * and SDK error mapping.
 *
 * All handlers follow the same flow:
 * 1. Parse input with Zod schema (validates snake_case MCP input)
 * 2. Normalize keys from snake_case → camelCase for SDK
 * 3. Call SDK method with normalized input
 * 4. Return success response or mapped error
 *
 * @param schema - Zod schema for input validation (snake_case fields)
 * @param sdkCall - Function that receives normalized (camelCase) input and calls SDK.
 *   Uses `any` deliberately: Zod validates input structure, normalizeKeys transforms
 *   keys from snake_case to camelCase. TypeScript cannot track the key transformation
 *   statically, so we trust the runtime validation boundary.
 * @returns MCP-compatible handler function
 *
 * @example
 * ```typescript
 * server.tool(
 *   'query_issues',
 *   'Query issues...',
 *   QueryIssuesInputSchema.shape,
 *   createToolHandler(QueryIssuesInputSchema, (n) =>
 *     opsClient.projects.listIssues(n.project, n)
 *   )
 * );
 * ```
 */
export function createToolHandler<TInput>(
  schema: z.ZodSchema<TInput>,
  sdkCall: (normalized: any) => Promise<unknown>,
  options?: {
    /** Tool name for error context. Included in error responses to help MCP clients diagnose failures. */
    toolName?: string;
    /** Transform parsed input before normalization. Return McpToolResponse to short-circuit. */
    preProcess?: (input: TInput) => TInput | McpToolResponse;
  }
): (args: unknown) => Promise<McpToolResponse> {
  const toolName = options?.toolName;

  return async (args: unknown): Promise<McpToolResponse> => {
    try {
      let input = schema.parse(coerceNumericFields(args, schema));

      if (options?.preProcess) {
        const preResult = options.preProcess(input);
        // Short-circuit if preProcess returns an MCP response (has 'content' property)
        if ('content' in (preResult as McpToolResponse)) {
          return preResult as McpToolResponse;
        }
        input = preResult as TInput;
      }

      const normalized = normalizeKeys(input) as Record<string, unknown>;
      const result = await sdkCall(normalized);
      return createSuccessResponse(result);
    } catch (error) {
      // Log errors to stderr for debugging (MCP transport uses stdout)
      const errorMsg = error instanceof Error ? error.message : String(error);
      const errorType = error instanceof z.ZodError ? 'validation' :
        error instanceof Error ? error.constructor.name : 'unknown';
      process.stderr.write(
        `[mcp-tool-error] tool=${toolName ?? 'unknown'} type=${errorType} message=${errorMsg.slice(0, 200)}\n`
      );

      if (error instanceof z.ZodError) {
        return mapZodErrorToMcp(error, toolName);
      }
      return mapSdkErrorToMcp(error, toolName);
    }
  };
}
