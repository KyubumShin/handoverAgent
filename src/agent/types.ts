// Handover types
export type HandoverType = 'project' | 'role' | 'team';

export interface HandoverProfile {
  id: string;
  type: HandoverType;
  name: string;
  description: string;
  createdAt: string;
  updatedAt: string;
  sources: string[];
  metadata: Record<string, unknown>;
}

// Knowledge types
export interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  category: KnowledgeCategory;
  tags: string[];
  source: KnowledgeSource;
  confidence: number; // 0-1
  createdAt: string;
  updatedAt: string;
}

export type KnowledgeCategory =
  | 'architecture'
  | 'codebase'
  | 'process'
  | 'people'
  | 'decision'
  | 'tool'
  | 'convention'
  | 'domain'
  | 'other';

export interface KnowledgeSource {
  type: 'file' | 'git' | 'doc' | 'manual' | 'qa';
  path?: string;
  ref?: string;
}

export interface KnowledgeIndex {
  entries: KnowledgeIndexEntry[];
  lastUpdated: string;
  totalEntries: number;
}

export interface KnowledgeIndexEntry {
  id: string;
  title: string;
  category: KnowledgeCategory;
  tags: string[];
  confidence: number;
}

// Sub-agent types
export interface SubAgentResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  metadata?: {
    tokensUsed?: number;
    duration?: number;
  };
}

export interface SubAgent {
  name: string;
  description: string;
  execute(input: unknown): Promise<SubAgentResult>;
}

// Q&A types
export interface QAMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  citations?: Citation[];
  confidence?: number;
  feedback?: Feedback;
}

export interface Citation {
  entryId: string;
  title: string;
  excerpt: string;
  source: KnowledgeSource;
}

// Gap analysis types
export interface GapReport {
  handoverId: string;
  generatedAt: string;
  coveredTopics: TopicCoverage[];
  gaps: KnowledgeGap[];
  overallCoverage: number; // 0-100
  recommendations: string[];
}

export interface TopicCoverage {
  topic: string;
  category: KnowledgeCategory;
  coverage: number; // 0-100
  questionsAsked: number;
}

export interface KnowledgeGap {
  topic: string;
  category: KnowledgeCategory;
  importance: 'critical' | 'high' | 'medium' | 'low';
  reason: string;
  suggestedQuestions: string[];
}

// Feedback types
export interface Feedback {
  rating: 'positive' | 'negative';
  comment?: string;
  timestamp: string;
  messageId?: string;
}

export interface FeedbackSummary {
  totalInteractions: number;
  positiveCount: number;
  negativeCount: number;
  satisfactionRate: number;
  commonIssues: string[];
  topPatterns: string[];
}

// Skill types
export interface SkillDefinition {
  id: string;
  name: string;
  description: string;
  version: string;
  trigger: SkillTrigger;
  prompt: string;
  examples: string[];
  metadata: {
    createdAt: string;
    updatedAt: string;
    usageCount: number;
    successRate: number;
    source: 'built-in' | 'generated' | 'manual';
  };
}

export interface SkillTrigger {
  keywords: string[];
  categories: KnowledgeCategory[];
  minConfidence: number;
}

// Session types
export interface Session {
  id: string;
  handoverId: string;
  startedAt: string;
  endedAt?: string;
  messages: QAMessage[];
  topicsCovered: string[];
}

// Config types
export interface HandoverConfig {
  apiKey?: string;
  model: string;
  dataDir: string;
  maxTokens: number;
  temperature: number;
}
