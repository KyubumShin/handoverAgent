import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, appendFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

export function readJSON<T>(path: string): T | null {
  try {
    if (!existsSync(path)) return null;
    const raw = readFileSync(path, 'utf-8');
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export function writeJSON(path: string, data: unknown): void {
  const dir = dirname(path);
  ensureDir(dir);
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf-8');
}

export function appendLine(path: string, line: string): void {
  const dir = dirname(path);
  ensureDir(dir);
  appendFileSync(path, line + '\n', 'utf-8');
}

export function readLines(path: string): string[] {
  try {
    if (!existsSync(path)) return [];
    return readFileSync(path, 'utf-8').split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

export function fileExists(path: string): boolean {
  return existsSync(path);
}

export function listJSONFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter(f => f.endsWith('.json'));
}
