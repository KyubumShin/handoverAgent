# Architecture

## Flow Summary

```
┌─────────────────────────────────────────────────────────────┐
│                    SESSION LIFECYCLE                         │
│                                                             │
│  SessionStart                                               │
│  ┌──────────────┐                                           │
│  │on-session-   │──→ Recover stale session (if unfinalized) │
│  │start.mjs     │──→ Read last-session.json                 │
│  │              │──→ Inject context to Claude via stdout    │
│  └──────────────┘                                           │
│         ↓                                                   │
│  During Session (hooks fire automatically)                  │
│  ┌──────────────┐     ┌──────────────┐    ┌──────────────┐  │
│  │on-prompt.mjs │     │on-tool-fail  │    │on-tool-done  │  │
│  │              │     │.mjs          │    │.mjs          │  │
│  │Log prompts + │     │Log ALL tool  │    │Detect errors │  │
│  │topics +      │     │failures w/   │    │in Bash output│  │
│  │instruction   │     │cause/summary │    │w/ cause/     │  │
│  │violations    │     │              │    │summary       │  │
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
│  │on-session-   │──→ finalizeSession() (shared pipeline):    │
│  │end.mjs       │   → Write .handover/last-session.json     │
│  │              │   → Ledger pipeline (see below)           │
│  │              │   → Archive session → .handover/archive/  │
│  └──────────────┘                                           │
└─────────────────────────────────────────────────────────────┘

  Manual triggers (skills):
  /handover:init   → Analyze project → Bootstrap CLAUDE.md + commands
  /handover:sync   → Review error ledger → Promote/demote/edit entries
  /handover:status → Display stats + ledger info
```

## Ledger Pipeline (on-session-end)

```
errors.jsonl (session) ──→ fingerprint ──→ merge into error-ledger.jsonl
                                                │
                                                ├─ sessionCount < threshold → stays in ledger (staging)
                                                └─ sessionCount >= threshold → promoted to CLAUDE.md

CLAUDE.md is output-only: regenerated entirely from promoted ledger entries.
Never read for error data.
```

### Steps:
1. Read session `errors.jsonl`
2. Read `.handover/error-ledger.jsonl`
3. Fingerprint + merge session errors into ledger (increment counts or create new)
4. Prune ledger (age limit + entry count limit)
5. Find promotable entries (`sessionCount >= promotionThreshold` and not yet promoted)
6. Generate CLAUDE.md content from ALL promoted entries (newest first, truncated to fit)
7. Write CLAUDE.md managed section (output-only)
8. Mark newly promoted entries, save ledger

## Data Flow

```
Hooks (capture)  →  Session Data (files)  →  Ledger (staging)  →  CLAUDE.md (output)
```

- **Hooks** (6 events): Capture prompts, errors, tool failures, instruction violations during sessions
- **Session store** (.handover/session/): Ephemeral JSONL logs, gitignored
- **Error ledger** (.handover/error-ledger.jsonl): Persistent staging area, survives archival
- **Skills** (3): Init, sync, status — Claude analyzes and generates output
- **Outputs**: `.claude/CLAUDE.md` (managed section) + `.claude/commands/*.md` (workflow commands)

## Error Format

Session errors (`errors.jsonl`) use this format:
```json
{
  "ts": "2026-02-19T14:30:00Z",
  "tool": "Bash",
  "type": "type_error",
  "cause": "src/api/users.ts:45",
  "summary": "Cannot read properties of null — missing null check before .map()",
  "raw": "TypeError: Cannot read properties of null (reading 'map') at ..."
}
```

Error types: `type_error`, `build_error`, `runtime_error`, `test_failure`, `instruction_violation`, `unknown_error`

## Ledger Entry Format

```json
{
  "fingerprint": "a1b2c3d4e5f67890",
  "type": "type_error",
  "cause": "src/api/users.ts:45",
  "summary": "Cannot read properties of null — missing null check before .map()",
  "firstSeen": "2026-02-15T10:00:00Z",
  "lastSeen": "2026-02-19T14:30:00Z",
  "sessionCount": 3,
  "hitCount": 7,
  "promoted": false
}
```

Fingerprint: MD5 hash of `type + file + normalized_error_signature` (excludes line numbers which shift).

## Design Decisions

### 1. Hooks over MCP/CLI — capture must be invisible

The old system required users to run commands (`handover extract`, `handover ask`). Nobody does that consistently. Hooks fire automatically on every prompt, every error, every session boundary. Zero user effort = 100% data capture.

### 2. JSONL session files over a database — simplicity wins

Each hook is a short-lived Node process. `appendFileSync` to a JSONL file is atomic, requires no dependencies, and is trivially parseable. A database (SQLite, etc.) would need connection management, locking, and a build step. JSONL gives us append-only logs that are human-readable and `grep`-able.

### 3. Marker-based CLAUDE.md over a separate knowledge base — native integration

Claude Code automatically loads `.claude/CLAUDE.md` into every session. By writing directly there (between `<!-- HANDOVER:START/END -->` markers), captured knowledge is available to Claude without any retrieval system. The markers ensure user content is never touched.

### 4. Error ledger as staging area — noise reduction

Not every error deserves a spot in CLAUDE.md. The ledger acts as a staging area: errors must appear across multiple sessions (`promotionThreshold`, default 2) before being promoted. This filters out one-off typos and transient failures, surfacing only persistent issues.

### 5. CLAUDE.md is output-only — single source of truth

