import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import chalk from 'chalk';

import type {
  HandoverProfile,
  Session,
  QAMessage,
  Feedback,
} from '../agent/types.js';
import { QAResponderAgent } from '../agent/sub-agents/qa-responder.js';
import type { QAInput } from '../agent/sub-agents/qa-responder.js';
import { initKnowledgeStore, getAllEntries } from '../knowledge/store.js';
import { findRelevantEntries } from '../knowledge/indexer.js';
import { saveFeedback } from '../feedback/collector.js';
import { getDataDir, readJSON, writeJSON, ensureDir } from '../utils/files.js';
import { info, warn, error, success, createSpinner, formatCitation } from './ui.js';

function loadProfile(): HandoverProfile | null {
  const dataDir = getDataDir();
  return readJSON<HandoverProfile>(join(dataDir, 'profile.json'));
}

function loadSession(sessionId: string): Session | null {
  const dataDir = getDataDir();
  return readJSON<Session>(join(dataDir, 'sessions', `${sessionId}.json`));
}

function saveSession(session: Session): void {
  const dataDir = getDataDir();
  const sessionsDir = join(dataDir, 'sessions');
  ensureDir(sessionsDir);
  writeJSON(join(sessionsDir, `${session.id}.json`), session);
}

function createNewSession(handoverId: string): Session {
  return {
    id: randomUUID(),
    handoverId,
    startedAt: new Date().toISOString(),
    messages: [],
    topicsCovered: [],
  };
}

function showHelp(): void {
  console.log('');
  console.log(chalk.bold('Available commands:'));
  console.log(`  ${chalk.cyan('/help')}                          Show this help`);
  console.log(`  ${chalk.cyan('/history')}                       Show conversation history`);
  console.log(`  ${chalk.cyan('/sources')}                       Show knowledge sources used`);
  console.log(
    `  ${chalk.cyan('/feedback <positive|negative> [comment]')}  Rate the last answer`,
  );
  console.log(`  ${chalk.cyan('/quit')} or ${chalk.cyan('/exit')}                  End session`);
  console.log('');
}

function showHistory(messages: QAMessage[]): void {
  if (messages.length === 0) {
    info('No messages yet.');
    return;
  }

  console.log('');
  console.log(chalk.bold('Conversation History:'));
  console.log(chalk.dim('-'.repeat(60)));

  for (const msg of messages) {
    const role =
      msg.role === 'user'
        ? chalk.blue.bold('You')
        : chalk.green.bold('Assistant');
    const time = chalk.dim(new Date(msg.timestamp).toLocaleTimeString());
    console.log(`${role} ${time}`);
    console.log(msg.content);
    if (msg.confidence !== undefined) {
      const pct = Math.round(msg.confidence * 100);
      console.log(chalk.dim(`Confidence: ${pct}%`));
    }
    console.log(chalk.dim('-'.repeat(60)));
  }
  console.log('');
}

function showSources(messages: QAMessage[]): void {
  const allCitations = messages.flatMap((m) => m.citations ?? []);

  if (allCitations.length === 0) {
    info('No sources cited yet.');
    return;
  }

  // Deduplicate by entryId
  const seen = new Set<string>();
  const unique = allCitations.filter((c) => {
    if (seen.has(c.entryId)) return false;
    seen.add(c.entryId);
    return true;
  });

  console.log('');
  console.log(chalk.bold('Knowledge Sources Used:'));
  console.log('');
  for (const citation of unique) {
    console.log(formatCitation(citation));
    console.log('');
  }
}

function handleFeedback(
  args: string,
  messages: QAMessage[],
): void {
  const parts = args.trim().split(/\s+/);
  const rating = parts[0];

  if (rating !== 'positive' && rating !== 'negative') {
    error('Usage: /feedback <positive|negative> [optional comment]');
    return;
  }

  // Find last assistant message
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  if (!lastAssistant) {
    warn('No assistant message to provide feedback on.');
    return;
  }

  const comment = parts.slice(1).join(' ') || undefined;
  const messageId = `${messages.indexOf(lastAssistant)}`;

  const feedback: Feedback = {
    rating,
    comment,
    timestamp: new Date().toISOString(),
    messageId,
  };

  saveFeedback(feedback);

  // Also attach feedback to the message in session
  lastAssistant.feedback = feedback;

  success(`Feedback recorded: ${rating}${comment ? ` - "${comment}"` : ''}`);
}

