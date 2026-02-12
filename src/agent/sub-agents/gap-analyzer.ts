import type {
  SubAgent,
  SubAgentResult,
  GapReport,
  TopicCoverage,
  KnowledgeGap,
  KnowledgeEntry,
  KnowledgeCategory,
  HandoverProfile,
  HandoverType,
  Session,
} from '../types.js';
import { chat } from '../../utils/claude.js';

export interface GapAnalysisInput {
  profile: HandoverProfile;
  entries: KnowledgeEntry[];
  sessions: Session[];
}

export interface GapAnalysisResult {
  report: GapReport;
  knowledgeMap: KnowledgeMapItem[];
}

export interface KnowledgeMapItem {
  category: KnowledgeCategory;
  topics: string[];
  entryCount: number;
  questionsAsked: number;
  coverage: number; // 0-100
}

interface ClaudeGapAnalysis {
  gaps: Array<{
    topic: string;
    category: KnowledgeCategory;
    importance: 'critical' | 'high' | 'medium' | 'low';
    reason: string;
    suggestedQuestions: string[];
  }>;
  recommendations: string[];
}

/** Categories considered required for each handover type. */
const REQUIRED_CATEGORIES: Record<HandoverType, KnowledgeCategory[]> = {
  project: ['architecture', 'codebase', 'tool', 'convention', 'process', 'decision'],
  role: ['process', 'people', 'tool', 'domain'],
  team: ['people', 'process', 'convention', 'tool'],
};

/** Categories that are nice-to-have for each handover type. */
const NICE_TO_HAVE_CATEGORIES: Record<HandoverType, KnowledgeCategory[]> = {
  project: ['people', 'domain'],
  role: ['decision', 'convention'],
  team: ['architecture', 'domain'],
};

const ALL_CATEGORIES: KnowledgeCategory[] = [
  'architecture',
  'codebase',
  'process',
  'people',
  'decision',
  'tool',
  'convention',
  'domain',
  'other',
];

const SYSTEM_PROMPT = `You are a gap analysis agent for knowledge handovers. Given a knowledge base and Q&A history, identify what critical topics are missing or poorly covered.

You must respond with ONLY valid JSON (no markdown fences, no extra text) matching this structure:
{
  "gaps": [
    {
      "topic": "string - specific topic that is missing or weak",
      "category": "one of: architecture, codebase, process, people, decision, tool, convention, domain, other",
      "importance": "one of: critical, high, medium, low",
      "reason": "string - why this gap matters",
      "suggestedQuestions": ["string - questions the receiver should ask to fill this gap"]
    }
  ],
  "recommendations": ["string - actionable recommendation for improving coverage"]
}`;

/**
 * Count how many questions were asked about each category based on session history.
 */
function countQuestionsByCategory(
  sessions: Session[],
  entries: KnowledgeEntry[],
): Map<KnowledgeCategory, number> {
  const counts = new Map<KnowledgeCategory, number>();

  // Extract all user questions from sessions
  const questions: string[] = [];
  for (const session of sessions) {
    for (const msg of session.messages) {
      if (msg.role === 'user') {
        questions.push(msg.content);
      }
    }
  }

  // Also use topicsCovered from sessions to map to categories
  const topicSet = new Set<string>();
  for (const session of sessions) {
    for (const topic of session.topicsCovered) {
      topicSet.add(topic.toLowerCase());
    }
  }

  // Map questions to categories using keyword matching against entries
  for (const question of questions) {
    const qLower = question.toLowerCase();
    // Find which categories the question relates to by matching entry titles/tags
    const matchedCategories = new Set<KnowledgeCategory>();
    for (const entry of entries) {
      const titleLower = entry.title.toLowerCase();
      const tagsLower = entry.tags.map((t) => t.toLowerCase());
      const titleTerms = titleLower.split(/\s+/);
      const qTerms = qLower.split(/\s+/).filter((t) => t.length > 2);

      const hasOverlap = qTerms.some(
        (term) => titleTerms.includes(term) || tagsLower.includes(term),
      );
      if (hasOverlap) {
        matchedCategories.add(entry.category);
      }
    }

    // If no match, try direct category keyword matching
    if (matchedCategories.size === 0) {
      for (const cat of ALL_CATEGORIES) {
        if (qLower.includes(cat)) {
          matchedCategories.add(cat);
        }
      }
    }

    for (const cat of matchedCategories) {
      counts.set(cat, (counts.get(cat) ?? 0) + 1);
    }
  }

  return counts;
}

