import {
  FlowchartEdge,
  FlowchartLane,
  FlowchartNode,
  FlowchartNodeType,
  FlowchartStatus,
  ValidationIssue,
} from '@/types/flowchart';

export const LANE_HEADER_WIDTH = 40;

export interface NodeTypeMeta {
  type: FlowchartNodeType;
  label: string;
  defaultTitle: string;
  fill: string;
  stroke: string;
  textColor: string;
  width: number;
  height: number;
}

export const NODE_TYPE_LIST: NodeTypeMeta[] = [
  {
    type: 'start',
    label: 'Início',
    defaultTitle: 'Início',
    fill: '#E8F5E9',
    stroke: '#2E7D32',
    textColor: '#1B5E20',
    width: 170,
    height: 56,
  },
  {
    type: 'end',
    label: 'Fim',
    defaultTitle: 'Fim',
    fill: '#FDECEB',
    stroke: '#C62828',
    textColor: '#7F1D1D',
    width: 162,
    height: 54,
  },
  {
    type: 'process',
    label: 'Processo',
    defaultTitle: 'Nova etapa',
    fill: '#FFFFFF',
    stroke: '#1E293B',
    textColor: '#0F172A',
    width: 184,
    height: 68,
  },
  {
    type: 'decision',
    label: 'Decisão',
    defaultTitle: 'Condição?',
    fill: '#FEF5E4',
    stroke: '#C78A1B',
    textColor: '#78350F',
    width: 162,
    height: 98,
  },
  {
    type: 'io',
    label: 'Entrada / Saída',
    defaultTitle: 'Dados',
    fill: '#EBF5FF',
    stroke: '#2563EB',
    textColor: '#1E3A8A',
    width: 180,
    height: 64,
  },
  {
    type: 'subprocess',
    label: 'Subprocesso',
    defaultTitle: 'Subprocesso',
    fill: '#F1F5F9',
    stroke: '#334155',
    textColor: '#0F172A',
    width: 184,
    height: 68,
  },
  {
    type: 'document',
    label: 'Documento',
    defaultTitle: 'Documento',
    fill: '#F8FAFC',
    stroke: '#475569',
    textColor: '#0F172A',
    width: 172,
    height: 68,
  },
  {
    type: 'database',
    label: 'Banco de dados',
    defaultTitle: 'Base de dados',
    fill: '#F3EEFE',
    stroke: '#6D28D9',
    textColor: '#4C1D95',
    width: 152,
    height: 74,
  },
  {
    type: 'manual',
    label: 'Operação manual',
    defaultTitle: 'Ação manual',
    fill: '#FDF2F8',
    stroke: '#BE185D',
    textColor: '#831843',
    width: 180,
    height: 64,
  },
  {
    type: 'delay',
    label: 'Espera',
    defaultTitle: 'Aguardar',
    fill: '#F1F5F9',
    stroke: '#64748B',
    textColor: '#1E293B',
    width: 156,
    height: 58,
  },
  {
    type: 'connector',
    label: 'Conector',
    defaultTitle: 'A',
    fill: '#FFFFFF',
    stroke: '#334155',
    textColor: '#0F172A',
    width: 54,
    height: 54,
  },
  {
    type: 'note',
    label: 'Nota',
    defaultTitle: 'Observação',
    fill: '#FEF9C3',
    stroke: '#CA8A04',
    textColor: '#713F12',
    width: 176,
    height: 72,
  },
];

export const NODE_TYPE_MAP = new Map<FlowchartNodeType, NodeTypeMeta>(
  NODE_TYPE_LIST.map((m) => [m.type, m]),
);

export function getNodeMeta(type: FlowchartNodeType): NodeTypeMeta {
  return NODE_TYPE_MAP.get(type) ?? NODE_TYPE_LIST[2];
}

export function createId(prefix: string): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
  }
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function formatStatusLabel(status: FlowchartStatus): string {
  switch (status) {
    case 'published':
      return 'Publicado';
    case 'review':
      return 'Em revisão';
    default:
      return 'Rascunho';
  }
}

