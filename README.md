# Handover

Lightweight Claude Code plugin that automatically captures session context — errors, workflows, patterns — and maintains a concise, self-pruning `CLAUDE.md` with auto-generated command files.

No CLI. No MCP server. No API key. No build step. Pure hooks + skills.

## How It Works

```
Hooks (capture)  →  Session Data (files)  →  Skills (synthesize)  →  CLAUDE.md + Commands (output)
```

**Hooks** run automatically during Claude Code sessions to capture prompts, errors, and tool failures. **Skills** let you (or Claude) synthesize that data into actionable project context in `.claude/CLAUDE.md` and `.claude/commands/`.

Session data is ephemeral (`.handover/`, gitignored). The valuable output lives in `.claude/` and gets committed with your project.

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

# 3. Sync — process captured data into CLAUDE.md (also suggested on session start)
/handover:sync

# 4. Check status
/handover:status
```

That's it. After init, everything else is automatic.

## Skills

### `/handover:init`
Analyzes your project (package.json, directory structure, git history) and creates:
- `.claude/CLAUDE.md` with a managed `<!-- HANDOVER:START/END -->` section containing stack, build commands, key directories
- `.claude/commands/*.md` workflow files (build, test, dev) based on detected scripts
- `.handover/` directory structure for session data

### `/handover:sync`
Processes captured session data and updates the CLAUDE.md managed section:
- Groups recurring errors by type and file
- Identifies frequent topics and workflow patterns
- Deduplicates entries, respects size limits
- Generates new command files for detected workflows

### `/handover:status`
Shows current state: managed section size, session stats, archive count, generated commands, and configuration.

## Hooks (Automatic)

| Event | What It Captures |
|-------|-----------------|
| `UserPromptSubmit` | Prompts with extracted topics |
| `PostToolUseFailure` | All tool failures with error classification |
| `PostToolUse` (Bash) | Build/test errors from successful Bash calls |
| `SessionStart` | Injects previous session context, suggests sync |
| `Stop` | Finalizes session, prunes CLAUDE.md, archives data |
| `PreCompact` | Saves session summary before conversation compaction |

All hooks are silent (no stdout) except `SessionStart` (injects context) and `PreCompact` (brief confirmation).

## CLAUDE.md Management

Handover manages a section between markers — your own content is never touched:

```markdown
# Your existing CLAUDE.md content here...

<!-- HANDOVER:START -->
## Session Context
### Errors
- [02/19] TypeError in src/api/users.ts:45 — null array check
- [02/18] Build: missing @types/node

### Patterns
- Build: `npm run build` (tsup, dist/)
- Test: `npm test` (vitest)
<!-- HANDOVER:END -->
```

**Auto-pruning**: Entries older than 7 days are removed. Section is capped at 1,000 chars. The "Patterns" subsection (most valuable) is always preserved.

## Configuration

Create `.handover/config.json` to customize:

```json
{
  "maxChars": 1000,
  "pruneAgeDays": 7,
  "maxArchivedSessions": 10
}
```

## Project Structure

```
handoverAgent/
  .claude-plugin/plugin.json      # Plugin manifest
  hooks/
    hooks.json                    # Hook registrations
    lib/
      session-store.mjs           # Session data persistence
      claude-md.mjs               # CLAUDE.md parse/update/prune
      error-detector.mjs          # Error pattern detection
    on-prompt.mjs                 # Log prompts + topics
    on-tool-fail.mjs              # Log tool failures
    on-tool-done.mjs              # Detect build/test errors
    on-session-start.mjs          # Inject context + suggest sync
    on-session-end.mjs            # Finalize + prune + archive
    on-compact.mjs                # Save summary before compaction
  skills/
    init/SKILL.md                 # Project analysis + bootstrap
    sync/SKILL.md                 # Session data → CLAUDE.md
    status/SKILL.md               # Status display
```

## License

MIT
