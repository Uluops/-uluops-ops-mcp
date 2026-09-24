#!/usr/bin/env node
/**
 * Wire check for the arm-to-destroy surface (spec v0.2.1 D1/D3/D5) against the
 * BUILT server over stdio — the path every unit test mocks (`SecureMcpServer`
 * is mocked everywhere; anxiety-reader F3). Runs in `prepublishOnly` after
 * `build`, so a dependency bump or a registration change that drops
 * `annotations` / `_meta` fails the publish instead of shipping silently.
 *
 * No network: tools/list is local, and the disarmed call is refused before any
 * request. The API URL is a closed local port so a call that DID escape the
 * gate would fail loudly with a connection error, not succeed.
 *
 * `--control` runs the same assertions against a registration that sets the
 * env to `true` and expects the disarm assertion to FAIL — proof the check can.
 */
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.join(here, '..', 'dist', 'index.js');
const control = process.argv.includes('--control');

function rpc(env, messages) {
  return new Promise((resolve, reject) => {
    const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('ULUOPS_')));
    const child = spawn(process.execPath, [DIST], {
      env: { ...cleanEnv, ULUOPS_API_KEY: `ulr_${'x'.repeat(40)}`, ULUOPS_BASE_URL: 'https://127.0.0.1:9', NODE_ENV: 'development', ...env },
      cwd: '/',
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; });
    const timer = setTimeout(() => { child.kill(); reject(new Error('timeout')); }, 30000);
    child.on('close', () => {
      clearTimeout(timer);
      const byId = {};
      for (const line of out.split('\n')) {
        try { const r = JSON.parse(line); if (r.id !== undefined) byId[r.id] = r; } catch { /* not JSON-RPC */ }
      }
      resolve({ byId, err });
    });
    const init = [
      { jsonrpc: '2.0', id: 0, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'check-wire', version: '0' } } },
      { jsonrpc: '2.0', method: 'notifications/initialized' },
    ];
    child.stdin.end([...init, ...messages].map((m) => JSON.stringify(m)).join('\n') + '\n');
  });
}

const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); };

const { byId: listed, err: bootErr } = await rpc({}, [{ jsonrpc: '2.0', id: 1, method: 'tools/list' }]);
const tools = new Map((listed[1]?.result?.tools ?? []).map((t) => [t.name, t]));
check(tools.size > 50, `tools/list returned ${tools.size} tools`);
check([...tools.values()].every((t) => t.annotations && typeof t.annotations.readOnlyHint === 'boolean'), 'every tool carries annotations');
const prompted = [...tools.values()].filter((t) => t._meta?.['anthropic/requiresUserInteraction'] === true).map((t) => t.name).sort();
check(JSON.stringify(prompted) === JSON.stringify(['delete_project', 'delete_run', 'merge_projects', 'rehome_project', 'update_profile']),
  `_meta requiresUserInteraction on exactly the five (got ${prompted.join(',')})`);
check(tools.get('get_project')?.annotations?.readOnlyHint === true, 'reads are readOnlyHint');
check(tools.get('edit_issue')?.annotations?.destructiveHint === true, 'ungated overwrite edit_issue is destructiveHint');
check(tools.get('create_issue')?.annotations?.destructiveHint === false, 'additive create_issue is not destructiveHint');
check(bootErr.includes('ULUOPS_ALLOW_DESTRUCTIVE is not set'), 'unset env warns at boot');

const call = { jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'delete_run', arguments: { run_id: 'a1b2c3d4-e5f6-7890-abcd-ef1234567890', confirm: true } } };
const { byId: refused } = await rpc({ ULUOPS_ALLOW_DESTRUCTIVE: control ? 'true' : 'false' }, [call]);
const text = refused[2]?.result?.content?.[0]?.text ?? '';
const disarmOk = text.includes('"code":"DESTRUCTIVE_NOT_ARMED"') && text.includes('"applied":false');

if (control) {
  if (disarmOk) { console.error('check-wire --control: disarm assertion PASSED against an armed server — the check cannot fail'); process.exit(1); }
  console.log('check-wire --control: disarm assertion correctly failed against an armed server');
  process.exit(failures.length === 0 ? 0 : 1);
}
check(disarmOk, `disarmed delete_run refuses with DESTRUCTIVE_NOT_ARMED (got ${text.slice(0, 120)})`);

if (failures.length > 0) {
  console.error(`check-wire: ${failures.length} failure(s)\n - ${failures.join('\n - ')}`);
  process.exit(1);
}
console.log(`check-wire: ok — ${tools.size} tools annotated, _meta on 5, disarm refuses over stdio`);
