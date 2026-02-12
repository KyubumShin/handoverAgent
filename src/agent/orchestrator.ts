import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { readdirSync } from 'node:fs';

import type {
  HandoverProfile,
  HandoverType,
  KnowledgeEntry,
  Session,
  GapReport,
  SkillDefinition,
  Feedback,
  Citation,
} from './types.js';

import { KnowledgeExtractorAgent } from './sub-agents/knowledge-extractor.js';
import { QAResponderAgent } from './sub-agents/qa-responder.js';
import { GapAnalyzerAgent } from './sub-agents/gap-analyzer.js';
import { SkillBuilderAgent } from './sub-agents/skill-builder.js';

import { initKnowledgeStore, addEntry, getAllEntries } from '../knowledge/store.js';
import { findRelevantEntries } from '../knowledge/indexer.js';

import { initSkillsDir, loadAllSkills, registerSkill, updateSkill } from '../skills/registry.js';

import { saveFeedback, loadFeedbackHistory } from '../feedback/collector.js';
import { detectQuestionPatterns, identifyWeakAreas } from '../feedback/analyzer.js';

import { getDataDir, readJSON, writeJSON, ensureDir } from '../utils/files.js';

export interface HandoverAgent {
  // Lifecycle
  initialize(
    name: string,
    type: HandoverType,
    description?: string,
  ): Promise<HandoverProfile>;
  getProfile(): HandoverProfile | null;

  // Knowledge
  extractKnowledge(
    path: string,
    options?: { type?: 'codebase' | 'docs' | 'git'; depth?: 'shallow' | 'deep' },
  ): Promise<{ entries: KnowledgeEntry[]; summary: string }>;
  getKnowledgeEntries(): KnowledgeEntry[];
  searchKnowledge(query: string): KnowledgeEntry[];

  // Q&A
  ask(
    question: string,
    sessionId?: string,
  ): Promise<{
    answer: string;
    citations: Citation[];
    confidence: number;
    suggestedFollowUps: string[];
  }>;

  // Intelligence
  analyzeGaps(): Promise<GapReport>;

  // Self-improvement
  getSkills(): SkillDefinition[];
  evolveSkills(): Promise<{ newSkills: SkillDefinition[]; improved: number }>;
  addFeedback(rating: 'positive' | 'negative', comment?: string): void;

  // Sessions
  getSessions(): Session[];
}

/**
 * Create a HandoverAgent instance that provides a unified programmatic API
 * over all sub-agents, stores, and registries.
 */
