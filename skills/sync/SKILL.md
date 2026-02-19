---
name: sync
description: Review and manage the error ledger — promote, demote, or edit error entries
---

# Handover Sync

Review the error ledger and manage which errors get promoted to `.claude/CLAUDE.md`.

## Steps

1. **Read the error ledger** from `.handover/error-ledger.jsonl`:
   - Show each entry: fingerprint, type, cause, summary, sessionCount, hitCount, promoted status
   - Highlight entries near promotion threshold (sessionCount approaching `promotionThreshold`)

2. **Read current session errors** from `.handover/session/errors.jsonl` (if session active):
   - Show new errors not yet merged into the ledger
   - Preview what their fingerprints would be

3. **Review and manage entries**:
   - **Force-promote**: Mark an entry as promoted (write to CLAUDE.md) even if below threshold
   - **Demote**: Mark a promoted entry as unpromoted (remove from CLAUDE.md)
   - **Edit summary**: Improve the summary text for clarity
   - **Delete**: Remove an entry from the ledger entirely

4. **Regenerate `.claude/CLAUDE.md`** managed section:
   - Generate content from ALL promoted entries (newest first)
   - Write between `<!-- HANDOVER:START -->` and `<!-- HANDOVER:END -->` markers
   - Respect the character limit from config (default: 1000 chars)

5. **Report** what was changed: entries promoted, demoted, edited, or deleted.

## Important
- The ledger at `.handover/error-ledger.jsonl` is the source of truth for errors
- CLAUDE.md is output-only — never read it to determine error state
- Only modify content between HANDOVER markers in CLAUDE.md
- Keep summaries concise — one line per error
- Use `writeManagedSection()` from `hooks/lib/claude-md.mjs` to write CLAUDE.md
- Use `readLedger()`/`writeLedger()` from `hooks/lib/session-store.mjs` for ledger I/O
