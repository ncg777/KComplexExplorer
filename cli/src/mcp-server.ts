#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import {
  ensureInitialized,
  analyze,
  identify,
  listPCS,
  getSubsets,
  getSupersets,
  union,
  intersection,
  zRelations,
  transpose,
  formatAnalysis,
  type PCS12Analysis,
} from './pcs12-operations.js';

function formatResult(analysis: PCS12Analysis): string {
  return formatAnalysis(analysis);
}

function formatMultipleResults(results: PCS12Analysis[]): string {
  if (results.length === 0) return 'No results found.';
  return results.map(r => formatResult(r)).join('\n---\n') + `\n\nTotal: ${results.length} results`;
}

async function main(): Promise<void> {
  // Suppress console.log during PCS12 init since stdout is reserved for JSON-RPC.
  // The ultra-mega-enumerator library logs debug messages to console.log.
  const originalLog = console.log;
  console.log = (...args: unknown[]) => {
    console.error('[init]', ...args);
  };
  await ensureInitialized();
  console.log = originalLog;

  const server = new McpServer({
    name: 'kcomplex-explorer',
    version: '2026.2.6',
  });

  // Tool: analyze
  server.tool(
    'analyze',
    'Analyze a pitch-class set by its Forte number. Returns common name, pitch classes, intervals, interval vector, symmetries, tension partition, and cardinality.',
    {
      forte: z.string().describe('Forte number of the pitch-class set (e.g., "3-11A", "7-35", "6-z29")'),
    },
    async ({ forte }) => {
      try {
        const result = analyze(forte);
        return {
          content: [{ type: 'text' as const, text: formatResult(result) }],
        };
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  // Tool: identify
  server.tool(
    'identify',
    'Identify a pitch-class set from individual pitch classes (0-11, where 0=C, 1=C#, 2=D, ..., 11=B). Returns the Forte number and full analysis.',
    {
      pitchClasses: z.array(z.number().int().min(0).max(11)).describe('Array of pitch classes (integers 0-11)'),
    },
    async ({ pitchClasses }) => {
      try {
        const result = identify(pitchClasses);
        return {
          content: [{ type: 'text' as const, text: formatResult(result) }],
        };
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  // Tool: list_pcs
  server.tool(
    'list_pcs',
    'List all pitch-class sets (PCS), optionally filtered by an upper bound scale and/or a search query. Use this to browse available PCS or find sets by name.',
    {
      upperBound: z.string().optional().describe('Forte number of the upper bound scale to filter within (e.g., "7-35" for major scale)'),
      search: z.string().optional().describe('Search query to filter by Forte number or common name (e.g., "major", "3-11")'),
    },
    async ({ upperBound, search }) => {
      try {
        const results = listPCS({ upperBound, search });
        return {
          content: [{ type: 'text' as const, text: formatMultipleResults(results) }],
        };
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  // Tool: get_subsets
  server.tool(
    'get_subsets',
    'Get all subsets of a given pitch-class set. Subsets are PCS whose pitch classes are entirely contained within the given set. Optionally restrict to subsets within a specific scale.',
    {
      forte: z.string().describe('Forte number of the pitch-class set (e.g., "7-35")'),
      withinScale: z.string().optional().describe('Optional Forte number of a scale to restrict the pool of candidates'),
    },
    async ({ forte, withinScale }) => {
      try {
        const results = getSubsets(forte, withinScale);
        return {
          content: [{ type: 'text' as const, text: formatMultipleResults(results) }],
        };
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  // Tool: get_supersets
  server.tool(
    'get_supersets',
    'Get all supersets of a given pitch-class set. Supersets are PCS that contain all the pitch classes of the given set. Optionally restrict to supersets within a specific scale.',
    {
      forte: z.string().describe('Forte number of the pitch-class set (e.g., "3-11A")'),
      withinScale: z.string().optional().describe('Optional Forte number of a scale to restrict the pool of candidates'),
    },
    async ({ forte, withinScale }) => {
      try {
        const results = getSupersets(forte, withinScale);
        return {
          content: [{ type: 'text' as const, text: formatMultipleResults(results) }],
        };
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  // Tool: union
  server.tool(
    'union',
    'Compute the union of two or more pitch-class sets. Returns the PCS containing all pitch classes from all input sets.',
    {
      forteNumbers: z.array(z.string()).min(2).describe('Array of Forte numbers to compute the union of (at least 2)'),
    },
    async ({ forteNumbers }) => {
      try {
        const result = union(forteNumbers);
        return {
          content: [{ type: 'text' as const, text: formatResult(result) }],
        };
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  // Tool: intersection
  server.tool(
    'intersection',
    'Compute the intersection of two or more pitch-class sets. Returns the PCS containing only the pitch classes common to all input sets.',
    {
      forteNumbers: z.array(z.string()).min(2).describe('Array of Forte numbers to compute the intersection of (at least 2)'),
    },
    async ({ forteNumbers }) => {
      try {
        const result = intersection(forteNumbers);
        return {
          content: [{ type: 'text' as const, text: formatResult(result) }],
        };
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  // Tool: z_relations
  server.tool(
    'z_relations',
    'Find Z-related chords: pitch-class sets that share the same interval vector but have different pitch-class content. Z-relations are indicated by a "z" in the Forte number.',
    {
      forte: z.string().describe('Forte number of the pitch-class set (e.g., "6-z29")'),
    },
    async ({ forte }) => {
      try {
        const result = zRelations(forte);
        const lines: string[] = [];
        lines.push('Source chord:');
        lines.push(formatResult(result.chord));
        lines.push('');
        if (result.zMates.length === 0) {
          lines.push('No Z-related chords found.');
        } else {
          lines.push(`Z-related chords (${result.zMates.length}):`);
          for (const mate of result.zMates) {
            lines.push('---');
            lines.push(formatResult(mate));
          }
        }
        return {
          content: [{ type: 'text' as const, text: lines.join('\n') }],
        };
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  // Tool: transpose
  server.tool(
    'transpose',
    'Transpose a pitch-class set by a given number of semitones. Returns the transposed PCS with full analysis.',
    {
      forte: z.string().describe('Forte number of the pitch-class set to transpose'),
      semitones: z.number().int().describe('Number of semitones to transpose by (can be negative)'),
    },
    async ({ forte, semitones }) => {
      try {
        const result = transpose(forte, semitones);
        return {
          content: [{ type: 'text' as const, text: formatResult(result) }],
        };
      } catch (err: any) {
        return { content: [{ type: 'text' as const, text: `Error: ${err.message}` }], isError: true };
      }
    },
  );

  // Connect to stdio transport
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error('KComplexExplorer MCP server running on stdio');
}

main().catch(err => {
  console.error(`Fatal error: ${err.message}`);
  process.exit(1);
});
