#!/usr/bin/env node
import { readEntries, archiveSession, updateSessionMeta, getConfig, ensureDir } from './lib/session-store.mjs';
import { readManagedSection, writeManagedSection, pruneByAge, pruneBySize } from './lib/claude-md.mjs';
import { writeFileSync } from 'fs';
import { join } from 'path';

const CLAUDE_MD = join('.claude', 'CLAUDE.md');
const HANDOVER_DIR = '.handover';

try {
  // Finalize session meta
  const prompts = readEntries('prompts');
  const errors = readEntries('errors');
  updateSessionMeta({
    endedAt: new Date().toISOString(),
    promptCount: prompts.length,
    errorCount: errors.length,
    finalized: true,
  });

  // Write last-session summary BEFORE archiving so next session-start can read it
  const byType = {};
  for (const e of errors) {
    byType[e.type] = (byType[e.type] || 0) + 1;
  }
  const allTopics = prompts.flatMap(p => p.topics || []);
  const topicCounts = {};
  for (const t of allTopics) {
    topicCounts[t] = (topicCounts[t] || 0) + 1;
  }
  const topTopics = Object.entries(topicCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([t]) => t);

  const summary = {
    endedAt: new Date().toISOString(),
    promptCount: prompts.length,
    errorCount: errors.length,
    errorsByType: byType,
    recentErrors: errors.slice(-5).map(e => ({ error: e.error.slice(0, 100), type: e.type })),
    topTopics,
  };
  ensureDir(HANDOVER_DIR);
  writeFileSync(join(HANDOVER_DIR, 'last-session.json'), JSON.stringify(summary, null, 2));

  // Prune CLAUDE.md managed section
  const config = getConfig();
  let managed = readManagedSection(CLAUDE_MD);

  if (managed) {
    managed = pruneByAge(managed, config.pruneAgeDays);
    managed = pruneBySize(managed, config.maxChars);
    writeManagedSection(CLAUDE_MD, managed);
  }

  // Archive session
  archiveSession();
} catch {
  // Silent failure
}