export function createHandoverAgent(dataDir?: string): HandoverAgent {
  const resolvedDataDir = dataDir ?? getDataDir();

  let currentProfile: HandoverProfile | null = null;
  let currentSession: Session | null = null;
  let initialized = false;

  function ensureStoreInitialized(): void {
    if (!initialized) {
      initKnowledgeStore(resolvedDataDir);
      initSkillsDir(resolvedDataDir);
      initialized = true;
    }
  }

  function loadProfile(): HandoverProfile | null {
    const profilePath = resolve(resolvedDataDir, 'profile.json');
    return readJSON<HandoverProfile>(profilePath);
  }

  function saveProfile(profile: HandoverProfile): void {
    const profilePath = resolve(resolvedDataDir, 'profile.json');
    writeJSON(profilePath, profile);
  }

  function loadAllSessions(): Session[] {
    const sessionsDir = join(resolvedDataDir, 'sessions');
    ensureDir(sessionsDir);

    const files = readdirSync(sessionsDir).filter((f) => f.endsWith('.json'));
    const sessions: Session[] = [];

    for (const file of files) {
      const session = readJSON<Session>(join(sessionsDir, file));
      if (session) sessions.push(session);
    }

    return sessions;
  }

  function getOrCreateSession(sessionId?: string): Session {
    if (sessionId && currentSession?.id === sessionId) {
      return currentSession;
    }

    if (sessionId) {
      const sessionsDir = join(resolvedDataDir, 'sessions');
      const existing = readJSON<Session>(join(sessionsDir, `${sessionId}.json`));
      if (existing) {
        currentSession = existing;
        return existing;
      }
    }

    const profile = currentProfile ?? loadProfile();
    const session: Session = {
      id: sessionId ?? randomUUID(),
      handoverId: profile?.id ?? 'unknown',
      startedAt: new Date().toISOString(),
      messages: [],
      topicsCovered: [],
    };
    currentSession = session;
    return session;
  }

  function saveSession(session: Session): void {
    const sessionsDir = join(resolvedDataDir, 'sessions');
    ensureDir(sessionsDir);
    writeJSON(join(sessionsDir, `${session.id}.json`), session);
  }

  // Load profile from disk on creation
  currentProfile = loadProfile();
  if (currentProfile) {
    ensureStoreInitialized();
  }

  const agent: HandoverAgent = {
    async initialize(
      name: string,
      type: HandoverType,
      description?: string,
    ): Promise<HandoverProfile> {
      const now = new Date().toISOString();
      const profile: HandoverProfile = {
        id: randomUUID(),
        type,
        name: name.trim(),
        description: description?.trim() ?? '',
        createdAt: now,
        updatedAt: now,
        sources: [],
        metadata: {},
      };

      saveProfile(profile);
      currentProfile = profile;
      ensureStoreInitialized();

      return profile;
    },

    getProfile(): HandoverProfile | null {
      if (!currentProfile) {
        currentProfile = loadProfile();
      }
      return currentProfile;
    },

    async extractKnowledge(
      path: string,
      options?: { type?: 'codebase' | 'docs' | 'git'; depth?: 'shallow' | 'deep' },
    ): Promise<{ entries: KnowledgeEntry[]; summary: string }> {
      ensureStoreInitialized();

      const resolvedPath = resolve(path);
      const extractor = new KnowledgeExtractorAgent();

      const result = await extractor.execute({
        path: resolvedPath,
        type: options?.type ?? 'codebase',
        depth: options?.depth ?? 'shallow',
      });

      if (!result.success || !result.data) {
        throw new Error(result.error ?? 'Knowledge extraction failed');
      }

      const { entries, summary } = result.data;

      // Persist entries to the store
      for (const entry of entries) {
        addEntry(entry);
      }

      // Update profile sources
      const profile = currentProfile ?? loadProfile();
      if (profile && !profile.sources.includes(resolvedPath)) {
        profile.sources.push(resolvedPath);
        profile.updatedAt = new Date().toISOString();
        saveProfile(profile);
        currentProfile = profile;
      }

      return { entries, summary };
    },

    getKnowledgeEntries(): KnowledgeEntry[] {
      ensureStoreInitialized();
      return getAllEntries();
    },

    searchKnowledge(query: string): KnowledgeEntry[] {
      ensureStoreInitialized();
      const allEntries = getAllEntries();
      return findRelevantEntries(query, allEntries);
    },

    async ask(
      question: string,
      sessionId?: string,
    ): Promise<{
      answer: string;
      citations: Citation[];
      confidence: number;
      suggestedFollowUps: string[];
    }> {
      ensureStoreInitialized();

      const profile = currentProfile ?? loadProfile();
      const session = getOrCreateSession(sessionId);

      const allEntries = getAllEntries();
      const relevantEntries = findRelevantEntries(question, allEntries);

      const handoverContext = profile
        ? [`Handover: ${profile.name}`, `Type: ${profile.type}`, `Description: ${profile.description}`].join('\n')
        : undefined;

      const qaAgent = new QAResponderAgent();
      const result = await qaAgent.execute({
        question,
        conversationHistory: session.messages,
        knowledgeEntries: relevantEntries,
        handoverContext,
      });

      if (!result.success || !result.data) {
        throw new Error(result.error ?? 'Q&A failed');
      }

      const { answer, citations, confidence, suggestedFollowUps } = result.data;

      // Record messages in the session
      const now = new Date().toISOString();
      session.messages.push({ role: 'user', content: question, timestamp: now });
      session.messages.push({
        role: 'assistant',
        content: answer,
        timestamp: now,
        citations,
        confidence,
      });

      saveSession(session);

      return { answer, citations, confidence, suggestedFollowUps };
    },

    async analyzeGaps(): Promise<GapReport> {
      ensureStoreInitialized();

      const profile = currentProfile ?? loadProfile();
      if (!profile) {
        throw new Error('No handover profile found. Call initialize() first.');
      }

      const entries = getAllEntries();
      const sessions = loadAllSessions();

      const analyzer = new GapAnalyzerAgent();
      const result = await analyzer.execute({ profile, entries, sessions });

      if (!result.success || !result.data) {
        throw new Error(result.error ?? 'Gap analysis failed');
      }

      return result.data.report;
    },

    getSkills(): SkillDefinition[] {
      ensureStoreInitialized();
      return loadAllSkills();
    },

    async evolveSkills(): Promise<{ newSkills: SkillDefinition[]; improved: number }> {
      ensureStoreInitialized();

      const feedbackHistory = loadFeedbackHistory();
      const sessions = loadAllSessions();
      const existingSkills = loadAllSkills();

      const questionPatterns = detectQuestionPatterns(sessions);
      const weakAreas = identifyWeakAreas(feedbackHistory, sessions);

      const builder = new SkillBuilderAgent();
      const result = await builder.execute({
        questionPatterns,
        weakAreas,
        existingSkills,
      });

      if (!result.success || !result.data) {
        throw new Error(result.error ?? 'Skill evolution failed');
      }

      const { newSkills, improvedSkills } = result.data;

      // Persist new skills
      for (const skill of newSkills) {
        registerSkill(skill);
      }

      // Apply improvements
      for (const improvement of improvedSkills) {
        updateSkill(improvement.id, {});
      }

      return { newSkills, improved: improvedSkills.length };
    },

    addFeedback(rating: 'positive' | 'negative', comment?: string): void {
      const feedback: Feedback = {
        rating,
        comment,
        timestamp: new Date().toISOString(),
        messageId: currentSession
          ? `${currentSession.messages.length - 1}`
          : undefined,
      };

      saveFeedback(feedback);
    },

    getSessions(): Session[] {
      return loadAllSessions();
    },
  };

  return agent;
}
