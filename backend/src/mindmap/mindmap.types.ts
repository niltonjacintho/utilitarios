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

export interface CreateMindMapInput {
  name: string;
  backgroundColor?: string;
  root?: MindMapNode;
}

export interface UpdateMindMapInput {
  name?: string;
  backgroundColor?: string;
  root?: MindMapNode;
  executors?: MindMapExecutor[];
  shares?: MindMapShare[];
}

export interface GenerateMindMapAiInput {
  text: string;
  title?: string;
}

export interface ExpandNodeAiInput {
  nodeId: string;
  instruction?: string;
}

export interface MindMapAiSummary {
  overview: string;
  highlights: string[];
  attentionPoints: string[];
  generatedByAi: boolean;
  model?: string;
}
