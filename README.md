# Handover

Lightweight Claude Code plugin that automatically captures session context — errors, workflows, patterns — and maintains a concise, self-pruning `CLAUDE.md` with auto-generated command files.

No CLI. No MCP server. No API key. No build step. Pure hooks + skills.

## How It Works

```
Hooks (capture)  →  Session Data (files)  →  Ledger (staging)  →  CLAUDE.md + Commands (output)
```

**Hooks** run automatically during Claude Code sessions to capture prompts, errors, tool failures, and instruction violations. Errors accumulate in a persistent **error ledger** — only errors that recur across multiple sessions get **promoted** to `.claude/CLAUDE.md`. This filters out one-off issues and surfaces persistent problems.

**Skills** let you review and manage the ledger, bootstrap project context, and check status.

Session data is ephemeral (`.handover/session/`, gitignored). The error ledger (`.handover/error-ledger.jsonl`) persists across sessions. The valuable output lives in `.claude/` and gets committed with your project.

## Installation

```bash
# From the plugin directory
claude plugin add /path/to/handoverAgent

# Or for development
claude --plugin-dir /path/to/handoverAgent
```

## Quick Start

```bash
# 1. Initialize — analyzes your project and creates CLAUDE.md context
/handover:init

# 2. Work normally — hooks capture errors and patterns automatically

# 3. Sync — review and manage the error ledger
/handover:sync

# 4. Check status
/handover:status
```

That's it. After init, everything else is automatic.

## Error Ledger

The error ledger (`.handover/error-ledger.jsonl`) is the core of Handover's error tracking:

```
During Session:
  on-prompt.mjs ──→ detect instruction violations ──→ errors.jsonl
  on-tool-fail.mjs ──→ classify + format ──→ errors.jsonl
  on-tool-done.mjs ──→ detect + format ──→ errors.jsonl

On Session End:
  errors.jsonl ──→ fingerprint ──→ merge into error-ledger.jsonl
                                        │
                                        ├─ sessionCount < threshold → stays in ledger (staging)
                                        └─ sessionCount >= threshold → promoted to CLAUDE.md
```

- **Fingerprinting**: Errors are deduplicated by type + file + normalized message (line numbers excluded since they shift)
- **Promotion threshold**: Errors must appear in 2+ sessions before reaching CLAUDE.md (configurable)
- **CLAUDE.md is output-only**: Regenerated entirely from promoted ledger entries, never read for error data
- **Instruction violations**: User corrections like "I told you to..." are captured and tracked like any other error

## Skills

### `/handover:init`
Analyzes your project (package.json, directory structure, git history) and creates:
- `.claude/CLAUDE.md` with a managed `<!-- HANDOVER:START/END -->` section containing stack, build commands, key directories
- `.claude/commands/*.md` workflow files (build, test, dev) based on detected scripts
- `.handover/` directory structure for session data

### `/handover:sync`
Review and manage the error ledger:
- View all ledger entries with promotion status
- Force-promote entries to CLAUDE.md (even below threshold)
- Demote entries (remove from CLAUDE.md)
- Edit summaries for clarity
- Regenerate CLAUDE.md managed section

### `/handover:status`
Shows current state: managed section size, error ledger statistics (total/promoted/staging entries, top error types), session stats, archive count, generated commands, and configuration.

## Hooks (Automatic)

| Event | What It Captures |
|-------|-----------------|
| `UserPromptSubmit` | Prompts with extracted topics + instruction violation detection |
| `PostToolUseFailure` | All tool failures with error classification |
| `PostToolUse` (Bash) | Build/test errors from successful Bash calls |
| `SessionStart` | Injects previous session context, suggests sync |
| `Stop` | Finalizes session, runs ledger pipeline, archives data |
| `PreCompact` | Saves session summary before conversation compaction |

All hooks are silent (no stdout) except `SessionStart` (injects context) and `PreCompact` (brief confirmation).

## CLAUDE.md Management

Handover manages a section between markers — your own content is never touched:

```markdown
# Your existing CLAUDE.md content here...

<!-- HANDOVER:START -->
## Session Context
### Errors (auto-tracked)
- [02/19] type_error: src/api/users.ts:45 — Cannot read properties of null
- [02/18] build_error: npm — missing @types/node
<!-- HANDOVER:END -->
```

Only errors that persist across multiple sessions appear here. The managed section is regenerated from the error ledger on each session end — capped at 1,000 chars, newest first.

## Configuration

Create `.handover/config.json` to customize:

```json
{
  "maxChars": 1000,
  "pruneAgeDays": 7,
  "maxArchivedSessions": 10,
  "promotionThreshold": 2,
  "maxLedgerEntries": 50,
  "ledgerPruneAgeDays": 30
}
```

| Key | Default | Description |
|-----|---------|-------------|
| `maxChars` | `1000` | Max characters for CLAUDE.md managed section |
| `pruneAgeDays` | `7` | Legacy age-based pruning |
| `maxArchivedSessions` | `10` | Max archived sessions to keep |
| `promotionThreshold` | `2` | Sessions an error must appear in before CLAUDE.md promotion |
| `maxLedgerEntries` | `50` | Max entries in the error ledger |
| `ledgerPruneAgeDays` | `30` | Remove unseen ledger entries after N days |

## Project Structure

```
handoverAgent/
  .claude-plugin/plugin.json      # Plugin manifest
  hooks/
    hooks.json                    # Hook registrations
    lib/
      session-store.mjs           # Session data persistence + ledger I/O
      claude-md.mjs               # CLAUDE.md marker parse/write
      error-detector.mjs          # Error classification + instruction violation detection
      error-ledger.mjs            # Fingerprinting, ledger merge, promotion, CLAUDE.md generation
    on-prompt.mjs                 # Log prompts + topics + instruction violations
    on-tool-fail.mjs              # Log tool failures
    on-tool-done.mjs              # Detect build/test errors
    on-session-start.mjs          # Inject context + suggest sync
    on-session-end.mjs            # Finalize + ledger pipeline + archive
    on-compact.mjs                # Save summary before compaction
  skills/
    init/SKILL.md                 # Project analysis + bootstrap
    sync/SKILL.md                 # Error ledger review + management
    status/SKILL.md               # Status display + ledger stats
```

## License

MIT