export async function startInteractiveSession(
  handoverId?: string,
): Promise<void> {
  // Load profile
  const profile = loadProfile();
  if (!profile) {
    error(
      'No handover profile found. Run "handover init" first to initialize a handover.',
    );
    process.exit(1);
  }

  const resolvedHandoverId = handoverId ?? profile.id;

  // Initialize knowledge store
  const dataDir = getDataDir();
  initKnowledgeStore(dataDir);

  // Create or load session
  const session = createNewSession(resolvedHandoverId);
  const qaAgent = new QAResponderAgent();

  // Build handover context from profile
  const handoverContext = [
    `Handover: ${profile.name}`,
    `Type: ${profile.type}`,
    `Description: ${profile.description}`,
  ].join('\n');

  // Welcome message
  console.log('');
  console.log(
    chalk.bold.cyan('Interactive Q&A Session'),
  );
  console.log(
    chalk.dim(`Session: ${session.id.slice(0, 8)}... | Handover: ${profile.name}`),
  );
  console.log(
    chalk.dim('Type /help for available commands, /quit to exit.'),
  );
  console.log('');

  // Create readline interface
  const rl = createInterface({ input, output });

  try {
    // eslint-disable-next-line no-constant-condition
    while (true) {
      let line: string;
      try {
        line = await rl.question(chalk.bold.cyan('handover > '));
      } catch {
        // EOF or readline closed
        break;
      }

      const trimmed = line.trim();
      if (!trimmed) continue;

      // Handle special commands
      if (trimmed === '/quit' || trimmed === '/exit') {
        break;
      }

      if (trimmed === '/help') {
        showHelp();
        continue;
      }

      if (trimmed === '/history') {
        showHistory(session.messages);
        continue;
      }

      if (trimmed === '/sources') {
        showSources(session.messages);
        continue;
      }

      if (trimmed.startsWith('/feedback')) {
        const args = trimmed.slice('/feedback'.length).trim();
        handleFeedback(args, session.messages);
        continue;
      }

      if (trimmed.startsWith('/')) {
        warn(`Unknown command: ${trimmed.split(/\s/)[0]}. Type /help for available commands.`);
        continue;
      }

      // Regular question
      const spinner = createSpinner('Thinking...');
      spinner.start();

      try {
        // Load knowledge entries
        const allEntries = getAllEntries();
        const relevantEntries = findRelevantEntries(trimmed, allEntries);

        const qaInput: QAInput = {
          question: trimmed,
          conversationHistory: session.messages,
          knowledgeEntries: relevantEntries,
          handoverContext,
        };

        const result = await qaAgent.execute(qaInput);
        spinner.stop();

        if (!result.success || !result.data) {
          error(result.error ?? 'Failed to generate an answer.');
          continue;
        }

        const { answer, citations, confidence, suggestedFollowUps } = result.data;

        // Add user message to session
        const userMessage: QAMessage = {
          role: 'user',
          content: trimmed,
          timestamp: new Date().toISOString(),
        };
        session.messages.push(userMessage);

        // Add assistant message to session
        const assistantMessage: QAMessage = {
          role: 'assistant',
          content: answer,
          timestamp: new Date().toISOString(),
          citations,
          confidence,
        };
        session.messages.push(assistantMessage);

        // Display the answer
        console.log('');
        console.log(chalk.bold.green('Answer:'));
        console.log(answer);
        console.log('');

        // Display confidence
        const pct = Math.round(confidence * 100);
        const confidenceColor =
          pct >= 70 ? chalk.green : pct >= 40 ? chalk.yellow : chalk.red;
        console.log(chalk.dim(`Confidence: ${confidenceColor(`${pct}%`)}`));

        // Display citations
        if (citations.length > 0) {
          console.log('');
          console.log(chalk.dim.bold('Sources:'));
          for (const citation of citations) {
            console.log(chalk.dim(`  [${citation.entryId}] ${citation.title}`));
          }
        }

        // Display follow-ups
        if (suggestedFollowUps.length > 0) {
          console.log('');
          console.log(chalk.dim.bold('You might also ask:'));
          for (const followUp of suggestedFollowUps) {
            console.log(chalk.dim(`  - ${followUp}`));
          }
        }

        console.log('');
      } catch (err) {
        spinner.stop();
        const message = err instanceof Error ? err.message : String(err);
        error(`Error: ${message}`);
      }
    }
  } finally {
    rl.close();

    // Save session on exit
    session.endedAt = new Date().toISOString();
    saveSession(session);

    console.log('');
    info(`Session saved: ${session.id.slice(0, 8)}...`);
    info(`Messages exchanged: ${session.messages.length}`);
    console.log('');
  }
}
