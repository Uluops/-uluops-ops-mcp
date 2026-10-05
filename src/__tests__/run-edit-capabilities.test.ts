import { describe, it, expect, vi } from 'vitest';
import type { OpsClient } from '@uluops/ops-sdk';
import { registerGetRunTool } from '../tools/get-run.js';
import { registerGetLatestRunTool } from '../tools/get-latest-run.js';
import { registerGetRunDetailsTool } from '../tools/get-run-details.js';
import { registerUpdateRunTool } from '../tools/update-run.js';

const id = '11111111-1111-4111-8111-111111111111';
const capabilities = { canUpdate: false, mutableFields: [], immutableFields: [{ field: 'averageScore', reason: 'FINALIZED_RUN_FIELD_IMMUTABLE' }], unchangedOnlyFields: [], byIdOnlyFields: [], requiredRole: 'publisher', denialReason: 'INSUFFICIENT_SCOPE', previewScope: 'analysis-only' };

describe('run edit capability guidance and output', () => {
  it.each([
    [registerGetRunTool, 'get', { run_id: id }, false],
    [registerGetLatestRunTool, 'getLatest', { project: 'p' }, false],
    [registerGetRunDetailsTool, 'getDetails', { project: 'p' }, true],
  ] as const)('preserves capabilities in read output', async (register, method, input, details) => {
    const run = { id, editCapabilities: capabilities };
    const response = details ? { run } : run;
    const server = { tool: vi.fn() };
    register(server, { runs: { [method]: vi.fn().mockResolvedValue(response) } } as unknown as OpsClient);
    const [, description, , handler] = server.tool.mock.calls[0];
    expect(description).toContain('editCapabilities');
    expect(description.toLowerCase()).toContain('absence means unknown');
    const result = await handler(input);
    const parsed = JSON.parse(result.content.find((entry: { type: string; text?: string }) => entry.type === 'text' && entry.text?.trim().startsWith('{')).text);
    expect(details ? parsed.run.editCapabilities : parsed.editCapabilities).toEqual(capabilities);
  });
  it('advertises the finalized-field policy and limits preview to analysis', () => {
    const server = { tool: vi.fn() };
    registerUpdateRunTool(server, {} as OpsClient);
    const [, description, schema] = server.tool.mock.calls[0];
    expect(description).toContain('Run identity and timestamp are immutable');
    expect(description).toContain('changing or clearing');
    expect(description).toContain('including zero and false');
    expect(description).toContain('metadata and quality edits are not previewed');
    expect(schema).not.toHaveProperty('timestamp');
    expect(schema).not.toHaveProperty('workflow_type');
  });
});
