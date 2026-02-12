# Handover - Claude Code Plugin

AI-powered knowledge transfer for project takeovers, role transitions, and team onboarding.

## What it does

**Handover** helps you get up to speed when you're new to a codebase, role, or team. It extracts structured knowledge from code, documentation, and git history, then lets you query it with intelligent Q&A that cites its sources.

### Key Features

- **Knowledge Extraction** - Analyze codebases, documentation, and git history to build a structured knowledge base
- **Intelligent Q&A** - Ask questions and get answers with source citations and confidence levels
- **Gap Analysis** - Identify what you still need to learn, prioritized by importance
- **Knowledge Maps** - Visual coverage showing your understanding across categories
- **Auto-Detection** - Plugin suggests itself when it detects you're in a handover situation
- **CLI Migration** - Import existing data from the handover-agent CLI tool

## Installation

```bash
# From Claude Code marketplace
/plugin install handover

# Or load locally for development
claude --plugin-dir ./plugin
```

## Quick Start

```
# 1. Initialize a handover profile
/handover:init project

# 2. Extract knowledge from the codebase
/handover:extract .

# 3. Also extract from docs and git history
/handover:extract . --docs
/handover:extract . --git

# 4. Start asking questions
/handover:ask How does authentication work?
/handover:ask What's the deployment process?

# 5. Check your coverage
/handover:map
/handover:gaps
```

## Skills

| Skill | Description |
|-------|-------------|
| `/handover:init` | Initialize a handover profile (project, role, or team) |
| `/handover:extract` | Extract knowledge from codebase, docs, or git |
| `/handover:ask` | Ask questions with cited answers |
| `/handover:gaps` | Analyze knowledge gaps and get recommendations |
| `/handover:map` | Visual knowledge coverage map |
| `/handover:status` | Show handover progress and stats |
| `/handover:feedback` | Rate answers or view feedback stats |
| `/handover:migrate` | Import data from the handover-agent CLI |

## How It Works

### Knowledge Categories

Extracted knowledge is organized into categories:

| Category | Examples |
|----------|---------|
| **architecture** | System design, module structure, data flow |
| **codebase** | File organization, key modules, entry points |
| **process** | Dev workflows, CI/CD, release process |
| **people** | Contributors, roles, team structure |
| **decision** | Why things were built a certain way |
| **tool** | Build tools, testing frameworks |
| **convention** | Coding standards, naming patterns |
| **domain** | Business logic, terminology |

### Citation System

When you ask questions, answers include inline citations like `[entry-id]` that reference specific knowledge entries, so you can trace where information came from.

### Confidence Levels

Each answer includes a confidence assessment:
- **High** - Knowledge base directly addresses the question
- **Medium** - Partial coverage, some inference required
- **Low** - Minimal relevant information

## Data Storage

Knowledge is stored in `.handover/` in your project directory:

```
.handover/
  profile.json           # Handover profile
  knowledge/
    entries/*.json        # Individual knowledge entries
    index.json            # Search index
  interactions/
    log.jsonl             # Q&A interaction log
  feedback/
    history.jsonl         # Feedback ratings
```

### Git Integration

Recommended `.gitignore` additions:
```
# Personal handover data
.handover/interactions/
.handover/feedback/

# Keep shared knowledge (optional)
# .handover/knowledge/
# .handover/profile.json
```

## Auto-Detection

The plugin automatically suggests itself when it detects handover-related phrases like:
- "I'm new to this codebase"
- "just joined the team"
- "taking over this project"
- "knowledge transfer"

## Migrating from CLI

If you previously used the `handover-agent` CLI tool:

```
/handover:migrate
```

This imports all existing knowledge entries, profile, and feedback history from the `.handover/data/` directory.

## Requirements

- Claude Code 1.0.33 or later
- Node.js 18+

## License

MIT
