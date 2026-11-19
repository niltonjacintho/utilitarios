export type FlowchartNodeType =
  | 'start'
  | 'end'
  | 'process'
  | 'decision'
  | 'io'
  | 'subprocess'
  | 'document'
  | 'database'
  | 'manual'
  | 'delay'
  | 'connector'
  | 'note';

export type FlowchartStatus = 'draft' | 'review' | 'published';

export type FlowchartAccessLevel = 'owner' | 'edit' | 'view';

export interface FlowchartLane {
  id: string;
  name: string;
  height: number;
}

export interface FlowchartNode {
  id: string;
  type: FlowchartNodeType;
  title: string;
  description?: string;
  owner?: string;
  trigger?: string;
  laneId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FlowchartEdge {
  id: string;
  sourceId: string;
  targetId: string;
  label?: string;
}

export interface FlowchartComment {
  id: string;
  author: string;
  text: string;
  nodeId?: string | null;
  createdAt: string;
}

export interface FlowchartShare {
  id: string;
  target: string;
  permission: 'view' | 'edit';
  createdAt: string;
}

export interface FlowchartVersionSummary {
  id: string;
  label: string;
  author: string;
  createdAt: string;
}

export interface FlowchartSummary {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  tags: string[];
  status: FlowchartStatus;
  archived: boolean;
  owner: string;
  accessLevel: FlowchartAccessLevel;
  nodeCount: number;
  edgeCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface FlowchartRecord extends FlowchartSummary {
  backgroundColor: string;
  lanes: FlowchartLane[];
  nodes: FlowchartNode[];
  edges: FlowchartEdge[];
  comments: FlowchartComment[];
  shares: FlowchartShare[];
  versions: FlowchartVersionSummary[];
}

export interface CreateFlowchartInput {
  name: string;
  description?: string;
  tags?: string[];
  status?: FlowchartStatus;
  backgroundColor?: string;
  lanes?: FlowchartLane[];
  nodes?: FlowchartNode[];
  edges?: FlowchartEdge[];
}

export interface UpdateFlowchartInput {
  name?: string;
  description?: string;
  tags?: string[];
  status?: FlowchartStatus;
  archived?: boolean;
  backgroundColor?: string;
  lanes?: FlowchartLane[];
  nodes?: FlowchartNode[];
  edges?: FlowchartEdge[];
  comments?: FlowchartComment[];
  shares?: FlowchartShare[];
}

export interface GenerateFlowchartAiInput {
  text: string;
  title?: string;
}

export interface FlowchartAiSummary {
  overview: string;
  highlights: string[];
  attentionPoints: string[];
  generatedByAi: boolean;
  model?: string;
}
