import Anthropic from '@anthropic-ai/sdk';
import type { MessageParam, Tool, ContentBlock } from '@anthropic-ai/sdk/resources/messages';
import { loadConfig } from './config.js';

export interface ChatOptions {
  model?: string;
  maxTokens?: number;
  temperature?: number;
  system?: string;
}

export interface ToolResult {
  text: string;
  toolUse?: {
    id: string;
    name: string;
    input: Record<string, unknown>;
  };
  stopReason: string;
}

/**
 * Create an Anthropic client instance.
 * Uses the provided API key, or falls back to config / env var.
 */
export function createClient(apiKey?: string): Anthropic {
  const key = apiKey ?? loadConfig().apiKey;
  if (!key) {
    throw new Error(
      'Anthropic API key is required. Set ANTHROPIC_API_KEY environment variable or run: handover config apiKey <your-key>',
    );
  }
  return new Anthropic({ apiKey: key });
}

/**
 * Extract text content from a message response's content blocks.
 */
function extractText(content: ContentBlock[]): string {
  return content
    .filter((block): block is Anthropic.TextBlock => block.type === 'text')
    .map((block) => block.text)
    .join('');
}

/**
 * Send a chat message and get back the response text.
 */
export async function chat(
  messages: MessageParam[],
  options: ChatOptions = {},
): Promise<string> {
  const config = loadConfig();
  const client = createClient(options.model ? undefined : undefined);

  const response = await client.messages.create({
    model: options.model ?? config.model,
    max_tokens: options.maxTokens ?? config.maxTokens,
    temperature: options.temperature ?? config.temperature,
    ...(options.system ? { system: options.system } : {}),
    messages,
  });

  return extractText(response.content);
}

/**
 * Send a chat message with tool definitions and get back a structured result.
 * Handles both text responses and tool-use responses.
 */
export async function chatWithTools(
  messages: MessageParam[],
  tools: Tool[],
  options: ChatOptions = {},
): Promise<ToolResult> {
  const config = loadConfig();
  const client = createClient();

  const response = await client.messages.create({
    model: options.model ?? config.model,
    max_tokens: options.maxTokens ?? config.maxTokens,
    temperature: options.temperature ?? config.temperature,
    ...(options.system ? { system: options.system } : {}),
    messages,
    tools,
  });

  const text = extractText(response.content);

  const toolUseBlock = response.content.find(
    (block): block is Anthropic.ToolUseBlock => block.type === 'tool_use',
  );

  return {
    text,
    toolUse: toolUseBlock
      ? {
          id: toolUseBlock.id,
          name: toolUseBlock.name,
          input: toolUseBlock.input as Record<string, unknown>,
        }
      : undefined,
    stopReason: response.stop_reason ?? 'end_turn',
  };
}
