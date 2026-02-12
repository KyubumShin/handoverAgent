import type { MessageParam } from '@anthropic-ai/sdk/resources/messages.js';
import type {
  SubAgent,
  SubAgentResult,
  QAMessage,
  Citation,
  KnowledgeEntry,
} from '../types.js';
import { chat } from '../../utils/claude.js';

export interface QAInput {
  question: string;
  conversationHistory: QAMessage[];
  knowledgeEntries: KnowledgeEntry[];
  handoverContext?: string;
}

export interface QAResult {
  answer: string;
  citations: Citation[];
  confidence: number;
  suggestedFollowUps: string[];
}

const SYSTEM_PROMPT = `You are a handover assistant helping someone understand a project, role, or team they are taking over.

Your job is to answer questions accurately using ONLY the knowledge provided to you. If the knowledge base does not contain enough information to answer fully, say so clearly.

Rules:
1. Cite your sources using [SOURCE_ID] format inline in your answer, where SOURCE_ID matches the ID of the knowledge entry you are referencing.
2. At the end of your answer, include a line starting with "CONFIDENCE:" followed by one of: low, medium, high
   - low: the knowledge base has minimal relevant information
   - medium: partial coverage, some inference required
   - high: the knowledge base directly addresses the question
3. After the confidence line, include a line starting with "FOLLOW_UPS:" followed by 2-4 suggested follow-up questions the user might want to ask, separated by "|"
4. Be concise but thorough. Use bullet points and structure for clarity.
5. If multiple knowledge entries are relevant, synthesize them into a coherent answer.`;

function formatKnowledgeForPrompt(entries: KnowledgeEntry[]): string {
  if (entries.length === 0) {
    return 'No relevant knowledge entries found.';
  }

  return entries
    .map((entry) => {
      const sourceInfo = entry.source.path
        ? `${entry.source.type}: ${entry.source.path}`
        : entry.source.type;
      return [
        `--- Entry [${entry.id}] ---`,
        `Title: ${entry.title}`,
        `Category: ${entry.category}`,
        `Source: ${sourceInfo}`,
        `Confidence: ${Math.round(entry.confidence * 100)}%`,
        '',
        entry.content,
        '',
      ].join('\n');
    })
    .join('\n');
}

function formatConversationHistory(messages: QAMessage[]): MessageParam[] {
  const recent = messages.slice(-10);
  return recent.map((msg) => ({
    role: msg.role,
    content: msg.content,
  }));
}

function parseCitations(
  answer: string,
  entries: KnowledgeEntry[],
): Citation[] {
  const citationPattern = /\[([^\]]+)\]/g;
  const cited = new Set<string>();
  let match: RegExpExecArray | null;

  while ((match = citationPattern.exec(answer)) !== null) {
    cited.add(match[1]!);
  }

  const citations: Citation[] = [];
  for (const entryId of cited) {
    const entry = entries.find((e) => e.id === entryId);
    if (entry) {
      const excerpt =
        entry.content.length > 200
          ? entry.content.slice(0, 200) + '...'
          : entry.content;
      citations.push({
        entryId: entry.id,
        title: entry.title,
        excerpt,
        source: entry.source,
      });
    }
  }

  return citations;
}

function parseConfidence(response: string): number {
  const confidenceMatch = /CONFIDENCE:\s*(low|medium|high)/i.exec(response);
  if (!confidenceMatch) return 0.5;

  const level = confidenceMatch[1]!.toLowerCase();
  switch (level) {
    case 'high':
      return 0.9;
    case 'medium':
      return 0.6;
    case 'low':
      return 0.3;
    default:
      return 0.5;
  }
}

function parseFollowUps(response: string): string[] {
  const followUpMatch = /FOLLOW_UPS:\s*(.+)/i.exec(response);
  if (!followUpMatch) return [];

  return followUpMatch[1]!
    .split('|')
    .map((q) => q.trim())
    .filter((q) => q.length > 0);
}

function cleanAnswer(response: string): string {
  return response
    .replace(/\nCONFIDENCE:\s*(low|medium|high)/i, '')
    .replace(/\nFOLLOW_UPS:\s*.+/i, '')
    .trim();
}

export class QAResponderAgent implements SubAgent {
  name = 'qa-responder';
  description =
    'Answers handover questions using accumulated knowledge with source citations';

  async execute(input: QAInput): Promise<SubAgentResult<QAResult>> {
    const startTime = Date.now();

    try {
      const { question, conversationHistory, knowledgeEntries, handoverContext } = input;

      // Build system prompt with context
      let systemPrompt = SYSTEM_PROMPT;
      if (handoverContext) {
        systemPrompt += `\n\nHandover Context:\n${handoverContext}`;
      }

      // Build the knowledge context for the user message
      const knowledgeText = formatKnowledgeForPrompt(knowledgeEntries);

      // Build messages array: conversation history + current question
      const historyMessages = formatConversationHistory(conversationHistory);

      const currentUserMessage = [
        'Available Knowledge:',
        knowledgeText,
        '---',
        `Question: ${question}`,
      ].join('\n\n');

      const messages: MessageParam[] = [
        ...historyMessages,
        { role: 'user', content: currentUserMessage },
      ];

      // Call Claude
      const response = await chat(messages, {
        system: systemPrompt,
        temperature: 0.3,
      });

      // Parse the response
      const answer = cleanAnswer(response);
      const citations = parseCitations(answer, knowledgeEntries);
      const confidence = parseConfidence(response);
      const suggestedFollowUps = parseFollowUps(response);

      const duration = Date.now() - startTime;

      return {
        success: true,
        data: {
          answer,
          citations,
          confidence,
          suggestedFollowUps,
        },
        metadata: {
          duration,
        },
      };
    } catch (err) {
      const duration = Date.now() - startTime;
      const message = err instanceof Error ? err.message : String(err);

      return {
        success: false,
        error: `QA Responder failed: ${message}`,
        metadata: {
          duration,
        },
      };
    }
  }
}
