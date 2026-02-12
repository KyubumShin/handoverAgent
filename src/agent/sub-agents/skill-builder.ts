import { randomUUID } from 'node:crypto';
import type { MessageParam } from '@anthropic-ai/sdk/resources/messages.js';
import type { SubAgent, SubAgentResult, SkillDefinition, KnowledgeCategory } from '../types.js';
import type { QuestionPattern, WeakArea } from '../../feedback/analyzer.js';
import { chat } from '../../utils/claude.js';

export interface SkillBuildInput {
  questionPatterns: QuestionPattern[];
  weakAreas: WeakArea[];
  existingSkills: SkillDefinition[];
}

export interface SkillBuildResult {
  newSkills: SkillDefinition[];
  improvedSkills: { id: string; changes: string }[];
  summary: string;
}

const SKILL_BUILDER_SYSTEM = `You are a skill builder for a handover agent. Your job is to create specialized prompt templates ("skills") that help answer recurring questions using a knowledge base.

When creating a new skill, respond in this exact JSON format:
{
  "name": "<human readable name>",
  "description": "<what this skill does>",
  "keywords": ["<trigger keyword 1>", "<trigger keyword 2>", ...],
  "categories": ["<category1>", "<category2>"],
  "prompt": "<the system prompt template that will be used with knowledge base entries to answer this type of question>",
  "examples": ["<example question 1>", "<example question 2>", "<example question 3>"]
}

Valid categories: architecture, codebase, process, people, decision, tool, convention, domain, other.

The prompt should:
1. Be specific to the recurring question pattern
2. Instruct the AI to use knowledge base entries effectively
3. Guide the AI to produce structured, actionable answers
4. Be self-contained (no external references)`;

const SKILL_IMPROVER_SYSTEM = `You are a skill improver for a handover agent. Given an existing skill that is performing poorly (receiving negative feedback), suggest improvements to its prompt template.

Respond in this exact JSON format:
{
  "improvedPrompt": "<the improved prompt template>",
  "changes": "<brief description of what was changed and why>"
}

Focus on:
1. Making the prompt more specific about what to look for in the knowledge base
2. Improving the output structure for clarity
3. Addressing the types of questions that received negative feedback
4. Adding more guidance for edge cases or missing information`;

/**
 * Check whether an existing skill already covers a question pattern.
 */
function isPatternCovered(pattern: QuestionPattern, existingSkills: SkillDefinition[]): boolean {
  const patternTerms = [pattern.pattern, ...pattern.categories].map((t) => t.toLowerCase());

  for (const skill of existingSkills) {
    const skillTerms = [
      ...skill.trigger.keywords,
      skill.name,
      ...skill.trigger.categories,
    ].map((t) => t.toLowerCase());

    // Check for overlap between pattern terms and skill terms
    const overlap = patternTerms.filter((pt) =>
      skillTerms.some((st) => st.includes(pt) || pt.includes(st)),
    );

    if (overlap.length >= 1) {
      return true;
    }
  }

  return false;
}

/**
 * Find existing skills that cover a weak area.
 */
function findSkillForWeakArea(weakArea: WeakArea, existingSkills: SkillDefinition[]): SkillDefinition | null {
  const topicLower = weakArea.topic.toLowerCase();

  for (const skill of existingSkills) {
    const keywords = skill.trigger.keywords.map((k) => k.toLowerCase());
    const nameLower = skill.name.toLowerCase();

    if (keywords.some((k) => k.includes(topicLower) || topicLower.includes(k)) || nameLower.includes(topicLower)) {
      return skill;
    }
  }

  return null;
}

/**
 * Parse a JSON response from Claude, handling markdown code fences and whitespace.
 */
function parseJSONResponse<T>(response: string): T | null {
  // Remove markdown code fences if present
  let cleaned = response.trim();
  const fenceMatch = /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/.exec(cleaned);
  if (fenceMatch) {
    cleaned = fenceMatch[1]!.trim();
  }

  try {
    return JSON.parse(cleaned) as T;
  } catch {
    return null;
  }
}

interface NewSkillResponse {
  name: string;
  description: string;
  keywords: string[];
  categories: string[];
  prompt: string;
  examples: string[];
}

interface ImproveSkillResponse {
  improvedPrompt: string;
  changes: string;
}

export class SkillBuilderAgent implements SubAgent {
  name = 'skill-builder';
  description = 'Creates and improves skills based on usage patterns and feedback';

