import { z } from 'zod';

export const DiscoveryPageShape = {
  format: z.literal('page').optional().describe('Opt in to {data,total,limit,offset,hasMore}; required for search/sort/projection and new scope controls. Defaults: limit 50, offset 0; max limit 100. Fixed-dataset traversal; concurrent changes are not snapshot-isolated.'),
  fields: z.array(z.string()).optional().describe('Public output field names in camelCase; requires format=page. id and page metadata are always retained. Unknown/private fields are rejected.'),
};

/** New semantics must be explicit; legacy calls retain their response shape. */
export function useDiscoveryPage(input: Record<string, unknown>, extraKeys: string[] = []): boolean {
  if (input['format'] === 'page') return true;
  const selected = ['fields', 'sortBy', 'sortOrder', 'search', 'includeArchived', ...extraKeys]
    .filter(key => input[key] !== undefined);
  if (selected.length) {
    throw new z.ZodError([{ code: 'custom', path: ['format'], message: `format=page is required for: ${selected.join(', ')}` }]);
  }
  return false;
}
