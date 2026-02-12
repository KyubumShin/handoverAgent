import { join } from 'node:path';
import { unlinkSync, existsSync, readdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { ensureDir, readJSON, writeJSON } from '../utils/files.js';
import type {
  KnowledgeEntry,
  KnowledgeCategory,
  KnowledgeIndex,
  KnowledgeIndexEntry,
} from '../agent/types.js';

let dataDirectory: string = '';

function entriesDir(): string {
  return join(dataDirectory, 'knowledge', 'entries');
}

function indexPath(): string {
  return join(dataDirectory, 'knowledge', 'index.json');
}

function entryPath(id: string): string {
  return join(entriesDir(), `${id}.json`);
}

/**
 * Create the knowledge directory structure.
 */
export function initKnowledgeStore(dataDir: string): void {
  dataDirectory = dataDir;
  ensureDir(entriesDir());

  // Create index file if it doesn't exist
  const idxPath = indexPath();
  if (!existsSync(idxPath)) {
    const emptyIndex: KnowledgeIndex = {
      entries: [],
      lastUpdated: new Date().toISOString(),
      totalEntries: 0,
    };
    writeJSON(idxPath, emptyIndex);
  }
}

/**
 * Ensure the store has been initialized. Throws if not.
 */
function ensureInitialized(): void {
  if (!dataDirectory) {
    throw new Error('Knowledge store not initialized. Call initKnowledgeStore first.');
  }
}

/**
 * Build an index entry from a full knowledge entry.
 */
function toIndexEntry(entry: KnowledgeEntry): KnowledgeIndexEntry {
  return {
    id: entry.id,
    title: entry.title,
    category: entry.category,
    tags: entry.tags,
    confidence: entry.confidence,
  };
}

/**
 * Save a knowledge entry and update the index.
 */
export function addEntry(entry: KnowledgeEntry): void {
  ensureInitialized();

  // Assign ID if missing
  if (!entry.id) {
    entry.id = randomUUID();
  }

  const now = new Date().toISOString();
  if (!entry.createdAt) entry.createdAt = now;
  if (!entry.updatedAt) entry.updatedAt = now;

  writeJSON(entryPath(entry.id), entry);

  // Update index
  const index = getIndex();
  index.entries.push(toIndexEntry(entry));
  index.totalEntries = index.entries.length;
  index.lastUpdated = now;
  writeJSON(indexPath(), index);
}

/**
 * Read a knowledge entry by ID.
 */
export function getEntry(id: string): KnowledgeEntry | null {
  ensureInitialized();
  return readJSON<KnowledgeEntry>(entryPath(id));
}

/**
 * Update an existing entry with partial data. Returns the updated entry or null.
 */
export function updateEntry(id: string, updates: Partial<KnowledgeEntry>): KnowledgeEntry | null {
  ensureInitialized();

  const existing = getEntry(id);
  if (!existing) return null;

  const updated: KnowledgeEntry = {
    ...existing,
    ...updates,
    id, // Prevent ID override
    updatedAt: new Date().toISOString(),
  };

  writeJSON(entryPath(id), updated);

  // Update the index entry
  const index = getIndex();
  const idx = index.entries.findIndex((e) => e.id === id);
  if (idx !== -1) {
    index.entries[idx] = toIndexEntry(updated);
  }
  index.lastUpdated = updated.updatedAt;
  writeJSON(indexPath(), index);

  return updated;
}

/**
 * Delete an entry by ID. Returns true if the entry was found and deleted.
 */
export function deleteEntry(id: string): boolean {
  ensureInitialized();

  const filepath = entryPath(id);
  if (!existsSync(filepath)) return false;

  unlinkSync(filepath);

  // Update index
  const index = getIndex();
  index.entries = index.entries.filter((e) => e.id !== id);
  index.totalEntries = index.entries.length;
  index.lastUpdated = new Date().toISOString();
  writeJSON(indexPath(), index);

  return true;
}

/**
 * Read all knowledge entries from the entries directory.
 */
export function getAllEntries(): KnowledgeEntry[] {
  ensureInitialized();

  const dir = entriesDir();
  if (!existsSync(dir)) return [];

  const files = readdirSync(dir).filter((f) => f.endsWith('.json'));
  const entries: KnowledgeEntry[] = [];

  for (const file of files) {
    const entry = readJSON<KnowledgeEntry>(join(dir, file));
    if (entry) entries.push(entry);
  }

  return entries;
}

/**
 * Search entries by category, tags, or text content.
 */
export function searchEntries(query: {
  category?: KnowledgeCategory;
  tags?: string[];
  text?: string;
}): KnowledgeEntry[] {
  const all = getAllEntries();

  return all.filter((entry) => {
    if (query.category && entry.category !== query.category) return false;

    if (query.tags && query.tags.length > 0) {
      const entryTagsLower = entry.tags.map((t) => t.toLowerCase());
      const hasMatchingTag = query.tags.some((t) => entryTagsLower.includes(t.toLowerCase()));
      if (!hasMatchingTag) return false;
    }

    if (query.text) {
      const searchText = query.text.toLowerCase();
      const inTitle = entry.title.toLowerCase().includes(searchText);
      const inContent = entry.content.toLowerCase().includes(searchText);
      if (!inTitle && !inContent) return false;
    }

    return true;
  });
}

/**
 * Read the index file.
 */
export function getIndex(): KnowledgeIndex {
  ensureInitialized();

  const index = readJSON<KnowledgeIndex>(indexPath());
  if (!index) {
    return {
      entries: [],
      lastUpdated: new Date().toISOString(),
      totalEntries: 0,
    };
  }
  return index;
}

/**
 * Rebuild the index from all entry files on disk.
 */
export function rebuildIndex(): KnowledgeIndex {
  ensureInitialized();

  const all = getAllEntries();
  const index: KnowledgeIndex = {
    entries: all.map(toIndexEntry),
    lastUpdated: new Date().toISOString(),
    totalEntries: all.length,
  };

  writeJSON(indexPath(), index);
  return index;
}
