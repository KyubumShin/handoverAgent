import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { KnowledgeStore } from '../lib/knowledge-store.js';
import { findRelevantEntries, getTopicSummary } from '../lib/knowledge-indexer.js';

export function registerSearchTools(server: McpServer, store: KnowledgeStore): void {
  server.tool(
    'handover_search',
    'Search knowledge entries with ranked relevance',
    {
      query: z.string().describe('Search query'),
      limit: z.number().min(1).max(100).default(10).describe('Maximum number of results'),
    },
    async ({ query, limit }) => {
      try {
        const allEntries = store.getAllEntries();
        const results = findRelevantEntries(query, allEntries, limit);

        const formatted = results.map(entry => ({
          id: entry.id,
          title: entry.title,
          category: entry.category,
          confidence: entry.confidence,
          snippet: entry.content.substring(0, 200) + (entry.content.length > 200 ? '...' : ''),
          tags: entry.tags,
        }));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ results: formatted, count: formatted.length }),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: String(error) }),
            },
          ],
        };
      }
    }
  );

  server.tool(
    'handover_topic_summary',
    'Get entry counts per category',
    {},
    async () => {
      try {
        const allEntries = store.getAllEntries();
        const summary = getTopicSummary(allEntries);

        const result = Array.from(summary.entries()).map(([category, count]) => ({
          category,
          count,
        }));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ summary: result, totalEntries: allEntries.length }),
            },
          ],
        };
      } catch (error) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: String(error) }),
            },
          ],
        };
      }
    }
  );
}
