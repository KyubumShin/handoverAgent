#!/usr/bin/env node
import { readEntries, archiveSession, updateSessionMeta, getConfig, ensureDir, readLedger, writeLedger } from './lib/session-store.mjs';
import { writeManagedSection } from './lib/claude-md.mjs';
import { updateLedger, pruneLedger, getPromotable, generateClaudeMdContent, markPromoted } from './lib/error-ledger.mjs';
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
    recentErrors: errors.slice(-5).map(e => ({
      error: (e.summary || e.raw || e.error || '').slice(0, 100),
      type: e.type,
    })),
    topTopics,
  };
  ensureDir(HANDOVER_DIR);
  writeFileSync(join(HANDOVER_DIR, 'last-session.json'), JSON.stringify(summary, null, 2));

  // Ledger pipeline
  const config = getConfig();

  if (errors.length > 0) {
    // a. Read existing ledger
    let ledger = readLedger();

    // b. Fingerprint + merge session errors into ledger
    ledger = updateLedger(errors, ledger);

    // c. Prune ledger (age + count limits)
    ledger = pruneLedger(ledger, config.ledgerPruneAgeDays, config.maxLedgerEntries);

    // d. Find newly promotable entries
    const newlyPromotable = getPromotable(ledger, config.promotionThreshold);

    // e. Mark newly promoted
    if (newlyPromotable.length > 0) {
      ledger = markPromoted(ledger, newlyPromotable.map(e => e.fingerprint));
    }

    // f. Generate CLAUDE.md content from ALL promoted entries
    const allPromoted = ledger.filter(e => e.promoted);
    if (allPromoted.length > 0) {
      const content = generateClaudeMdContent(allPromoted, config.maxChars);
      writeManagedSection(CLAUDE_MD, content);
    }

    // g. Save ledger
    writeLedger(ledger);
  }

  // Archive session
  archiveSession();
} catch {
  // Silent failure
}
