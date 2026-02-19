#!/usr/bin/env node
import { readEntries, updateSessionMeta, ensureDir } from './lib/session-store.mjs';
import { writeFileSync } from 'fs';
import { join } from 'path';

const SESSION_DIR = join('.handover', 'session');

try {
  const prompts = readEntries('prompts');
  const errors = readEntries('errors');

  const summary = {
    savedAt: new Date().toISOString(),
    promptCount: prompts.length,
    errorCount: errors.length,
    recentTopics: [...new Set(prompts.slice(-10).flatMap(p => p.topics || []))],
    recentErrors: errors.slice(-5).map(e => ({
      error: e.error.slice(0, 100),
      type: e.type,
    })),
  };

  ensureDir(SESSION_DIR);
  writeFileSync(join(SESSION_DIR, 'summary.json'), JSON.stringify(summary, null, 2));

  updateSessionMeta({ lastCompactedAt: new Date().toISOString() });

  process.stdout.write('[Handover] Session summary saved before compaction.\n');
} catch {
  // Silent failure
}
