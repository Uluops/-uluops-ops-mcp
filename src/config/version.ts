/**
 * This package's version and writer stamp (effectiveness-analytics spec §4.2, D56).
 * Read from package.json, as `src/index.ts` reads it for the server handshake, so
 * the stamp and the advertised server version cannot disagree.
 */
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export const OPS_MCP_VERSION: string = (require('../../package.json') as { version: string }).version;
export const OPS_MCP_WRITER_STAMP = `ops-mcp@${OPS_MCP_VERSION}`;
