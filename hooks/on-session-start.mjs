#!/usr/bin/env node
import { readEntries, hasSessionData } from './lib/session-store.mjs';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const LAST_SESSION = join('.handover', 'last-session.json');

try {
  // Try current session data first, then fall back to last-session summary
  if (hasSessionData()) {
    const errors = readEntries('errors');
    const prompts = readEntries('prompts');
    outputSummary(errors, prompts);
  } else if (existsSync(LAST_SESSION)) {
    // Read summary saved by previous session-end before archiving
    const summary = JSON.parse(readFileSync(LAST_SESSION, 'utf8'));
    const lines = ['[Handover] Previous session summary available.'];

    if (summary.errorCount > 0) {
      const typeSummary = Object.entries(summary.errorsByType || {})
        .map(([t, c]) => `${c} ${t.replace('_', ' ')}`).join(', ');
      lines.push(`Errors found: ${summary.errorCount} (${typeSummary})`);
      for (const e of (summary.recentErrors || [])) {
        lines.push(`  - ${e.error}`);
      }
    }

    if (summary.topTopics?.length > 0) {
      lines.push(`Topics: ${summary.topTopics.join(', ')}`);
    }

    lines.push('Run /handover:sync to update .claude/CLAUDE.md with session findings.');
    process.stdout.write(lines.join('\n') + '\n');
  } else {
    process.stdout.write('[Handover] No previous session data.\n');
  }
} catch {
  // Silent failure
}

function outputSummary(errors, prompts) {
  const lines = ['[Handover] Previous session data available.'];

  if (errors.length > 0) {
    const byType = {};
    for (const e of errors) {
      byType[e.type] = (byType[e.type] || 0) + 1;
    }
    const summary = Object.entries(byType).map(([t, c]) => `${c} ${t.replace('_', ' ')}`).join(', ');
    lines.push(`Errors found: ${errors.length} (${summary})`);

    const recent = errors.slice(-5);
    for (const e of recent) {
      lines.push(`  - ${e.error.slice(0, 100)}`);
    }
  }

  if (prompts.length > 0) {
    const allTopics = prompts.flatMap(p => p.topics || []);
    const topicCounts = {};
    for (const t of allTopics) {
      topicCounts[t] = (topicCounts[t] || 0) + 1;
    }
    const topTopics = Object.entries(topicCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8)
      .map(([t]) => t);
    if (topTopics.length > 0) {
      lines.push(`Topics: ${topTopics.join(', ')}`);
    }
  }

  lines.push('Run /handover:sync to update .claude/CLAUDE.md with session findings.');
  process.stdout.write(lines.join('\n') + '\n');
}
