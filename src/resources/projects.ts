/**
 * Projects MCP resource
 *
 * Provides read-only access to project listing via validation:// URI scheme.
 */

import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerResourceRegistration } from '../types/index.js';
import { createResourceResponse, createErrorResourceResponse } from './response-helpers.js';
import { redactCredentials } from '../client/sdk-error-mapper.js';

/**
 * Register projects resource and template
 */
export function registerProjectsResource(
  server: McpServerResourceRegistration,
  opsClient: OpsClient
): void {
  // Static resource: list all projects
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- MCP SDK 1.x deprecates tool()/resource() for registerTool()/registerResource(); still supported. Migration tracked separately (mcp-secure-server 0.0.24 surfaced the SDK's @deprecated through its now-typed methods).
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
        // Redact any credential values before exposing in resource response.
        // Shared with the tool path since 0.21.1 — this used to carry its own
        // copy of the key regex, narrower than the accepted key shape.
        const message = redactCredentials(rawMessage);
        return createErrorResourceResponse('validation://projects', message);
      }
    }
  );

  // Template resource: points a project-specific read at get_project_summary.
  //
  // Until 0.21.1 this was registered as the LITERAL string
  // 'validation://projects/{project}', on the premise that "MCP SDK resource
  // handlers don't receive the actual requested URI". That premise is false
  // for a `ResourceTemplate` (the SDK passes the URI and matched variables —
  // SecureMcpServer.resource forwards the template untouched). The literal
  // registration meant only the placeholder itself resolved; the natural read
  // (validation://projects/my-project) got a bare -32602 "not found" with none
  // of the guidance below (consumer-validate run #13, dx-validator).
  //
  // Deliberately NOT done: serving the summary itself from this resource.
  // Resources carry no `org` argument and land on the personal org by
  // construction (response-helpers.ts, emitResourceRead), so a data-bearing
  // project read here would be a second path to project data outside the
  // D13/D15 org seam that every tool goes through. The tool stays the one
  // way to read a summary; the resource only routes there.
  //
  // The `list` callback is load-bearing for DISCOVERY. A template is normally
  // advertised through `resources/templates/list`, but mcp-secure-server
  // (0.0.22-security) refuses that method at its INVALID_MCP_METHOD layer, so
  // with `list: undefined` the pattern vanished from every listing a client
  // can reach. Listing the placeholder entry keeps `resources/list` exactly as
  // it was under the literal registration (3 entries). It lists no real
  // projects — that would be an unscoped API read on every resources/list.
  const description = 'Project summary pattern - use get_project_summary tool for actual data';
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- MCP SDK 1.x deprecates tool()/resource() for registerTool()/registerResource(); still supported. Migration tracked separately (mcp-secure-server 0.0.24 surfaced the SDK's @deprecated through its now-typed methods).
  server.resource(
    'project-summary',
    new ResourceTemplate('validation://projects/{project}', {
      list: (): { resources: Array<{ uri: string; name: string; description: string; mimeType: string }> } => ({
        resources: [
          {
            uri: 'validation://projects/{project}',
            name: 'project-summary',
            description,
            mimeType: 'application/json',
          },
        ],
      }),
    }),
    {
      description,
      mimeType: 'application/json',
    },
    (uri: URL, variables: Record<string, string | string[]>) => {
      const raw = variables['project'];
      let project = (Array.isArray(raw) ? raw[0] : raw) ?? '';
      try {
        project = decodeURIComponent(project);
      } catch {
        // malformed escape — show it as sent
      }
      // Reading the listed placeholder itself matches the template with
      // project = "{project}"; the example should show a usable call.
      if (project === '' || project === '{project}') project = 'my-project';
      return Promise.resolve(
        createResourceResponse(uri.href, {
          info: 'This resource routes to the tool API, which is the only way to read a project summary.',
          tool: 'get_project_summary',
          example: `get_project_summary(${JSON.stringify({ project: project.slice(0, 200) })})`,
          note: 'Resources do not carry an org argument; get_project_summary does, and applies the org allowlist.',
        })
      );
    }
  );
}
