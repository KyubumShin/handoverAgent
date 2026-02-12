import { join } from 'node:path';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import type {
  SubAgent,
  SubAgentResult,
  KnowledgeEntry,
  KnowledgeCategory,
  KnowledgeSource,
} from '../types.js';
import { listFiles, readJSON, readMarkdown } from '../../utils/files.js';
import { chat } from '../../utils/claude.js';

export interface ExtractionInput {
  path: string;
  type: 'codebase' | 'docs' | 'git';
  depth?: 'shallow' | 'deep';
}

export interface ExtractionResult {
  entries: KnowledgeEntry[];
  summary: string;
  sourcesProcessed: number;
}

interface ClaudeExtractedEntry {
  title: string;
  content: string;
  category: KnowledgeCategory;
  tags: string[];
  confidence: number;
}

const SYSTEM_PROMPT =
  'You are a knowledge extraction agent. Analyze the provided source material and extract structured knowledge entries for handover documentation. Each entry should be self-contained and useful for someone new to the project.';

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  '.next',
  '.cache',
  'coverage',
  '__pycache__',
  '.venv',
  'venv',
]);

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.svg',
  '.woff', '.woff2', '.ttf', '.eot',
  '.zip', '.tar', '.gz', '.bz2',
  '.pdf', '.doc', '.docx',
  '.mp3', '.mp4', '.avi', '.mov',
  '.exe', '.dll', '.so', '.dylib',
  '.lock',
]);

const KEY_FILES = new Set([
  'package.json',
  'tsconfig.json',
  'README.md',
  'readme.md',
  'Makefile',
  'Dockerfile',
  'docker-compose.yml',
  'docker-compose.yaml',
  '.env.example',
  'pyproject.toml',
  'setup.py',
  'setup.cfg',
  'Cargo.toml',
  'go.mod',
  'pom.xml',
  'build.gradle',
]);

function isSkippedDir(name: string): boolean {
  return SKIP_DIRS.has(name) || name.startsWith('.');
}

function isBinaryFile(filename: string): boolean {
  const ext = filename.substring(filename.lastIndexOf('.'));
  return BINARY_EXTENSIONS.has(ext.toLowerCase());
}

function isKeyFile(filename: string): boolean {
  return KEY_FILES.has(filename);
}

function safeReadFile(filepath: string, maxBytes: number = 50000): string | null {
  try {
    const content = readFileSync(filepath, 'utf-8');
    if (content.length > maxBytes) {
      return content.slice(0, maxBytes) + '\n... [truncated]';
    }
    return content;
  } catch {
    return null;
  }
}

function makeEntry(
  extracted: ClaudeExtractedEntry,
  source: KnowledgeSource,
): KnowledgeEntry {
  const now = new Date().toISOString();
  return {
    id: randomUUID(),
    title: extracted.title,
    content: extracted.content,
    category: extracted.category,
    tags: extracted.tags,
    source,
    confidence: Math.max(0, Math.min(1, extracted.confidence)),
    createdAt: now,
    updatedAt: now,
  };
}

