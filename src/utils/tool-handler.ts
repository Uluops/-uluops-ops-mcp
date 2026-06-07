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

  const shape: Record<string, z.ZodTypeAny> = schema.shape;
  const obj = { ...(args as Record<string, unknown>) };

  for (const [key, fieldSchema] of Object.entries(shape)) {
    if (key in obj && typeof obj[key] === 'string') {
      if (isNumericSchema(fieldSchema)) {
        const num = Number(obj[key]);
        // Number.isFinite rejects NaN, Infinity, and -Infinity
        if (Number.isFinite(num)) {
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
  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable) {
    return isNumericSchema(schema.unwrap());
  }
  if (schema instanceof z.ZodDefault) {
    return isNumericSchema(schema.removeDefault());
  }
  return false;
}

/**
 * Sentinel used by preProcess hooks to short-circuit the handler with a
 * tool response (typically an error). Discriminating on a dedicated symbol
 * avoids accidental collision with tool input schemas that may legitimately
 * contain a top-level `content` field.
 */
const SHORT_CIRCUIT = Symbol('mcp.tool.short-circuit');

type ShortCircuit = McpToolResponse & { readonly [SHORT_CIRCUIT]: true };

/**
 * Construct a short-circuit response from a preProcess hook. The returned
 * value is a normal MCP tool response plus a non-enumerable marker symbol
 * that createToolHandler recognises.
 */
export function shortCircuit(response: McpToolResponse): ShortCircuit {
  return Object.defineProperty({ ...response }, SHORT_CIRCUIT, {
    value: true,
    enumerable: false,
    writable: false,
    configurable: false,
  }) as ShortCircuit;
}

function isShortCircuit(value: unknown): value is ShortCircuit {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as { [SHORT_CIRCUIT]?: unknown })[SHORT_CIRCUIT] === true
  );
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
 * @param sdkCall - Function that receives the normalized (camelCase) input as
 *   `Record<string, unknown>` and calls the SDK. The runtime contract is upheld
 *   by Zod validation immediately upstream.
 * @returns MCP-compatible handler function
 *
 * @example
 * ```typescript
 * server.tool(
 *   'query_issues',
 *   'Query issues...',
 *   QueryIssuesInputSchema.shape,
 *   createToolHandler(QueryIssuesInputSchema, (n) =>
 *     opsClient.projects.listIssues(n['project'] as string, n)
 *   )
 * );
 * ```
 */
export function createToolHandler<TInput>(
  schema: z.ZodSchema<TInput>,
  // SAFETY: `normalized` is `any` because normalizeKeys performs a runtime
  // snake_case → camelCase key transformation that TypeScript cannot track
  // statically. Zod validation immediately upstream enforces the shape; the
  // SDK call signatures further constrain field types. createToolHandler is
  // an internal utility (not re-exported from src/index.ts), so this `any`
  // does not leak to the public npm surface.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sdkCall: (normalized: any) => Promise<unknown>,
  options?: {
    /** Tool name for error context. Included in error responses to help MCP clients diagnose failures. */
    toolName?: string;
    /**
     * Transform parsed input before normalization. Return the value produced
     * by `shortCircuit(response)` to bypass the SDK call and return `response`
     * directly to the caller.
     */
    preProcess?: (input: TInput) => TInput | ShortCircuit;
  }
): (args: unknown) => Promise<McpToolResponse> {
  const toolName = options?.toolName;

  return async (args: unknown): Promise<McpToolResponse> => {
    try {
      let input = schema.parse(coerceNumericFields(args, schema));

      if (options?.preProcess) {
        const preResult = options.preProcess(input);
        if (isShortCircuit(preResult)) {
          return preResult;
        }
        input = preResult;
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
