import type { Feedback, FeedbackSummary, Session } from '../agent/types.js';

export interface QuestionPattern {
  pattern: string;
  frequency: number;
  categories: string[];
  exampleQuestions: string[];
  averageRating: number;
}

export interface WeakArea {
  topic: string;
  negativeCount: number;
  totalCount: number;
  sampleQuestions: string[];
}

/**
 * Tokenize a question into normalized terms, removing short words and common stop words.
 */
function tokenize(text: string): string[] {
  const stopWords = new Set([
    'the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been',
    'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will',
    'would', 'could', 'should', 'may', 'might', 'can', 'shall',
    'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from',
    'as', 'into', 'through', 'during', 'before', 'after', 'and',
    'but', 'or', 'nor', 'not', 'so', 'yet', 'both', 'either',
    'neither', 'each', 'every', 'all', 'any', 'few', 'more',
    'most', 'other', 'some', 'such', 'no', 'only', 'own', 'same',
    'than', 'too', 'very', 'just', 'about', 'what', 'how', 'why',
    'when', 'where', 'who', 'which', 'this', 'that', 'these',
    'those', 'it', 'its', 'i', 'me', 'my', 'we', 'our', 'you',
    'your', 'he', 'she', 'they', 'them', 'their',
  ]);

  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2 && !stopWords.has(t));
}

/**
 * Extract user questions from a list of sessions.
 */
function extractUserQuestions(sessions: Session[]): string[] {
  const questions: string[] = [];
  for (const session of sessions) {
    for (const msg of session.messages) {
      if (msg.role === 'user') {
        questions.push(msg.content);
      }
    }
  }
  return questions;
}

/**
 * Build a term frequency map across all questions.
 */
function buildTermFrequency(questions: string[]): Map<string, number> {
  const freq = new Map<string, number>();
  for (const q of questions) {
    const terms = tokenize(q);
    // Count unique terms per question (document frequency)
    const unique = new Set(terms);
    for (const term of unique) {
      freq.set(term, (freq.get(term) ?? 0) + 1);
    }
  }
  return freq;
}

/**
 * Group questions by their dominant keyword theme.
 * Returns a map of theme keyword -> questions containing that keyword.
 */
function groupQuestionsByTheme(
  questions: string[],
  termFrequency: Map<string, number>,
  minFrequency: number,
): Map<string, string[]> {
  // Find terms that appear frequently enough to be "themes"
  const themes = new Map<string, string[]>();

  const frequentTerms = [...termFrequency.entries()]
    .filter(([, count]) => count >= minFrequency)
    .sort((a, b) => b[1] - a[1])
    .map(([term]) => term);

  for (const term of frequentTerms) {
    const matching = questions.filter((q) => {
      const terms = tokenize(q);
      return terms.includes(term);
    });
    if (matching.length >= minFrequency) {
      themes.set(term, matching);
    }
  }

  return themes;
}

/**
 * Match feedback entries to session messages by timestamp proximity.
 * Returns a map of question content -> associated feedback entries.
 */
function matchFeedbackToQuestions(
  feedbackHistory: Feedback[],
  sessions: Session[],
): Map<string, Feedback[]> {
  const questionFeedback = new Map<string, Feedback[]>();

  for (const session of sessions) {
    for (let i = 0; i < session.messages.length; i++) {
      const msg = session.messages[i]!;
      if (msg.role !== 'assistant') continue;

      // Check if this assistant message has inline feedback
      if (msg.feedback) {
        // Find the preceding user question
        const userMsg = findPrecedingUserMessage(session.messages, i);
        if (userMsg) {
          const existing = questionFeedback.get(userMsg) ?? [];
          existing.push(msg.feedback);
          questionFeedback.set(userMsg, existing);
        }
        continue;
      }

      // Try matching by messageId from the feedback history
      const messageId = `${i}`;
      const matched = feedbackHistory.filter((f) => f.messageId === messageId);
      if (matched.length > 0) {
        const userMsg = findPrecedingUserMessage(session.messages, i);
        if (userMsg) {
          const existing = questionFeedback.get(userMsg) ?? [];
          existing.push(...matched);
          questionFeedback.set(userMsg, existing);
        }
        continue;
      }

      // Fallback: match by timestamp proximity (within 60 seconds)
      const msgTime = new Date(msg.timestamp).getTime();
      for (const feedback of feedbackHistory) {
        const fbTime = new Date(feedback.timestamp).getTime();
        if (Math.abs(msgTime - fbTime) < 60_000) {
          const userMsg = findPrecedingUserMessage(session.messages, i);
          if (userMsg) {
            const existing = questionFeedback.get(userMsg) ?? [];
            existing.push(feedback);
            questionFeedback.set(userMsg, existing);
          }
        }
      }
    }
  }

  return questionFeedback;
}

/**
 * Find the content of the user message that precedes the assistant message at the given index.
 */
