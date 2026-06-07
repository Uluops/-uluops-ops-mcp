/**
 * create_issue tool
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import {
  PrioritySchema,
  SeveritySchema,
  FailureDomainSchema,
  FilePathSchema,
  IssueTypeSchema,
  type McpServerToolRegistration,
} from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const CreateIssueInputSchema = z.object({
  project: z.string().min(1).describe('Project name'),
  title: z.string().min(1).max(500).describe('Issue title'),
  priority: PrioritySchema.describe('Issue priority'),
  type: IssueTypeSchema.optional().describe(
    'Issue type. Universal types: feature, bug, refactor, config, docs, infra, security, test. Domain-specific types (e.g., "deficiency", "ambiguity" for legal) are also accepted and resolved by the API.'
  ),
  severity: SeveritySchema.optional().describe('Issue severity'),
  category: z.string().max(100).optional().describe('Issue category'),
  description: z.string().max(10000).optional().describe('Detailed description'),
  file_path: FilePathSchema.optional().describe('File path where issue was found'),
  line_number: z.number().int().nonnegative().optional().nullable().describe('Line number in file'),
  failure_code: z
    .string()
    .regex(/^(STR|SEM|PRA|EPI)-[A-Z]{3}\/[CHMLI]$/, {
      message: 'Must match DOMAIN-MODE/SEVERITY (e.g., SEM-VAL/H, STR-OMI/M). DOMAIN ∈ {STR,SEM,PRA,EPI}; MODE = 3 uppercase letters; SEVERITY ∈ {C,H,M,L,I}.',
    })
    .optional()
    .describe('Failure code (e.g., SEM-VAL/H)'),
  failure_domain: FailureDomainSchema.optional().describe('Failure domain'),
  failure_mode: z
    .string()
    .regex(/^[A-Z]{3}$/, {
      message: 'Must be exactly 3 uppercase letters (e.g., VAL, OMI, FRA). For the full code (e.g., SEM-VAL/H), use failure_code instead.',
    })
    .optional()
    .describe('Failure mode — 3 uppercase letters (e.g., VAL, OMI)'),
  agent: z.string().max(100).optional().describe('Agent name (defaults to user-submitted)'),
});

export type CreateIssueInput = z.infer<typeof CreateIssueInputSchema>;

export function registerCreateIssueTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient
): void {
  server.tool(
    'create_issue',
    'Create a user-submitted issue directly. Use this to log issues discovered outside of validation runs. Required fields: project, title, priority.',
    CreateIssueInputSchema.shape,
    createToolHandler(CreateIssueInputSchema, (n) => opsClient.issues.create(n), { toolName: 'create_issue' })
  );
}
