#!/usr/bin/env node
import { appendEntry } from './lib/session-store.mjs';
import { categorizeError, summarizeError } from './lib/error-detector.mjs';

try {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  const data = JSON.parse(input);
  const toolName = data?.data?.tool_name || data?.data?.toolName || 'unknown';
  const error = data?.data?.error || data?.data?.output || '';

  if (error) {
    const raw = String(error).slice(0, 500);
    appendEntry('errors', {
      tool: toolName,
      type: categorizeError(raw),
      cause: toolName,
      summary: summarizeError(raw),
      raw,
    });
  }
} catch {
  // Silent failure
}
