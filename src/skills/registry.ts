import { join } from 'node:path';
import { existsSync, readdirSync, unlinkSync } from 'node:fs';
import type { SkillDefinition, KnowledgeCategory } from '../agent/types.js';
import { ensureDir, readJSON, writeJSON, getDataDir } from '../utils/files.js';

/**
 * Initialize the skills directory structure under the data directory.
 */
export function initSkillsDir(dataDir: string): void {
  ensureDir(join(dataDir, 'skills'));
}

/**
 * Return the built-in skills that ship with the handover agent.
 */
export function getBuiltInSkills(): SkillDefinition[] {
  const now = new Date().toISOString();

  return [
    {
      id: 'codebase-overview',
      name: 'Codebase Overview',
      description: 'Generates a high-level overview of the project structure, tech stack, and architecture.',
      version: '1.0.0',
      trigger: {
        keywords: ['overview', 'structure', 'architecture', 'codebase', 'project'],
        categories: ['architecture', 'codebase'] as KnowledgeCategory[],
        minConfidence: 0.3,
      },
      prompt: [
        'You are a handover assistant. Using the knowledge base entries provided, generate a clear and concise overview of this project.',
        'Cover the following aspects:',
        '1. What the project does (purpose and goals)',
        '2. Technology stack and key dependencies',
        '3. High-level architecture (main components and how they interact)',
        '4. Directory/file structure summary',
        '',
        'Keep it structured with headings and bullet points. Be factual - only state what the knowledge base supports.',
      ].join('\n'),
      examples: ['Give me a codebase overview', 'What is the project structure?', 'Describe the architecture'],
      metadata: {
        createdAt: now,
        updatedAt: now,
        usageCount: 0,
        successRate: 1,
        source: 'built-in',
      },
    },
    {
      id: 'onboarding-checklist',
      name: 'Onboarding Checklist',
      description: 'Creates a step-by-step onboarding checklist for getting started with the project.',
      version: '1.0.0',
      trigger: {
        keywords: ['checklist', 'getting started', 'setup', 'onboarding', 'first steps'],
        categories: ['process', 'tool'] as KnowledgeCategory[],
        minConfidence: 0.3,
      },
      prompt: [
        'You are a handover assistant. Using the knowledge base entries provided, generate a practical onboarding checklist.',
        'The checklist should include:',
        '1. Environment setup steps (tools, dependencies, accounts)',
        '2. Key repositories to clone and how to build/run them',
        '3. Important documentation to read first',
        '4. Key people to meet or contact',
        '5. Common workflows and processes to learn',
        '',
        'Format as a numbered checklist with clear, actionable items. Prioritize the most critical items first.',
      ].join('\n'),
      examples: ['Create an onboarding checklist', 'How do I get started?', 'What should I set up first?'],
      metadata: {
        createdAt: now,
        updatedAt: now,
        usageCount: 0,
        successRate: 1,
        source: 'built-in',
      },
    },
    {
      id: 'key-decisions',
      name: 'Key Decisions',
      description: 'Summarizes important architectural and technical decisions and their rationale.',
      version: '1.0.0',
      trigger: {
        keywords: ['decisions', 'why', 'rationale', 'choices', 'reasoning', 'trade-offs'],
        categories: ['decision', 'architecture'] as KnowledgeCategory[],
        minConfidence: 0.3,
      },
      prompt: [
        'You are a handover assistant. Using the knowledge base entries provided, summarize the key architectural and technical decisions made in this project.',
        'For each decision:',
        '1. What was decided',
        '2. Why it was decided that way (rationale)',
        '3. What alternatives were considered (if known)',
        '4. Any trade-offs or consequences',
        '',
        'Focus on decisions that a new team member needs to understand to work effectively. Group by category if there are many.',
      ].join('\n'),
      examples: ['What key decisions were made?', 'Why was this architecture chosen?', 'What are the design rationale?'],
      metadata: {
        createdAt: now,
        updatedAt: now,
        usageCount: 0,
        successRate: 1,
        source: 'built-in',
      },
    },
    {
      id: 'team-contacts',
      name: 'Team Contacts',
      description: 'Lists key people, their roles, and areas of responsibility.',
      version: '1.0.0',
      trigger: {
        keywords: ['who', 'team', 'contacts', 'people', 'roles', 'owner', 'responsible'],
        categories: ['people'] as KnowledgeCategory[],
        minConfidence: 0.3,
      },
      prompt: [
        'You are a handover assistant. Using the knowledge base entries provided, list the key people involved in this project.',
        'For each person:',
        '1. Name and role/title',
        '2. Areas of responsibility or expertise',
        '3. When to contact them (what questions or issues)',
        '',
        'If the knowledge base does not have detailed people information, state that clearly and suggest the user add this information.',
      ].join('\n'),
      examples: ['Who should I talk to?', 'Who is on the team?', 'Who owns the backend?'],
      metadata: {
        createdAt: now,
        updatedAt: now,
        usageCount: 0,
        successRate: 1,
        source: 'built-in',
      },
    },
  ];
}

