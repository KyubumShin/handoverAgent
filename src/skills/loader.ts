import type { MessageParam } from '@anthropic-ai/sdk/resources/messages.js';
import type { SkillDefinition, KnowledgeEntry } from '../agent/types.js';
import { chat } from '../utils/claude.js';
import { matchSkills, updateSkill, getSkill } from './registry.js';

export interface SkillExecutionResult {
  output: string;
  skillId: string;
  success: boolean;
  tokensUsed?: number;
}

/**
 * Format knowledge entries into a text block for inclusion in a prompt.
 */
function formatKnowledgeContext(entries: KnowledgeEntry[]): string {
  if (entries.length === 0) {
    return 'No knowledge entries available.';
  }

  return entries
    .map((entry) => {
      const sourceInfo = entry.source.path
        ? `${entry.source.type}: ${entry.source.path}`
        : entry.source.type;
      return [
        `--- [${entry.id}] ${entry.title} ---`,
        `Category: ${entry.category} | Source: ${sourceInfo} | Confidence: ${Math.round(entry.confidence * 100)}%`,
        '',
        entry.content,
      ].join('\n');
    })
    .join('\n\n');
}

/**
 * Execute a skill against the knowledge base with an optional user query.
 *
 * Builds a Claude prompt from the skill's prompt template, injects relevant
 * knowledge entries, and returns the generated output.
 */
export async function executeSkill(
  skill: SkillDefinition,
  knowledgeEntries: KnowledgeEntry[],
  userQuery?: string,
): Promise<SkillExecutionResult> {
  try {
    const knowledgeContext = formatKnowledgeContext(knowledgeEntries);

    const systemPrompt = [
      skill.prompt,
      '',
      'Use only the knowledge base entries provided below. If the knowledge base lacks information on a topic, say so explicitly.',
    ].join('\n');

    let userContent = `Knowledge Base:\n\n${knowledgeContext}`;
    if (userQuery) {
      userContent += `\n\n---\n\nUser Query: ${userQuery}`;
    } else {
      userContent += `\n\n---\n\nPlease generate the output based on the knowledge base above.`;
    }

    const messages: MessageParam[] = [
      { role: 'user', content: userContent },
    ];

    const response = await chat(messages, {
      system: systemPrompt,
      temperature: 0.3,
    });

    return {
      output: response,
      skillId: skill.id,
      success: true,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      output: `Skill execution failed: ${message}`,
      skillId: skill.id,
      success: false,
    };
  }
}

/**
 * Auto-match the best skill for a given query and execute it.
 *
 * Uses matchSkills() to find the best-matching skill. If the top match
 * has a score above the skill's minConfidence threshold, executes it and
 * updates the skill's usage count.
 *
 * Returns null if no skill matches with sufficient confidence.
 */
export async function autoExecuteSkill(
  query: string,
  knowledgeEntries: KnowledgeEntry[],
): Promise<SkillExecutionResult | null> {
  const matches = matchSkills(query);

  if (matches.length === 0) {
    return null;
  }

  const bestMatch = matches[0]!;

  // Execute the best matching skill
  const result = await executeSkill(bestMatch, knowledgeEntries, query);

  // Update usage count for dynamic skills (built-in skills are not persisted)
  if (bestMatch.metadata.source !== 'built-in') {
    const existing = getSkill(bestMatch.id);
    if (existing) {
      const newUsageCount = existing.metadata.usageCount + 1;
      const totalAttempts = newUsageCount;
      const previousSuccesses = existing.metadata.successRate * existing.metadata.usageCount;
      const newSuccessRate = (previousSuccesses + (result.success ? 1 : 0)) / totalAttempts;

      updateSkill(bestMatch.id, {
        metadata: {
          ...existing.metadata,
          usageCount: newUsageCount,
          successRate: newSuccessRate,
          updatedAt: new Date().toISOString(),
        },
      });
    }
  }

  return result;
}
