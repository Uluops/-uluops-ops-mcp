import { describe, it, expect, vi } from 'vitest';
import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import { registerSaveRunTool } from '../tools/save-run.js';
import { registerValidateRunTool } from '../tools/validate-run.js';
import { registerUpdateRunTool } from '../tools/update-run.js';

const components = {
  cached_input_tokens: 757888,
  reasoning_output_tokens: 64,
  thinking_tokens: 0,
  tool_tokens: 0,
};
const normalizedComponents = {
  cachedInputTokens: 757888,
  reasoningOutputTokens: 64,
  thinkingTokens: 0,
  toolTokens: 0,
};

describe('metrics transport contract', () => {
  for (const [name, register] of [
    ['save', registerSaveRunTool], ['validate', registerValidateRunTool], ['updateWithEcho', registerUpdateRunTool],
  ] as const) {
    it(`${name} advertises and forwards harness and every token component`, async () => {
      const tool = vi.fn();
      const call = vi.fn().mockResolvedValue({ run: {}, analysisWrite: null });
      register({ tool }, { runs: { [name]: call } } as unknown as OpsClient);
      const [, , shape, handler] = tool.mock.calls[0];
      const agent = { name: 'chain-tracer', decision: 'TRACED', harness: 'codex' };
      const tokens = { input_tokens: 832036, output_tokens: 4966, ...components };
      const payload = {
        org: 'ulu-labs', project: '-uluops-agent-metrics', workflow_type: 'subagent-metrics-audit', run_number: 8,
        agents: [name === 'updateWithEcho' ? { ...agent, ...tokens } : { ...agent, tokens }],
      };
      const parsed = z.object(shape).parse(payload);
      expect(parsed.agents[0]).toEqual(payload.agents[0]);
      await handler(payload);
      expect(call).toHaveBeenCalled();
      const forwarded = call.mock.calls[0][0].agents[0];
      expect(forwarded.harness).toBe('codex');
      expect(name === 'updateWithEcho' ? forwarded : forwarded.tokens).toMatchObject(normalizedComponents);
      expect(call.mock.calls[0][1]).toMatchObject({ org: 'ulu-labs' });
    });
  }
});
