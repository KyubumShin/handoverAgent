import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { KnowledgeStore } from '../lib/knowledge-store.js';
import type { KnowledgeEntry, KnowledgeSource } from '../lib/types.js';

export function registerStoreTools(server: McpServer, store: KnowledgeStore, dataDir: string): void {
  server.tool(
    'handover_init',
    'Initialize .handover directory structure',
    {
      dataDir: z.string().optional().describe('Data directory path (defaults to .handover)'),
    },
    async () => {
      try {
        store.init();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, dataDir }),
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
    'handover_add_entry',
    'Add a knowledge entry to the store',
    {
      title: z.string().describe('Entry title'),
      content: z.string().describe('Entry content'),
      category: z.enum([
        'architecture',
        'codebase',
        'process',
        'people',
        'decision',
        'tool',
        'convention',
        'domain',
        'other',
      ]).describe('Knowledge category'),
      tags: z.array(z.string()).default([]).describe('Tags for categorization'),
      source: z.object({
        type: z.enum(['file', 'git', 'doc', 'manual', 'qa']),
        path: z.string().optional(),
        ref: z.string().optional(),
      }).describe('Knowledge source'),
      confidence: z.number().min(0).max(1).default(0.8).describe('Confidence score (0-1)'),
    },
    async ({ title, content, category, tags, source, confidence }) => {
      try {
        const entry: KnowledgeEntry = {
          id: '',
          title,
          content,
          category,
          tags,
          source: source as KnowledgeSource,
          confidence,
          createdAt: '',
          updatedAt: '',
        };

        const result = await store.addEntry(entry);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result),
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
    'handover_get_entry',
    'Get a knowledge entry by ID',
    {
      id: z.string().describe('Entry ID'),
    },
    async ({ id }) => {
      try {
        const entry = store.getEntry(id);
        if (!entry) {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify({ error: 'Entry not found' }),
              },
            ],
          };
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(entry),
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
    'handover_delete_entry',
    'Delete a knowledge entry by ID',
    {
      id: z.string().describe('Entry ID'),
    },
    async ({ id }) => {
      try {
        const deleted = await store.deleteEntry(id);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ deleted }),
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
    'handover_list_entries',
    'List all knowledge entries, optionally filtered by category',
    {
      category: z.enum([
        'architecture',
        'codebase',
        'process',
        'people',
        'decision',
        'tool',
        'convention',
        'domain',
        'other',
      ]).optional().describe('Filter by category'),
    },
    async ({ category }) => {
      try {
        let entries = store.getAllEntries();
        if (category) {
          entries = entries.filter(e => e.category === category);
        }
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ entries, count: entries.length }),
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
    'handover_rebuild_index',
    'Rebuild the knowledge index',
    {},
    async () => {
      try {
        const index = await store.rebuildIndex();
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(index),
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
