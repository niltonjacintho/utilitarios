import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { GeminiService } from '../ai/gemini.service';
import { AuthUser } from '../auth/auth.types';
import { SqliteService } from '../database/sqlite.service';
import {
  CreateFlowchartInput,
  FlowchartAccessLevel,
  FlowchartAiSummary,
  FlowchartComment,
  FlowchartEdge,
  FlowchartLane,
  FlowchartNode,
  FlowchartNodeType,
  FlowchartRecord,
  FlowchartStatus,
  FlowchartSummary,
  GenerateFlowchartAiInput,
  UpdateFlowchartInput,
} from './flowchart.types';

interface FlowchartRow {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  tags_json: string;
  status: FlowchartStatus;
  archived: number;
  owner: string;
  background_color: string;
  lanes_json: string;
  nodes_json: string;
  edges_json: string;
  comments_json: string;
  created_at: string;
  updated_at: string;
  shared_permission?: 'view' | 'edit' | null;
}

interface ShareRow {
  id: string;
  target: string;
  permission: 'view' | 'edit';
  created_at: string;
}

interface VersionRow {
  id: string;
  label: string;
  author: string;
  snapshot_json: string;
  created_at: string;
}

interface RawAiFlowchart {
  name?: string;
  description?: string;
  lanes?: Array<{ id?: string; name?: string }>;
  nodes?: Array<{
    id?: string;
    type?: string;
    title?: string;
    description?: string;
    owner?: string;
    trigger?: string;
    lane?: string;
    laneId?: string;
  }>;
  edges?: Array<{
    sourceId?: string;
    targetId?: string;
    from?: string;
    to?: string;
    label?: string;
  }>;
}

const VALID_NODE_TYPES = new Set<FlowchartNodeType>([
  'start',
  'end',
  'process',
  'decision',
  'io',
  'subprocess',
  'document',
  'database',
  'manual',
  'delay',
  'connector',
  'note',
]);

export function getDefaultNodeSize(type: FlowchartNodeType): {
  width: number;
  height: number;
} {
  switch (type) {
    case 'start':
    case 'end':
      return { width: 170, height: 56 };
    case 'decision':
      return { width: 158, height: 96 };
    case 'connector':
      return { width: 54, height: 54 };
    case 'database':
      return { width: 150, height: 72 };
    case 'note':
      return { width: 170, height: 74 };
    default:
      return { width: 184, height: 68 };
  }
}

@Injectable()
export class FlowchartService {
  constructor(
    private readonly sqlite: SqliteService,
    private readonly geminiService: GeminiService,
  ) {}

  list(
    user: AuthUser,
    filters?: {
      scope?: 'mine' | 'shared' | 'archived';
      q?: string;
      status?: string;
    },
  ): FlowchartSummary[] {
    const db = this.sqlite.connection;
    const scope = filters?.scope ?? 'mine';
    const q = filters?.q?.trim().toLowerCase() ?? '';
    const statusFilter = filters?.status?.trim() ?? '';

    const rows = db
      .prepare(
        `SELECT
          f.*,
          COALESCE(u.name, f.owner) AS owner,
          (
            SELECT s.permission
            FROM flowchart_shares s
            WHERE s.flowchart_id = f.id AND LOWER(s.target) = LOWER(?)
            LIMIT 1
          ) AS shared_permission
         FROM flowcharts f
         LEFT JOIN users u ON u.id = f.owner_id
         WHERE (
           f.owner_id = ?
           OR EXISTS (
             SELECT 1 FROM flowchart_shares s
             WHERE s.flowchart_id = f.id AND LOWER(s.target) = LOWER(?)
           )
         )
         ORDER BY f.updated_at DESC`,
      )
      .all(user.email, user.id, user.email) as unknown as FlowchartRow[];

    return rows
      .map((row) => this.toSummary(user, row))
      .filter((item) => {
        if (scope === 'archived') {
          if (!item.archived) return false;
        } else if (scope === 'shared') {
          if (item.archived || item.accessLevel === 'owner') return false;
        } else {
          if (item.archived || item.accessLevel !== 'owner') return false;
        }

        if (statusFilter && statusFilter !== 'all' && item.status !== statusFilter) {
          return false;
        }

        if (q) {
          const hay = [item.name, item.description, item.tags.join(' ')]
            .join(' ')
            .toLowerCase();
          if (!hay.includes(q)) return false;
        }

        return true;
      });
  }

