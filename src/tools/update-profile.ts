/**
 * update_profile tool
 *
 * Update the authenticated user's profile. Setting a username confirms it
 * (one-time) — this is the prerequisite the registry enforces before a user
 * can create or publish definitions. Wraps the ops-sdk auth.updateProfile
 * operation, which the ops-api fold-in treats as username confirmation.
 */

import { z } from 'zod';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerToolRegistration } from '../types/index.js';
import { createToolHandler } from '../utils/tool-handler.js';

export const UpdateProfileInputSchema = z.object({
  username: z
    .string()
    .regex(/^[a-z0-9](?:[a-z0-9_-]{0,38}[a-z0-9])?$/)
    .describe(
      'Username / personal-org slug (1-40 chars, lowercase alphanumeric with internal hyphens or underscores, e.g. "ulu-labs"). Setting it confirms it one-time and unlocks creating/publishing registry definitions; it cannot be changed or removed afterward.',
    )
    .optional(),
  name: z.string().max(100).describe('Display name').optional(),
  bio: z.string().max(500).describe('Short bio').optional(),
  timezone: z
    .string()
    .describe('IANA timezone string (e.g. America/New_York)')
    .optional(),
  websiteUrl: z.string().url().max(500).describe('Website URL').optional(),
});

export type UpdateProfileInput = z.infer<typeof UpdateProfileInputSchema>;

/**
 * Register update_profile tool
 */
export function registerUpdateProfileTool(
  server: McpServerToolRegistration,
  opsClient: OpsClient,
): void {
  server.tool(
    'update_profile',
    'Update the authenticated user profile (username, name, bio, timezone, websiteUrl). Setting a username confirms it one-time and is required before creating or publishing registry definitions. At least one field must be provided. Returns the updated public user.',
    UpdateProfileInputSchema.shape,
    createToolHandler(UpdateProfileInputSchema, (n) => opsClient.auth.updateProfile(n), {
      toolName: 'update_profile',
    }),
  );
}