  async execute(input: unknown): Promise<SubAgentResult<SkillBuildResult>> {
    const startTime = Date.now();

    try {
      const { questionPatterns, weakAreas, existingSkills } = input as SkillBuildInput;
      const newSkills: SkillDefinition[] = [];
      const improvedSkills: { id: string; changes: string }[] = [];

      // Step 1: Create new skills for uncovered patterns
      const uncoveredPatterns = questionPatterns.filter(
        (p) => p.frequency >= 2 && !isPatternCovered(p, existingSkills),
      );

      for (const pattern of uncoveredPatterns.slice(0, 3)) {
        const skill = await this.buildSkillForPattern(pattern);
        if (skill) {
          newSkills.push(skill);
        }
      }

      // Step 2: Improve existing skills for weak areas
      for (const weakArea of weakAreas.slice(0, 3)) {
        const existingSkill = findSkillForWeakArea(weakArea, existingSkills);
        if (existingSkill) {
          const improvement = await this.improveSkill(existingSkill, weakArea);
          if (improvement) {
            improvedSkills.push(improvement);
          }
        }
      }

      const summaryParts: string[] = [];
      if (newSkills.length > 0) {
        summaryParts.push(`Created ${newSkills.length} new skill(s): ${newSkills.map((s) => s.name).join(', ')}`);
      }
      if (improvedSkills.length > 0) {
        summaryParts.push(`Improved ${improvedSkills.length} existing skill(s)`);
      }
      if (summaryParts.length === 0) {
        summaryParts.push('No new skills needed - existing skills cover current question patterns well.');
      }

      const duration = Date.now() - startTime;

      return {
        success: true,
        data: {
          newSkills,
          improvedSkills,
          summary: summaryParts.join('. '),
        },
        metadata: { duration },
      };
    } catch (err) {
      const duration = Date.now() - startTime;
      const message = err instanceof Error ? err.message : String(err);

      return {
        success: false,
        error: `Skill builder failed: ${message}`,
        metadata: { duration },
      };
    }
  }

  /**
   * Use Claude to generate a new SkillDefinition for a recurring question pattern.
   */
  private async buildSkillForPattern(pattern: QuestionPattern): Promise<SkillDefinition | null> {
    const userContent = [
      'Create a new skill for the following recurring question pattern:',
      '',
      `Theme: ${pattern.pattern}`,
      `Frequency: ${pattern.frequency} occurrences`,
      `Related categories: ${pattern.categories.join(', ')}`,
      '',
      'Example questions:',
      ...pattern.exampleQuestions.map((q) => `  - "${q}"`),
    ].join('\n');

    const messages: MessageParam[] = [
      { role: 'user', content: userContent },
    ];

    const response = await chat(messages, {
      system: SKILL_BUILDER_SYSTEM,
      temperature: 0.4,
    });

    const parsed = parseJSONResponse<NewSkillResponse>(response);
    if (!parsed) return null;

    const now = new Date().toISOString();
    const validCategories: KnowledgeCategory[] = [
      'architecture', 'codebase', 'process', 'people',
      'decision', 'tool', 'convention', 'domain', 'other',
    ];

    const categories = (parsed.categories ?? [])
      .filter((c): c is KnowledgeCategory => validCategories.includes(c as KnowledgeCategory));

    return {
      id: `gen-${randomUUID().slice(0, 8)}`,
      name: parsed.name,
      description: parsed.description,
      version: '1.0.0',
      trigger: {
        keywords: parsed.keywords ?? [pattern.pattern],
        categories: categories.length > 0 ? categories : ['other'],
        minConfidence: 0.3,
      },
      prompt: parsed.prompt,
      examples: parsed.examples ?? pattern.exampleQuestions,
      metadata: {
        createdAt: now,
        updatedAt: now,
        usageCount: 0,
        successRate: 0,
        source: 'generated',
      },
    };
  }

  /**
   * Use Claude to suggest improvements for an underperforming skill.
   */
  private async improveSkill(
    skill: SkillDefinition,
    weakArea: WeakArea,
  ): Promise<{ id: string; changes: string } | null> {
    const userContent = [
      'Improve this underperforming skill:',
      '',
      `Skill: ${skill.name}`,
      `Current prompt: ${skill.prompt}`,
      '',
      'Problem area:',
      `  Topic: ${weakArea.topic}`,
      `  Negative feedback: ${weakArea.negativeCount} out of ${weakArea.totalCount} interactions`,
      '',
      'Sample questions that received negative feedback:',
      ...weakArea.sampleQuestions.map((q) => `  - "${q}"`),
    ].join('\n');

    const messages: MessageParam[] = [
      { role: 'user', content: userContent },
    ];

    const response = await chat(messages, {
      system: SKILL_IMPROVER_SYSTEM,
      temperature: 0.4,
    });

    const parsed = parseJSONResponse<ImproveSkillResponse>(response);
    if (!parsed) return null;

    return {
      id: skill.id,
      changes: parsed.changes,
    };
  }
}