  findById(user: AuthUser, id: string): FlowchartRecord {
    const { row, accessLevel } = this.loadAuthorizedRow(user, id);
    const db = this.sqlite.connection;

    const shares = db
      .prepare(
        'SELECT id, target, permission, created_at FROM flowchart_shares WHERE flowchart_id = ? ORDER BY created_at ASC',
      )
      .all(id) as unknown as ShareRow[];

    const versions = db
      .prepare(
        'SELECT id, label, author, created_at FROM flowchart_versions WHERE flowchart_id = ? ORDER BY created_at DESC',
      )
      .all(id) as unknown as Array<{
      id: string;
      label: string;
      author: string;
      created_at: string;
    }>;

    const lanes = this.safeJson<FlowchartLane[]>(row.lanes_json, []);
    const nodes = this.safeJson<FlowchartNode[]>(row.nodes_json, []);
    const edges = this.safeJson<FlowchartEdge[]>(row.edges_json, []);
    const comments = this.safeJson<FlowchartComment[]>(row.comments_json, []);
    const tags = this.safeJson<string[]>(row.tags_json, []);

    return {
      id: row.id,
      ownerId: row.owner_id,
      name: row.name,
      description: row.description,
      tags,
      status: row.status,
      archived: Boolean(row.archived),
      owner: row.owner,
      accessLevel,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      backgroundColor: row.background_color,
      lanes,
      nodes,
      edges,
      comments,
      shares: shares.map((s) => ({
        id: s.id,
        target: s.target,
        permission: s.permission,
        createdAt: s.created_at,
      })),
      versions: versions.map((v) => ({
        id: v.id,
        label: v.label,
        author: v.author,
        createdAt: v.created_at,
      })),
    };
  }

