/**
 * Generator for src/__tests__/fixtures/server-accepted-analysis-entries.json
 * (save-schema-server-parity.test.ts). Committed so the fixture can be REGENERATED,
 * not hand-edited (R3 review, tracker run #3, test-architect B1).
 *
 * It runs candidate analysis entries through ops-uluops-api's own save-path schemas
 * (SaveRunSchema -> toSaveRunInput, the per-entry parse ops-api R2 added) and keeps
 * the ones the server ACCEPTS, in the snake_case wire form this server receives.
 * The candidates are boundary cases: every place the two sides were known to bound
 * differently, each enum value and section type, and adversarial shapes. A candidate
 * the server rejects is listed in `serverRejects`, so a regeneration that suddenly
 * accepts everything is visible.
 *
 * Run it from the ROOT of an ops-uluops-api checkout (its zod and source must
 * resolve), and regenerate whenever that repo's analysis save schemas change:
 *
 *   cp <ops-mcp>/scripts/derive-server-accepted-entries.ts <ops-api>/derive-tmp.ts
 *   cd <ops-api> && DB_PASSWORD=test NODE_ENV=test npx tsx derive-tmp.ts \
 *     > <ops-mcp>/src/__tests__/fixtures/server-accepted-analysis-entries.json
 *   rm derive-tmp.ts
 */
import { SaveRunSchema, toSaveRunInput } from './src/controllers/run-transformers.ts';
import { normalizeKeys } from './src/utils/case-transform.ts';
import { execSync } from 'node:child_process';

const s = (n: number, c = 'x') => c.repeat(n);
const nest = (d: number): unknown => (d === 0 ? 'leaf' : { n: nest(d - 1) });
const rec = (o: Record<string, unknown>) => ({ record_type: 'finding', record_id: 'r-1', title: 't', data: {}, ...o });
const sum = (o: Record<string, unknown>) => ({ decision: 'PASS', ...o });
const section = (type: string, extra: Record<string, unknown> = {}) => ({ type, label: 'L', summary: 'S', ...extra });
const SECTIONS = [
  section('inventory', { items: [{ a: 1 }], gaps: ['g'] }),
  section('topology', { entities: [{ e: 1 }], relationships: [{ r: 1 }], clusters: [{ c: 1 }] }),
  section('landscape', { dimensions: ['d'], findings: [{ f: 1 }] }),
  section('classification', { hierarchy: [{ h: 1 }] }),
  section('mapping', { source_domain: 'a', target_domain: 'b', translations: [{ t: 1 }] }),
  section('synthesis', { patterns: [{ p: 1 }], archetypes: [{ a: 1 }] }),
  section('limitation', { blind_spots: [{ b: 1 }] }),
  section('agenda', { questions: [{ q: 1 }] }),
];
const map = (sections: unknown[]) => ({ metadata: { explorer_name: 'deep-explore', framework: 'structural', artifact_path: 'src/' }, sections });

