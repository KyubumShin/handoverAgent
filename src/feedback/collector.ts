import { readFileSync, existsSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { getDataDir, ensureDir } from '../utils/files.js';
import type { Feedback } from '../agent/types.js';

function getFeedbackDir(): string {
  const dataDir = getDataDir();
  const feedbackDir = join(dataDir, 'feedback');
  ensureDir(feedbackDir);
  return feedbackDir;
}

function getHistoryPath(): string {
  return join(getFeedbackDir(), 'history.jsonl');
}

/**
 * Append a feedback entry to the history file (one JSON object per line).
 */
export function saveFeedback(feedback: Feedback): void {
  const path = getHistoryPath();
  const line = JSON.stringify(feedback) + '\n';
  appendFileSync(path, line, 'utf-8');
}

/**
 * Read all feedback entries from the history file.
 * Returns an empty array if the file does not exist.
 */
export function loadFeedbackHistory(): Feedback[] {
  const path = getHistoryPath();

  if (!existsSync(path)) {
    return [];
  }

  const raw = readFileSync(path, 'utf-8');
  const lines = raw.split('\n').filter((line) => line.trim().length > 0);
  const entries: Feedback[] = [];

  for (const line of lines) {
    try {
      entries.push(JSON.parse(line) as Feedback);
    } catch {
      // Skip malformed lines
    }
  }

  return entries;
}

/**
 * Find feedback for a specific message by its messageId.
 * Returns null if no feedback exists for the given message.
 */
export function getFeedbackForMessage(messageId: string): Feedback | null {
  const history = loadFeedbackHistory();
  return history.find((f) => f.messageId === messageId) ?? null;
}

/**
 * Calculate aggregate feedback statistics.
 */
export function getFeedbackStats(): {
  total: number;
  positive: number;
  negative: number;
  rate: number;
} {
  const history = loadFeedbackHistory();
  const total = history.length;
  const positive = history.filter((f) => f.rating === 'positive').length;
  const negative = history.filter((f) => f.rating === 'negative').length;
  const rate = total > 0 ? positive / total : 0;

  return { total, positive, negative, rate };
}
