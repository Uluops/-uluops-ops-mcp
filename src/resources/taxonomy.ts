/**
 * Taxonomy MCP resource
 *
 * Provides read-only access to the failure taxonomy via validation:// URI scheme.
 * Fetches taxonomy data from the tracker API via SDK on first access,
 * caches for 1 hour, and serves stale data on errors.
 *
 * Previously contained a hardcoded divergent taxonomy with completely
 * different mode codes. Now serves the canonical taxonomy from the DB.
 *
 * See: dynamic-taxonomy-spec-v1_0_0.md, Phase 5.
 */

import type { OpsClient } from '@uluops/ops-sdk';
import type { McpServerResourceRegistration } from '../types/index.js';
import { createResourceResponse } from './response-helpers.js';

const CACHE_TTL_MS = 3_600_000; // 1 hour

interface TaxonomyCache {
  data: unknown;
  expiry: number;
}

let cache: TaxonomyCache | null = null;

async function getTaxonomyData(opsClient: OpsClient): Promise<unknown> {
  // Serve from cache if fresh
  if (cache && Date.now() < cache.expiry) {
    return cache.data;
  }

  try {
    const taxonomy = await opsClient.taxonomy.get();
    cache = { data: taxonomy, expiry: Date.now() + CACHE_TTL_MS };
    return taxonomy;
  } catch {
    // Serve stale cache on error
    if (cache) return cache.data;
    // Name the config knob, matching the tool-layer NetworkError guidance —
    // the resource path previously gave no pointer at what to check.
    throw new Error(
      'Taxonomy unavailable: tracker API unreachable and no cached data. ' +
      'Verify the API is running and reachable at the configured base URL ' +
      '(ULUOPS_BASE_URL if overridden, otherwise the ops-sdk production default).'
    );
  }
}

/**
 * Register taxonomy resource
 */
export function registerTaxonomyResource(
  server: McpServerResourceRegistration,
  opsClient: OpsClient,
): void {
  server.resource(
    'taxonomy',
    'validation://taxonomy',
    {
      description: 'Failure taxonomy schema for classifying validation issues',
      mimeType: 'application/json',
    },
    async () => {
      const taxonomy = await getTaxonomyData(opsClient);
      return createResourceResponse('validation://taxonomy', taxonomy);
    },
  );
}
