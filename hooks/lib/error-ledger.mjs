import { createHash } from 'crypto';

/**
 * Compute a dedup fingerprint from error type + file + normalized signature.
 * Excludes line numbers (they shift between sessions).
 */
export function computeFingerprint(entry) {
  const type = entry.type || 'unknown_error';
  // Extract file from cause (file:line format) or from legacy field
  const cause = entry.cause || entry.file || '';
  const file = cause.includes(':') ? cause.split(':')[0] : cause;
  // Normalize error text: strip line numbers, collapse whitespace
  const rawText = entry.summary || entry.raw || entry.error || '';
  const normalized = rawText
    .replace(/:\d+/g, '')          // strip :lineNumber
    .replace(/\s+/g, ' ')         // collapse whitespace
    .trim()
    .slice(0, 120);
  const key = `${type}:${file}:${normalized}`;
  return createHash('md5').update(key).digest('hex').slice(0, 16);
}

/**
 * Merge session errors into the existing ledger.
 * Returns a new ledger array (does not mutate input).
 */
export function updateLedger(sessionErrors, existingLedger) {
  const ledgerMap = new Map();
  for (const entry of existingLedger) {
    ledgerMap.set(entry.fingerprint, { ...entry });
  }

  const now = new Date().toISOString();

  for (const err of sessionErrors) {
    const fp = computeFingerprint(err);
    if (ledgerMap.has(fp)) {
      const existing = ledgerMap.get(fp);
      existing.lastSeen = now;
      existing.sessionCount += 1;
      existing.hitCount += 1;
      // Update summary if the new one is more informative
      if (err.summary && err.summary.length > (existing.summary || '').length) {
        existing.summary = err.summary;
      }
    } else {
      ledgerMap.set(fp, {
        fingerprint: fp,
        type: err.type || 'unknown_error',
        cause: err.cause || err.file || err.tool || 'unknown',
        summary: err.summary || err.raw || err.error || '',
        firstSeen: now,
        lastSeen: now,
        sessionCount: 1,
        hitCount: 1,
        promoted: false,
      });
    }
  }

  return [...ledgerMap.values()];
}

/**
 * Prune ledger entries that are too old or exceed max count.
 * Removes oldest (by lastSeen) first.
 */
export function pruneLedger(ledger, maxAgeDays, maxEntries) {
  const cutoff = Date.now() - maxAgeDays * 24 * 60 * 60 * 1000;

  // Remove entries not seen since cutoff (but keep promoted ones)
  let pruned = ledger.filter(e =>
    e.promoted || new Date(e.lastSeen).getTime() >= cutoff
  );

  // Enforce max entries — remove oldest unpromoted first, then oldest promoted
  if (pruned.length > maxEntries) {
    pruned.sort((a, b) => new Date(a.lastSeen) - new Date(b.lastSeen));
    // Try removing unpromoted first
    const promoted = pruned.filter(e => e.promoted);
    const unpromoted = pruned.filter(e => !e.promoted);
    if (unpromoted.length > 0 && pruned.length > maxEntries) {
      const keep = maxEntries - promoted.length;
      pruned = [...unpromoted.slice(Math.max(0, unpromoted.length - keep)), ...promoted];
    }
    if (pruned.length > maxEntries) {
      pruned = pruned.slice(pruned.length - maxEntries);
    }
  }

  return pruned;
}

/**
 * Get ledger entries that qualify for CLAUDE.md promotion.
 */
export function getPromotable(ledger, threshold) {
  return ledger.filter(e => e.sessionCount >= threshold && !e.promoted);
}

/**
 * Generate CLAUDE.md content lines from promoted entries.
 * Newest first, truncated to maxChars.
 */
export function generateClaudeMdContent(promotedEntries, maxChars) {
  if (promotedEntries.length === 0) return '';

  // Sort by lastSeen descending (newest first)
  const sorted = [...promotedEntries].sort(
    (a, b) => new Date(b.lastSeen) - new Date(a.lastSeen)
  );

  const header = '## Session Context\n### Errors (auto-tracked)';
  let lines = [header];
  let totalLen = header.length + 1; // +1 for newline

  for (const entry of sorted) {
    const date = new Date(entry.lastSeen);
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const summary = (entry.summary || '').slice(0, 120);
    const line = `- [${mm}/${dd}] ${entry.type}: ${entry.cause} — ${summary}`;

    if (totalLen + line.length + 1 > maxChars) break;
    lines.push(line);
    totalLen += line.length + 1;
  }

  return lines.join('\n');
}

/**
 * Mark entries as promoted in the ledger.
 * Returns a new ledger array.
 */
export function markPromoted(ledger, fingerprints) {
  const fpSet = new Set(fingerprints);
  return ledger.map(e =>
    fpSet.has(e.fingerprint) ? { ...e, promoted: true } : e
  );
}
