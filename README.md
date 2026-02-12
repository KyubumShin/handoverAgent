# Handover Agent

AI-powered knowledge transfer assistant available as both a CLI tool and a Claude Code plugin. Helps people receiving handovers -- project takeovers, role transitions, and team onboarding. It extracts knowledge from codebases, documentation, and git history, then provides intelligent Q&A with source citations, gap analysis, and self-improving skills.

```
handover ask "How is the authentication system structured?"

Answer:
The authentication system uses JWT tokens with a refresh token rotation strategy...

Confidence: 85%
Sources:
  [a1b2c3] Authentication Architecture
  [d4e5f6] Security Decisions Log

You might also ask:
  - How are refresh tokens rotated?
  - What happens when a token expires?
```

## Installation

```bash
npm install -g handover-agent
```

Or run directly with npx:

```bash
npx handover-agent
```

## Quick Start

### CLI

```bash
# 1. Initialize a handover
handover init -t project

# 2. Extract knowledge from your codebase
handover extract ./src
handover extract ./docs --docs
handover extract . --git

# 3. Ask questions
handover ask "What is the project architecture?"
handover ask   # starts interactive Q&A session

# 4. Analyze knowledge gaps
handover gaps

# 5. Evolve skills from usage patterns
handover skills --evolve
```

### Claude Code Plugin

The plugin runs natively within Claude Code conversations with no API key required.

**Installation (Local Development):**
```bash
claude --plugin-dir ./plugin
```

**Available Skills:**
- `/handover:init` -- Initialize handover session
- `/handover:extract` -- Extract knowledge from files/git
- `/handover:ask` -- Ask questions with AI-powered answers
- `/handover:gaps` -- Analyze knowledge gaps
- `/handover:map` -- Visualize knowledge coverage
- `/handover:status` -- Show handover progress
- `/handover:feedback` -- Provide feedback on answers
- `/handover:migrate` -- Migrate CLI data to plugin

**Automatic Detection:**
The plugin automatically detects handover situations via conversation hooks. When you start a new project or mention onboarding, it offers to initialize a handover session.

**Knowledge Persistence:**
The plugin includes an MCP server with 15 tools for persistent knowledge storage. Knowledge survives conversation compaction and is shared across all Claude Code sessions in the project.

**Detailed Documentation:**
See [`plugin/README.md`](plugin/README.md) for complete plugin documentation.

## Commands

### `handover init`

Initialize a new handover profile.

```bash
handover init -t project   # project takeover (default)
handover init -t role       # role transition
handover init -t team       # team onboarding
```

### `handover extract <path>`

Extract knowledge from files, documentation, or git history.

```bash
handover extract ./src              # analyze codebase structure
handover extract ./src --deep       # deep analysis (reads file contents)
handover extract ./docs --docs      # extract from markdown documentation
handover extract . --git            # extract from git history and contributors
```

### `handover ask [question]`

Ask questions about the handover. Without a question, starts an interactive session.

```bash
handover ask "What database is used?"
handover ask   # interactive mode with follow-ups, feedback, and history
```

Interactive mode commands:
- `/help` -- show available commands
- `/history` -- show conversation history
- `/sources` -- show knowledge sources used
- `/feedback positive|negative [comment]` -- rate the last answer
- `/quit` -- end session

### `handover status`

Show handover progress: knowledge entries, categories, sources, and feedback stats.

### `handover gaps`

Analyze knowledge gaps using AI. Shows missing topics by importance (critical, high, medium, low) with suggested questions to fill each gap.

### `handover map`

Display a visual knowledge map with coverage bars for each category.

### `handover skills`

List available skills (built-in and generated).

```bash
handover skills             # list all skills
handover skills --evolve    # create new skills from usage patterns
```

### `handover feedback`

View aggregate feedback statistics.

### `handover config [key] [value]`

View or edit configuration.

```bash
handover config                    # show all settings
handover config model              # show specific setting
handover config model claude-sonnet-4-20250514   # set a value
handover config apiKey sk-... -g   # set globally
```

## Architecture

Handover Agent is built around four specialized sub-agents coordinated by a central orchestrator:

```
                    +-------------------+
                    |   Orchestrator    |
                    | (unified API)     |
                    +--------+----------+
                             |
         +-------------------+-------------------+
         |           |           |               |
   +-----+-----+ +--+---+ +----+----+ +---------+--+
   | Knowledge  | | Q&A  | |  Gap    | |   Skill    |
   | Extractor  | | Resp | | Analyzer| |   Builder  |
   +-----+------+ +--+---+ +----+----+ +------+-----+
         |            |          |              |
   +-----+------------+----------+--------------+-----+
   |              Knowledge Store & Index              |
   +------------------+-------------------------------+
                       |
   +-------------------+-------------------------------+
   |   Feedback Collector  |   Skills Registry         |
   +---------------------------------------------------+
```

- **Knowledge Extractor** -- Analyzes codebases, documentation files, and git history to produce structured knowledge entries.
- **Q&A Responder** -- Answers questions using the knowledge base with inline source citations and confidence scoring.
- **Gap Analyzer** -- Identifies missing or weak knowledge areas and recommends priorities.
- **Skill Builder** -- Creates and improves prompt templates based on recurring question patterns and feedback.

The system improves over time: negative feedback and question patterns drive automatic skill evolution, making future answers more accurate.

### Claude Code Plugin Variant

The Claude Code plugin provides the same core functionality with native integration:
- **8 Skills** -- Commands invokable via `/handover:*` in Claude Code
- **3 Agents** -- Specialized subagents (knowledge-extractor, qa-responder, gap-analyzer) using Claude Code's Task API
- **MCP Server** -- 15 tools for persistent knowledge storage across sessions
- **Auto-detection Hooks** -- Automatic handover situation detection in conversations

The plugin shares the same knowledge extraction and Q&A logic but adapts to Claude Code's environment.

## Configuration

### Environment Variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key (required) |
| `HANDOVER_MODEL` | Claude model to use (default: `claude-sonnet-4-20250514`) |
| `HANDOVER_DATA_DIR` | Data directory path (default: `.handover/data`) |
| `HANDOVER_MAX_TOKENS` | Max tokens per response (default: `4096`) |
| `HANDOVER_TEMPERATURE` | Temperature for generation (default: `0.7`) |

### Config Files

Configuration is loaded in this order (later overrides earlier):

1. Defaults
2. Global config: `~/.handover/config.json`
3. Local config: `.handover/config.json` (project-level)
4. Environment variables

## Programmatic API

The orchestrator can be used as a library:

```typescript
import { createHandoverAgent } from 'handover-agent';

const agent = createHandoverAgent('./my-data-dir');

// Initialize
await agent.initialize('My Project', 'project', 'A web application');

// Extract knowledge
const { entries, summary } = await agent.extractKnowledge('./src', { depth: 'deep' });

// Ask questions
const { answer, citations, confidence } = await agent.ask('How does auth work?');

// Analyze gaps
const report = await agent.analyzeGaps();

// Self-improve
const { newSkills, improved } = await agent.evolveSkills();
```

## Contributing

1. Clone the repository
2. Install dependencies: `npm install`
3. Build: `npm run build`
4. Run locally: `node dist/index.js`

### Development

```bash
npm run dev       # watch mode
npm run lint      # type checking
npm run test      # run tests
npm run clean     # remove build artifacts
```

## License

MIT
