export interface MindMapComment {
  id: string;
  author: string;
  text: string;
  createdAt: string;
}

export interface MindMapNode {
  id: string;
  text: string;
  notes?: string;
  completed?: boolean;
  executorId?: string | null;
  dueDate?: string | null;
  collapsed?: boolean;
  comments?: MindMapComment[];
  children: MindMapNode[];
}

export interface MindMapExecutor {
  id: string;
  name: string;
  createdAt: string;
}

export interface MindMapShare {
  id: string;
  target: string;
  permission: 'view' | 'edit';
  createdAt: string;
}

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  initials: string;
  avatarUrl: string | null;
  provider: 'local' | 'google' | 'both';
}

export type MindMapAccessLevel = 'owner' | 'edit' | 'view';

export interface MindMapSummary {
  id: string;
  ownerId: string;
  name: string;
  owner: string;
  accessLevel: MindMapAccessLevel;
  itemCount: number;
  completedCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface MindMapRecord extends MindMapSummary {
  backgroundColor: string;
  root: MindMapNode;
  executors: MindMapExecutor[];
  shares: MindMapShare[];
}

export interface MindMapAiSummary {
  overview: string;
  highlights: string[];
  attentionPoints: string[];
  generatedByAi: boolean;
  model?: string;
}
