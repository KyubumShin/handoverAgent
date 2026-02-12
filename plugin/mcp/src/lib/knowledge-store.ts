import { join } from 'node:path';
import { unlinkSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { ensureDir, readJSON, writeJSON, listJSONFiles } from './file-utils.js';
import { FileLock } from './lock.js';
import type { KnowledgeEntry, KnowledgeCategory, KnowledgeIndex, KnowledgeIndexEntry } from './types.js';

export class KnowledgeStore {
  private dataDir: string;
  private lock: FileLock;

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.lock = new FileLock(join(dataDir, 'knowledge'));
  }

  private entriesDir(): string {
    return join(this.dataDir, 'knowledge', 'entries');
  }

  private indexPath(): string {
    return join(this.dataDir, 'knowledge', 'index.json');
  }

  private entryPath(id: string): string {
    return join(this.entriesDir(), `${id}.json`);
  }

  init(): void {
    ensureDir(this.entriesDir());
    if (!existsSync(this.indexPath())) {
      const emptyIndex: KnowledgeIndex = {
        entries: [],
        lastUpdated: new Date().toISOString(),
        totalEntries: 0,
      };
      writeJSON(this.indexPath(), emptyIndex);
    }
  }

  private toIndexEntry(entry: KnowledgeEntry): KnowledgeIndexEntry {
    return {
      id: entry.id,
      title: entry.title,
      category: entry.category,
      tags: entry.tags,
      confidence: entry.confidence,
    };
  }

  /**
   * Find an existing entry with the same title and source (dedup check).
   */
  private findDuplicate(entry: KnowledgeEntry): KnowledgeEntry | null {
    const all = this.getAllEntries();
    return all.find(e =>
      e.title.toLowerCase() === entry.title.toLowerCase() &&
      e.source.type === entry.source.type &&
      e.source.path === entry.source.path
    ) ?? null;
  }

  /**
   * Add entry with dedup. Returns existing entry ID if duplicate found.
   */
  async addEntry(entry: KnowledgeEntry): Promise<{ id: string; deduplicated: boolean }> {
    await this.lock.acquire();
    try {
      // Dedup check
      const existing = this.findDuplicate(entry);
      if (existing) {
        return { id: existing.id, deduplicated: true };
      }

      if (!entry.id) {
        entry.id = randomUUID();
      }
      const now = new Date().toISOString();
      if (!entry.createdAt) entry.createdAt = now;
      if (!entry.updatedAt) entry.updatedAt = now;

      writeJSON(this.entryPath(entry.id), entry);

      const index = this.getIndex();
      index.entries.push(this.toIndexEntry(entry));
      index.totalEntries = index.entries.length;
      index.lastUpdated = now;
      writeJSON(this.indexPath(), index);

      return { id: entry.id, deduplicated: false };
    } finally {
      this.lock.release();
    }
  }

  getEntry(id: string): KnowledgeEntry | null {
    return readJSON<KnowledgeEntry>(this.entryPath(id));
  }

  async updateEntry(id: string, updates: Partial<KnowledgeEntry>): Promise<KnowledgeEntry | null> {
    await this.lock.acquire();
    try {
      const existing = this.getEntry(id);
      if (!existing) return null;

      const updated: KnowledgeEntry = {
        ...existing,
        ...updates,
        id,
        updatedAt: new Date().toISOString(),
      };

      writeJSON(this.entryPath(id), updated);

      const index = this.getIndex();
      const idx = index.entries.findIndex(e => e.id === id);
      if (idx !== -1) {
        index.entries[idx] = this.toIndexEntry(updated);
      }
      index.lastUpdated = updated.updatedAt;
      writeJSON(this.indexPath(), index);

      return updated;
    } finally {
      this.lock.release();
    }
  }

  async deleteEntry(id: string): Promise<boolean> {
    await this.lock.acquire();
    try {
      const filepath = this.entryPath(id);
      if (!existsSync(filepath)) return false;

      unlinkSync(filepath);

      const index = this.getIndex();
      index.entries = index.entries.filter(e => e.id !== id);
      index.totalEntries = index.entries.length;
      index.lastUpdated = new Date().toISOString();
      writeJSON(this.indexPath(), index);

      return true;
    } finally {
      this.lock.release();
    }
  }

  getAllEntries(): KnowledgeEntry[] {
    const dir = this.entriesDir();
    const files = listJSONFiles(dir);
    const entries: KnowledgeEntry[] = [];
    for (const file of files) {
      const entry = readJSON<KnowledgeEntry>(join(dir, file));
      if (entry) entries.push(entry);
    }
    return entries;
  }

  searchEntries(query: { category?: KnowledgeCategory; tags?: string[]; text?: string }): KnowledgeEntry[] {
    const all = this.getAllEntries();
    return all.filter(entry => {
      if (query.category && entry.category !== query.category) return false;
      if (query.tags && query.tags.length > 0) {
        const entryTagsLower = entry.tags.map(t => t.toLowerCase());
        if (!query.tags.some(t => entryTagsLower.includes(t.toLowerCase()))) return false;
      }
      if (query.text) {
        const s = query.text.toLowerCase();
        if (!entry.title.toLowerCase().includes(s) && !entry.content.toLowerCase().includes(s)) return false;
      }
      return true;
    });
  }

  getIndex(): KnowledgeIndex {
    const index = readJSON<KnowledgeIndex>(this.indexPath());
    return index ?? { entries: [], lastUpdated: new Date().toISOString(), totalEntries: 0 };
  }

  async rebuildIndex(): Promise<KnowledgeIndex> {
    await this.lock.acquire();
    try {
      const all = this.getAllEntries();
      const index: KnowledgeIndex = {
        entries: all.map(e => this.toIndexEntry(e)),
        lastUpdated: new Date().toISOString(),
        totalEntries: all.length,
      };
      writeJSON(this.indexPath(), index);
      return index;
    } finally {
      this.lock.release();
    }
  }
}
