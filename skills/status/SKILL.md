---
name: status
description: Show Handover status — session stats, managed content, and configuration
---

# Handover Status

Display the current state of Handover for this project.

## Steps

1. **Check CLAUDE.md managed section**:
   - Read `.claude/CLAUDE.md` and extract content between `<!-- HANDOVER:START -->` / `<!-- HANDOVER:END -->`
   - Report: character count, number of entries, oldest/newest dated entry

2. **Check session data**:
   - Read `.handover/session/prompts.jsonl` — count entries
   - Read `.handover/session/errors.jsonl` — count entries, list types
   - Read `.handover/session/meta.json` — session timing

3. **Check archived sessions**:
   - Count directories in `.handover/archive/`
   - Show date range of archives

4. **Check generated commands**:
   - List files in `.claude/commands/`

5. **Show configuration**:
   - Read `.handover/config.json` (or show defaults if not present)
   - Show: maxChars, pruneAgeDays, maxArchivedSessions

6. **Format output** as a clear status report:
   ```
   ## Handover Status

   **CLAUDE.md Managed Section**: 450/1000 chars, 5 entries, [02/15] — [02/19]

   **Current Session**: 12 prompts, 3 errors (2 build, 1 test)
   Started: 2026-02-19T10:00:00Z

   **Archives**: 4 sessions (02/12 — 02/18)

   **Commands**: build.md, test.md, dev.md

   **Config**: prune after 7 days, max 1000 chars, keep 10 archives
   ```

## Important
- If Handover is not initialized, suggest running /handover:init
- Show actual data, not placeholders
- Handle missing files gracefully