async function callClaude(prompt: string): Promise<ClaudeExtractedEntry[]> {
  const responseText = await chat(
    [{ role: 'user', content: prompt }],
    { system: SYSTEM_PROMPT, temperature: 0.3 },
  );

  // Extract JSON from the response - look for array in the text
  const jsonMatch = responseText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) {
    return [];
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as ClaudeExtractedEntry[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function extractFromCodebase(
  input: ExtractionInput,
): Promise<ExtractionResult> {
  const { path: basePath, depth = 'shallow' } = input;

  // List all files, filtering out skipped dirs and binary files
  const allFiles = await listFiles(basePath);
  const relevantFiles = allFiles.filter((f) => {
    const parts = f.split('/');
    if (parts.some((p) => isSkippedDir(p))) return false;
    if (isBinaryFile(f)) return false;
    return true;
  });

  // Separate key files and source files
  const keyFiles: string[] = [];
  const sourceFiles: string[] = [];

  for (const file of relevantFiles) {
    const basename = file.split('/').pop() ?? file;
    if (isKeyFile(basename)) {
      keyFiles.push(file);
    } else {
      sourceFiles.push(file);
    }
  }

  // Read key files
  const keyFileContents: Record<string, string> = {};
  for (const file of keyFiles) {
    const content = safeReadFile(join(basePath, file));
    if (content) {
      keyFileContents[file] = content;
    }
  }

  // Build file tree summary
  const fileTree = relevantFiles.slice(0, 200).join('\n');

  // For deep mode, also read entry points and config files
  let additionalContext = '';
  if (depth === 'deep') {
    // Find likely entry points
    const entryPoints = sourceFiles.filter((f) => {
      const name = f.split('/').pop() ?? '';
      return (
        name === 'index.ts' ||
        name === 'index.js' ||
        name === 'main.ts' ||
        name === 'main.js' ||
        name === 'app.ts' ||
        name === 'app.js' ||
        name === 'server.ts' ||
        name === 'server.js'
      );
    });

    for (const ep of entryPoints.slice(0, 10)) {
      const content = safeReadFile(join(basePath, ep), 10000);
      if (content) {
        additionalContext += `\n\n--- ${ep} ---\n${content}`;
      }
    }

    // Read config files
    const configFiles = sourceFiles.filter((f) => {
      const name = f.split('/').pop() ?? '';
      return (
        name.endsWith('.config.ts') ||
        name.endsWith('.config.js') ||
        name.endsWith('.config.json') ||
        name === '.eslintrc.json' ||
        name === '.prettierrc'
      );
    });

    for (const cf of configFiles.slice(0, 10)) {
      const content = safeReadFile(join(basePath, cf), 5000);
      if (content) {
        additionalContext += `\n\n--- ${cf} ---\n${content}`;
      }
    }
  }

  // Build the prompt for Claude
  const keyFileSections = Object.entries(keyFileContents)
    .map(([name, content]) => `--- ${name} ---\n${content}`)
    .join('\n\n');

  const prompt = `Analyze this project and extract knowledge entries for a handover document.

## File Structure
\`\`\`
${fileTree}
\`\`\`

## Key Files
${keyFileSections}
${additionalContext ? `\n## Additional Source Files\n${additionalContext}` : ''}

## Instructions
Extract knowledge entries as a JSON array. Each entry should have:
- title: A clear, descriptive title
- content: Detailed explanation useful for someone new to the project
- category: One of "architecture", "codebase", "tool", "convention", "process", "decision", "domain", "people", "other"
- tags: Relevant tags as an array of strings
- confidence: Number 0-1 indicating how confident you are in this information

Focus on:
1. Project architecture and structure
2. Key technologies and dependencies
3. Build and development setup
4. Important conventions and patterns
5. Entry points and main modules

Respond with ONLY a JSON array of entries. No other text.`;

  const extracted = await callClaude(prompt);
  const source: KnowledgeSource = { type: 'file', path: basePath };
  const entries = extracted.map((e) => makeEntry(e, source));

  const sourcesProcessed = keyFiles.length + (depth === 'deep' ? sourceFiles.length : 0);

  return {
    entries,
    summary: `Extracted ${entries.length} entries from codebase analysis (${relevantFiles.length} files found, ${keyFiles.length} key files analyzed)`,
    sourcesProcessed,
  };
}

async function extractFromDocs(input: ExtractionInput): Promise<ExtractionResult> {
  const { path: basePath } = input;

  // Find all markdown files
  const allFiles = await listFiles(basePath, '**/*.md');
  const mdFiles = allFiles.filter((f) => {
    const parts = f.split('/');
    return !parts.some((p) => isSkippedDir(p));
  });

  if (mdFiles.length === 0) {
    return {
      entries: [],
      summary: 'No markdown documentation files found.',
      sourcesProcessed: 0,
    };
  }

  // Read markdown files
  const docContents: Record<string, string> = {};
  for (const file of mdFiles.slice(0, 30)) {
    const content = readMarkdown(join(basePath, file));
    if (content) {
      docContents[file] = content.length > 20000 ? content.slice(0, 20000) + '\n... [truncated]' : content;
    }
  }

  const docSections = Object.entries(docContents)
    .map(([name, content]) => `--- ${name} ---\n${content}`)
    .join('\n\n');

  const prompt = `Analyze these documentation files and extract knowledge entries for a handover document.

## Documentation Files
${docSections}

## Instructions
Extract knowledge entries as a JSON array. Each entry should have:
- title: A clear, descriptive title
- content: Detailed explanation useful for someone new to the project
- category: One of "process", "decision", "domain", "architecture", "codebase", "tool", "convention", "people", "other"
- tags: Relevant tags as an array of strings
- confidence: Number 0-1 indicating how confident you are

Focus on:
1. Processes and workflows described
2. Architectural decisions documented
3. Domain concepts explained
4. Setup and onboarding guides
5. Team conventions

Respond with ONLY a JSON array of entries. No other text.`;

  const extracted = await callClaude(prompt);
  const source: KnowledgeSource = { type: 'doc', path: basePath };
  const entries = extracted.map((e) => makeEntry(e, source));

  return {
    entries,
    summary: `Extracted ${entries.length} entries from ${mdFiles.length} documentation files`,
    sourcesProcessed: mdFiles.length,
  };
}

async function extractFromGit(input: ExtractionInput): Promise<ExtractionResult> {
  const { path: basePath } = input;

  let gitLog = '';
  let gitGraph = '';
  let gitContributors = '';

  try {
    gitLog = execSync('git log --oneline -50', {
      cwd: basePath,
      encoding: 'utf-8',
      timeout: 10000,
    });
  } catch {
    return {
      entries: [],
      summary: 'Not a git repository or git is not available.',
      sourcesProcessed: 0,
    };
  }

  try {
    gitGraph = execSync('git log --all --oneline --graph -20', {
      cwd: basePath,
      encoding: 'utf-8',
      timeout: 10000,
    });
  } catch {
    gitGraph = '(graph unavailable)';
  }

  try {
    gitContributors = execSync('git shortlog -sn', {
      cwd: basePath,
      encoding: 'utf-8',
      timeout: 10000,
    });
  } catch {
    gitContributors = '(contributors unavailable)';
  }

  const prompt = `Analyze this git history and extract knowledge entries for a handover document.

## Recent Commits (last 50)
\`\`\`
${gitLog}
\`\`\`

## Branch Graph (last 20)
\`\`\`
${gitGraph}
\`\`\`

## Contributors
\`\`\`
${gitContributors}
\`\`\`

## Instructions
Extract knowledge entries as a JSON array. Each entry should have:
- title: A clear, descriptive title
- content: Detailed explanation useful for someone new to the project
- category: One of "people", "decision", "process", "architecture", "codebase", "tool", "convention", "domain", "other"
- tags: Relevant tags as an array of strings
- confidence: Number 0-1 indicating how confident you are

Focus on:
1. Key contributors and their roles/areas
2. Development patterns (branching strategy, commit conventions)
3. Recent major changes or decisions visible in history
4. Project activity level and pace
5. Notable milestones or releases

Respond with ONLY a JSON array of entries. No other text.`;

  const extracted = await callClaude(prompt);
  const source: KnowledgeSource = { type: 'git', path: basePath };
  const entries = extracted.map((e) => makeEntry(e, source));

  return {
    entries,
    summary: `Extracted ${entries.length} entries from git history analysis`,
    sourcesProcessed: 1,
  };
}

export class KnowledgeExtractorAgent implements SubAgent {
  name = 'knowledge-extractor';
  description =
    'Analyzes codebases, documentation, and git history to extract handover knowledge';

  async execute(input: unknown): Promise<SubAgentResult<ExtractionResult>> {
    const extractionInput = input as ExtractionInput;
    const startTime = Date.now();

    try {
      let result: ExtractionResult;

      switch (extractionInput.type) {
        case 'codebase':
          result = await extractFromCodebase(extractionInput);
          break;
        case 'docs':
          result = await extractFromDocs(extractionInput);
          break;
        case 'git':
          result = await extractFromGit(extractionInput);
          break;
        default:
          return {
            success: false,
            error: `Unknown extraction type: ${extractionInput.type}`,
          };
      }

      const duration = Date.now() - startTime;

      return {
        success: true,
        data: result,
        metadata: { duration },
      };
    } catch (err) {
      const duration = Date.now() - startTime;
      const message = err instanceof Error ? err.message : String(err);

      return {
        success: false,
        error: `Extraction failed: ${message}`,
        metadata: { duration },
      };
    }
  }
}
