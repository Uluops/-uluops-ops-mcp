/**
 * tool-policies.json ↔ tool input-schema parity
 *
 * mcp-secure-server skips pattern scanning for a tool's `relaxedFields` — that is the
 * documented escape hatch for STORAGE tools whose text legitimately quotes code (a finding
 * that cites `child_process.exec(cmd)` must be storable). The policy file names fields by
 * string; nothing binds those strings to the tools' Zod input shapes. On 2026-09-24 that gap
 * showed up live: update_run accepted the same `recommendations` array as save_run but did not
 * relax it, so a recommendation quoting an `exec(` call was refused with "Command injection
 * detected: Exec Call" — while its `relaxedFields` still named `validators`, a field
 * update_run no longer accepts.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { OpsClient } from '@uluops/ops-sdk';
import { registerAllTools } from '../tools/index.js';
import type { McpServerToolRegistration } from '../types/index.js';

type Policy = { level?: string; relaxedFields?: string[] };
const policies = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../tool-policies.json', import.meta.url)), 'utf8')
).tools as Record<string, Policy>;

// mcp-secure-server's isFieldPathRelaxed matches a relaxed name against ANY path segment, so
// save_run's `description` legitimately relaxes recommendations[].description. The census is
// therefore every object key at any depth of the tool's Zod input, not just top-level keys.
function collectKeys(node: unknown, out: Set<string>, seen = new Set<unknown>()): void {
  if (node === null || typeof node !== 'object' || seen.has(node)) return;
  seen.add(node);
  const n = node as Record<string, unknown> & { _def?: Record<string, unknown> };
  const shapeSrc = (n as { shape?: unknown }).shape ?? n._def?.shape;
  const shape: unknown = typeof shapeSrc === 'function' ? (shapeSrc as () => unknown)() : shapeSrc;
  if (shape !== null && typeof shape === 'object') {
    for (const [k, v] of Object.entries(shape as Record<string, unknown>)) {
      out.add(k);
      collectKeys(v, out, seen);
    }
  }
  const def = n._def ?? {};
  for (const inner of [def.innerType, def.schema, def.type, def.element, def.valueType, def.in, def.out, def.left, def.right]) {
    collectKeys(inner, out, seen);
  }
  for (const opt of (def.options as unknown[] | undefined) ?? []) collectKeys(opt, out, seen);
}

function collectInputFields(): Map<string, Set<string>> {
  const fields = new Map<string, Set<string>>();
  const mockServer = {
    tool: (name: string, _description: string, shape: Record<string, unknown> | undefined) => {
      const keys = new Set<string>();
      for (const [k, v] of Object.entries(shape ?? {})) {
        keys.add(k);
        collectKeys(v, keys);
      }
      fields.set(name, keys);
    },
  } as unknown as McpServerToolRegistration;
  registerAllTools(mockServer, {} as unknown as OpsClient);
  return fields;
}

const inputFields = collectInputFields();

describe('tool-policies.json relaxedFields ↔ input schemas', () => {
  it('the census is non-empty (the checks can fail)', () => {
    const withRelaxed = Object.values(policies).filter((p) => (p.relaxedFields?.length ?? 0) > 0);
    expect(inputFields.size).toBeGreaterThan(0);
    expect(withRelaxed.length).toBeGreaterThan(0);
  });

  it('every relaxedFields entry names a field its tool accepts (at any depth)', () => {
    const stale: string[] = [];
    for (const [tool, policy] of Object.entries(policies)) {
      const accepted = inputFields.get(tool);
      if (!accepted) continue; // policy for an unregistered tool is tool-spec-parity's concern
      for (const f of policy.relaxedFields ?? []) {
        if (!accepted.has(f)) stale.push(`${tool}.${f}`);
      }
    }
    expect(stale, `relaxedFields naming fields the tool does not accept: ${stale.join(', ')}`).toEqual([]);
  });

  // A dry-run / preview tool must be refused exactly when its write would be, or the
  // documented preview-first workflow fails on payloads the write itself accepts.
  // update_run is paired with save_run because it accepts the same recommendations and
  // analysis arrays (tool-registry.ts: "Must match save_run").
  const PAIRS: Array<[source: string, mirror: string]> = [
    ['save_run', 'validate_run'],
    ['save_run', 'update_run'],
    ['update_run', 'preview_update_run'],
  ];

  for (const [source, mirror] of PAIRS) {
    it(`${mirror} has a policy at the same level as ${source}`, () => {
      expect(policies[mirror], `${mirror} has no tool-policies.json entry (falls to defaultLevel)`).toBeDefined();
      expect(policies[mirror]?.level).toBe(policies[source]?.level);
    });

    it(`${mirror} relaxes every field ${source} relaxes that ${mirror} also accepts`, () => {
      const sourceRelaxed = policies[source]?.relaxedFields ?? [];
      const mirrorRelaxed = new Set(policies[mirror]?.relaxedFields ?? []);
      const mirrorAccepts = inputFields.get(mirror) ?? new Set<string>();
      const missing = sourceRelaxed.filter((f) => mirrorAccepts.has(f) && !mirrorRelaxed.has(f));
      expect(missing, `${mirror} accepts but does not relax: ${missing.join(', ')}`).toEqual([]);
    });
  }
});
