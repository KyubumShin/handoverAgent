# Architecture

## Flow Summary

```
┌─────────────────────────────────────────────────────────────┐
│                    SESSION LIFECYCLE                         │
│                                                             │
│  SessionStart                                               │
│  ┌──────────────┐                                           │
│  │on-session-   │──→ Read last-session.json                 │
│  │start.mjs     │──→ Inject context to Claude via stdout    │
│  └──────────────┘                                           │
│         ↓                                                   │
│  During Session (hooks fire automatically)                  │
│  ┌──────────────┐     ┌──────────────┐    ┌──────────────┐  │
│  │on-prompt.mjs │     │on-tool-fail  │    │on-tool-done  │  │
│  │              │     │.mjs          │    │.mjs          │  │
│  │Log prompts + │     │Log ALL tool  │    │Detect errors │  │
│  │topics        │     │failures      │    │in Bash output│  │
│  └──────┬───────┘     └──────┬───────┘    └──────┬───────┘  │
│         ↓                    ↓                   ↓          │
│     .handover/session/prompts.jsonl  errors.jsonl           │
│                                                             │
│  PreCompact (if conversation gets long)                     │
│  ┌──────────────┐                                           │
│  │on-compact.mjs│──→ Save summary.json snapshot             │
│  └──────────────┘                                           │
│         ↓                                                   │
│  Stop / SessionEnd                                          │
│  ┌──────────────┐                                           │
│  │on-session-   │──→ Write .handover/last-session.json      │
│  │end.mjs       │──→ Prune CLAUDE.md (age + size)           │
│  │              │──→ Archive session → .handover/archive/   │
│  └──────────────┘                                           │
└─────────────────────────────────────────────────────────────┘

  Manual triggers (skills):
  /handover:init   → Analyze project → Bootstrap CLAUDE.md + commands
  /handover:sync   → Process session data → Update CLAUDE.md
  /handover:status → Display stats
```

## Data Flow

```
Hooks (capture)  →  Session Data (files)  →  Skills (synthesize)  →  CLAUDE.md + Commands (output)
```

- **Hooks** (6 events): Capture prompts, errors, tool failures during sessions
- **Session store** (.handover/): Ephemeral JSONL logs, gitignored
- **Skills** (3): Init, sync, status — Claude analyzes and generates output
- **Outputs**: `.claude/CLAUDE.md` (managed section) + `.claude/commands/*.md` (workflow commands)

## Design Decisions

### 1. Hooks over MCP/CLI — capture must be invisible

The old system required users to run commands (`handover extract`, `handover ask`). Nobody does that consistently. Hooks fire automatically on every prompt, every error, every session boundary. Zero user effort = 100% data capture.

### 2. JSONL session files over a database — simplicity wins

Each hook is a short-lived Node process. `appendFileSync` to a JSONL file is atomic, requires no dependencies, and is trivially parseable. A database (SQLite, etc.) would need connection management, locking, and a build step. JSONL gives us append-only logs that are human-readable and `grep`-able.

### 3. Marker-based CLAUDE.md over a separate knowledge base — native integration

Claude Code automatically loads `.claude/CLAUDE.md` into every session. By writing directly there (between `<!-- HANDOVER:START/END -->` markers), captured knowledge is available to Claude without any retrieval system. The markers ensure user content is never touched.

### 4. Self-pruning over manual cleanup — context rots

A 6-month-old error entry is noise. The prune-by-age (7 day default) and prune-by-size (1000 char cap) ensure the managed section stays fresh and relevant. The `Patterns` subsection (build commands, key dirs) is undated and always preserved — it's the most durable knowledge.

### 5. `last-session.json` bridge — ordering problem

Session-end archives session data (moves the directory). Session-start needs that data. The `last-session.json` file written to `.handover/` (outside the session dir) before archiving solves this ordering problem cleanly.

### 6. Pure `.mjs` with no build step — instant plugins

No TypeScript, no compilation, no `node_modules`. Every file runs directly with `node`. This means zero install friction, zero build failures, and the entire plugin can be read and understood in one sitting.

### 7. Skills as markdown instructions — Claude IS the processor

Skills are just markdown instructions telling Claude what to do. `/handover:init` doesn't run code to analyze a project — it tells Claude to use `Glob`, `Read`, and `git log` itself. This leverages Claude's native tool access and reasoning rather than reimplementing it in JavaScript.

## File Responsibilities

| File | Layer | Role |
|------|-------|------|
| `hooks/on-prompt.mjs` | Capture | Log prompts + extract topic keywords |
| `hooks/on-tool-fail.mjs` | Capture | Log all tool failures with error classification |
| `hooks/on-tool-done.mjs` | Capture | Detect build/test errors in successful Bash output |
| `hooks/on-session-start.mjs` | Bridge | Inject previous session context into new session |
| `hooks/on-session-end.mjs` | Lifecycle | Finalize, write summary, prune CLAUDE.md, archive |
| `hooks/on-compact.mjs` | Lifecycle | Save session snapshot before conversation compaction |
| `hooks/lib/session-store.mjs` | Storage | JSONL append/read, archival, config, meta |
| `hooks/lib/claude-md.mjs` | Storage | CLAUDE.md marker parse/write, prune by age/size |
| `hooks/lib/error-detector.mjs` | Analysis | Regex error classification + file:line extraction |
| `skills/init/SKILL.md` | Synthesis | Project analysis → bootstrap CLAUDE.md + commands |
| `skills/sync/SKILL.md` | Synthesis | Session data → CLAUDE.md updates |
| `skills/status/SKILL.md` | Display | Show handover stats and config |

## Pruning Strategy

```
on-session-end
  │
  ├─ pruneByAge(content, 7 days)
  │    Remove dated entries [MM/DD] older than 7 days
  │    Year-boundary: entries >30 days in future assumed last year
  │    Non-dated lines (headers, patterns) always kept
  │
  └─ pruneBySize(content, 1000 chars)
       Remove oldest dated entries first (preserving line order)
       Headers and section structure maintained
       Patterns subsection (undated) always survives
```

## Session Data Model

```
.handover/
  session/                          # Current session (ephemeral)
    prompts.jsonl                   # {"ts", "prompt", "topics"}
    errors.jsonl                    # {"ts", "tool", "error", "type", "file?", "line?"}
    meta.json                       # {"startedAt", "endedAt", "promptCount", "errorCount", "finalized"}
    summary.json                    # Written by on-compact before compaction
  archive/                          # Past sessions (auto-pruned to 10)
    2026-02-19T05-53-37/            # Timestamped copies of session/
  last-session.json                 # Bridge: written by session-end, read by session-start
  config.json                       # {"maxChars": 1000, "pruneAgeDays": 7, "maxArchivedSessions": 10}
```
