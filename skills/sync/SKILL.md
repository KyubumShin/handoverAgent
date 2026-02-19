---
name: sync
description: Sync session data into CLAUDE.md — processes captured errors and patterns
---

# Handover Sync

Process captured session data and update `.claude/CLAUDE.md` with findings.

## Steps

1. **Read session data** from `.handover/session/`:
   - `errors.jsonl` — captured errors and failures
   - `prompts.jsonl` — user prompt history and topics
   - `summary.json` — compaction summary (if exists)

2. **Analyze patterns**:
   - **Recurring errors**: Group by type and file. If the same error appears multiple times, it's important.
   - **Frequent topics**: What areas of the codebase is the user working on most?
   - **Workflow patterns**: Are there repeated sequences of commands or operations?

3. **Update `.claude/CLAUDE.md`** managed section (between `<!-- HANDOVER:START -->` and `<!-- HANDOVER:END -->`):
   - Add new error entries with date stamps `[MM/DD]`, deduplicated
   - Update project context if new patterns are detected
   - Respect the 1,000 character limit on the managed section — remove oldest entries if needed
   - Preserve the Patterns/context subsection (most valuable)

   Example managed section format:
   ```
   ## Session Context
   ### Errors
   - [02/19] TypeError in src/api/users.ts:45 — null array check
   - [02/18] Build: missing @types/node

   ### Patterns
   - Build: `npm run build` (tsup, dist/)
   - Test: `npm test` (vitest)
   - Entry: src/index.ts
   ```

4. **Generate workflow commands** if new patterns detected:
   - If the user keeps running the same sequence of commands, create a `.claude/commands/<workflow>.md` file

5. **Report** what was synced: new errors added, patterns updated, commands generated.

## Important
- Only modify content between HANDOVER markers
- Keep entries concise — one line per error, include file:line when available
- Deduplicate — don't add the same error twice
- If no session data exists, inform the user and suggest running /handover:init
