import { z } from 'zod';

/**
 * Tool-parameter schemas whose advertised JSON Schema is exactly what zod 3 emitted (zod-4 train
 * T4). zod 4's built-ins describe the same validation with constructs that are NEW on the wire to
 * every client these tools are listed to (Claude Code passes them to Anthropic, Codex to OpenAI):
 *
 *   - `z.number().int()` adds `maximum: 9007199254740991` (and `minimum` where none is set);
 *   - `z.guid()` adds an 8-4-4-4-12 hex `pattern` (zod 3's `.uuid()` advertised none here).
 *
 * Anthropic accepts the bound (probed for @uluops/core 0.52.0, with a control); OpenAI could not be
 * probed, and its strict schemas restrict keywords. Same decision as core's and registry-mcp's
 * `toolInteger()`: keep the 0.31.x wire. Validation is the zod-3 set for both. Pinned by the
 * `tool schema wire` block in `src/__tests__/tool-schemas.test.ts`.
 */
export const toolInteger = (): z.ZodNumber => z.number().refine(Number.isInteger, 'Expected an integer').meta({ type: 'integer' });

const GUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

/** Any 8-4-4-4-12 hex id, as zod 3's `.uuid()` and zod 4's `z.guid()` accept; advertised as zod 3 did, `format: "uuid"`, with no pattern. */
export const toolGuid = (): z.ZodString => z.string().refine((s) => GUID.test(s), 'Invalid GUID').meta({ format: 'uuid' });
