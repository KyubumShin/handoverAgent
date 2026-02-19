---
name: init
description: Initialize Handover for this project — analyzes codebase and creates context
---

# Handover Init

Analyze this project and set up automatic session context capture.

## Steps

1. **Analyze the project** using Glob and Read:
   - `package.json`, `Cargo.toml`, `pyproject.toml`, `go.mod`, or equivalent → detect tech stack
   - Build/test/dev commands from package scripts or build configs
   - Directory structure → identify key directories and entry points
   - `.gitignore` → understand project boundaries
   - Recent `git log --oneline -10` → understand recent work
   - Existing `.claude/CLAUDE.md` → preserve any non-handover content

2. **Create `.claude/CLAUDE.md`** with a managed section (preserve existing non-handover content if present):
   ```
   <!-- HANDOVER:START -->
   ## Project Context
   - **Stack**: [detected stack, e.g., TypeScript, React, Vitest]
   - **Build**: `[build command]` | **Test**: `[test command]`
   - **Key dirs**: [important directories and their purpose]
   - **Entry**: [main entry point(s)]
   <!-- HANDOVER:END -->
   ```
   Keep the managed section concise — under 500 chars initially.

3. **Create `.claude/commands/`** with workflow commands based on detected scripts:
   - `build.md`: Instructions for building the project
   - `test.md`: Instructions for running tests
   - `dev.md`: Instructions for starting dev server (if applicable)
   Each command file should be a simple markdown file with the command and brief context.

4. **Create `.handover/` directory structure**:
   ```
   .handover/
     session/          # Will be populated by hooks during sessions
     archive/          # Past session data
     config.json       # Default config: {"maxChars": 1000, "pruneAgeDays": 7, "maxArchivedSessions": 10}
   ```

5. **Report** what was created and detected.

## Important
- Do NOT overwrite existing non-handover content in CLAUDE.md
- Keep generated content concise and actionable
- Only create command files for scripts/commands that actually exist in the project
