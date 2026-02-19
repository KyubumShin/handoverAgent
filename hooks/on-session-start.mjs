#!/usr/bin/env node
import { readEntries, hasSessionData } from './lib/session-store.mjs';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const LAST_SESSION = join('.handover', 'last-session.json');

try {
  let errorCount = 0;
  let errorsByType = {};
  let recentErrors = [];
  let topTopics = [];
  let source = null;

  if (hasSessionData()) {
    source = 'session';
    const errors = readEntries('errors');
    const prompts = readEntries('prompts');
    errorCount = errors.length;
    for (const e of errors) {
      errorsByType[e.type] = (errorsByType[e.type] || 0) + 1;
    }
    recentErrors = errors.slice(-3).map(e => e.error.slice(0, 100));
    const allTopics = prompts.flatMap(p => p.topics || []);
    const counts = {};
    for (const t of allTopics) counts[t] = (counts[t] || 0) + 1;
    topTopics = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([t]) => t);
  } else if (existsSync(LAST_SESSION)) {
    source = 'summary';
    const s = JSON.parse(readFileSync(LAST_SESSION, 'utf8'));
    errorCount = s.errorCount || 0;
    errorsByType = s.errorsByType || {};
    recentErrors = (s.recentErrors || []).slice(0, 3).map(e => e.error);
    topTopics = s.topTopics || [];
  }

  if (!source) {
    process.stdout.write('[Handover] No previous session data.\n');
    process.exit(0);
  }

  // Compact output — minimize tokens injected into context
  const parts = ['[Handover]'];

  if (errorCount > 0) {
    const types = Object.entries(errorsByType).map(([t, c]) => `${c} ${t.replace('_', ' ')}`).join(', ');
    parts.push(`${errorCount} errors (${types})`);
    for (const e of recentErrors) {
      parts.push(`  - ${e}`);
    }
  }

  if (topTopics.length > 0) {
    parts.push(`Topics: ${topTopics.join(', ')}`);
  }

  parts.push('/handover:sync to update CLAUDE.md');
  process.stdout.write(parts.join('\n') + '\n');
} catch {
  // Silent failure
}
