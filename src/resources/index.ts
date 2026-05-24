/**
 * Resource registry - registers all MCP resources
 */

import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerResourceRegistration } from '../types/index.js';
import { registerProjectsResource } from './projects.js';
import { registerTaxonomyResource } from './taxonomy.js';

/**
 * Register all MCP resources
 */
export function registerAllResources(
  server: McpServerResourceRegistration,
  opsClient: OpsClient
): void {
  registerProjectsResource(server, opsClient);
  registerTaxonomyResource(server, opsClient);
}

// Re-export for testing
export { registerProjectsResource } from './projects.js';
export { registerTaxonomyResource } from './taxonomy.js';
