/**
 * Arm-to-destroy — confirmation-and-org-provenance spec v0.2.0, D1–D3 (+ D5).
 *
 * Every confirmation this server checks (`confirm`, `confirmation_phrase`,
 * `confirm_cross_org`) is a value the model typed, and the model's context is
 * fed by text other tracker users wrote (circumvention run #9 A1, confirmed by
 * falsification run #12). `ULUOPS_ALLOW_DESTRUCTIVE` is the one factor the
 * model has no path to: process environment, read once at boot.
 *
 * Default is ARMED (unset → today's behaviour + a boot warning) — Alex's call,
 * 2026-09-24, on install friction; the spec's changelog keeps the "refused by
 * default" recommendation it overrode. So this gate bounds only registrations
 * whose operator set `false`. The description sentence below is how the model
 * learns the env exists: the boot warning goes to stderr, which it never sees.
 *
 * The set and the annotations are defined here, once, and applied at the
 * registration seam (`registerAllTools`, `src/index.ts`), so gate, label and
 * description note cannot disagree. They can all be wrong together — a new
 * write tool left out of both gate lists below — which is why an unclassified
 * write is labelled destructive and fails the parity test.
 */
import type { ZodRawShape } from 'zod';
import type { McpServerToolRegistration, McpToolResponse, ToolHandler } from '../types/index.js';
import type { DestructiveMode } from '../types/index.js';
import { toolRegistry } from '../config/tool-registry.js';

/**
 * D2 — the destructive set. The v0.1.0 nine plus `merge_issues` and
 * `soft_delete_issue`, which exist and were missed, plus `update_status`
 * (code audit of 0.22.0): it makes the same `bulkUpdateIssueStatus` call as
 * `bulk_update_status` with NO array cap, so leaving it out meant a disarmed
 * server could still re-status every issue in one call. Single-issue edits
 * (`update_issue_by_fingerprint`, `undo_issue_status`, `edit_issue`,
 * `update_project`) are deliberately outside it — see the spec's changelog.
 * Narrow only after the A11 reversibility probe reads the bulk paths at the API.
 */
export const DESTRUCTIVE_TOOLS: ReadonlySet<string> = new Set([
  'delete_project',
  'soft_delete_project',
  'delete_run',
  'merge_projects',
  'rehome_project',
  'archive_runs',
  'bulk_update_status',
  'update_status',
  'update_run',
  'update_profile',
  'merge_issues',
  'soft_delete_issue',
]);

/**
 * Every OTHER write tool, named — so gate membership is a closed decision, not
 * an absence (anxiety-reader F4). A write tool in neither set fails the parity
 * test until someone classifies it.
 *
 * Outside the gate by decision (spec v0.2.1 changelog): the switch bounds bulk
 * and irreversible operations, not every write. That is NOT a claim these are
 * harmless — several overwrite data one record at a time (see ADDITIVE_WRITES).
 */
export const UNGATED_WRITES: ReadonlySet<string> = new Set([
  'save_run',
  'add_issue_note',
  'edit_issue',
  'create_issue',
  'create_project',
  'update_project',
  'restore_project',
  'update_issue_by_fingerprint',
  'restore_issue',
  'undo_issue_status',
]);

/**
 * The writes that only ADD — the one case MCP defines `destructiveHint: false`
 * for ("performs only additive updates"). Everything else that writes gets
 * `destructiveHint: true`, gated or not: `save_run` can reopen issues,
 * `edit_issue` / `update_project` / `update_issue_by_fingerprint` /
 * `undo_issue_status` overwrite, `restore_*` reverse a decision. The first cut
 * of 0.22.0 labelled all ungated writes `false`, which told annotation-reading
 * hosts those tools were safe when MCP's own default had said otherwise
 * (circumvention-forecaster A8). The label describes the effect; the gate is
 * the D2 decision — they are different questions.
 */
export const ADDITIVE_WRITES: ReadonlySet<string> = new Set([
  'add_issue_note',
  'create_issue',
  'create_project',
]);

