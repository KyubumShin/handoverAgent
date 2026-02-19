#!/usr/bin/env node
import { appendEntry } from './lib/session-store.mjs';
import { detectInstructionViolation } from './lib/error-detector.mjs';

const STOP_WORDS = new Set([
  'the', 'this', 'that', 'with', 'from', 'have', 'been', 'will',
  'would', 'could', 'should', 'about', 'which', 'there', 'their',
  'what', 'when', 'where', 'make', 'like', 'just', 'into', 'also',
  'some', 'than', 'them', 'then', 'these', 'each', 'other', 'does',
  'done', 'please', 'want', 'need', 'help', 'using', 'used',
]);

function extractTopics(prompt) {
  return [...new Set(
    prompt.toLowerCase()
      .replace(/[^a-z0-9\s-]/g, ' ')
      .split(/\s+/)
      .filter(w => w.length > 3 && !STOP_WORDS.has(w))
  )].slice(0, 10);
}

try {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  const data = JSON.parse(input);
  const prompt = data?.data?.prompt || '';

  if (prompt.trim()) {
    const topics = extractTopics(prompt);
    appendEntry('prompts', { prompt: prompt.slice(0, 100), topics });

    // Detect instruction violations
    const violation = detectInstructionViolation(prompt);
    if (violation) {
      appendEntry('errors', {
        tool: 'user_prompt',
        type: 'instruction_violation',
        cause: violation.signal,
        summary: violation.summary,
        raw: prompt.slice(0, 300),
      });
    }
  }
} catch {
  // Silent failure — hooks must not break the session
}
