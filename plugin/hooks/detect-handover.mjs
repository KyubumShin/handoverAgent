#!/usr/bin/env node

/**
 * UserPromptSubmit hook: Detects when a user might be in a handover situation
 * and suggests the handover plugin if .handover/ doesn't exist yet.
 */

import { existsSync } from 'node:fs';
import { join } from 'node:path';

// Read stdin (hook receives user prompt as JSON)
let input = '';
for await (const chunk of process.stdin) {
  input += chunk;
}

try {
  const data = JSON.parse(input);
  const prompt = (data.prompt || data.content || '').toLowerCase();
  const cwd = process.cwd();
  const handoverDir = join(cwd, '.handover');

  // Don't suggest if handover is already initialized
  if (existsSync(handoverDir)) {
    process.exit(0);
  }

  // Handover-related phrases
  const triggers = [
    'new to this codebase',
    'new to this project',
    'just joined',
    'taking over',
    'handover',
    'hand over',
    'knowledge transfer',
    'onboarding',
    'inherited this',
    'picking up this project',
    'new team member',
    'getting up to speed',
    'unfamiliar with this',
    'first time seeing this',
    'need to understand this',
    'what does this project do',
    'how does this codebase work',
    'project takeover',
  ];

  const triggered = triggers.some(phrase => prompt.includes(phrase));

  if (triggered) {
    // Output context that Claude will see
    const msg = [
      'It sounds like you might be going through a handover or onboarding.',
      'The **handover** plugin can help! It extracts and organizes project knowledge to accelerate your understanding.',
      '',
      'Try: `/handover:init` to get started, then `/handover:extract .` to analyze this codebase.',
    ].join('\n');

    process.stdout.write(msg);
  }
} catch {
  // Silent failure - hooks should never break the session
  process.exit(0);
}