export const DESTRUCTIVE_ENV = 'ULUOPS_ALLOW_DESTRUCTIVE';

/** Appended to each destructive tool's description — the channel the model reads. */
export const DESTRUCTIVE_DESCRIPTION_NOTE =
  `Destructive: the server operator can disable this tool by setting ${DESTRUCTIVE_ENV}=false in the MCP server registration.`;

/**
 * Appended as well for the five that carry `requiresUserInteraction` (operators-eye
 * FM-3): a host that denies the call never reaches this server, so the server's
 * "do not substitute" refusal text never arrives — the instruction has to be in
 * the description, before the attempt.
 */
export const PROMPTED_DESCRIPTION_NOTE =
  'Claude Code asks the user to approve each call. If the call is denied or refused, stop and tell the user — ' +
  'do not use another tool (archive, soft-delete, bulk status) to achieve the same effect.';

let mode: DestructiveMode = 'default';

/** Set once at boot from `config.api.destructive`. */
export function setDestructiveMode(m: DestructiveMode): void {
  mode = m;
}

export function getDestructiveMode(): DestructiveMode {
  return mode;
}

export function isDestructiveArmed(): boolean {
  return mode !== 'disarmed';
}

/**
 * A refused call leaves a trace (code audit F2): a disarmed server that blocks
 * an injected `delete_project` is exactly the event the operator needs to see.
 * Its own sink, like D4's — the org-call record is for calls that resolved an
 * org, and a refused one never did.
 */
export type DestructiveRefusalSink = (tool: string) => void;
const defaultRefusalSink: DestructiveRefusalSink = (tool) => {
  process.stderr.write(`[mcp-tool-refused] tool=${tool} code=DESTRUCTIVE_NOT_ARMED — ${DESTRUCTIVE_ENV}=false\n`);
};
let refusalSink: DestructiveRefusalSink = defaultRefusalSink;
export function setDestructiveRefusalSink(sink: DestructiveRefusalSink | undefined): void {
  refusalSink = sink ?? defaultRefusalSink;
}

/**
 * The terminal refusal. Same shape as D15's `ORG_NOT_ALLOWED`, but with no org
 * echo: it fires before org resolution, so no org was resolved to report.
 */
export function destructiveRefusal(toolName: string): McpToolResponse {
  return {
    content: [{ type: 'text', text: JSON.stringify({
      error: `\`${toolName}\` is disabled on this server (${DESTRUCTIVE_ENV}=false). Nothing was applied.`,
      tool: toolName,
      code: 'DESTRUCTIVE_NOT_ARMED',
      status: 403,
      terminal: true,
      applied: false,
      suggestion:
        'Terminal — the operator disabled destructive tools for this MCP server. Do NOT retry, and do NOT look for ' +
        'another tool that achieves the same effect. Tell the user; the operator can enable them by setting ' +
        `${DESTRUCTIVE_ENV}=true in the server registration.`,
    }) }],
    isError: true,
  };
}

/**
 * Wrap a registration so the D2 tools are gated and labelled. The gate is an
 * outer handler: it runs before `createToolHandler` (org resolution, its Zod
 * parse, `preProcess`, the SDK), so a disarmed call touches nothing. It does
 * NOT run before the MCP SDK's own protocol-layer `inputSchema` check, which
 * precedes every handler: a malformed call to a disarmed tool gets a
 * validation error, not `DESTRUCTIVE_NOT_ARMED` — neither reaches the API.
 * The mode is read per call from module state set at boot, never from arguments.
 *
 * @param server - The registration to wrap
 * @returns A registration that gates and annotates the destructive set
 */