/**
 * Build knowledge map items from entries and session data.
 */
function buildKnowledgeMap(
  entries: KnowledgeEntry[],
  sessions: Session[],
  handoverType: HandoverType,
): KnowledgeMapItem[] {
  const questionCounts = countQuestionsByCategory(sessions, entries);
  const required = REQUIRED_CATEGORIES[handoverType];
  const niceToHave = NICE_TO_HAVE_CATEGORIES[handoverType];
  const relevantCategories = [...required, ...niceToHave];

  // Count entries per category
  const entryCounts = new Map<KnowledgeCategory, number>();
  const topicsByCategory = new Map<KnowledgeCategory, Set<string>>();

  for (const entry of entries) {
    entryCounts.set(entry.category, (entryCounts.get(entry.category) ?? 0) + 1);
    if (!topicsByCategory.has(entry.category)) {
      topicsByCategory.set(entry.category, new Set());
    }
    topicsByCategory.get(entry.category)!.add(entry.title);
  }

  // Also add "other" if there are entries in that category
  const allCategoriesPresent = new Set<KnowledgeCategory>([
    ...relevantCategories,
    ...entryCounts.keys(),
  ]);

  const mapItems: KnowledgeMapItem[] = [];

  for (const category of allCategoriesPresent) {
    const entryCount = entryCounts.get(category) ?? 0;
    const questions = questionCounts.get(category) ?? 0;
    const topics = topicsByCategory.get(category)
      ? Array.from(topicsByCategory.get(category)!)
      : [];

    // Coverage calculation:
    // - Having entries is the primary factor
    // - Having questions asked (engagement) is a secondary factor
    let coverage = 0;
    if (entryCount > 0) {
      // Base coverage from entries: 1 entry = 20%, 3 entries = 60%, 5+ = 80%
      coverage = Math.min(80, entryCount * 20);
      // Bonus from engagement via Q&A (up to +20%)
      if (questions > 0) {
        coverage += Math.min(20, questions * 10);
      }
    }
    coverage = Math.min(100, coverage);

    mapItems.push({
      category,
      topics,
      entryCount,
      questionsAsked: questions,
      coverage,
    });
  }

  return mapItems;
}

/**
 * Calculate overall coverage as a percentage of required categories that have entries.
 */
function calculateOverallCoverage(
  mapItems: KnowledgeMapItem[],
  handoverType: HandoverType,
): number {
  const required = REQUIRED_CATEGORIES[handoverType];
  if (required.length === 0) return 100;

  let coveredCount = 0;
  for (const cat of required) {
    const item = mapItems.find((m) => m.category === cat);
    if (item && item.entryCount > 0) {
      coveredCount++;
    }
  }

  return Math.round((coveredCount / required.length) * 100);
}

/**
 * Build topic coverage list from knowledge map items.
 */
function buildTopicCoverage(
  mapItems: KnowledgeMapItem[],
): TopicCoverage[] {
  const coverages: TopicCoverage[] = [];

  for (const item of mapItems) {
    for (const topic of item.topics) {
      coverages.push({
        topic,
        category: item.category,
        coverage: item.coverage,
        questionsAsked: item.questionsAsked,
      });
    }

    // If no topics but the category exists in the map, add a category-level entry
    if (item.topics.length === 0) {
      coverages.push({
        topic: item.category,
        category: item.category,
        coverage: 0,
        questionsAsked: item.questionsAsked,
      });
    }
  }

  return coverages;
}

/**
 * Use Claude to identify specific knowledge gaps.
 */
