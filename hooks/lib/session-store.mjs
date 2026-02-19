import { readFileSync, writeFileSync, appendFileSync, mkdirSync, existsSync, readdirSync, renameSync, rmSync } from 'fs';
import { join, dirname } from 'path';

const HANDOVER_DIR = '.handover';
const SESSION_DIR = join(HANDOVER_DIR, 'session');
const ARCHIVE_DIR = join(HANDOVER_DIR, 'archive');
const CONFIG_FILE = join(HANDOVER_DIR, 'config.json');

const DEFAULT_CONFIG = {
  maxChars: 1000,
  pruneAgeDays: 7,
  maxArchivedSessions: 10
};

export function ensureDir(dirPath) {
  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

export function getConfig() {
  try {
    if (existsSync(CONFIG_FILE)) {
      return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_FILE, 'utf8')) };
    }
  } catch {}
  return { ...DEFAULT_CONFIG };
}

export function appendEntry(type, data) {
  ensureDir(SESSION_DIR);
  const filePath = join(SESSION_DIR, `${type}.jsonl`);
  const entry = { ts: new Date().toISOString(), ...data };
  appendFileSync(filePath, JSON.stringify(entry) + '\n');
}

export function readEntries(type) {
  const filePath = join(SESSION_DIR, `${type}.jsonl`);
  if (!existsSync(filePath)) return [];
  try {
    return readFileSync(filePath, 'utf8')
      .trim()
      .split('\n')
      .filter(Boolean)
      .map(line => JSON.parse(line));
  } catch {
    return [];
  }
}

export function archiveSession() {
  if (!existsSync(SESSION_DIR)) return;

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const archivePath = join(ARCHIVE_DIR, timestamp);
  ensureDir(ARCHIVE_DIR);

  // Move session dir to archive
  renameSync(SESSION_DIR, archivePath);

  // Enforce max archived sessions
  const config = getConfig();
  const archives = readdirSync(ARCHIVE_DIR).sort();
  while (archives.length > config.maxArchivedSessions) {
    const oldest = archives.shift();
    rmSync(join(ARCHIVE_DIR, oldest), { recursive: true, force: true });
  }
}

export function getSessionMeta() {
  const metaPath = join(SESSION_DIR, 'meta.json');
  if (!existsSync(metaPath)) {
    return { startedAt: new Date().toISOString(), promptCount: 0, errorCount: 0, finalized: false };
  }
  try {
    return JSON.parse(readFileSync(metaPath, 'utf8'));
  } catch {
    return { startedAt: new Date().toISOString(), promptCount: 0, errorCount: 0, finalized: false };
  }
}

export function updateSessionMeta(updates) {
  ensureDir(SESSION_DIR);
  const meta = { ...getSessionMeta(), ...updates };
  writeFileSync(join(SESSION_DIR, 'meta.json'), JSON.stringify(meta, null, 2));
}

export function hasSessionData() {
  if (!existsSync(SESSION_DIR)) return false;
  const prompts = join(SESSION_DIR, 'prompts.jsonl');
  const errors = join(SESSION_DIR, 'errors.jsonl');
  return existsSync(prompts) || existsSync(errors);
}
