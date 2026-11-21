/**
 * Agent-read tool descriptions use the product noun.
 *
 * The product noun is *finding*; `recommendations` is a legacy wire key and may appear in a tool
 * description only as the key or parameter name. Agents read these descriptions, so prose drift
 * here reaches them directly. Descriptions only: no schema, parameter or behaviour is pinned.
 */
import { describe, it, expect } from 'vitest';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { registerAllTools } from '../tools/index.js';

function registerAll(): Map<string, string> {
  const descriptions = new Map<string, string>();
  const server: McpServerToolRegistration = {
    tool(name: string, description: string): void {
      descriptions.set(name, description);
    },
  };
  const method = (): Promise<object> => Promise.resolve({});
  const namespace = new Proxy({}, { get: () => method });
  const client = new Proxy({}, { get: () => namespace });
  registerAllTools(server, client as unknown as OpsClient);
  return descriptions;
}

describe('agent-read tool descriptions', () => {
  const descriptions = registerAll();

  it('enumerates a non-empty tool list', () => {
    expect(descriptions.size).toBeGreaterThan(0);
    expect(descriptions.has('get_run_details')).toBe(true);
    expect(descriptions.has('update_run')).toBe(true);
  });

  it('get_run_details opens with the finding noun', () => {
    expect(descriptions.get('get_run_details')).toMatch(
      /^Get detailed run information with all findings \(wire key `recommendations`\) and summary stats\. Each finding carries TWO status fields/,
    );
  });

  it('update_run opens with the finding noun', () => {
    expect(descriptions.get('update_run')).toMatch(/^Enrich run telemetry, findings and analysis post-hoc\./);
  });

  it('get_run_details and update_run use "recommendation(s)" only inside backticks or as the parameter', () => {
    for (const name of ['get_run_details', 'update_run']) {
      const prose = (descriptions.get(name) ?? '')
        .replace(/`[^`]*`/g, '')
        .replace(/adding recommendations\/issues/g, '');
      expect(prose, name).not.toMatch(/\brecommendations?\b/i);
    }
  });

  it('no tool description uses "validation" in the retired run/issue sense', () => {
    for (const [name, description] of descriptions) {
      expect(description, name).not.toMatch(/\bvalidation (run|pipeline|issue|analytics|status)/i);
    }
  });
});
