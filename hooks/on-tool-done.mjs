#!/usr/bin/env node
import { appendEntry } from './lib/session-store.mjs';
import { detectErrors, formatForLog } from './lib/error-detector.mjs';

try {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
  }

  const data = JSON.parse(input);
  const toolName = data?.data?.tool_name || data?.data?.toolName || 'Bash';
  const output = data?.data?.output || data?.data?.stdout || '';

  const errors = detectErrors(String(output));

  if (errors.length > 0) {
    for (const err of errors) {
      appendEntry('errors', formatForLog(toolName, err));
    }
  }
} catch {
  // Silent failure
}
