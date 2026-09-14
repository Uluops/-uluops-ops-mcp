/**
 * Vitest setup: pin the D13 workspace-org resolver to "personal" for every
 * unit test unless a test overrides it.
 *
 * `createToolHandler` resolves the org through `@uluops/ops-sdk`'s
 * `resolveWorkspaceOrg`, which walks the REAL filesystem upward from
 * process.cwd(). This workspace will carry a `.uluops.json` at its root, so an
 * unmocked resolver would make every handler test send `org: 'ulu-labs'` the
 * day that file lands — hermeticity by mock, not by luck.
 */
import { vi } from 'vitest';

vi.mock('@uluops/ops-sdk', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@uluops/ops-sdk')>();
  return {
    ...actual,
    resolveWorkspaceOrg: vi.fn((opts?: { explicit?: string }) =>
      opts?.explicit !== undefined
        ? actual.resolveWorkspaceOrg({ explicit: opts.explicit, cwd: '/', env: {}, stopAt: '/' })
        : { org: undefined, source: 'personal' as const },
    ),
  };
});

// The per-call org record defaults to a stderr line; route it nowhere in unit
// tests (org-scope.test.ts installs its own sink to assert on the records).
import { setOrgCallSink } from '../src/utils/org-call-log.js';
setOrgCallSink(() => {});
