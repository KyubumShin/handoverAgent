import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readJSON, writeJSON } from '../lib/file-utils.js';
import { KnowledgeStore } from '../lib/knowledge-store.js';
import type { HandoverProfile } from '../lib/types.js';

export function registerProfileTools(server: McpServer, dataDir: string): void {
  const profilePath = join(dataDir, 'profile.json');

  server.tool(
    'handover_create_profile',
    'Create a handover profile',
    {
      type: z.enum(['project', 'role', 'team']).describe('Profile type'),
      name: z.string().describe('Profile name'),
      description: z.string().describe('Profile description'),
    },
    async ({ type, name, description }) => {
      try {
        const profile: HandoverProfile = {
          id: randomUUID(),
          type,
          name,
          description,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          sources: [],
          metadata: {},
        };

        writeJSON(profilePath, profile);

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(profile),
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
    'handover_get_profile',
    'Get the current handover profile',
    {},
    async () => {
      try {
        const profile = readJSON<HandoverProfile>(profilePath);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(profile || { profile: null }),
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
    'handover_get_status',
    'Get overview stats about the handover knowledge base',
    {},
    async () => {
      try {
        const store = new KnowledgeStore(dataDir);
        const profile = readJSON<HandoverProfile>(profilePath);
        const index = store.getIndex();
        const allEntries = store.getAllEntries();

        // Count entries per category
        const categories: Record<string, number> = {};
        for (const entry of allEntries) {
          categories[entry.category] = (categories[entry.category] || 0) + 1;
        }

        // Count interactions
        const interactionLogPath = join(dataDir, 'interactions', 'log.jsonl');
        let interactionCount = 0;
        try {
          const { readLines } = await import('../lib/file-utils.js');
          const lines = readLines(interactionLogPath);
          interactionCount = lines.length;
        } catch {
          // Ignore if no log exists
        }

        const status = {
          profile,
          entryCount: index.totalEntries,
          categories,
          lastUpdated: index.lastUpdated,
          interactionCount,
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(status),
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
