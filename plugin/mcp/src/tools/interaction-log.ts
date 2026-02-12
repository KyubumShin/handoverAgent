import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { appendLine } from '../lib/file-utils.js';
import type { InteractionLogEntry } from '../lib/types.js';

export function registerInteractionLogTools(server: McpServer, dataDir: string): void {
  const logPath = join(dataDir, 'interactions', 'log.jsonl');

  server.tool(
    'handover_log_interaction',
    'Log a Q&A interaction with the knowledge base',
    {
      question: z.string().describe('User question'),
      answer: z.string().describe('System answer'),
      confidence: z.number().min(0).max(1).describe('Answer confidence (0-1)'),
      citations: z.array(z.string()).default([]).describe('Entry IDs used to generate answer'),
    },
    async ({ question, answer, confidence, citations }) => {
      try {
        const entry: InteractionLogEntry = {
          id: randomUUID(),
          question,
          answer,
          confidence,
          citations,
          timestamp: new Date().toISOString(),
        };

        appendLine(logPath, JSON.stringify(entry));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ id: entry.id, timestamp: entry.timestamp }),
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
