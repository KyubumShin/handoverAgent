#!/usr/bin/env node
import { hasSessionData, getSessionMeta } from './lib/session-store.mjs';
import { finalizeSession } from './lib/finalize-session.mjs';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const SESSION_DIR = join('.handover', 'session');
const LAST_SESSION = join('.handover', 'last-session.json');

try {
  // Recovery: detect stale session from /clear, crash, or terminal close.
  // Check session dir existence (not just data files) to catch empty stale sessions too.
  if (existsSync(SESSION_DIR)) {
    const meta = getSessionMeta();
    if (!meta.finalized) {
      finalizeSession();
      // Session is now archived and last-session.json is written.
      // Fall through to read it below.
    }
  }

  // Normal session-start: read last-session summary
  let errorCount = 0;
  let errorsByType = {};
  let recentErrors = [];
  let topTopics = [];

  if (existsSync(LAST_SESSION)) {
    const s = JSON.parse(readFileSync(LAST_SESSION, 'utf8'));
    errorCount = s.errorCount || 0;
    errorsByType = s.errorsByType || {};
    recentErrors = (s.recentErrors || []).slice(0, 3).map(e => e.error);
    topTopics = s.topTopics || [];
  }

  if (errorCount === 0 && topTopics.length === 0) {
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