export function formatRoleLabel(role: 'owner' | 'edit' | 'view'): string {
  switch (role) {
    case 'owner':
      return 'Proprietário';
    case 'edit':
      return 'Editor';
    default:
      return 'Leitor';
  }
}

export function formatDateTime(iso?: string | null): string {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

export function computeLaneBounds(
  lanes: FlowchartLane[],
): Array<{ lane: FlowchartLane; top: number; bottom: number }> {
  let y = 0;
  return lanes.map((lane) => {
    const top = y;
    const bottom = y + lane.height;
    y = bottom;
    return { lane, top, bottom };
  });
}

export function findLaneAtY(
  lanes: FlowchartLane[],
  centerY: number,
): FlowchartLane | null {
  const bounds = computeLaneBounds(lanes);
  for (const item of bounds) {
    if (centerY >= item.top && centerY <= item.bottom) {
      return item.lane;
    }
  }
  return lanes[lanes.length - 1] ?? null;
}

export function validateFlowchart(
  nodes: FlowchartNode[],
  edges: FlowchartEdge[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const starts = nodes.filter((n) => n.type === 'start');
  const ends = nodes.filter((n) => n.type === 'end');

  if (starts.length === 0) {
    issues.push({
      id: 'val_no_start',
      severity: 'error',
      message: 'O fluxograma não possui um elemento de Início.',
    });
  }

  if (ends.length === 0) {
    issues.push({
      id: 'val_no_end',
      severity: 'warning',
      message: 'O fluxograma não possui um elemento de Fim.',
    });
  }

  for (const node of nodes) {
    if (node.type === 'note') continue;

    const incoming = edges.filter((e) => e.targetId === node.id);
    const outgoing = edges.filter((e) => e.sourceId === node.id);

    if (node.type === 'start' && outgoing.length === 0) {
      issues.push({
        id: `val_start_out_${node.id}`,
        severity: 'error',
        message: `O início "${node.title}" não possui conexão de saída.`,
        nodeId: node.id,
      });
    }

    if (node.type !== 'start' && incoming.length === 0 && nodes.length > 1) {
      issues.push({
        id: `val_orphan_${node.id}`,
        severity: 'warning',
        message: `"${node.title}" não recebe nenhuma conexão de entrada.`,
        nodeId: node.id,
      });
    }

    if (node.type === 'decision') {
      if (outgoing.length < 2) {
        issues.push({
          id: `val_dec_out_${node.id}`,
          severity: 'warning',
          message: `A decisão "${node.title}" possui menos de 2 caminhos de saída.`,
          nodeId: node.id,
        });
      }
      const unlabeled = outgoing.filter((e) => !e.label?.trim());
      if (unlabeled.length > 0) {
        issues.push({
          id: `val_dec_label_${node.id}`,
          severity: 'warning',
          message: `A decisão "${node.title}" possui saída(s) sem rótulo (ex.: Sim / Não).`,
          nodeId: node.id,
        });
      }
    }
  }

  return issues;
}

export function organizeFlowchart(
  lanes: FlowchartLane[],
  nodes: FlowchartNode[],
  edges: FlowchartEdge[],
): { lanes: FlowchartLane[]; nodes: FlowchartNode[] } {
  const nextLanes = lanes.map((l) => ({ ...l }));
  const nextNodes = nodes.map((n) => ({ ...n }));

  if (nextLanes.length === 0 || nextNodes.length === 0) {
    return { lanes: nextLanes, nodes: nextNodes };
  }

  const outgoing = new Map<string, string[]>();
  const incomingCount = new Map<string, number>();

  for (const n of nextNodes) {
    outgoing.set(n.id, []);
    incomingCount.set(n.id, 0);
  }
  for (const e of edges) {
    outgoing.get(e.sourceId)?.push(e.targetId);
    incomingCount.set(e.targetId, (incomingCount.get(e.targetId) ?? 0) + 1);
  }

  const colOf = new Map<string, number>();
  const queue: string[] = [];

  for (const n of nextNodes) {
    if (n.type === 'start' || (incomingCount.get(n.id) ?? 0) === 0) {
      colOf.set(n.id, 0);
      queue.push(n.id);
    }
  }

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const currCol = colOf.get(curr) ?? 0;
    for (const next of outgoing.get(curr) ?? []) {
      const candidate = currCol + 1;
      const existing = colOf.get(next);
      if (existing === undefined || (candidate > existing && candidate <= nextNodes.length)) {
        colOf.set(next, candidate);
        queue.push(next);
      }
    }
  }

  let fallbackCol = 0;
  for (const n of nextNodes) {
    if (!colOf.has(n.id)) colOf.set(n.id, fallbackCol++);
  }

  const cellGroups = new Map<string, FlowchartNode[]>();
  const maxStackPerLane = new Map<string, number>();

  for (const n of nextNodes) {
    const validLaneId = nextLanes.some((l) => l.id === n.laneId)
      ? n.laneId
      : nextLanes[0].id;
    n.laneId = validLaneId;
    const col = colOf.get(n.id) ?? 0;
    const key = `${validLaneId}::${col}`;
    const list = cellGroups.get(key) ?? [];
    list.push(n);
    cellGroups.set(key, list);
    maxStackPerLane.set(
      validLaneId,
      Math.max(maxStackPerLane.get(validLaneId) ?? 1, list.length),
    );
  }

  const laneTop = new Map<string, number>();
  let cursorY = 0;
  for (const lane of nextLanes) {
    const stack = maxStackPerLane.get(lane.id) ?? 1;
    lane.height = Math.max(200, stack * 124 + 56);
    laneTop.set(lane.id, cursorY);
    cursorY += lane.height;
  }

  const START_X = 92;
  const COL_STEP = 252;

  for (const [key, group] of cellGroups.entries()) {
    const [laneId, colStr] = key.split('::');
    const col = Number(colStr);
    const lane = nextLanes.find((l) => l.id === laneId) ?? nextLanes[0];
    const top = laneTop.get(lane.id) ?? 0;
    const slotH = lane.height / group.length;

    group.forEach((node, idx) => {
      node.x = START_X + col * COL_STEP;
      const centerY = top + slotH * idx + slotH / 2;
      node.y = Math.round(centerY - node.height / 2);
    });
  }

  return { lanes: nextLanes, nodes: nextNodes };
}

export function computeOrthogonalEdgePath(
  source: FlowchartNode,
  target: FlowchartNode,
): {
  path: string;
  labelX: number;
  labelY: number;
} {
  const sx = source.x + source.width;
  const sy = source.y + source.height / 2;
  const tx = target.x;
  const ty = target.y + target.height / 2;

  // Conexão normal da esquerda para a direita
  if (tx >= sx + 22) {
    if (Math.abs(ty - sy) < 6) {
      return {
        path: `M ${sx} ${sy} L ${tx} ${ty}`,
        labelX: (sx + tx) / 2,
        labelY: sy - 10,
      };
    }

    const midX = Math.round(sx + (tx - sx) * 0.48);
    const r = Math.min(10, Math.abs(ty - sy) / 2, Math.abs(midX - sx), Math.abs(tx - midX));
    const dirY = ty > sy ? 1 : -1;

    const path = [
      `M ${sx} ${sy}`,
      `L ${midX - r} ${sy}`,
      `Q ${midX} ${sy} ${midX} ${sy + dirY * r}`,
      `L ${midX} ${ty - dirY * r}`,
      `Q ${midX} ${ty} ${midX + r} ${ty}`,
      `L ${tx} ${ty}`,
    ].join(' ');

    return {
      path,
      labelX: midX,
      labelY: Math.round(sy + (ty - sy) * 0.35),
    };
  }

  // Loop de retorno (destino à esquerda ou sobreposto)
  const outX = sx + 24;
  const inX = tx - 24;
  const loopY =
    ty >= sy
      ? Math.max(source.y + source.height, target.y + target.height) + 34
      : Math.min(source.y, target.y) - 34;

  const path = `M ${sx} ${sy} L ${outX} ${sy} L ${outX} ${loopY} L ${inX} ${loopY} L ${inX} ${ty} L ${tx} ${ty}`;
  return {
    path,
    labelX: Math.round((outX + inX) / 2),
    labelY: loopY - 8,
  };
}
