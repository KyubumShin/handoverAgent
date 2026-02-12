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

export interface KnowledgeEntry {
  id: string;
  title: string;
  content: string;
  category: KnowledgeCategory;
  tags: string[];
  source: KnowledgeSource;
  confidence: number;
  createdAt: string;
  updatedAt: string;
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

export interface Feedback {
  rating: 'positive' | 'negative';
  comment?: string;
  timestamp: string;
  messageId?: string;
}

export interface InteractionLogEntry {
  id: string;
  question: string;
  answer: string;
  confidence: number;
  citations: string[]; // entry IDs
  feedback?: Feedback;
  timestamp: string;
}

export interface TopicSummary {
  category: KnowledgeCategory;
  count: number;
}

export interface MigrationReport {
  entriesMigrated: number;
  entriesSkipped: number;
  profileMigrated: boolean;
  feedbackMigrated: boolean;
  errors: string[];
}
