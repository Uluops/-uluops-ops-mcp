/**
 * The transport limits admit what the tracker API admits (config/message-limits.ts).
 *
 * Runs the largest valid save_run through mcp-secure-server's real validation
 * pipeline, built from the exact production options (buildServerOptions). The
 * controls run the same payloads under the 0.32.0 limits and show them refused,
 * so a pass here cannot be a pipeline that checks nothing.
 */
import { describe, it, expect } from 'vitest';
import { SecureMcpServer } from 'mcp-secure-server';
import { buildServerOptions } from '../config/server-options.js';
import { MESSAGE_LIMITS, PREVIOUS_MESSAGE_LIMITS, API_BODY_LIMIT_BYTES, API_RAW_MARKDOWN_MAX_CHARS } from '../config/message-limits.js';
import { SaveRunInputSchema } from '../tools/save-run.js';
import { buildLargestSaveRun, reportMarkdown, toolCallMessage } from './fixtures/largest-save-run.js';

const security = { enableLogging: false, verboseLogging: false, logPerformanceMetrics: false };

/**
 * A pipeline built from the production options, validating as the transport does:
 * mcp-secure-server's transport-validator passes `policy: defaultPolicy` in the
 * pipeline context, and without it Layer 4 refuses every write tool.
 */
async function pipeline(overrides: Record<string, unknown> = {}) {
  const options = { ...buildServerOptions(security), ...overrides };
  const server = await SecureMcpServer.create({ name: 'message-limits-test', version: '0.0.0' }, options);
  return {
    validate: (message: Record<string, unknown>) =>
      server.validationPipeline.validate(message, {
        timestamp: Date.now(),
        transportLevel: true,
        originalMessage: message,
        policy: options.defaultPolicy,
      }),
  };
}

function smallSaveRun(rawMarkdown: string): Record<string, unknown> {
  return {
    project: 'message-limits-fixture',
    workflow_type: 'pipeline:ship',
    agents: [{ name: 'review-agent-0', score: 82, max_score: 100, decision: 'PASS' }],
    recommendations: [],
    raw_markdown: rawMarkdown,
  };
}

describe('transport limits match the API (2026-10-25 length audit)', () => {
  const largest = buildLargestSaveRun();

  it('the fixture is a valid save_run at the API array limits', () => {
    const parsed = SaveRunInputSchema.safeParse(largest);
    expect(parsed.success, parsed.success ? '' : JSON.stringify(parsed.error.issues.slice(0, 3))).toBe(true);
    expect((largest['agents'] as unknown[]).length).toBe(100);
    expect((largest['recommendations'] as unknown[]).length).toBe(500);
    expect((largest['analysis_records'] as unknown[]).length).toBe(100);
    expect((largest['analysis_summary'] as unknown[]).length).toBe(20);
    expect((largest['raw_markdown'] as string).length).toBe(API_RAW_MARKDOWN_MAX_CHARS);
    expect(Buffer.byteLength(JSON.stringify(largest), 'utf8')).toBeLessThan(API_BODY_LIMIT_BYTES);
  });

  it('the largest valid save_run passes the production pipeline', async () => {
    const result = await (await pipeline()).validate(toolCallMessage('save_run', largest));
    expect({ passed: result.passed, layer: result.layerName, reason: result.reason }).toMatchObject({ passed: true });
  });

  it('CONTROL: the same save_run is refused under the 0.32.0 limits', async () => {
    const result = await (await pipeline({ ...PREVIOUS_MESSAGE_LIMITS })).validate(toolCallMessage('save_run', largest));
    expect(result.passed).toBe(false);
    expect(result.violationType).toMatch(/SIZE_LIMIT_EXCEEDED|PARAM_LIMIT_EXCEEDED|EXCESSIVE_PARAM_COUNT|STRING_LIMIT_EXCEEDED|OVERSIZED_PARAMS/);
  });

  it('CONTROL: the 0.32.0 key-count cap alone refuses it (17,498 keys against 3000)', async () => {
    const result = await (await pipeline({ maxParamCount: PREVIOUS_MESSAGE_LIMITS.maxParamCount })).validate(toolCallMessage('save_run', largest));
    expect(result.passed).toBe(false);
    expect(result.violationType).toBe('EXCESSIVE_PARAM_COUNT');
  });

  it('a raw_markdown at the API maximum passes; CONTROL: refused under the 0.32.0 string cap', async () => {
    const message = toolCallMessage('save_run', smallSaveRun(reportMarkdown(API_RAW_MARKDOWN_MAX_CHARS)));
    expect((await (await pipeline()).validate(message)).passed).toBe(true);
    const old = await (await pipeline({ ...PREVIOUS_MESSAGE_LIMITS })).validate(message);
    expect(old.passed).toBe(false);
    expect(old.reason).toMatch(/String parameter too long|too large/);
  });

  // mcp-secure-server 0.1.1-security (tracker 53dd1c56): through 0.1.0 Layer 1 refused any
  // message containing U+200D, so one compound emoji in a report refused the whole save,
  // while eight of the nine bidi controls passed. Fails on 0.0.25-security for both reasons.
  it('a compound emoji in raw_markdown passes; a bidi isolate is refused', async () => {
    const p = await pipeline();
    const emoji = await p.validate(toolCallMessage('save_run', smallSaveRun('Shipped \u{1F468}\u200D\u{1F4BB} today')));
    expect({ passed: emoji.passed, reason: emoji.reason }).toMatchObject({ passed: true });
    const isolate = await p.validate(toolCallMessage('save_run', smallSaveRun('access\u2066level')));
    expect(isolate.passed).toBe(false);
    expect(isolate.violationType).toBe('SUSPICIOUS_ENCODING');
  });

  it('every limit sits at or above the API value it is derived from', () => {
    expect(MESSAGE_LIMITS.maxMessageSize).toBeGreaterThanOrEqual(API_BODY_LIMIT_BYTES);
    expect(MESSAGE_LIMITS.maxParamBytes).toBeGreaterThanOrEqual(API_BODY_LIMIT_BYTES);
    expect(MESSAGE_LIMITS.suspiciousMessageSize).toBeGreaterThanOrEqual(MESSAGE_LIMITS.maxMessageSize);
    expect(MESSAGE_LIMITS.maxStringLength).toBeGreaterThanOrEqual(API_RAW_MARKDOWN_MAX_CHARS);
  });
});