function findPrecedingUserMessage(
  messages: { role: string; content: string }[],
  assistantIndex: number,
): string | null {
  for (let j = assistantIndex - 1; j >= 0; j--) {
    if (messages[j]!.role === 'user') {
      return messages[j]!.content;
    }
  }
  return null;
}

/**
 * Analyze feedback patterns and return a summary with insights.
 */
export function analyzeFeedback(
  feedbackHistory: Feedback[],
  sessions: Session[],
): FeedbackSummary {
  const totalInteractions = feedbackHistory.length;
  const positiveCount = feedbackHistory.filter((f) => f.rating === 'positive').length;
  const negativeCount = feedbackHistory.filter((f) => f.rating === 'negative').length;
  const satisfactionRate = totalInteractions > 0 ? positiveCount / totalInteractions : 0;

  // Extract common issues from negative feedback comments
  const negativeComments = feedbackHistory
    .filter((f) => f.rating === 'negative' && f.comment)
    .map((f) => f.comment!);

  const commonIssues = findCommonPhrases(negativeComments);

  // Find top question patterns
  const questions = extractUserQuestions(sessions);
  const termFreq = buildTermFrequency(questions);
  const topPatterns = [...termFreq.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([term, count]) => `${term} (${count}x)`);

  return {
    totalInteractions,
    positiveCount,
    negativeCount,
    satisfactionRate,
    commonIssues,
    topPatterns,
  };
}

/**
 * Find commonly repeated phrases from a set of comments.
 */
function findCommonPhrases(comments: string[]): string[] {
  if (comments.length === 0) return [];

  const phraseCount = new Map<string, number>();

  for (const comment of comments) {
    const terms = tokenize(comment);
    // Build bigrams for phrase detection
    for (let i = 0; i < terms.length - 1; i++) {
      const bigram = `${terms[i]} ${terms[i + 1]}`;
      phraseCount.set(bigram, (phraseCount.get(bigram) ?? 0) + 1);
    }
    // Also count individual meaningful terms
    for (const term of terms) {
      phraseCount.set(term, (phraseCount.get(term) ?? 0) + 1);
    }
  }

  return [...phraseCount.entries()]
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([phrase]) => phrase);
}

/**
 * Detect recurring question patterns across sessions.
 * Groups similar questions by shared keywords and returns frequency statistics.
 */
export function detectQuestionPatterns(sessions: Session[]): QuestionPattern[] {
  const questions = extractUserQuestions(sessions);
  if (questions.length === 0) return [];

  const termFreq = buildTermFrequency(questions);
  const minFrequency = Math.max(2, Math.floor(questions.length * 0.1));
  const themes = groupQuestionsByTheme(questions, termFreq, minFrequency);

  const patterns: QuestionPattern[] = [];

  for (const [theme, matchingQuestions] of themes) {
    // Determine categories from the questions' terms
    const allTerms = matchingQuestions.flatMap((q) => tokenize(q));
    const termCounts = new Map<string, number>();
    for (const t of allTerms) {
      termCounts.set(t, (termCounts.get(t) ?? 0) + 1);
    }
    const topTerms = [...termCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([t]) => t);

    patterns.push({
      pattern: theme,
      frequency: matchingQuestions.length,
      categories: topTerms,
      exampleQuestions: matchingQuestions.slice(0, 5),
      averageRating: 0, // Will be enriched if feedback data is available
    });
  }

  // Sort by frequency descending
  return patterns.sort((a, b) => b.frequency - a.frequency);
}

/**
 * Identify topics where answers consistently get negative feedback.
 * Correlates feedback entries with session messages to find weak areas.
 */
export function identifyWeakAreas(
  feedbackHistory: Feedback[],
  sessions: Session[],
): WeakArea[] {
  const questionFeedback = matchFeedbackToQuestions(feedbackHistory, sessions);
  const topicStats = new Map<string, { negative: number; total: number; questions: string[] }>();

  for (const [question, feedbacks] of questionFeedback) {
    const terms = tokenize(question);
    const topTerms = terms.slice(0, 3); // Use top terms as topic proxy

    for (const term of topTerms) {
      const stats = topicStats.get(term) ?? { negative: 0, total: 0, questions: [] };
      for (const fb of feedbacks) {
        stats.total++;
        if (fb.rating === 'negative') {
          stats.negative++;
        }
      }
      if (!stats.questions.includes(question) && stats.questions.length < 5) {
        stats.questions.push(question);
      }
      topicStats.set(term, stats);
    }
  }

  const weakAreas: WeakArea[] = [];

  for (const [topic, stats] of topicStats) {
    // Only report topics with a meaningful negative ratio
    if (stats.total >= 2 && stats.negative / stats.total >= 0.4) {
      weakAreas.push({
        topic,
        negativeCount: stats.negative,
        totalCount: stats.total,
        sampleQuestions: stats.questions,
      });
    }
  }

  // Sort by negative count descending
  return weakAreas.sort((a, b) => b.negativeCount - a.negativeCount);
}