async function analyzeGapsWithClaude(
  entries: KnowledgeEntry[],
  sessions: Session[],
  handoverType: HandoverType,
): Promise<ClaudeGapAnalysis> {
  const entryDescriptions = entries.map(
    (e) => `[${e.category}] ${e.title} (confidence: ${Math.round(e.confidence * 100)}%)`,
  );

  // Extract Q&A topics
  const qaTopics: string[] = [];
  for (const session of sessions) {
    for (const msg of session.messages) {
      if (msg.role === 'user') {
        qaTopics.push(msg.content);
      }
    }
    qaTopics.push(...session.topicsCovered);
  }

  const required = REQUIRED_CATEGORIES[handoverType];
  const niceToHave = NICE_TO_HAVE_CATEGORIES[handoverType];

  const prompt = `Analyze this knowledge base for a "${handoverType}" handover and identify gaps.

## Knowledge Entries (${entries.length} total)
${entryDescriptions.length > 0 ? entryDescriptions.join('\n') : '(none)'}

## Q&A Topics Discussed
${qaTopics.length > 0 ? qaTopics.join('\n') : '(none)'}

## Expected Coverage
Required categories: ${required.join(', ')}
Nice-to-have categories: ${niceToHave.join(', ')}

## Instructions
Identify what critical knowledge is MISSING or WEAK. Consider:
1. Which required categories have no entries or very few entries?
2. What specific topics within each category are likely missing?
3. What questions has the receiver NOT asked that they probably should?
4. What domain-specific knowledge would someone new need?

Return 3-8 gaps ordered by importance, and 2-5 actionable recommendations.
Respond with ONLY valid JSON matching the required schema.`;

  const responseText = await chat(
    [{ role: 'user', content: prompt }],
    { system: SYSTEM_PROMPT, temperature: 0.3 },
  );

  // Parse JSON from response
  const jsonMatch = responseText.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    return { gaps: [], recommendations: [] };
  }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as ClaudeGapAnalysis;
    return {
      gaps: Array.isArray(parsed.gaps) ? parsed.gaps : [],
      recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
    };
  } catch {
    return { gaps: [], recommendations: [] };
  }
}

export class GapAnalyzerAgent implements SubAgent {
  name = 'gap-analyzer';
  description = 'Identifies knowledge gaps and recommends learning priorities';

  async execute(input: unknown): Promise<SubAgentResult<GapAnalysisResult>> {
    const startTime = Date.now();

    try {
      const { profile, entries, sessions } = input as GapAnalysisInput;

      // Step 1: Build the knowledge map from local data
      const knowledgeMap = buildKnowledgeMap(entries, sessions, profile.type);

      // Step 2: Calculate overall coverage
      const overallCoverage = calculateOverallCoverage(knowledgeMap, profile.type);

      // Step 3: Build topic coverage
      const coveredTopics = buildTopicCoverage(knowledgeMap);

      // Step 4: Use Claude to identify specific gaps
      const claudeAnalysis = await analyzeGapsWithClaude(
        entries,
        sessions,
        profile.type,
      );

      // Step 5: Build gap objects
      const gaps: KnowledgeGap[] = claudeAnalysis.gaps.map((g) => ({
        topic: g.topic,
        category: g.category,
        importance: g.importance,
        reason: g.reason,
        suggestedQuestions: g.suggestedQuestions,
      }));

      // Step 6: Assemble the report
      const report: GapReport = {
        handoverId: profile.id,
        generatedAt: new Date().toISOString(),
        coveredTopics,
        gaps,
        overallCoverage,
        recommendations: claudeAnalysis.recommendations,
      };

      const duration = Date.now() - startTime;

      return {
        success: true,
        data: { report, knowledgeMap },
        metadata: { duration },
      };
    } catch (err) {
      const duration = Date.now() - startTime;
      const message = err instanceof Error ? err.message : String(err);

      return {
        success: false,
        error: `Gap analysis failed: ${message}`,
        metadata: { duration },
      };
    }
  }
}
