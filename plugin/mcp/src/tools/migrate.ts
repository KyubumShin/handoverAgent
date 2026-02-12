import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { join } from 'node:path';
import { existsSync, copyFileSync } from 'node:fs';
import { KnowledgeStore } from '../lib/knowledge-store.js';
import { listJSONFiles, readJSON, ensureDir } from '../lib/file-utils.js';
import type { KnowledgeEntry, HandoverProfile, MigrationReport } from '../lib/types.js';

export function registerMigrateTools(server: McpServer, store: KnowledgeStore, dataDir: string): void {
  server.tool(
    'handover_migrate',
    'Import data from CLI format to MCP format',
    {
      oldDataDir: z.string().describe('Path to old .handover/data directory'),
    },
    async ({ oldDataDir }) => {
      const report: MigrationReport = {
        entriesMigrated: 0,
        entriesSkipped: 0,
        profileMigrated: false,
        feedbackMigrated: false,
        errors: [],
      };

      try {
        // Migrate knowledge entries
        const oldEntriesDir = join(oldDataDir, 'knowledge', 'entries');
        if (existsSync(oldEntriesDir)) {
          const files = listJSONFiles(oldEntriesDir);
          for (const file of files) {
            try {
              const entry = readJSON<KnowledgeEntry>(join(oldEntriesDir, file));
              if (entry) {
                const result = await store.addEntry(entry);
                if (result.deduplicated) {
                  report.entriesSkipped++;
                } else {
                  report.entriesMigrated++;
                }
              }
            } catch (error) {
              report.errors.push(`Failed to migrate entry ${file}: ${String(error)}`);
            }
          }
        }

        // Migrate profile
        const oldProfilePath = join(oldDataDir, 'profile.json');
        const newProfilePath = join(dataDir, 'profile.json');
        if (existsSync(oldProfilePath)) {
          try {
            const profile = readJSON<HandoverProfile>(oldProfilePath);
            if (profile && !existsSync(newProfilePath)) {
              copyFileSync(oldProfilePath, newProfilePath);
              report.profileMigrated = true;
            }
          } catch (error) {
            report.errors.push(`Failed to migrate profile: ${String(error)}`);
          }
        }

        // Migrate feedback history
        const oldFeedbackPath = join(oldDataDir, 'feedback', 'history.jsonl');
        const newFeedbackPath = join(dataDir, 'feedback', 'history.jsonl');
        if (existsSync(oldFeedbackPath)) {
          try {
            ensureDir(join(dataDir, 'feedback'));
            if (!existsSync(newFeedbackPath)) {
              copyFileSync(oldFeedbackPath, newFeedbackPath);
              report.feedbackMigrated = true;
            }
          } catch (error) {
            report.errors.push(`Failed to migrate feedback: ${String(error)}`);
          }
        }

        // Rebuild index after migration
        if (report.entriesMigrated > 0) {
          await store.rebuildIndex();
        }

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(report),
            },
          ],
        };
      } catch (error) {
        report.errors.push(`Migration failed: ${String(error)}`);
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(report),
            },
          ],
        };
      }
    }
  );
}