export function withDestructiveGate(server: McpServerToolRegistration): McpServerToolRegistration {
  return {
    tool: (name, description, schema, handler): void => {
      if (!DESTRUCTIVE_TOOLS.has(name)) {
        server.tool(name, description, schema, handler);
        return;
      }
      const gated: ToolHandler = async (args) => {
        if (isDestructiveArmed()) return handler(args);
        refusalSink(name);
        return destructiveRefusal(name);
      };
      const notes = REQUIRES_USER_INTERACTION.has(name)
        ? `${DESTRUCTIVE_DESCRIPTION_NOTE} ${PROMPTED_DESCRIPTION_NOTE}`
        : DESTRUCTIVE_DESCRIPTION_NOTE;
      server.tool(name, `${description.trimEnd()} ${notes}`, schema, gated);
    },
  };
}

/** MCP `ToolAnnotations` — hints only; see spec §2 on what Claude Code documents. */
export interface ToolAnnotationHints {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint?: boolean;
  openWorldHint: boolean;
}

const READ_TOOLS = new Set(toolRegistry.filter((t) => t.sideEffects === 'read').map((t) => t.name));

/**
 * D3 — annotations, derived from `tool-registry.ts`'s `sideEffects` and
 * ADDITIVE_WRITES. `readOnlyHint` on reads; `destructiveHint: false` only on
 * purely additive writes; `true` on every other write, including the ungated
 * ones; `idempotentHint: false` on the gated set. `openWorldHint: false`
 * everywhere — the server reaches one API.
 *
 * @param name - Tool name
 * @returns The annotations for that tool
 */
export function toolAnnotations(name: string): ToolAnnotationHints {
  if (DESTRUCTIVE_TOOLS.has(name)) {
    return { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false };
  }
  if (READ_TOOLS.has(name)) {
    return { readOnlyHint: true, destructiveHint: false, openWorldHint: false };
  }
  if (ADDITIVE_WRITES.has(name)) {
    return { readOnlyHint: false, destructiveHint: false, openWorldHint: false };
  }
  // Every other write — ungated overwrites and anything unclassified — is
  // destructive in MCP's sense; never label toward "safe" by default.
  return { readOnlyHint: false, destructiveHint: true, openWorldHint: false };
}

/**
 * The irreversible five — carry `_meta["anthropic/requiresUserInteraction"]`
 * (Alex, 2026-09-24). Claude Code documents that such a tool prompts the human
 * directly in every mode, allow rules and `allow` hooks notwithstanding, and is
 * denied in `dontAsk` mode (code.claude.com/docs/en/permission-modes,
 * …/permissions, read 2026-09-24). That is the second factor this spec looked
 * for: a person, not a value the model typed. Kept to operations rare enough
 * that one click costs little; `update_run`, `bulk_update_status` and
 * `archive_runs` run inside pipelines and stay prompt-free. Other hosts may
 * ignore the key — it is Anthropic-namespaced.
 */
export const REQUIRES_USER_INTERACTION: ReadonlySet<string> = new Set([
  'delete_project',
  'delete_run',
  'merge_projects',
  'rehome_project',
  'update_profile',
]);

/**
 * @param name - Tool name
 * @returns The `_meta` for that tool's registration, or `undefined` for none
 */
export function toolMeta(name: string): Record<string, unknown> | undefined {
  return REQUIRES_USER_INTERACTION.has(name) ? { 'anthropic/requiresUserInteraction': true } : undefined;
}

/**
 * The `registerTool` config for one tool: description, input shape, D3
 * annotations and, for the irreversible five, the Claude Code `_meta` flag.
 * Built here rather than inline in `main()` so it can be tested — `main()`'s
 * registration path is mocked in every test.
 *
 * @param name - Tool name
 * @param description - Final description (after both wrappers)
 * @param inputSchema - Raw Zod shape
 * @returns The config object `SecureMcpServer.registerTool` forwards unchanged
 */
export function toolRegistrationConfig(
  name: string,
  description: string,
  inputSchema: ZodRawShape,
): { description: string; inputSchema: ZodRawShape; annotations: ToolAnnotationHints; _meta?: Record<string, unknown> } {
  const meta = toolMeta(name);
  return { description, inputSchema, annotations: toolAnnotations(name), ...(meta !== undefined ? { _meta: meta } : {}) };
}
