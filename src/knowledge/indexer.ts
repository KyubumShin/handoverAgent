import type {
  KnowledgeEntry,
  KnowledgeCategory,
  KnowledgeIndex,
  KnowledgeIndexEntry,
} from '../agent/types.js';
import { getAllEntries } from './store.js';

/**
 * Build a KnowledgeIndex from a list of entries.
 */
export function indexEntries(entries: KnowledgeEntry[]): KnowledgeIndex {
  const indexEntryList: KnowledgeIndexEntry[] = entries.map((entry) => ({
    id: entry.id,
    title: entry.title,
    category: entry.category,
    tags: entry.tags,
    confidence: entry.confidence,
  }));

  return {
    entries: indexEntryList,
    lastUpdated: new Date().toISOString(),
    totalEntries: indexEntryList.length,
  };
}

/**
 * Score and rank entries by relevance to a text query.
 * Uses keyword matching on title/content, tag matching, and category matching.
 * Returns top N results (default 10), sorted by relevance * confidence.
 */
export function findRelevantEntries(
  query: string,
  entries: KnowledgeEntry[],
  limit: number = 10,
): KnowledgeEntry[] {
  const queryLower = query.toLowerCase();
  const queryTerms = queryLower
    .split(/\s+/)
    .filter((t) => t.length > 2);

  if (queryTerms.length === 0) {
    return entries.slice(0, limit);
  }

  const scored = entries.map((entry) => {
    let score = 0;

    const titleLower = entry.title.toLowerCase();
    const contentLower = entry.content.toLowerCase();
    const tagsLower = entry.tags.map((t) => t.toLowerCase());

    // Exact phrase match in title (highest weight)
    if (titleLower.includes(queryLower)) {
      score += 10;
    }

    // Exact phrase match in content
    if (contentLower.includes(queryLower)) {
      score += 5;
    }

    // Individual term matches
    for (const term of queryTerms) {
      // Title keyword match
      if (titleLower.includes(term)) {
        score += 3;
      }

      // Content keyword match
      if (contentLower.includes(term)) {
        score += 1;
      }

      // Tag exact match
      if (tagsLower.includes(term)) {
        score += 4;
      }

      // Category match
      if (entry.category.toLowerCase().includes(term)) {
        score += 2;
      }
    }

    // Weight by confidence
    const finalScore = score * entry.confidence;

    return { entry, score: finalScore };
  });

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((s) => s.entry);
}

/**
 * Get all entries in a specific category.
 */
export function getEntriesByCategory(category: KnowledgeCategory): KnowledgeEntry[] {
  const all = getAllEntries();
  return all.filter((entry) => entry.category === category);
}

/**
 * Return a count of entries per category.
 */
export function getTopicSummary(): Map<KnowledgeCategory, number> {
  const all = getAllEntries();
  const summary = new Map<KnowledgeCategory, number>();

  for (const entry of all) {
    const count = summary.get(entry.category) ?? 0;
    summary.set(entry.category, count + 1);
  }

  return summary;
}
