/**
 * get_latest_run on a project with no matching run (registry-mcp consumer-validate run #4,
 * 2026-10-25). The API answers `{ data: null }` on purpose; ops-sdk >= 7.1.0 exposes it as
 * `runs.findLatest() === null`. Through 0.33.0 the tool called `getLatest` and surfaced
 * SDK_RESPONSE_SHAPE_MISMATCH instead.
 */
import { describe, it, expect, vi } from 'vitest';
import type { OpsClient } from '@uluops/ops-sdk';
import { registerGetLatestRunTool } from '../tools/get-latest-run.js';

type Handler = (args: unknown) => Promise<{ isError?: boolean; content: Array<{ type: string; text?: string }> }>;

/** What the SDK returns when the handler asks for response context, as it always does. */
const envelope = (data: unknown): { data: unknown; context: unknown } => ({ data, context: { requestId: 'req-1' } });

function setup(findLatest: ReturnType<typeof vi.fn>): Handler {
  const server = { tool: vi.fn() };
  registerGetLatestRunTool(server, { runs: { findLatest } } as unknown as OpsClient);
  return server.tool.mock.calls[0][3] as Handler;
}

const json = (result: Awaited<ReturnType<Handler>>): Record<string, unknown> =>
  JSON.parse(result.content.find((c) => c.type === 'text' && c.text?.trim().startsWith('{') === true)?.text ?? 'null') as Record<string, unknown>;

describe('get_latest_run with no runs yet', () => {
  it('keeps the response context beside the projected result', async () => {
    const handler = setup(vi.fn().mockResolvedValue(envelope(null)));
    const result = await handler({ project: 'empty-project' });
    expect(JSON.stringify(result.content)).toContain('req-1');
  });

  it('returns { run: null, message }, not an error', async () => {
    const handler = setup(vi.fn().mockResolvedValue(envelope(null)));
    const result = await handler({ project: 'empty-project', workflow_type: 'consumer-validate' });
    expect(result.isError).toBeFalsy();
    expect(json(result)).toEqual({
      run: null,
      project: 'empty-project',
      workflow_type: 'consumer-validate',
      message: "No runs yet for project 'empty-project' with workflow type 'consumer-validate'.",
    });
  });

  it('omits workflow_type when none was asked for', async () => {
    const handler = setup(vi.fn().mockResolvedValue(envelope(null)));
    const body = json(await handler({ project: 'empty-project' }));
    expect(body).toEqual({ run: null, project: 'empty-project', message: "No runs yet for project 'empty-project'." });
  });

  it('passes the project and workflow type to findLatest and returns a found run unchanged', async () => {
    const findLatest = vi.fn().mockResolvedValue(envelope({ id: 'r1', runNumber: 4 }));
    const handler = setup(findLatest);
    const body = json(await handler({ project: 'p', workflow_type: 'ship' }));
    expect(findLatest).toHaveBeenCalledWith('p', 'ship', expect.objectContaining({ withResponseContext: true }));
    expect(body).toMatchObject({ id: 'r1', runNumber: 4 });
  });
});
