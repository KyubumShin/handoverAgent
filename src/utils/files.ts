import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { glob as globFn } from 'glob';
import { loadConfig } from './config.js';

/**
 * Create a directory recursively if it doesn't exist.
 */
export function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

/**
 * Read and parse a JSON file. Returns null if the file doesn't exist or is invalid.
 */
export function readJSON<T>(path: string): T | null {
  try {
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/**
 * Write data to a JSON file with pretty printing.
 * Creates parent directories if they don't exist.
 */
export function writeJSON(path: string, data: unknown): void {
  const dir = dirname(path);
  ensureDir(dir);
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

/**
 * Read a markdown file. Returns null if the file doesn't exist.
 */
export function readMarkdown(path: string): string | null {
  try {
    if (!existsSync(path)) return null;
    return readFileSync(path, 'utf-8');
  } catch {
    return null;
  }
}

/**
 * Write content to a markdown file.
 * Creates parent directories if they don't exist.
 */
export function writeMarkdown(path: string, content: string): void {
  const dir = dirname(path);
  ensureDir(dir);
  writeFileSync(path, content, 'utf-8');
}

/**
 * List files in a directory, optionally filtered by a glob pattern.
 * Returns relative paths from the given directory.
 */
export async function listFiles(dir: string, pattern?: string): Promise<string[]> {
  if (!existsSync(dir)) return [];

  if (pattern) {
    const matches = await globFn(pattern, { cwd: dir, nodir: true });
    return matches.sort();
  }

  // Without pattern, list all files recursively
  const results: string[] = [];

  function walk(currentDir: string, prefix: string): void {
    const entries = readdirSync(currentDir);
    for (const entry of entries) {
      const fullPath = join(currentDir, entry);
      const relativePath = prefix ? join(prefix, entry) : entry;
      try {
        const stat = statSync(fullPath);
        if (stat.isDirectory()) {
          // Skip hidden directories and node_modules
          if (!entry.startsWith('.') && entry !== 'node_modules') {
            walk(fullPath, relativePath);
          }
        } else {
          results.push(relativePath);
        }
      } catch {
        // Skip files we can't stat
      }
    }
  }

  walk(dir, '');
  return results.sort();
}

/**
 * Find the project root by walking up from cwd looking for a .handover directory.
 * Returns null if no .handover directory is found.
 */
export function getProjectRoot(): string | null {
  let current = process.cwd();

  while (true) {
    const handoverDir = join(current, '.handover');
    if (existsSync(handoverDir)) {
      return current;
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return null;
}

/**
 * Get the resolved data directory path.
 * Uses config dataDir, resolved relative to project root or cwd.
 */
export function getDataDir(): string {
  const config = loadConfig();
  const root = getProjectRoot() ?? process.cwd();
  const dataDir = resolve(root, config.dataDir);
  ensureDir(dataDir);
  return dataDir;
}