/**
 * Load all dynamic skills from the skills directory on disk.
 */
function loadDynamicSkills(): SkillDefinition[] {
  const dataDir = getDataDir();
  const skillsDir = join(dataDir, 'skills');

  if (!existsSync(skillsDir)) return [];

  const files = readdirSync(skillsDir).filter((f) => f.endsWith('.json'));
  const skills: SkillDefinition[] = [];

  for (const file of files) {
    const skill = readJSON<SkillDefinition>(join(skillsDir, file));
    if (skill) skills.push(skill);
  }

  return skills;
}

/**
 * Load all skills: built-in skills first, then dynamic skills from disk.
 */
export function loadAllSkills(): SkillDefinition[] {
  const builtIn = getBuiltInSkills();
  const dynamic = loadDynamicSkills();
  return [...builtIn, ...dynamic];
}

/**
 * Get a skill by its ID. Checks built-in skills first, then dynamic.
 */
export function getSkill(id: string): SkillDefinition | null {
  const builtIn = getBuiltInSkills().find((s) => s.id === id);
  if (builtIn) return builtIn;

  const dataDir = getDataDir();
  const skillPath = join(dataDir, 'skills', `${id}.json`);
  return readJSON<SkillDefinition>(skillPath);
}

/**
 * Register a new dynamic skill by saving it to the skills directory.
 */
export function registerSkill(skill: SkillDefinition): void {
  const dataDir = getDataDir();
  initSkillsDir(dataDir);
  const skillPath = join(dataDir, 'skills', `${skill.id}.json`);
  writeJSON(skillPath, skill);
}

/**
 * Update an existing dynamic skill with partial updates (e.g., increment usage count).
 * Does not update built-in skills.
 */
export function updateSkill(id: string, updates: Partial<SkillDefinition>): void {
  const dataDir = getDataDir();
  const skillPath = join(dataDir, 'skills', `${id}.json`);
  const existing = readJSON<SkillDefinition>(skillPath);

  if (!existing) return;

  const updated: SkillDefinition = {
    ...existing,
    ...updates,
    id, // Prevent ID override
    metadata: {
      ...existing.metadata,
      ...(updates.metadata ?? {}),
      updatedAt: new Date().toISOString(),
    },
  };

  writeJSON(skillPath, updated);
}

/**
 * Score a skill against a query string. Returns a relevance score >= 0.
 */
function scoreSkill(skill: SkillDefinition, query: string, category?: KnowledgeCategory): number {
  const queryLower = query.toLowerCase();
  const queryTerms = queryLower.split(/\s+/).filter((t) => t.length > 2);
  let score = 0;

  // Keyword matching from trigger keywords
  for (const keyword of skill.trigger.keywords) {
    const keywordLower = keyword.toLowerCase();
    // Exact keyword in query
    if (queryLower.includes(keywordLower)) {
      score += 3;
    }
    // Individual query term matches keyword
    for (const term of queryTerms) {
      if (keywordLower.includes(term) || term.includes(keywordLower)) {
        score += 1;
      }
    }
  }

  // Category match bonus
  if (category && skill.trigger.categories.includes(category)) {
    score += 2;
  }

  // Name / description match
  const nameLower = skill.name.toLowerCase();
  const descLower = skill.description.toLowerCase();
  for (const term of queryTerms) {
    if (nameLower.includes(term)) score += 2;
    if (descLower.includes(term)) score += 1;
  }

  return score;
}

/**
 * Find skills matching a query, optionally filtered by category.
 * Returns results sorted by relevance score (highest first).
 */
export function matchSkills(query: string, category?: KnowledgeCategory): SkillDefinition[] {
  const allSkills = loadAllSkills();

  const scored = allSkills.map((skill) => ({
    skill,
    score: scoreSkill(skill, query, category),
  }));

  return scored
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .map((s) => s.skill);
}

/**
 * Delete a dynamic skill by ID. Returns true if the skill was found and deleted.
 * Cannot delete built-in skills.
 */
export function deleteSkill(id: string): boolean {
  // Prevent deleting built-in skills
  const builtIn = getBuiltInSkills().find((s) => s.id === id);
  if (builtIn) return false;

  const dataDir = getDataDir();
  const skillPath = join(dataDir, 'skills', `${id}.json`);

  if (!existsSync(skillPath)) return false;

  unlinkSync(skillPath);
  return true;
}
