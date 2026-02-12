---
name: extract
description: Extract knowledge from a codebase, documentation, or git history for handover. Analyzes project files and stores structured knowledge entries.
argument-hint: <path> [--docs] [--git] [--deep]
---

# Knowledge Extraction

You are performing knowledge extraction for a handover. Your goal is to analyze the target path and create structured knowledge entries that will help someone new understand the project.

## Arguments

- `$ARGUMENTS` contains the path and optional flags
- `--docs` flag: focus on markdown documentation files only
- `--git` flag: focus on git history analysis only
- `--deep` flag: also read entry points and config files (deeper analysis)
- No flag: analyze codebase (project files, structure, dependencies)

## Setup

1. First check if `.handover/` exists. If not, tell the user to run `/handover:init` first.
2. Call `handover_get_profile` to load the current handover profile.

## Extraction Modes

### Codebase Mode (default)

1. Use the **Glob** tool to find key project files:
   - `package.json`, `tsconfig.json`, `pyproject.toml`, `Cargo.toml`, `go.mod`, `pom.xml`
   - `README.md`, `Dockerfile`, `docker-compose.yml`, `.env.example`
   - `Makefile`, `build.gradle`, `setup.py`, `setup.cfg`

2. Use the **Read** tool to read these key files.

3. Use the **Glob** tool to build a file tree of the project (exclude `node_modules`, `.git`, `dist`, `build`, `coverage`, `__pycache__`, `.venv`).

4. If `--deep` flag is present, also read:
   - Entry points: `index.ts`, `index.js`, `main.ts`, `main.js`, `app.ts`, `app.js`, `server.ts`, `server.js`
   - Config files: `*.config.ts`, `*.config.js`, `.eslintrc*`, `.prettierrc`

5. Analyze everything and create knowledge entries.

### Documentation Mode (`--docs`)

1. Use **Glob** to find all `**/*.md` files.
2. Use **Read** to read them (up to 30 files).
3. Extract knowledge about processes, decisions, domain concepts, setup guides, conventions.

### Git Mode (`--git`)

1. Use **Bash** to run:
   - `git log --oneline -50` (recent commits)
   - `git log --all --oneline --graph -20` (branch structure)
   - `git shortlog -sn` (contributors)
2. Extract knowledge about contributors, branching strategy, recent changes, project pace.

## Creating Knowledge Entries

For each piece of knowledge you identify, call `handover_add_entry` with:

```json
{
  "title": "Clear, descriptive title",
  "content": "Detailed explanation useful for someone new",
  "category": "one of: architecture, codebase, process, people, decision, tool, convention, domain, other",
  "tags": ["relevant", "tags"],
  "source": {
    "type": "file|git|doc",
    "path": "source path"
  },
  "confidence": 0.8
}
```

### Category Guidelines

| Category | Use For |
|----------|---------|
| `architecture` | System design, module structure, data flow, deployment topology |
| `codebase` | File organization, key modules, entry points, build output |
| `process` | Development workflows, CI/CD, release process, PR conventions |
| `people` | Contributors, roles, team structure, ownership areas |
| `decision` | Why things were built a certain way, trade-offs made |
| `tool` | Build tools, dev dependencies, testing frameworks, deployment tools |
| `convention` | Coding standards, naming patterns, file organization rules |
| `domain` | Business logic, domain concepts, terminology |
| `other` | Anything that doesn't fit above but is important |

### Confidence Guidelines

- **0.9-1.0**: Directly stated in source (e.g., README says "we use Jest for testing")
- **0.7-0.8**: Clearly implied from evidence (e.g., jest.config.js exists)
- **0.5-0.6**: Reasonable inference (e.g., commit patterns suggest weekly releases)
- **0.3-0.4**: Weak inference, needs verification

## Output

After extracting, report:
- Number of entries created (and how many were deduplicated)
- Categories covered
- Suggest running `/handover:gaps` to see what's still missing
