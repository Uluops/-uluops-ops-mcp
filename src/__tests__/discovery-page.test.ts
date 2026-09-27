import { describe, it, expect, vi } from 'vitest';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { registerListProjectsTool } from '../tools/list-projects.js';
import { registerQueryIssuesTool } from '../tools/query-issues.js';
import { registerSearchIssuesTool } from '../tools/search-issues.js';
import { registerListRunsTool } from '../tools/list-runs.js';
import { registerQueryAnalysisRecordsTool } from '../tools/query-analysis-records.js';
import { registerGetProjectAnalysisTool } from '../tools/get-project-analysis.js';
import { registerGetAgentRunsAnalysisTool } from '../tools/get-agent-runs-analysis.js';

type Handler = (args: unknown) => Promise<{ content: Array<{ text: string }>; isError?: boolean }>;
type Register = (server: McpServerToolRegistration, client: OpsClient) => void;
const page = { data: [{ id: 'identity' }], total: 21, limit: 1, offset: 20, hasMore: false };
const legacy = { legacy: ['original shape'] };
const context = { version: 1, orgSlug: 'acme', source: 'bound-key' };
const scope = { org: 'acme', withResponseContext: true };
const cases: [string, Register, string, string, Record<string, unknown>][] = [
  ['projects', registerListProjectsTool, 'listProjects', 'projects.list', {}],
  ['issues', registerQueryIssuesTool, 'queryIssues', 'projects.listIssues', { project: 'p' }],
  ['search', registerSearchIssuesTool, 'searchIssues', 'issues.search', { query: 'q' }],
  ['runs', registerListRunsTool, 'listRuns', 'runs.listByProject', { project: 'p' }],
  ['records', registerQueryAnalysisRecordsTool, 'queryAnalysisRecords', 'runs.queryAnalysisRecords', {}],
  ['project analysis', registerGetProjectAnalysisTool, 'getProjectAnalysis', 'runs.getProjectAnalysis', { project: 'p' }],
  ['agent analysis', registerGetAgentRunsAnalysisTool, 'getAgentRunsAnalysis', 'runs.getAgentRunsAnalysis', { project: 'p', agent_name: 'agent' }],
];
function setup(register: Register, discoveryName: string, legacyName: string): { handler: Handler; paged: ReturnType<typeof vi.fn>; old: ReturnType<typeof vi.fn> } {
  const paged = vi.fn().mockResolvedValue({ data: page, context });
  const old = vi.fn().mockResolvedValue({ data: legacy, context });
  const [namespace, method] = legacyName.split('.') as [string, string];
  const sdk = { discovery: { [discoveryName]: paged }, [namespace]: { [method]: old } };
  const server = { tool: vi.fn() };
  register(server, sdk as unknown as OpsClient);
  const handler = server.tool.mock.calls[0]?.[3] as Handler;
  return { handler, paged, old };
}
const payload = (result: Awaited<ReturnType<Handler>>): unknown => JSON.parse(result.content[0]?.text ?? '{}') as unknown;

describe('discovery page tool routing', () => {
  it.each(cases)('%s routes explicit pages and preserves metadata and effective scope', async (_name, register, method, oldMethod, input) => {
    const { handler, paged, old } = setup(register, method, oldMethod);
    const result = await handler({ ...input, format: 'page', fields: ['id'], limit: 1, offset: 20, org: 'acme' });
    expect(result.isError).toBeUndefined();
    expect(payload(result)).toEqual(page);
    expect(paged).toHaveBeenCalledTimes(1);
    expect(paged.mock.calls[0]?.at(-1)).toEqual(scope);
    expect(paged.mock.calls[0]).toContainEqual(expect.objectContaining({ fields: ['id'], limit: 1, offset: 20 }));
    expect(JSON.parse(result.content[1]?.text ?? '{}')).toMatchObject({ effectiveContext: context });
    expect(old).not.toHaveBeenCalled();
  });
  it.each(cases)('%s preserves legacy output when format is omitted', async (_name, register, method, oldMethod, input) => {
    const { handler, paged, old } = setup(register, method, oldMethod);
    expect(payload(await handler({ ...input, org: 'acme' }))).toEqual(legacy);
    expect(paged).not.toHaveBeenCalled();
    expect(old.mock.calls[0]?.at(-1)).toEqual(scope);
  });
  it.each(cases)('%s rejects projection unless page format is selected', async (_name, register, method, oldMethod, input) => {
    const { handler, paged, old } = setup(register, method, oldMethod);
    const result = await handler({ ...input, fields: [] });
    expect(result.isError).toBe(true);
    expect(payload(result)).toMatchObject({ error: expect.stringContaining('format=page') });
    expect(paged).not.toHaveBeenCalled();
    expect(old).not.toHaveBeenCalled();
  });
  it.each([
    [0, { search: 'p' }], [0, { limit: 2 }], [0, { offset: 0 }], [0, { sort_order: 'asc' }],
    [1, { sort_by: 'priority' }], [2, { offset: 0 }], [3, { include_archived: false }],
    [4, { project: 'p' }], [4, { run_id: '550e8400-e29b-41d4-a716-446655440000' }],
  ] as const)('requires page format for new controls (%s, %j)', async (index, controls) => {
    const entry = cases[index];
    if (!entry) throw new Error('Missing case');
    const { handler, paged, old } = setup(entry[1], entry[2], entry[3]);
    expect((await handler({ ...entry[4], ...controls })).isError).toBe(true);
    expect(paged).not.toHaveBeenCalled();
    expect(old).not.toHaveBeenCalled();
  });
  it('preserves query_issues defaults and forwards previously dropped filters on legacy calls', async () => {
    const { handler, old } = setup(registerQueryIssuesTool, 'queryIssues', 'projects.listIssues');
    await handler({ project: 'p', workflow_type: 'audit', classified: false, failure_mode: 'missing', offset: 4, org: 'acme' });
    expect(old).toHaveBeenCalledWith('p', { status: 'open', priority: 'all', includeResolved: false, limit: 50, workflowType: 'audit', classified: false, failureMode: 'missing', offset: 4 }, scope);
  });
  it('normalizes issue filters for page calls', async () => {
    const { handler, paged } = setup(registerQueryIssuesTool, 'queryIssues', 'projects.listIssues');
    await handler({ project: 'p', format: 'page', workflow_type: 'audit', classified: false, failure_mode: 'missing', offset: 4, org: 'acme' });
    expect(paged).toHaveBeenCalledWith('p', expect.objectContaining({ workflowType: 'audit', classified: false, failureMode: 'missing', offset: 4 }), scope);
  });
  it('preserves legacy search limit 20 and leaves page limit to the page contract', async () => {
    const { handler, old, paged } = setup(registerSearchIssuesTool, 'searchIssues', 'issues.search');
    await handler({ query: 'q', org: 'acme' });
    expect(old).toHaveBeenCalledWith({ query: 'q', status: 'all', priority: 'all', limit: 20 }, scope);
    await handler({ query: 'q', format: 'page', org: 'acme' });
    expect(paged.mock.calls[0]?.[0]).not.toHaveProperty('limit');
  });
});