const records: Array<[string, Record<string, unknown>]> = [
  ['minimal', rec({})],
  ['agent_name 100 chars', rec({ agent_name: s(100, 'a') })],
  ['agent_name padded (trimmed)', rec({ agent_name: '  agent-a  ' })],
  ['agent_name empty (counts as absent)', rec({ agent_name: '' })],
  ['agent_name whitespace (counts as absent)', rec({ agent_name: '   ' })],
  ['agent_name 101 chars', rec({ agent_name: s(101, 'a') })],
  ['record_id 100 chars', rec({ record_id: s(100, 'i') })],
  ['record_id empty', rec({ record_id: '' })],
  ['record_id 101 chars', rec({ record_id: s(101, 'i') })],
  ['record_type 50 chars', rec({ record_type: s(50, 'r') })],
  ['record_type empty', rec({ record_type: '' })],
  ['title empty', rec({ title: '' })],
  ['title 500 chars', rec({ title: s(500, 't') })],
  ['classification 50 chars', rec({ classification: s(50, 'c') })],
  ['classification null', rec({ classification: null })],
  ...(['critical', 'high', 'medium', 'low', 'info'] as const).map(v => [`severity ${v}`, rec({ severity: v })] as [string, Record<string, unknown>]),
  ['severity null', rec({ severity: null })],
  ...(['validator', 'analyst', 'explorer', 'forecaster', 'executor', 'generator'] as const).map(v => [`agent_type ${v}`, rec({ agent_name: 'agent-a', agent_type: v })] as [string, Record<string, unknown>]),
  ['agent_type null', rec({ agent_type: null })],
  ['data nested 7 levels', rec({ data: nest(7) as Record<string, unknown> })],
  ['data ~60 KiB', rec({ data: { blob: s(60_000) } })],
  ['data mixed values', rec({ data: { n: 1.5, b: true, s: 'x', a: [1, 'two'], o: { k: null } } })],
  // Adversarial (R3 review B1): length is counted in UTF-16 units on both sides, padding
  // is trimmed before the cap, unknown keys are stripped, null names count as absent.
  ['agent_name padded to 103 chars, 100 after trim', rec({ agent_name: `  ${s(100, 'a')} ` })],
  ['agent_name 50 surrogate pairs (100 UTF-16 units)', rec({ agent_name: '\u{1F600}'.repeat(50) })],
  ['agent_name 51 surrogate pairs (102 UTF-16 units)', rec({ agent_name: '\u{1F600}'.repeat(51) })],
  ['record_id 50 surrogate pairs (100 UTF-16 units)', rec({ record_id: '\u{1F600}'.repeat(50) })],
  ['agent_name null', rec({ agent_name: null })],
  ['unknown extra key', rec({ extra_key: 'stripped' })],
  ['title with newline and quotes', rec({ title: 'line1\n"quoted"' })],
];
const summaries: Array<[string, Record<string, unknown>]> = [
  ['minimal', sum({})],
  ['decision empty', sum({ decision: '' })],
  ['decision 50 chars', sum({ decision: s(50, 'D') })],
  ['score 0', sum({ score: 0 })],
  ['score 100', sum({ score: 100 })],
  ['score fractional 2.5', sum({ score: 2.5 })],
  ['score null', sum({ score: null })],
  ['agent_name 100 chars', sum({ agent_name: s(100, 'a') })],
  ['agent_name empty (counts as absent)', sum({ agent_name: '' })],
  ['agent_name whitespace (counts as absent)', sum({ agent_name: '   ' })],
  ...(['validator', 'analyst', 'explorer', 'forecaster', 'executor', 'generator'] as const).map(v => [`agent_type ${v}`, sum({ agent_name: 'agent-a', agent_type: v })] as [string, Record<string, unknown>]),
  ['decision_vocabulary 100 chars', sum({ decision_vocabulary: s(100, 'v') })],
  ['decision_vocabulary null', sum({ decision_vocabulary: null })],
  ['category_scores weight 1 score 0', sum({ category_scores: [{ name: 'C', weight: 1, score: 0 }] })],
  ['category_scores 50 entries', sum({ category_scores: Array.from({ length: 50 }, (_v, i) => ({ name: `c${String(i)}`, weight: 2, score: 1 })) })],
  ['category_scores fractional score', sum({ category_scores: [{ name: 'C', weight: 30, score: 27.5 }] })],
  ['category_scores null', sum({ category_scores: null })],
  ['system_metrics mixed', sum({ system_metrics: { fearsIdentified: 6, scope: 'architectural', clean: true } })],
  ['epistemic_assessment', sum({ epistemic_assessment: { fsRisk: 'LOW' } })],
  ['audit_implications 50 x 2000 chars', sum({ audit_implications: Array.from({ length: 50 }, () => s(2000, 'i')) })],
  ['exploration_maps every section type', sum({ exploration_maps: [map(SECTIONS)] })],
  ['exploration_maps 50 sections', sum({ exploration_maps: [map(Array.from({ length: 50 }, () => SECTIONS[0]))] })],
  ['exploration_maps 20 maps', sum({ exploration_maps: Array.from({ length: 20 }, () => map([SECTIONS[0]])) })],
  ['exploration_maps section with extra key', sum({ exploration_maps: [map([{ ...SECTIONS[0], extra_note: 'kept' }])] })],
  ['exploration_maps null', sum({ exploration_maps: null })],
  ['agent_name padded to 103 chars, 100 after trim', sum({ agent_name: `  ${s(100, 'a')} ` })],
  ['agent_name null', sum({ agent_name: null })],
  ['unknown extra key', sum({ extra_key: 'stripped' })],
];

const base = { project: 'p', workflow_type: 'w', agents: [{ name: 'agent-a', decision: 'PASS' }, { name: 'agent-b', decision: 'PASS' }], recommendations: [] };
function judge(kind: 'records' | 'summaries', entry: Record<string, unknown>): boolean {
  const body = kind === 'records' ? { ...base, analysis_records: [entry] } : { ...base, analysis_summary: [entry] };
  const parsed = SaveRunSchema.safeParse(normalizeKeys(body as Record<string, unknown>));
  if (!parsed.success) return false;
  const input = toSaveRunInput(parsed.data);
  const arr = (kind === 'records' ? input.analysisRecords : input.analysisSummary) as unknown[] | undefined;
  const first = Array.isArray(arr) ? arr[0] : arr;
  return !(first && typeof first === 'object' && (first as { invalid?: boolean }).invalid === true);
}
const sha = execSync('git rev-parse --short HEAD').toString().trim();
const out = { derivedFrom: `ops-uluops-api ${sha} SaveRunSchema + toSaveRunInput (save path)`, derivedAt: new Date().toISOString().slice(0, 10), records: [] as unknown[], summaries: [] as unknown[], serverRejects: [] as string[] };
for (const [label, e] of records) (judge('records', e) ? out.records.push({ label, entry: e }) : out.serverRejects.push(`record: ${label}`));
for (const [label, e] of summaries) (judge('summaries', e) ? out.summaries.push({ label, entry: e }) : out.serverRejects.push(`summary: ${label}`));
process.stdout.write(JSON.stringify(out, null, 1));