The ledger is the source of truth for error data. CLAUDE.md is regenerated entirely from promoted ledger entries on each session end. This eliminates the fragile read-parse-modify-write cycle and prevents drift between the ledger and CLAUDE.md.

### 6. Instruction violation detection — capturing user corrections

When a user says "I told you to..." or "that's wrong", it signals a repeated instruction that Claude keeps missing. These are captured as `instruction_violation` errors and flow through the same ledger pipeline, so persistent misunderstandings surface in CLAUDE.md.

### 7. `last-session.json` bridge — ordering problem

Session-end archives session data (moves the directory). Session-start needs that data. The `last-session.json` file written to `.handover/` (outside the session dir) before archiving solves this ordering problem cleanly.

### 8. Pure `.mjs` with no build step — instant plugins

No TypeScript, no compilation, no `node_modules`. Every file runs directly with `node`. This means zero install friction, zero build failures, and the entire plugin can be read and understood in one sitting.

### 9. Skills as markdown instructions — Claude IS the processor

Skills are just markdown instructions telling Claude what to do. `/handover:init` doesn't run code to analyze a project — it tells Claude to use `Glob`, `Read`, and `git log` itself. This leverages Claude's native tool access and reasoning rather than reimplementing it in JavaScript.

### 10. Crash-safe ledger writes — temp file + rename

The ledger is written via a temp file + `renameSync` to prevent corruption if the process is killed mid-write. This is a standard pattern for atomic file updates.

### 11. Stale session recovery — no data left behind

If a session ends abnormally (`/clear`, terminal close, process kill), the `Stop` hook never fires and session data is left unprocessed. On next `SessionStart`, `on-session-start.mjs` detects any unfinalized session (`.handover/session/` exists with `meta.finalized !== true`) and runs the full `finalizeSession()` pipeline — ledger merge, pruning, promotion, CLAUDE.md update, archive — before proceeding. This ensures zero error data loss across abnormal session boundaries. The `finalizeSession()` function is shared between `on-session-end.mjs` and `on-session-start.mjs` via `hooks/lib/finalize-session.mjs`.

## File Responsibilities

| File | Layer | Role |
|------|-------|------|
| `hooks/on-prompt.mjs` | Capture | Log prompts + extract topics + detect instruction violations |
| `hooks/on-tool-fail.mjs` | Capture | Log tool failures with cause/summary/raw |
| `hooks/on-tool-done.mjs` | Capture | Detect build/test errors in successful Bash output |
| `hooks/on-session-start.mjs` | Bridge | Recover stale sessions + inject previous session context |
| `hooks/on-session-end.mjs` | Lifecycle | Finalize session via shared pipeline |
| `hooks/lib/finalize-session.mjs` | Lifecycle | Shared finalization: summary, ledger pipeline, archive |
| `hooks/on-compact.mjs` | Lifecycle | Save session snapshot before conversation compaction |
| `hooks/lib/session-store.mjs` | Storage | JSONL append/read, archival, config, meta, ledger I/O |
| `hooks/lib/claude-md.mjs` | Storage | CLAUDE.md marker parse/write |
| `hooks/lib/error-detector.mjs` | Analysis | Error classification, summarization, instruction violation detection |
| `hooks/lib/error-ledger.mjs` | Analysis | Fingerprinting, ledger merge, pruning, promotion, CLAUDE.md generation |
| `skills/init/SKILL.md` | Synthesis | Project analysis → bootstrap CLAUDE.md + commands |
| `skills/sync/SKILL.md` | Synthesis | Review and manage error ledger entries |
| `skills/status/SKILL.md` | Display | Show handover stats, ledger info, and config |

## Session Data Model

```
.handover/
  session/                          # Current session (ephemeral)
    prompts.jsonl                   # {"ts", "prompt", "topics"}
    errors.jsonl                    # {"ts", "tool", "type", "cause", "summary", "raw"}
    meta.json                       # {"startedAt", "endedAt", "promptCount", "errorCount", "finalized"}
    summary.json                    # Written by on-compact before compaction
  archive/                          # Past sessions (auto-pruned to 10)
    2026-02-19T05-53-37/            # Timestamped copies of session/
  error-ledger.jsonl                # Persistent error staging (survives archival)
  last-session.json                 # Bridge: written by session-end, read by session-start
  config.json                       # {"maxChars", "pruneAgeDays", "maxArchivedSessions",
                                    #  "promotionThreshold", "maxLedgerEntries", "ledgerPruneAgeDays"}
```

## Configuration

| Key | Default | Description |
|-----|---------|-------------|
| `maxChars` | `1000` | Max characters for CLAUDE.md managed section |
| `pruneAgeDays` | `7` | (Legacy) Age-based pruning for CLAUDE.md entries |
| `maxArchivedSessions` | `10` | Max archived sessions to keep |
| `promotionThreshold` | `2` | Sessions an error must appear in before CLAUDE.md promotion |
| `maxLedgerEntries` | `50` | Max entries in the error ledger |
| `ledgerPruneAgeDays` | `30` | Remove unseen ledger entries after N days |

## Backward Compatibility

- Old `errors.jsonl` entries (with `error`/`file`/`line` fields) are handled gracefully by `computeFingerprint()` — checks for `summary`/`raw` fields, falls back to `error`
- CLAUDE.md marker format unchanged (`<!-- HANDOVER:START/END -->`)
- Existing config.json fields unchanged; new fields have defaults
