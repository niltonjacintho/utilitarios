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
  CreateMindMapInput,
  ExpandNodeAiInput,
  GenerateMindMapAiInput,
  MindMapAccessLevel,
  MindMapAiSummary,
  MindMapNode,
  MindMapRecord,
  MindMapSummary,
  UpdateMindMapInput,
} from './mindmap.types';

interface MindMapRow {
  id: string;
  owner_id: string;
  name: string;
  owner: string;
  background_color: string;
  nodes_json: string;
  item_count: number;
  completed_count: number;
  created_at: string;
  updated_at: string;
  shared_permission?: 'view' | 'edit' | null;
}

interface ExecutorRow {
  id: string;
  name: string;
  created_at: string;
}

interface ShareRow {
  id: string;
  target: string;
  permission: 'view' | 'edit';
  created_at: string;
}

interface RawAiNode {
  text?: string;
  notes?: string;
  children?: RawAiNode[];
}

@Injectable()
export class MindMapService {
  constructor(
    private readonly sqlite: SqliteService,
    private readonly geminiService: GeminiService,
  ) {}

  list(user: AuthUser, search?: string): MindMapSummary[] {
    const db = this.sqlite.connection;
    const trimmed = search?.trim();

    const baseQuery = `
      SELECT
        m.id,
        m.owner_id,
        m.name,
        COALESCE(u.name, m.owner) AS owner,
        m.item_count,
        m.completed_count,
        m.created_at,
        m.updated_at,
        (
          SELECT s.permission
          FROM mindmap_shares s
          WHERE s.mindmap_id = m.id AND LOWER(s.target) = LOWER(?)
          LIMIT 1
        ) AS shared_permission
      FROM mindmaps m
      LEFT JOIN users u ON u.id = m.owner_id
      WHERE (
        m.owner_id = ?
        OR EXISTS (
          SELECT 1 FROM mindmap_shares s
          WHERE s.mindmap_id = m.id AND LOWER(s.target) = LOWER(?)
        )
      )
      ${trimmed ? 'AND LOWER(m.name) LIKE LOWER(?)' : ''}
      ORDER BY m.updated_at DESC
    `;

    const rows = (
      trimmed
        ? db
            .prepare(baseQuery)
            .all(user.email, user.id, user.email, `%${trimmed}%`)
        : db.prepare(baseQuery).all(user.email, user.id, user.email)
    ) as unknown as MindMapRow[];

    return rows.map((row) => ({
      id: row.id,
      ownerId: row.owner_id,
      name: row.name,
      owner: row.owner,
      accessLevel: this.resolveAccessLevel(user, row.owner_id, row.shared_permission),
      itemCount: row.item_count,
      completedCount: row.completed_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  }

  findById(user: AuthUser, id: string): MindMapRecord {
    const { row, accessLevel } = this.loadAuthorizedRow(user, id);
    const db = this.sqlite.connection;

    const executors = db
      .prepare(
        'SELECT id, name, created_at FROM mindmap_executors WHERE mindmap_id = ? ORDER BY created_at ASC',
      )
      .all(id) as unknown as ExecutorRow[];

    const shares = db
      .prepare(
        'SELECT id, target, permission, created_at FROM mindmap_shares WHERE mindmap_id = ? ORDER BY created_at ASC',
      )
      .all(id) as unknown as ShareRow[];

    return {
      id: row.id,
      ownerId: row.owner_id,
      name: row.name,
      owner: row.owner,
      accessLevel,
      backgroundColor: row.background_color,
      itemCount: row.item_count,
      completedCount: row.completed_count,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      root: JSON.parse(row.nodes_json) as MindMapNode,
      executors: executors.map((item) => ({
        id: item.id,
        name: item.name,
        createdAt: item.created_at,
      })),
      shares: shares.map((item) => ({
        id: item.id,
        target: item.target,
        permission: item.permission,
        createdAt: item.created_at,
      })),
    };
  }

  create(user: AuthUser, input: CreateMindMapInput): MindMapRecord {
    const name = input.name?.trim();
    if (!name) {
      throw new BadRequestException('O nome do mapa é obrigatório.');
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const backgroundColor = input.backgroundColor?.trim() || '#F8FAFC';

    const root: MindMapNode = input.root ?? {
      id: randomUUID(),
      text: name,
      completed: false,
      children: [
        {
          id: randomUUID(),
          text: 'Tópico principal',
          completed: false,
          children: [],
        },
      ],
    };

    const stats = this.computeStats(root);

    this.sqlite.connection
      .prepare(
        `INSERT INTO mindmaps (id, owner_id, name, owner, background_color, nodes_json, item_count, completed_count, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        user.id,
        name,
        user.name,
        backgroundColor,
        JSON.stringify(root),
        stats.itemCount,
        stats.completedCount,
        now,
        now,
      );

    return this.findById(user, id);
  }

  update(user: AuthUser, id: string, input: UpdateMindMapInput): MindMapRecord {
    const existing = this.findById(user, id);
    if (existing.accessLevel === 'view') {
      throw new ForbiddenException(
        'Você possui permissão apenas de leitura neste mapa.',
      );
    }

    const db = this.sqlite.connection;
    const name = input.name?.trim() || existing.name;
    const backgroundColor =
      input.backgroundColor?.trim() || existing.backgroundColor;
    const root = input.root ?? existing.root;
    const stats = this.computeStats(root);
    const now = new Date().toISOString();

    db.exec('BEGIN');
    try {
      db.prepare(
        `UPDATE mindmaps
         SET name = ?, background_color = ?, nodes_json = ?, item_count = ?, completed_count = ?, updated_at = ?
         WHERE id = ?`,
      ).run(
        name,
        backgroundColor,
        JSON.stringify(root),
        stats.itemCount,
        stats.completedCount,
        now,
        id,
      );

      if (Array.isArray(input.executors)) {
        db.prepare('DELETE FROM mindmap_executors WHERE mindmap_id = ?').run(id);
        const insertExecutor = db.prepare(
          'INSERT INTO mindmap_executors (id, mindmap_id, name, created_at) VALUES (?, ?, ?, ?)',
        );
        for (const executor of input.executors) {
          const cleanName = executor.name?.trim();
          if (!cleanName) continue;
          insertExecutor.run(
            executor.id || randomUUID(),
            id,
            cleanName,
            executor.createdAt || now,
          );
        }
      }

      if (Array.isArray(input.shares) && existing.accessLevel === 'owner') {
        db.prepare('DELETE FROM mindmap_shares WHERE mindmap_id = ?').run(id);
        const insertShare = db.prepare(
          'INSERT INTO mindmap_shares (id, mindmap_id, target, permission, created_at) VALUES (?, ?, ?, ?, ?)',
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

  duplicate(user: AuthUser, id: string): MindMapRecord {
    const existing = this.findById(user, id);
    const clonedRoot = this.cloneWithFreshIds(existing.root);
    const copy = this.create(user, {
      name: `${existing.name} (cópia)`,
      backgroundColor: existing.backgroundColor,
      root: clonedRoot,
    });

    if (existing.executors.length > 0) {
      return this.update(user, copy.id, {
        executors: existing.executors.map((e) => ({
          ...e,
          id: randomUUID(),
        })),
      });
    }

    return copy;
  }

  remove(user: AuthUser, id: string): { deleted: true; id: string } {
    const existing = this.findById(user, id);
    if (existing.accessLevel !== 'owner') {
      throw new ForbiddenException(
        'Apenas o proprietário pode excluir este mapa.',
      );
    }

    this.sqlite.connection
      .prepare('DELETE FROM mindmaps WHERE id = ?')
      .run(id);
    return { deleted: true, id };
  }

  async generateWithAi(
    user: AuthUser,
    input: GenerateMindMapAiInput,
  ): Promise<MindMapRecord> {
    const text = input.text?.trim();
    if (!text) {
      throw new BadRequestException(
        'Informe um texto para gerar o mapa mental com IA.',
      );
    }

    const result = await this.geminiService.generateJson<{
      name?: string;
      root?: RawAiNode;
    }>({
      prompt: text,
      systemInstruction: [
        'Você é um especialista em mapas mentais.',
        'Traduza o texto fornecido em um mapa mental hierárquico rico, objetivo e bem organizado no mesmo idioma do texto de entrada.',
        'Retorne exclusivamente JSON válido no seguinte formato:',
        '{ "name": "Título curto do mapa", "root": { "text": "Nó central", "notes": "resumo opcional", "children": [ { "text": "Ramo 1", "notes": "opcional", "children": [ { "text": "Subtópico", "children": [] } ] } ] } }',
        'Crie entre 3 e 7 ramos principais no nível 1 e sub-ramos quando fizer sentido.',
      ].join('\n'),
      temperature: 0.3,
    });

    const mapName =
      input.title?.trim() ||
      result.data?.name?.trim() ||
      result.data?.root?.text?.trim() ||
      'Mapa gerado com IA';

    const normalizedRoot = this.normalizeAiNode(
      result.data?.root ?? { text: mapName, children: [] },
      mapName,
    );

    return this.create(user, {
      name: mapName,
      root: normalizedRoot,
    });
  }

  async explainWithAi(
    user: AuthUser,
    id: string,
  ): Promise<{ explanation: string; model: string }> {
    const map = this.findById(user, id);
    const fullContext = this.serializeFullContext(map);

    const result = await this.geminiService.generateText({
      prompt: fullContext,
      systemInstruction: [
        'Você é um analista sênior explicando um mapa mental para a equipe.',
        'Considere TODAS as informações: nós, hierarquia, notas, status, executores, prazos e TODOS os comentários.',
        'Produza uma explicação clara e estruturada em português contendo:',
        '1. Visão geral (objetivo principal do mapa)',
        '2. Principais frentes / temas',
        '3. Pontos de atenção, pendências (inclusive dos comentários) e próximos passos sugeridos',
        'Seja conciso, direto e use marcadores bem organizados.',
      ].join('\n'),
      temperature: 0.3,
    });

    return {
      explanation: result.text,
      model: result.model,
    };
  }

  async summarizeForExport(
    user: AuthUser,
    id: string,
  ): Promise<MindMapAiSummary> {
    const map = this.findById(user, id);

    if (!this.geminiService.isConfigured()) {
      return this.buildFallbackSummary(map);
    }

    const fullContext = this.serializeFullContext(map);

    try {
      const result = await this.geminiService.generateJson<{
        overview?: string;
        highlights?: string[];
        attentionPoints?: string[];
      }>({
        prompt: fullContext,
        systemInstruction: [
          'Você é um especialista em síntese executiva.',
          'Analise integralmente o mapa mental fornecido — incluindo estrutura hierárquica, notas, status de conclusão, executores, prazos e TODOS os comentários registrados nos nós.',
          'Gere um resumo SUCINTO (não muito longo, leitura rápida de 20 segundos) em português.',
          'Retorne exclusivamente JSON válido no formato:',
          '{ "overview": "Parágrafo único e direto de 2 a 3 frases sintetizando o objetivo e o estado atual do mapa.", "highlights": ["Até 4 destaques curtos e concretos"], "attentionPoints": ["Até 3 pendências, riscos ou ações relevantes extraídas dos itens, notas e comentários"] }',
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
        return this.buildFallbackSummary(map);
      }

      return {
        overview,
        highlights,
        attentionPoints,
        generatedByAi: true,
        model: result.model,
      };
    } catch {
      return this.buildFallbackSummary(map);
    }
  }

  async expandNodeWithAi(
    user: AuthUser,
    id: string,
    input: ExpandNodeAiInput,
  ): Promise<{ children: MindMapNode[]; model: string }> {
    const map = this.findById(user, id);
    if (map.accessLevel === 'view') {
      throw new ForbiddenException(
        'Você possui permissão apenas de leitura neste mapa.',
      );
    }

    const targetNode = this.findNodeById(map.root, input.nodeId);
    if (!targetNode) {
      throw new NotFoundException(`Item "${input.nodeId}" não encontrado no mapa.`);
    }

    const outline = this.serializeOutline(map.root, 0);
    const extraContext = input.instruction?.trim()
      ? `\nInstrução adicional: ${input.instruction.trim()}`
      : '';

    const result = await this.geminiService.generateJson<{
      children?: RawAiNode[];
    }>({
      prompt: `Contexto do mapa "${map.name}":\n${outline}\n\nItem a expandir: "${targetNode.text}"${
        targetNode.notes ? `\nNotas do item: ${targetNode.notes}` : ''
      }${extraContext}`,
      systemInstruction: [
        'Sugira de 3 a 5 sub-itens objetivos e práticos como filhos do item solicitado, sem repetir filhos já existentes.',
        'Retorne exclusivamente JSON válido no formato:',
        '{ "children": [ { "text": "Sub-item", "notes": "breve observação opcional", "children": [] } ] }',
      ].join('\n'),
      temperature: 0.4,
    });

    const rawChildren = Array.isArray(result.data?.children)
      ? result.data.children
      : [];

    const children = rawChildren
      .filter((item) => Boolean(item?.text?.trim()))
      .map((item) => this.normalizeAiNode(item, 'Novo sub-item'));

    return {
      children,
      model: result.model,
    };
  }

  private loadAuthorizedRow(
    user: AuthUser,
    id: string,
  ): { row: MindMapRow; accessLevel: MindMapAccessLevel } {
    const db = this.sqlite.connection;
    const row = db
      .prepare(
        `SELECT m.*, COALESCE(u.name, m.owner) AS owner
         FROM mindmaps m
         LEFT JOIN users u ON u.id = m.owner_id
         WHERE m.id = ?`,
      )
      .get(id) as unknown as MindMapRow | undefined;

    if (!row) {
      throw new NotFoundException(`Mapa "${id}" não encontrado.`);
    }

    if (row.owner_id === user.id) {
      return { row, accessLevel: 'owner' };
    }

    const share = db
      .prepare(
        `SELECT permission FROM mindmap_shares
         WHERE mindmap_id = ? AND LOWER(target) = LOWER(?)
         LIMIT 1`,
      )
      .get(id, user.email) as { permission: 'view' | 'edit' } | undefined;

    if (!share) {
      throw new ForbiddenException('Você não tem permissão para acessar este mapa.');
    }

    return {
      row,
      accessLevel: share.permission === 'view' ? 'view' : 'edit',
    };
  }

  private resolveAccessLevel(
    user: AuthUser,
    ownerId: string,
    sharedPermission?: 'view' | 'edit' | null,
  ): MindMapAccessLevel {
    if (ownerId === user.id) return 'owner';
    return sharedPermission === 'view' ? 'view' : 'edit';
  }

  private computeStats(node: MindMapNode): {
    itemCount: number;
    completedCount: number;
  } {
    let itemCount = 1;
    let completedCount = node.completed ? 1 : 0;

    for (const child of node.children ?? []) {
      const childStats = this.computeStats(child);
      itemCount += childStats.itemCount;
      completedCount += childStats.completedCount;
    }

    return { itemCount, completedCount };
  }

  private cloneWithFreshIds(node: MindMapNode): MindMapNode {
    return {
      ...node,
      id: randomUUID(),
      comments: (node.comments ?? []).map((comment) => ({
        ...comment,
        id: randomUUID(),
      })),
      children: (node.children ?? []).map((child) =>
        this.cloneWithFreshIds(child),
      ),
    };
  }

  private normalizeAiNode(raw: RawAiNode, fallbackText: string): MindMapNode {
    return {
      id: randomUUID(),
      text: raw.text?.trim() || fallbackText,
      notes: raw.notes?.trim() || undefined,
      completed: false,
      comments: [],
      children: Array.isArray(raw.children)
        ? raw.children
            .filter((child) => Boolean(child?.text?.trim()))
            .map((child) => this.normalizeAiNode(child, 'Item'))
        : [],
    };
  }

  private findNodeById(
    node: MindMapNode,
    targetId: string,
  ): MindMapNode | null {
    if (node.id === targetId) {
      return node;
    }
    for (const child of node.children ?? []) {
      const found = this.findNodeById(child, targetId);
      if (found) return found;
    }
    return null;
  }

  private serializeFullContext(map: MindMapRecord): string {
    const executorById = new Map(map.executors.map((e) => [e.id, e.name]));
    const lines: string[] = [
      `Mapa mental: "${map.name}"`,
      `Proprietário: ${map.owner}`,
      `Total de itens: ${map.itemCount}`,
      `Tarefas concluídas: ${map.completedCount}`,
    ];

    if (map.executors.length > 0) {
      lines.push(
        `Executores cadastrados: ${map.executors.map((e) => e.name).join(', ')}`,
      );
    }

    lines.push('', 'Estrutura detalhada (incluindo notas e comentários):');

    const walk = (node: MindMapNode, depth: number) => {
      const indent = '  '.repeat(depth);
      const tags: string[] = [];
      if (node.completed) tags.push('concluído');
      const execName = node.executorId ? executorById.get(node.executorId) : null;
      if (execName) tags.push(`executor: ${execName}`);
      if (node.dueDate) tags.push(`prazo: ${node.dueDate}`);
      const tagStr = tags.length > 0 ? ` [${tags.join(' | ')}]` : '';

      lines.push(`${indent}- ${node.text}${tagStr}`);
      if (node.notes?.trim()) {
        lines.push(`${indent}  Nota: ${node.notes.trim()}`);
      }
      if (node.comments && node.comments.length > 0) {
        for (const c of node.comments) {
          lines.push(
            `${indent}  Comentário (${c.author}): ${c.text.trim()}`,
          );
        }
      }
      for (const child of node.children ?? []) {
        walk(child, depth + 1);
      }
    };

    walk(map.root, 0);
    return lines.join('\n');
  }

  private buildFallbackSummary(map: MindMapRecord): MindMapAiSummary {
    const topBranches = (map.root.children ?? [])
      .slice(0, 4)
      .map((child) => child.text);

    let totalComments = 0;
    let totalNotes = 0;
    const recentComments: string[] = [];

    const walk = (node: MindMapNode) => {
      if (node.notes?.trim()) totalNotes += 1;
      for (const c of node.comments ?? []) {
        totalComments += 1;
        if (recentComments.length < 3) {
          recentComments.push(`${node.text}: "${c.text.trim()}" (${c.author})`);
        }
      }
      for (const child of node.children ?? []) walk(child);
    };
    walk(map.root);

    const pending = Math.max(0, map.itemCount - map.completedCount);
    const overview = `O mapa "${map.name}" reúne ${map.itemCount} itens organizados em ${map.root.children.length} frente(s) principal(is), com ${map.completedCount} tarefa(s) concluída(s), ${totalNotes} nota(s) detalhada(s) e ${totalComments} comentário(s) registrados.`;

    const highlights =
      topBranches.length > 0
        ? topBranches.map((branch) => `Frente mapeada: ${branch}`)
        : ['Estrutura inicial pronta para expansão de tópicos.'];

    const attentionPoints =
      recentComments.length > 0
        ? recentComments
        : pending > 0
          ? [`${pending} item(ns) ainda em aberto para acompanhamento.`]
          : ['Todas as tarefas do mapa foram concluídas.'];

    return {
      overview,
      highlights,
      attentionPoints,
      generatedByAi: false,
    };
  }

  private serializeOutline(node: MindMapNode, depth: number): string {
    const indent = '  '.repeat(depth);
    const status = node.completed ? '[concluído] ' : '';
    const noteSuffix = node.notes ? ` (Nota: ${node.notes})` : '';
    const lines = [`${indent}- ${status}${node.text}${noteSuffix}`];
    for (const child of node.children ?? []) {
      lines.push(this.serializeOutline(child, depth + 1));
    }
    return lines.join('\n');
  }
}