  create(user: AuthUser, input: CreateFlowchartInput): FlowchartRecord {
    const name = input.name?.trim();
    if (!name) {
      throw new BadRequestException('O nome do fluxograma é obrigatório.');
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const laneId = `lane_${randomUUID().slice(0, 8)}`;

    const lanes: FlowchartLane[] =
      input.lanes && input.lanes.length > 0
        ? input.lanes
        : [{ id: laneId, name: 'Processo Principal', height: 220 }];

    const startId = `start_${randomUUID().slice(0, 8)}`;
    const procId = `proc_${randomUUID().slice(0, 8)}`;
    const endId = `end_${randomUUID().slice(0, 8)}`;

    const nodes: FlowchartNode[] =
      input.nodes && input.nodes.length > 0
        ? input.nodes
        : [
            {
              id: startId,
              type: 'start',
              title: 'Início do processo',
              laneId: lanes[0].id,
              x: 90,
              y: 80,
              width: 170,
              height: 56,
            },
            {
              id: procId,
              type: 'process',
              title: 'Executar etapa inicial',
              owner: user.name,
              laneId: lanes[0].id,
              x: 330,
              y: 74,
              width: 184,
              height: 68,
            },
            {
              id: endId,
              type: 'end',
              title: 'Processo concluído',
              laneId: lanes[0].id,
              x: 590,
              y: 80,
              width: 170,
              height: 56,
            },
          ];

    const edges: FlowchartEdge[] =
      input.edges !== undefined
        ? input.edges
        : [
            { id: `edge_${randomUUID().slice(0, 8)}`, sourceId: startId, targetId: procId },
            { id: `edge_${randomUUID().slice(0, 8)}`, sourceId: procId, targetId: endId },
          ];

    this.sqlite.connection
      .prepare(
        `INSERT INTO flowcharts (
           id, owner_id, name, description, tags_json, status, archived, owner,
           background_color, lanes_json, nodes_json, edges_json, comments_json,
           created_at, updated_at
         )
         VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?, '[]', ?, ?)`,
      )
      .run(
        id,
        user.id,
        name,
        input.description?.trim() ?? '',
        JSON.stringify(input.tags ?? []),
        input.status ?? 'draft',
        user.name,
        input.backgroundColor?.trim() || '#F8FAFC',
        JSON.stringify(lanes),
        JSON.stringify(nodes),
        JSON.stringify(edges),
        now,
        now,
      );

    return this.findById(user, id);
  }

  update(
    user: AuthUser,
    id: string,
    input: UpdateFlowchartInput,
  ): FlowchartRecord {
    const existing = this.findById(user, id);
    if (existing.accessLevel === 'view') {
      throw new ForbiddenException(
        'Você possui permissão apenas de leitura neste fluxograma.',
      );
    }

    const db = this.sqlite.connection;
    const now = new Date().toISOString();

    const name = input.name?.trim() || existing.name;
    const description =
      input.description !== undefined ? input.description : existing.description;
    const tags = Array.isArray(input.tags) ? input.tags : existing.tags;
    const status = input.status ?? existing.status;
    const archived =
      input.archived !== undefined ? (input.archived ? 1 : 0) : existing.archived ? 1 : 0;
    const backgroundColor =
      input.backgroundColor?.trim() || existing.backgroundColor;
    const lanes = Array.isArray(input.lanes) ? input.lanes : existing.lanes;
    const nodes = Array.isArray(input.nodes) ? input.nodes : existing.nodes;
    const edges = Array.isArray(input.edges) ? input.edges : existing.edges;
    const comments = Array.isArray(input.comments)
      ? input.comments
      : existing.comments;

    db.exec('BEGIN');
    try {
      db.prepare(
        `UPDATE flowcharts
         SET name = ?, description = ?, tags_json = ?, status = ?, archived = ?,
             background_color = ?, lanes_json = ?, nodes_json = ?, edges_json = ?,
             comments_json = ?, updated_at = ?
         WHERE id = ?`,
      ).run(
        name,
        description,
        JSON.stringify(tags),
        status,
        archived,
        backgroundColor,
        JSON.stringify(lanes),
        JSON.stringify(nodes),
        JSON.stringify(edges),
        JSON.stringify(comments),
        now,
        id,
      );

      if (Array.isArray(input.shares) && existing.accessLevel === 'owner') {
        db.prepare('DELETE FROM flowchart_shares WHERE flowchart_id = ?').run(id);
        const insertShare = db.prepare(
          'INSERT INTO flowchart_shares (id, flowchart_id, target, permission, created_at) VALUES (?, ?, ?, ?, ?)',
        );
        for (const share of input.shares) {
          const cleanTarget = share.target?.trim();
          if (!cleanTarget) continue;
          insertShare.run(
            share.id || randomUUID(),
            id,
            cleanTarget,
            share.permission === 'view' ? 'view' : 'edit',
            share.createdAt || now,
          );
        }
      }

      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    return this.findById(user, id);
  }

  duplicate(user: AuthUser, id: string): FlowchartRecord {
    const existing = this.findById(user, id);
    return this.create(user, {
      name: `${existing.name} (cópia)`,
      description: existing.description,
      tags: existing.tags,
      status: 'draft',
      backgroundColor: existing.backgroundColor,
      lanes: existing.lanes,
      nodes: existing.nodes,
      edges: existing.edges,
    });
  }

  remove(user: AuthUser, id: string): { deleted: true; id: string } {
    const existing = this.findById(user, id);
    if (existing.accessLevel !== 'owner') {
      throw new ForbiddenException(
        'Apenas o proprietário pode excluir este fluxograma.',
      );
    }

    this.sqlite.connection
      .prepare('DELETE FROM flowcharts WHERE id = ?')
      .run(id);
    return { deleted: true, id };
  }

  createVersion(
    user: AuthUser,
    id: string,
    label?: string,
  ): FlowchartRecord {
    const existing = this.findById(user, id);
    if (existing.accessLevel === 'view') {
      throw new ForbiddenException('Sem permissão para criar versão.');
    }

    const versionId = randomUUID();
    const now = new Date().toISOString();
    const cleanLabel =
      label?.trim() || `Versão ${existing.versions.length + 1}`;
    const snapshot = {
      name: existing.name,
      description: existing.description,
      lanes: existing.lanes,
      nodes: existing.nodes,
      edges: existing.edges,
      backgroundColor: existing.backgroundColor,
    };

    this.sqlite.connection
      .prepare(
        `INSERT INTO flowchart_versions (id, flowchart_id, label, author, snapshot_json, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(versionId, id, cleanLabel, user.name, JSON.stringify(snapshot), now);

    return this.findById(user, id);
  }

  restoreVersion(
    user: AuthUser,
    id: string,
    versionId: string,
  ): FlowchartRecord {
    const existing = this.findById(user, id);
    if (existing.accessLevel === 'view') {
      throw new ForbiddenException('Sem permissão para restaurar versão.');
    }

    const row = this.sqlite.connection
      .prepare(
        'SELECT * FROM flowchart_versions WHERE id = ? AND flowchart_id = ?',
      )
      .get(versionId, id) as unknown as VersionRow | undefined;

    if (!row) {
      throw new NotFoundException('Versão não encontrada.');
    }

    const snapshot = JSON.parse(row.snapshot_json) as {
      name?: string;
      description?: string;
      lanes?: FlowchartLane[];
      nodes?: FlowchartNode[];
      edges?: FlowchartEdge[];
      backgroundColor?: string;
    };

    return this.update(user, id, {
      name: snapshot.name ?? existing.name,
      description: snapshot.description ?? existing.description,
      lanes: snapshot.lanes ?? existing.lanes,
      nodes: snapshot.nodes ?? existing.nodes,
      edges: snapshot.edges ?? existing.edges,
      backgroundColor: snapshot.backgroundColor ?? existing.backgroundColor,
    });
  }

  async generateNewWithAi(
    user: AuthUser,
    input: GenerateFlowchartAiInput,
  ): Promise<FlowchartRecord> {
    const built = await this.generateGraphFromText(input);
    return this.create(user, {
      name: built.name,
      description: built.description,
      lanes: built.lanes,
      nodes: built.nodes,
      edges: built.edges,
    });
  }

  async applyAiToExisting(
    user: AuthUser,
    id: string,
    input: GenerateFlowchartAiInput,
  ): Promise<FlowchartRecord> {
    const existing = this.findById(user, id);
    if (existing.accessLevel === 'view') {
      throw new ForbiddenException(
        'Você possui permissão apenas de leitura neste fluxograma.',
      );
    }

    const built = await this.generateGraphFromText({
      text: input.text,
      title: input.title || existing.name,
    });

    return this.update(user, id, {
      description: built.description || existing.description,
      lanes: built.lanes,
      nodes: built.nodes,
      edges: built.edges,
    });
  }

  async summarizeForExport(
    user: AuthUser,
    id: string,
  ): Promise<FlowchartAiSummary> {
    const chart = this.findById(user, id);

    if (!this.geminiService.isConfigured()) {
      return this.buildFallbackSummary(chart);
    }

    const context = this.serializeFullContext(chart);

    try {
      const result = await this.geminiService.generateJson<{
        overview?: string;
        highlights?: string[];
        attentionPoints?: string[];
      }>({
        prompt: context,
        systemInstruction: [
          'Você é um especialista em modelagem de processos e fluxogramas.',
          'Analise integralmente o fluxograma fornecido — incluindo raias (áreas/atores), etapas, decisões (caminhos Sim/Não), responsáveis, descrições e TODOS os comentários.',
          'Gere um resumo SUCINTO (leitura rápida) em português.',
          'Retorne exclusivamente JSON válido no formato:',
          '{ "overview": "Parágrafo curto de 2 a 3 frases resumindo o objetivo, fluxo principal e áreas envolvidas.", "highlights": ["Até 4 pontos-chave do processo"], "attentionPoints": ["Até 3 pontos de atenção, decisões críticas ou observações dos comentários"] }',
        ].join('\n'),
        temperature: 0.25,
      });

      const overview = result.data?.overview?.trim();
      const highlights = Array.isArray(result.data?.highlights)
        ? result.data.highlights.map((h) => String(h).trim()).filter(Boolean).slice(0, 4)
        : [];
      const attentionPoints = Array.isArray(result.data?.attentionPoints)
        ? result.data.attentionPoints.map((a) => String(a).trim()).filter(Boolean).slice(0, 3)
        : [];

      if (!overview) {
        return this.buildFallbackSummary(chart);
      }

      return {
        overview,
        highlights,
        attentionPoints,
        generatedByAi: true,
        model: result.model,
      };
    } catch {
      return this.buildFallbackSummary(chart);
    }
  }

  private async generateGraphFromText(input: GenerateFlowchartAiInput): Promise<{
    name: string;
    description: string;
    lanes: FlowchartLane[];
    nodes: FlowchartNode[];
    edges: FlowchartEdge[];
  }> {
    const text = input.text?.trim();
    if (!text) {
      throw new BadRequestException(
        'Descreva o processo em texto corrido para a IA gerar o fluxograma.',
      );
    }

    const result = await this.geminiService.generateJson<RawAiFlowchart>({
      prompt: text,
      systemInstruction: [
        'Você é um arquiteto de processos especialista em fluxogramas com raias (swimlanes).',
        'Interprete o texto corrido do usuário e traduza em um fluxograma completo, claro e bem conectado, preservando o idioma do texto.',
        'Identifique as áreas/times/atores como raias (lanes), os eventos de início (start) e fim (end), etapas (process), decisões (decision com saídas rotuladas como "Sim" e "Não" ou condições claras), entradas/saídas (io), documentos (document) e bancos/sistemas (database) quando aplicável.',
        'Retorne EXCLUSIVAMENTE JSON válido no formato:',
        '{',
        '  "name": "Título curto do processo",',
        '  "description": "Resumo breve de 1 frase do processo",',
        '  "lanes": [{ "id": "lane_1", "name": "Nome da área ou ator" }],',
        '  "nodes": [{ "id": "n1", "type": "start|process|decision|end|io|subprocess|document|database|manual|delay", "title": "Texto curto do bloco", "description": "Detalhes opcionais", "owner": "Time ou responsável opcional", "laneId": "lane_1" }],',
        '  "edges": [{ "sourceId": "n1", "targetId": "n2", "label": "Sim ou Não (opcional)" }]',
        '}',
        'Regras obrigatórias:',
        '- Sempre inclua pelo menos 1 nó type="start" e pelo menos 1 nó type="end".',
        '- Todos os nós devem pertencer a um laneId existente em lanes.',
        '- Toda decisão (type="decision") deve ter pelo menos 2 conexões de saída com rótulo claro (ex.: "Sim" e "Não").',
        '- Não deixe nós desconectados.',
      ].join('\n'),
      temperature: 0.25,
    });

    return this.normalizeAndLayoutAiFlowchart(result.data, input.title);
  }

  private normalizeAndLayoutAiFlowchart(
    raw: RawAiFlowchart,
    fallbackTitle?: string,
  ): {
    name: string;
    description: string;
    lanes: FlowchartLane[];
    nodes: FlowchartNode[];
    edges: FlowchartEdge[];
  } {
    const rawLanes = Array.isArray(raw?.lanes) ? raw.lanes : [];
    const laneIdMap = new Map<string, string>();
    const laneNameMap = new Map<string, string>();
    const lanes: FlowchartLane[] = [];

    for (const item of rawLanes) {
      const cleanName = item?.name?.trim();
      if (!cleanName) continue;
      const id = `lane_${randomUUID().slice(0, 8)}`;
      lanes.push({ id, name: cleanName, height: 220 });
      if (item.id) laneIdMap.set(item.id, id);
      laneNameMap.set(cleanName.toLowerCase(), id);
    }

    if (lanes.length === 0) {
      lanes.push({
        id: `lane_${randomUUID().slice(0, 8)}`,
        name: 'Fluxo Principal',
        height: 220,
      });
    }

    const rawNodes = Array.isArray(raw?.nodes) ? raw.nodes : [];
    const nodeIdMap = new Map<string, string>();
    const nodes: FlowchartNode[] = [];

    for (let idx = 0; idx < rawNodes.length; idx++) {
      const item = rawNodes[idx];
      const title = item?.title?.trim();
      if (!title) continue;

      const rawType = (item.type ?? 'process').toLowerCase() as FlowchartNodeType;
      const type: FlowchartNodeType = VALID_NODE_TYPES.has(rawType)
        ? rawType
        : 'process';

      const newId = `${type}_${randomUUID().slice(0, 8)}`;
      if (item.id) nodeIdMap.set(item.id, newId);
      nodeIdMap.set(String(idx + 1), newId);

      let laneId =
        (item.laneId && laneIdMap.get(item.laneId)) ||
        (item.lane && laneNameMap.get(item.lane.trim().toLowerCase())) ||
        lanes[0].id;

      if (!lanes.some((l) => l.id === laneId)) {
        laneId = lanes[0].id;
      }

      const size = getDefaultNodeSize(type);
      nodes.push({
        id: newId,
        type,
        title,
        description: item.description?.trim() || '',
        owner: item.owner?.trim() || '',
        trigger: item.trigger?.trim() || '',
        laneId,
        x: 90,
        y: 80,
        width: size.width,
        height: size.height,
      });
    }

    if (nodes.length === 0) {
      const sId = `start_${randomUUID().slice(0, 8)}`;
      const eId = `end_${randomUUID().slice(0, 8)}`;
      nodes.push(
        {
          id: sId,
          type: 'start',
          title: 'Início',
          laneId: lanes[0].id,
          x: 90,
          y: 80,
          width: 170,
          height: 56,
        },
        {
          id: eId,
          type: 'end',
          title: 'Fim',
          laneId: lanes[0].id,
          x: 340,
          y: 80,
          width: 170,
          height: 56,
        },
      );
    }

    const rawEdges = Array.isArray(raw?.edges) ? raw.edges : [];
    const edges: FlowchartEdge[] = [];
    const edgeSet = new Set<string>();

    for (const item of rawEdges) {
      const srcKey = item?.sourceId ?? item?.from;
      const tgtKey = item?.targetId ?? item?.to;
      if (!srcKey || !tgtKey) continue;

      const sourceId = nodeIdMap.get(srcKey);
      const targetId = nodeIdMap.get(tgtKey);
      if (!sourceId || !targetId || sourceId === targetId) continue;

      const key = `${sourceId}->${targetId}:${item.label ?? ''}`;
      if (edgeSet.has(key)) continue;
      edgeSet.add(key);

      edges.push({
        id: `edge_${randomUUID().slice(0, 8)}`,
        sourceId,
        targetId,
        label: item.label?.trim() || undefined,
      });
    }

    // Auto-layout limpo da esquerda para a direita respeitando as raias
    this.autoLayoutGraph(lanes, nodes, edges);

    return {
      name:
        fallbackTitle?.trim() ||
        raw?.name?.trim() ||
        'Fluxograma gerado com IA',
      description: raw?.description?.trim() || '',
      lanes,
      nodes,
      edges,
    };
  }

  private autoLayoutGraph(
    lanes: FlowchartLane[],
    nodes: FlowchartNode[],
    edges: FlowchartEdge[],
  ): void {
    const outgoing = new Map<string, string[]>();
    const incomingCount = new Map<string, number>();

    for (const n of nodes) {
      outgoing.set(n.id, []);
      incomingCount.set(n.id, 0);
    }
    for (const e of edges) {
      outgoing.get(e.sourceId)?.push(e.targetId);
      incomingCount.set(e.targetId, (incomingCount.get(e.targetId) ?? 0) + 1);
    }

    const colOf = new Map<string, number>();
    const queue: string[] = [];

    for (const n of nodes) {
      if (n.type === 'start' || (incomingCount.get(n.id) ?? 0) === 0) {
        colOf.set(n.id, 0);
        queue.push(n.id);
      }
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      const currCol = colOf.get(current) ?? 0;
      for (const next of outgoing.get(current) ?? []) {
        const candidateCol = currCol + 1;
        const prevCol = colOf.get(next);
        if (prevCol === undefined || (candidateCol > prevCol && candidateCol <= nodes.length)) {
          colOf.set(next, candidateCol);
          queue.push(next);
        }
      }
    }

    let fallbackCol = 0;
    for (const n of nodes) {
      if (!colOf.has(n.id)) {
        colOf.set(n.id, fallbackCol++);
      }
    }

    // Agrupa por (laneId, col) para empilhar verticalmente sem sobreposição
    const cellGroups = new Map<string, FlowchartNode[]>();
    const maxStackPerLane = new Map<string, number>();

    for (const n of nodes) {
      const col = colOf.get(n.id) ?? 0;
      const cellKey = `${n.laneId}::${col}`;
      const list = cellGroups.get(cellKey) ?? [];
      list.push(n);
      cellGroups.set(cellKey, list);
      maxStackPerLane.set(
        n.laneId,
        Math.max(maxStackPerLane.get(n.laneId) ?? 1, list.length),
      );
    }

    // Ajusta altura das raias conforme empilhamento
    const laneTop = new Map<string, number>();
    let cursorY = 0;
    for (const lane of lanes) {
      const rows = maxStackPerLane.get(lane.id) ?? 1;
      lane.height = Math.max(200, rows * 124 + 56);
      laneTop.set(lane.id, cursorY);
      cursorY += lane.height;
    }

    const START_X = 96;
    const COL_STEP = 256;

    for (const [cellKey, group] of cellGroups.entries()) {
      const [laneId, colStr] = cellKey.split('::');
      const col = Number(colStr);
      const lane = lanes.find((l) => l.id === laneId) ?? lanes[0];
      const top = laneTop.get(lane.id) ?? 0;
      const slotHeight = lane.height / group.length;

      group.forEach((node, idx) => {
        node.x = START_X + col * COL_STEP;
        const centerY = top + slotHeight * idx + slotHeight / 2;
        node.y = Math.round(centerY - node.height / 2);
      });
    }
  }

  private loadAuthorizedRow(
    user: AuthUser,
    id: string,
  ): { row: FlowchartRow; accessLevel: FlowchartAccessLevel } {
    const db = this.sqlite.connection;
    const row = db
      .prepare(
        `SELECT f.*, COALESCE(u.name, f.owner) AS owner
         FROM flowcharts f
         LEFT JOIN users u ON u.id = f.owner_id
         WHERE f.id = ?`,
      )
      .get(id) as unknown as FlowchartRow | undefined;

    if (!row) {
      throw new NotFoundException(`Fluxograma "${id}" não encontrado.`);
    }

    if (row.owner_id === user.id) {
      return { row, accessLevel: 'owner' };
    }

    const share = db
      .prepare(
        `SELECT permission FROM flowchart_shares
         WHERE flowchart_id = ? AND LOWER(target) = LOWER(?)
         LIMIT 1`,
      )
      .get(id, user.email) as { permission: 'view' | 'edit' } | undefined;

    if (!share) {
      throw new ForbiddenException(
        'Você não tem permissão para acessar este fluxograma.',
      );
    }

    return {
      row,
      accessLevel: share.permission === 'view' ? 'view' : 'edit',
    };
  }

  private toSummary(user: AuthUser, row: FlowchartRow): FlowchartSummary {
    const nodes = this.safeJson<FlowchartNode[]>(row.nodes_json, []);
    const edges = this.safeJson<FlowchartEdge[]>(row.edges_json, []);
    const tags = this.safeJson<string[]>(row.tags_json, []);
    const accessLevel: FlowchartAccessLevel =
      row.owner_id === user.id
        ? 'owner'
        : row.shared_permission === 'view'
          ? 'view'
          : 'edit';

    return {
      id: row.id,
      ownerId: row.owner_id,
      name: row.name,
      description: row.description,
      tags,
      status: row.status,
      archived: Boolean(row.archived),
      owner: row.owner,
      accessLevel,
      nodeCount: nodes.length,
      edgeCount: edges.length,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  private serializeFullContext(chart: FlowchartRecord): string {
    const laneMap = new Map(chart.lanes.map((l) => [l.id, l.name]));
    const nodeMap = new Map(chart.nodes.map((n) => [n.id, n.title]));
    const lines: string[] = [
      `Fluxograma: "${chart.name}"`,
      `Estado: ${chart.status}`,
      `Proprietário: ${chart.owner}`,
      chart.description ? `Descrição: ${chart.description}` : '',
      `Raias (${chart.lanes.length}): ${chart.lanes.map((l) => l.name).join(', ')}`,
      '',
      `Elementos (${chart.nodes.length}):`,
    ].filter(Boolean);

    for (const n of chart.nodes) {
      const laneName = laneMap.get(n.laneId) ?? 'Geral';
      const meta = [
        `tipo=${n.type}`,
        `raia=${laneName}`,
        n.owner ? `owner=${n.owner}` : '',
        n.trigger ? `gatilho=${n.trigger}` : '',
      ]
        .filter(Boolean)
        .join(' | ');
      lines.push(`- ${n.title} [${meta}]`);
      if (n.description?.trim()) {
        lines.push(`  Descrição: ${n.description.trim()}`);
      }
    }

    lines.push('', `Conexões (${chart.edges.length}):`);
    for (const e of chart.edges) {
      const from = nodeMap.get(e.sourceId) ?? e.sourceId;
      const to = nodeMap.get(e.targetId) ?? e.targetId;
      lines.push(`- ${from} -> ${to}${e.label ? ` [${e.label}]` : ''}`);
    }

    if (chart.comments.length > 0) {
      lines.push('', `Comentários (${chart.comments.length}):`);
      for (const c of chart.comments) {
        const ref = c.nodeId ? ` (sobre "${nodeMap.get(c.nodeId) ?? c.nodeId}")` : '';
        lines.push(`- ${c.author}${ref}: ${c.text}`);
      }
    }

    return lines.join('\n');
  }

  private buildFallbackSummary(chart: FlowchartRecord): FlowchartAiSummary {
    const decisions = chart.nodes.filter((n) => n.type === 'decision');
    const overview = `O fluxograma "${chart.name}" modela ${chart.nodes.length} elemento(s) e ${chart.edges.length} conexão(ões) distribuídos em ${chart.lanes.length} raia(s) (${chart.lanes.map((l) => l.name).join(', ')}), com ${chart.comments.length} comentário(s) registrados.`;

    const highlights = chart.lanes
      .slice(0, 4)
      .map((lane) => {
        const count = chart.nodes.filter((n) => n.laneId === lane.id).length;
        return `Raia "${lane.name}": ${count} elemento(s) mapeado(s).`;
      });

    const attentionPoints: string[] = [];
    for (const d of decisions.slice(0, 2)) {
      attentionPoints.push(`Ponto de decisão: "${d.title}".`);
    }
    for (const c of chart.comments.slice(0, 2)) {
      attentionPoints.push(`Comentário (${c.author}): "${c.text}"`);
    }
    if (attentionPoints.length === 0) {
      attentionPoints.push('Nenhuma pendência crítica registrada nos comentários.');
    }

    return {
      overview,
      highlights,
      attentionPoints: attentionPoints.slice(0, 3),
      generatedByAi: false,
    };
  }

  private safeJson<T>(raw: string, fallback: T): T {
    try {
      return JSON.parse(raw) as T;
    } catch {
      return fallback;
    }
  }
}
