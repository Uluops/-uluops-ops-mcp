/**
 * delete_run — the confirm flag has to mean something.
 *
 * circumvention-forecaster run #9 A2 / explorer run #11 P23, falsified run #12
 * (tracker -uluops-ops-mcp). At 0.20.1 the schema said `confirm: z.boolean()` and the
 * handler forwarded only run_id; the SDK synthesizes X-Confirm-Delete from the id, so
 * `confirm: false` and `confirm: true` produced byte-identical requests and the tool
 * description "Requires confirm=true" was false. 0.21.1 makes it `z.literal(true)` —
 * the refusal happens where the schema promises it, before any SDK call.
 */

import { describe, it, expect, vi } from 'vitest';
import type { OpsClient } from '@uluops/ops-sdk';
import { registerDeleteRunTool } from '../tools/delete-run.js';

const RUN_ID = '11111111-1111-4111-8111-111111111111';

function grab(client: unknown): { handler: (a: Record<string, unknown>) => Promise<any>; description: string } {
  const server = { tool: vi.fn() };
  registerDeleteRunTool(server, client as OpsClient);
  const call = server.tool.mock.calls[0];
  return { handler: call[call.length - 1], description: call[1] as string };
}

describe('delete_run confirm', () => {
  it('confirm:false is refused by the schema and the SDK is never called', async () => {
    const del = vi.fn().mockResolvedValue({ deleted: true });
    const { handler } = grab({ runs: { delete: del } });
    const result = await handler({ run_id: RUN_ID, confirm: false });
    expect(result.isError).toBe(true);
    expect(del).not.toHaveBeenCalled();
    expect(JSON.parse(result.content[0].text).error).toMatch(/confirm/i);
  });

  it('a missing confirm is refused the same way', async () => {
    const del = vi.fn().mockResolvedValue({ deleted: true });
    const { handler } = grab({ runs: { delete: del } });
    const result = await handler({ run_id: RUN_ID });
    expect(result.isError).toBe(true);
    expect(del).not.toHaveBeenCalled();
  });

  it('control: confirm:true still deletes, with the run id forwarded', async () => {
    const del = vi.fn().mockResolvedValue({ deleted: true });
    const { handler } = grab({ runs: { delete: del } });
    const result = await handler({ run_id: RUN_ID, confirm: true });
    expect(result.isError).toBeUndefined();
    expect(del).toHaveBeenCalledWith(RUN_ID, { withResponseContext: true });
  });

  it('the description no longer promises a check the code did not make', () => {
    const { description } = grab({ runs: { delete: vi.fn() } });
    expect(description).toMatch(/refused by the schema/);
  });
});
