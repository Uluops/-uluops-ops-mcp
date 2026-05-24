/**
 * Projects MCP resource
 *
 * Provides read-only access to project listing via validation:// URI scheme.
 */

import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerResourceRegistration } from '../types/index.js';
import { createResourceResponse, createErrorResourceResponse } from './response-helpers.js';

/**
 * Register projects resource and template
 */
export function registerProjectsResource(
  server: McpServerResourceRegistration,
  opsClient: OpsClient
): void {
  // Static resource: list all projects
  server.resource(
    'projects',
    'validation://projects',
    {
      description: 'List all tracked projects',
      mimeType: 'application/json',
    },
    async () => {
      try {
        const result = await opsClient.projects.list();
        return createResourceResponse('validation://projects', result);
      } catch (error) {
        const rawMessage = error instanceof Error ? error.message : 'Unknown error';
        // Redact any credential values before exposing in resource response
        const message = rawMessage.replace(/ulr_[a-zA-Z0-9]{20,}/g, '[REDACTED]')
          .replace(/bearer\s+[a-zA-Z0-9_\-.]+/gi, '[REDACTED]');
        return createErrorResourceResponse('validation://projects', message);
      }
    }
  );

  // Template resource: get specific project summary
  // Note: MCP SDK resource handlers don't receive the actual requested URI,
  // so we cannot extract the {project} parameter at runtime. Instead, we
  // register this as a discoverable pattern and direct users to the tool API.
  // This is a known SDK limitation, not a bug - tools are the primary interface.
  server.resource(
    'project-summary',
    'validation://projects/{project}',
    {
      description: 'Project summary pattern - use get_project_summary tool for actual data',
      mimeType: 'application/json',
    },
    () => {
      return Promise.resolve(
        createResourceResponse('validation://projects/{project}', {
          info: 'This resource template advertises the URL pattern. Use the tool API for actual data.',
          tool: 'get_project_summary',
          example: 'get_project_summary({ project: "my-project" })',
          note: 'MCP SDK limitation: resource handlers cannot access URI template parameters',
        })
      );
    }
  );
}
