/**
 * The largest save_run the tracker API accepts: every array at its API limit
 * and every documented field present.
 *
 * API limits (ops-uluops-api run-transformers.ts SaveRunSchema): agents <= 100,
 * recommendations <= 500, analysisRecords <= 100, analysisSummary <= 20,
 * rawMarkdown <= 500,000 chars. Strings are short and plain. This fixture
 * measures key count, not bytes. It must also pass the content layers, whose
 * attack patterns ordinary prose does not trip.
 *
 * Used by message-limits.test.ts to show the transport limits admit what the
 * API admits, and that the 0.32.0 limits did not.
 */

import { API_RAW_MARKDOWN_MAX_CHARS } from '../../config/message-limits.js';

const tokens = {
  input_tokens: 12_000,
  output_tokens: 3_000,
  cached_input_tokens: 0,
  reasoning_output_tokens: 0,
  thinking_tokens: 0,
  tool_tokens: 0,
  cache_creation_tokens: 400,
  cache_read_tokens: 9_000,
  total_effective_tokens: 15_400,
};

function agent(i: number): Record<string, unknown> {
  return {
    name: `review-agent-${String(i)}`,
    score: 82,
    max_score: 100,
    decision: 'PASS',
    definition_version: '1.4.0',
    summary: 'The design holds; two findings need follow-up before the next phase.',
    model: 'claude-sonnet-5',
    harness: 'claude-code',
    tokens: { ...tokens },
    duration_ms: 41_000,
    agent_id: `a${i.toString(16).padStart(16, '0')}`,
  };
}

function recommendation(i: number): Record<string, unknown> {
  return {
    agent: `review-agent-${String(i % 100)}`,
    title: `Finding ${String(i)}: error handling is not documented for this path`,
    priority: 'suggested',
    type: 'bug',
    description: 'The handler returns early without recording the outcome, so a retry cannot tell success from failure.',
    file_path: `src/services/module${String(i % 40)}.ts`,
    line_number: 10 + (i % 300),
    category: 'error-handling',
    severity: 'medium',
    failure_code: 'STR-OMI/M',
    failure_domain: 'STR',
    failure_mode: 'OMI',
    classification_confidence: 'high',
    classified_by: 'agent',
    secondary_failure_codes: ['SEM-COM/L', 'PRA-DOC/L'],
    taxonomy_version: '1.1.0',
    cluster_key: `cluster-${String(i % 250)}`,
  };
}

function record(i: number): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (let k = 0; k < 20; k++) data[`field_${String(k)}`] = `observation ${String(k)} for record ${String(i)}`;
  return {
    agent_type: 'analyst',
    agent_name: `review-agent-${String(i % 20)}`,
    record_type: 'convention',
    record_id: `convention-${String(i)}`,
    title: `Convention ${String(i)} recorded in the module layout`,
    classification: 'LIVING',
    severity: 'low',
    data,
  };
}

function summary(i: number): Record<string, unknown> {
  const metrics: Record<string, unknown> = {};
  for (let k = 0; k < 10; k++) metrics[`metric_${String(k)}`] = k;
  return {
    agent_name: `review-agent-${String(i)}`,
    agent_type: 'explorer',
    decision: 'EXPLORED',
    score: null,
    decision_vocabulary: 'EXPLORED',
    system_metrics: metrics,
    category_scores: Array.from({ length: 5 }, (_, k) => ({ name: `Category ${String(k)}`, weight: 20, score: 15 })),
    epistemic_assessment: { overall: 'moderate', evidence: 'partial', scope: 'module', drift: 'low', confidence: 'medium' },
    audit_implications: ['Re-check after the next release.', 'Track the open question.', 'No action needed now.'],
    exploration_maps: [
      {
        metadata: { explorer_name: `review-agent-${String(i)}`, framework: 'meadows', artifact_path: 'docs/design.md' },
        sections: [
          { type: 'inventory', label: 'Stocks', summary: 'What accumulates', items: Array.from({ length: 5 }, (_, k) => ({ name: `stock ${String(k)}`, kind: 'queue', note: 'grows under load' })), gaps: ['no drain rate'] },
          { type: 'topology', label: 'Loops', entities: Array.from({ length: 5 }, (_, k) => ({ id: `e${String(k)}`, label: `entity ${String(k)}` })), relationships: Array.from({ length: 4 }, (_, k) => ({ from: `e${String(k)}`, to: `e${String(k + 1)}`, kind: 'feeds' })), clusters: [{ id: 'c0', members: ['e0', 'e1'] }] },
        ],
      },
    ],
  };
}

/** Plain report prose, varied so no repeated-character pattern applies. */
export function reportMarkdown(chars: number): string {
  let out = '# Review report\n\n';
  for (let line = 0; out.length < chars; line++) {
    out += `Line ${String(line)}: the reviewer read section ${String(line % 97)} and recorded note ${String(line % 13)}.\n`;
  }
  return out.slice(0, chars);
}

export function buildLargestSaveRun(): Record<string, unknown> {
  return {
    project: 'message-limits-fixture',
    workflow_type: 'pipeline:ship',
    timestamp: '2026-10-25T12:00:00.000Z',
    agents: Array.from({ length: 100 }, (_, i) => agent(i)),
    recommendations: Array.from({ length: 500 }, (_, i) => recommendation(i)),
    summary: { all_gates_passed: false, average_score: 82 },
    raw_markdown: reportMarkdown(API_RAW_MARKDOWN_MAX_CHARS),
    idempotency_key: 'message-limits-fixture-1',
    definition_type: 'pipeline',
    definition_name: 'ship',
    definition_version: '2.1.0',
    definition_hash: '0123456789abcdef'.repeat(4),
    analysis_records: Array.from({ length: 100 }, (_, i) => record(i)),
    analysis_summary: Array.from({ length: 20 }, (_, i) => summary(i)),
  };
}

/** The JSON-RPC message the MCP host sends for a tool call. */
export function toolCallMessage(name: string, args: Record<string, unknown>): Record<string, unknown> {
  return { jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: args } };
}
