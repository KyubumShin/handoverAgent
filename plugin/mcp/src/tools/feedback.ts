import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { join } from 'node:path';
import { appendLine, readLines } from '../lib/file-utils.js';
import type { Feedback } from '../lib/types.js';

export function registerFeedbackTools(server: McpServer, dataDir: string): void {
  const feedbackPath = join(dataDir, 'feedback', 'history.jsonl');

  server.tool(
    'handover_log_feedback',
    'Record user feedback on an interaction',
    {
      rating: z.enum(['positive', 'negative']).describe('Feedback rating'),
      comment: z.string().optional().describe('Optional feedback comment'),
      interactionId: z.string().optional().describe('Optional interaction ID reference'),
    },
    async ({ rating, comment, interactionId }) => {
      try {
        const feedback: Feedback = {
          rating,
          comment,
          timestamp: new Date().toISOString(),
          messageId: interactionId,
        };

        appendLine(feedbackPath, JSON.stringify(feedback));

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ success: true, feedback }),
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
    'handover_feedback_stats',
    'Get aggregate feedback statistics',
    {},
    async () => {
      try {
        const lines = readLines(feedbackPath);
        let total = 0;
        let positive = 0;
        let negative = 0;

        for (const line of lines) {
          try {
            const feedback = JSON.parse(line) as Feedback;
            total++;
            if (feedback.rating === 'positive') positive++;
            if (feedback.rating === 'negative') negative++;
          } catch {
            // Skip invalid lines
          }
        }

        const satisfactionRate = total > 0 ? (positive / total) * 100 : 0;

        const stats = {
          total,
          positive,
          negative,
          satisfactionRate: Math.round(satisfactionRate * 100) / 100,
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(stats),
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
