/**
 * Transport-level size limits for the SecureMcpServer, sized to what the
 * tracker API ingests.
 *
 * WHY THESE NUMBERS: mcp-secure-server applies these five caps server-wide,
 * before any tool's own policy (`maxArgsSize` in tool-registry.ts) is consulted.
 * They used to sit far below the API: a 500 KB envelope, a 128 Ki-char string
 * cap and a 3000-key cap. So a payload the API accepts was refused here first.
 * The key cap alone stopped save_run at roughly 150-230 recommendations against
 * the API's 500. The census behind this change is the 2026-10-25 save_run length
 * audit (session scratch `save-run-caps.md`, summarised in the CHANGELOG).
 *
 * The API is the authority on what a run may contain. This layer should refuse
 * only what the API would refuse anyway, or what is malformed. Each value is
 * derived from an API limit, not chosen:
 *
 *   - Envelope (maxMessageSize, maxParamBytes, suspiciousMessageSize):
 *     the API's request body limit, `express.json({ limit: '2mb' })`
 *     (ops-uluops-api src/index.ts), which body-parser reads as 2 MiB, plus
 *     64 KiB of headroom. The headroom lets a save_run at its own
 *     `maxArgsSize` (2 MiB) fit inside the JSON-RPC envelope; the API's 2 MiB
 *     then decides.
 *   - maxStringLength: the longest string field the API accepts, `rawMarkdown`
 *     at 500,000 chars (run-transformers.ts SaveRunSchema), rounded up to 512 Ki.
 *   - maxParamCount: mcp-secure-server counts every object key and array index,
 *     recursively. A save_run at the API's array limits (100 agents, 500
 *     recommendations, 100 analysis records, 20 summaries, every field present)
 *     measures 17,498 (nesting depth 11, about 0.95 MiB). The fixture in
 *     `__tests__/fixtures/largest-save-run.ts` is that payload, and
 *     `message-limits.test.ts` runs it through the real validation pipeline.
 *     32,768 is about twice that, for larger `data` blobs; the byte cap bounds
 *     it anyway. Nesting is capped at 15 inside the library (not configurable);
 *     the fixture reaches 11.
 *
 * These are server-wide, so every tool gets them, not only save_run. Byte size
 * stays per-tool: each ToolSpec's `maxArgsSize` still binds below the envelope.
 * String length and key count have no per-tool setting in mcp-secure-server
 * 0.0.25-security. Per-tool overrides would be the tighter design; that is a
 * library change, filed as mcp-secure-server tracker 17343905.
 *
 * WHAT BREAKS IF THESE DRIFT: lower them below the API and saves the API would
 * accept are refused at the protocol layer with an opaque -32602. Raise them
 * above the API and nothing is gained: the API refuses with a named 400 or 413.
 * Re-derive from the API whenever its body limit or SaveRunSchema caps change.
 */

const KiB = 1024;
const MiB = 1024 * KiB;

/** The API's `express.json({ limit: '2mb' })`, as body-parser reads it. */
export const API_BODY_LIMIT_BYTES = 2 * MiB;

/** The API's `rawMarkdown` cap (run-transformers.ts SaveRunSchema). */
export const API_RAW_MARKDOWN_MAX_CHARS = 500_000;

const ENVELOPE_BYTES = API_BODY_LIMIT_BYTES + 64 * KiB;

export const MESSAGE_LIMITS = {
  maxMessageSize: ENVELOPE_BYTES,
  maxParamBytes: ENVELOPE_BYTES,
  // Layer 3 BLOCKS messages over this size as suspicious. Left at the preset
  // default (50 KB) it would be a third, lower ceiling; it tracks the envelope.
  suspiciousMessageSize: ENVELOPE_BYTES,
  maxStringLength: 512 * KiB,
  maxParamCount: 32_768,
} as const;

/**
 * The values these replaced (0.32.0), kept so the test can show the largest
 * valid save_run failing under them: a check that cannot fail proves nothing.
 */
export const PREVIOUS_MESSAGE_LIMITS = {
  maxMessageSize: 500 * KiB,
  maxParamBytes: 500 * KiB,
  suspiciousMessageSize: 500 * KiB,
  maxStringLength: 128 * KiB,
  maxParamCount: 3000,
} as const;
