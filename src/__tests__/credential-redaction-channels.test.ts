/**
 * Credential redaction — every channel, every accepted key shape.
 *
 * circumvention-forecaster run #9 A12 / circumvention-explorer run #11 T7, P16, P17;
 * falsified run #12 (tracker -uluops-ops-mcp). Four code-facts were TRUE at 0.20.1:
 *
 *   (i)   the redaction regex `/ulr_[a-zA-Z0-9]{20,}/` was narrower than the key shape
 *         config/index.ts ACCEPTS (`^ulr_[A-Za-z0-9_-]{16,}$`) — a key with `-`/`_` or a
 *         16–19 char tail passed boot validation and walked past redaction;
 *   (ii)  replacement used the non-global regex, so only the FIRST key in a message
 *         was redacted;
 *   (iii) the `[mcp-tool-error]` stderr line was written BEFORE the mapper ran — no
 *         redaction at all on that channel (P16);
 *   (iv)  `schema_issues` on SDK_RESPONSE_SHAPE_MISMATCH sliced `error.message` without
 *         passing through the sanitizer (P17).
 *
 * The resource-path error (resources/projects.ts) carried its own copy of the narrow
 * regex. Every test here has a control that must FAIL on the pre-0.20.2 shape; the
 * controls are the pre-fix inputs themselves (an 18-char key, a hyphenated key, two
 * keys in one message), so a regression re-fails these exact assertions.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { OpsClient } from '@uluops/ops-sdk';
import {
  mapSdkErrorToMcp,
  mapSdkResponseShapeErrorToMcp,
  redactCredentials,
} from '../client/sdk-error-mapper.js';
import { registerGetRunTool } from '../tools/get-run.js';
import { registerProjectsResource } from '../resources/projects.js';

// Shapes the boot validator ACCEPTS (config/index.ts `^ulr_[A-Za-z0-9_-]{16,}$`) that the
// pre-0.20.2 regex (`[a-zA-Z0-9]{20,}`) did NOT match.
const KEY_18_ALNUM = 'ulr_ABCDEFGHIJKLMNOPQR'; // 18-char tail
const KEY_HYPHEN = 'ulr_abcdefghij-klmnopqrst_uv'; // `-` and `_` inside the tail
// Shape the pre-fix regex DID match — the control that proves the channel exists.
const KEY_24_ALNUM = 'ulr_ABCDEFGHIJKLMNOPQRSTUVWX';
const KEY_24_ALNUM_B = 'ulr_ZYXWVUTSRQPONMLKJIHGFEDC';

function payload(result: { content: Array<{ text: string }> }): Record<string, unknown> {
  return JSON.parse(result.content[0].text) as Record<string, unknown>;
}

describe('redactCredentials — accepted key shapes', () => {
  it('(i) redacts an 18-char alphanumeric key the boot validator accepts', () => {
    expect(redactCredentials(`rejected ${KEY_18_ALNUM}`)).toBe('rejected [REDACTED]');
  });

  it('(i) redacts a key containing - and _ in the tail', () => {
    expect(redactCredentials(`rejected ${KEY_HYPHEN}`)).toBe('rejected [REDACTED]');
  });

  it('(ii) redacts EVERY key in a message, not just the first', () => {
    const out = redactCredentials(`first ${KEY_24_ALNUM} second ${KEY_24_ALNUM_B}`);
    expect(out).toBe('first [REDACTED] second [REDACTED]');
    expect(out).not.toContain(KEY_24_ALNUM_B);
  });

  it('control: the 24-char alphanumeric key the old regex matched is still redacted', () => {
    expect(redactCredentials(`rejected ${KEY_24_ALNUM}`)).toBe('rejected [REDACTED]');
  });

  it('control: a key-shaped token SHORTER than the accepted minimum is left alone (the regex is not over-wide)', () => {
    // 15-char tail — boot validation refuses it, so it is not a credential this server holds.
    expect(redactCredentials('token ulr_ABCDEFGHIJKLMNO here')).toBe('token ulr_ABCDEFGHIJKLMNO here');
  });

  it('control: field NAMES that mention credentials are preserved', () => {
    expect(redactCredentials('ULUOPS_API_KEY must start with "ulr_"')).toBe('ULUOPS_API_KEY must start with "ulr_"');
  });

  it('is idempotent across calls (global regexes carry no lastIndex state between messages)', () => {
    redactCredentials(`a ${KEY_24_ALNUM}`);
    expect(redactCredentials(`b ${KEY_24_ALNUM}`)).toBe('b [REDACTED]');
    expect(redactCredentials(`c ${KEY_24_ALNUM}`)).toBe('c [REDACTED]');
  });
});

describe('channel: mapped tool error (content[0].text)', () => {
  it('redacts an accepted-shape key embedded in an upstream error message', () => {
    const text = String(payload(mapSdkErrorToMcp(new Error(`upstream said: ${KEY_HYPHEN}`)))['error']);
    expect(text).toContain('[REDACTED]');
    expect(text).not.toContain(KEY_HYPHEN);
  });
});

describe('channel: schema_issues on SDK_RESPONSE_SHAPE_MISMATCH (P17)', () => {
  it('passes error.message through redaction before slicing', () => {
    const zodLike = Object.assign(
      new Error(`[{"path":["${KEY_24_ALNUM}"],"message":"Unrecognized key"}] ${KEY_18_ALNUM}`),
      { name: 'ZodError' },
    );
    const p = payload(mapSdkResponseShapeErrorToMcp(zodLike, 'get_run'));
    expect(p['code']).toBe('SDK_RESPONSE_SHAPE_MISMATCH');
    const issues = String(p['schema_issues']);
    expect(issues).toContain('[REDACTED]');
    expect(issues).not.toContain(KEY_24_ALNUM);
    expect(issues).not.toContain(KEY_18_ALNUM);
    // The rest of the message survives — redaction, not truncation to nothing.
    expect(issues).toContain('Unrecognized key');
  });
});

describe('channel: [mcp-tool-error] stderr line (P16)', () => {
  let stderrSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    stderrSpy = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
  });
  afterEach(() => {
    stderrSpy.mockRestore();
  });

  function grabHandler(client: unknown): (args: Record<string, unknown>) => Promise<unknown> {
    const server = { tool: vi.fn() };
    registerGetRunTool(server, client as OpsClient);
    const call = server.tool.mock.calls[0];
    return call[call.length - 1] as (args: Record<string, unknown>) => Promise<unknown>;
  }

  it('redacts the raw SDK error message before it reaches stderr', async () => {
    const get = vi.fn().mockRejectedValue(new Error(`boom ${KEY_HYPHEN} and ${KEY_24_ALNUM}`));
    const handler = grabHandler({ runs: { get } });
    await handler({ run_id: '11111111-1111-4111-8111-111111111111' });

    const lines = stderrSpy.mock.calls.map((c) => String(c[0]));
    const errLine = lines.find((l) => l.startsWith('[mcp-tool-error]'));
    expect(errLine).toBeDefined();
    expect(errLine).toContain('[REDACTED]');
    expect(errLine).not.toContain(KEY_HYPHEN);
    expect(errLine).not.toContain(KEY_24_ALNUM);
    // The line still carries its diagnostic shape.
    expect(errLine).toMatch(/tool=get_run type=Error message=boom /);
  });

  it('control: the stderr line is still written at all (the assertion above is not vacuous)', async () => {
    const get = vi.fn().mockRejectedValue(new Error('plain failure'));
    const handler = grabHandler({ runs: { get } });
    await handler({ run_id: '11111111-1111-4111-8111-111111111111' });
    const errLine = stderrSpy.mock.calls.map((c) => String(c[0])).find((l) => l.startsWith('[mcp-tool-error]'));
    expect(errLine).toContain('message=plain failure');
  });
});

describe('channel: resource error response (validation://projects)', () => {
  it('uses the shared redaction — an accepted-shape key in projects.list() error is redacted', async () => {
    const server = { resource: vi.fn() };
    const list = vi.fn().mockRejectedValue(new Error(`Connection refused for ${KEY_18_ALNUM}`));
    registerProjectsResource(server, { projects: { list } } as unknown as OpsClient);
    const handler = server.resource.mock.calls[0][3] as () => Promise<{ contents: Array<{ text?: string }> }>;
    const result = await handler();
    const data = JSON.parse(result.contents[0].text ?? '{}') as { error: string };
    expect(data.error).toContain('[REDACTED]');
    expect(data.error).not.toContain(KEY_18_ALNUM);
    expect(data.error).toContain('Connection refused for');
  });
});
