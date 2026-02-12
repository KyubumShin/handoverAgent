import type { KnowledgeEntry, KnowledgeCategory } from './types.js';

export function findRelevantEntries(
  query: string,
  entries: KnowledgeEntry[],
  limit: number = 10,
): KnowledgeEntry[] {
  const queryLower = query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/).filter(t => t.length > 2);

  if (queryTerms.length === 0) {
    return entries.slice(0, limit);
  }

  const scored = entries.map(entry => {
    let score = 0;
    const titleLower = entry.title.toLowerCase();
    const contentLower = entry.content.toLowerCase();
    const tagsLower = entry.tags.map(t => t.toLowerCase());

    if (titleLower.includes(queryLower)) score += 10;
    if (contentLower.includes(queryLower)) score += 5;

    for (const term of queryTerms) {
      if (titleLower.includes(term)) score += 3;
      if (contentLower.includes(term)) score += 1;
      if (tagsLower.includes(term)) score += 4;
      if (entry.category.toLowerCase().includes(term)) score += 2;
    }

    return { entry, score: score * entry.confidence };
  });

  return scored
    .filter(s => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(s => s.entry);
}

export function getTopicSummary(entries: KnowledgeEntry[]): Map<KnowledgeCategory, number> {
  const summary = new Map<KnowledgeCategory, number>();
  for (const entry of entries) {
    summary.set(entry.category, (summary.get(entry.category) ?? 0) + 1);
  }
  return summary;
}
