import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { GeminiService } from '../ai/gemini.service';
import { AuthUser } from '../auth/auth.types';
import { DatabaseService } from '../database/database.service';
import { DbIntrospectorService } from './db-introspector.service';
import {
  formatColumnType,
  generateAddRelationSql,
  generateCreateTableSql,
  parseDdlScript,
} from './ddl.util';
import {
  CreateErProjectInput,
  DbDialect,
  ErAccessLevel,
  ErAiOperation,
  ErAiPlanResponse,
  ErAiSummary,
  ErColumn,
  ErDbConnectionConfig,
  ErDbConnectionTestInput,
  ErHistoryEntry,
  ErPendingChange,
  ErProjectRecord,
  ErProjectSummary,
  ErRelation,
  ErSubModel,
  ErTable,
  UpdateErProjectInput,
} from './erstudio.types';

interface ErProjectRow {
  id: string;
  owner_id: string;
  name: string;
  description: string;
  dialect: DbDialect;
  owner: string;
  tables_json: string;
  relations_json: string;
  submodels_json: string;
  active_submodel_id: string;
  db_config_json: string | null;
  pending_changes_json: string;
  history_json: string;
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

@Injectable()
export class ErStudioService {
  constructor(
    private readonly db: DatabaseService,
    private readonly geminiService: GeminiService,
    private readonly introspector: DbIntrospectorService,
  ) {}

  async listUsersForSharing(currentUser: AuthUser): Promise<
    Array<{
      id: string;
      name: string;
      email: string;
    }>
  > {
    return this.db.queryAll<{ id: string; name: string; email: string }>(
      'SELECT id, name, email FROM users WHERE id != ? ORDER BY name ASC',
      [currentUser.id],
    );
  }

  async list(
    user: AuthUser,
    filters?: {
      scope?: 'all' | 'mine' | 'shared';
      q?: string;
      sort?: 'recent' | 'name';
    },
  ): Promise<ErProjectSummary[]> {
    const scope = filters?.scope ?? 'all';
    const q = filters?.q?.trim().toLowerCase() ?? '';
    const sort = filters?.sort ?? 'recent';

    const rows = await this.db.queryAll<ErProjectRow>(
      `SELECT
         p.*,
         COALESCE(u.name, p.owner) AS owner,
         (
           SELECT s.permission FROM er_project_shares s
           WHERE s.project_id = p.id AND LOWER(s.target) = LOWER(?)
           LIMIT 1
         ) AS shared_permission
       FROM er_projects p
       LEFT JOIN users u ON u.id = p.owner_id
       WHERE (
         p.owner_id = ?
         OR EXISTS (
           SELECT 1 FROM er_project_shares s
           WHERE s.project_id = p.id AND LOWER(s.target) = LOWER(?)
         )
       )
       ORDER BY ${sort === 'name' ? 'LOWER(p.name) ASC' : 'p.updated_at DESC'}`,
      [user.email, user.id, user.email],
    );

    const summaries: ErProjectSummary[] = await Promise.all(
      rows.map(async (row) => {
        const shareRows = await this.db.queryAll<{ target: string }>(
          'SELECT target FROM er_project_shares WHERE project_id = ?',
          [row.id],
        );
        const tables = this.safeJson<ErTable[]>(row.tables_json, []);
        const subModels = this.safeJson<ErSubModel[]>(row.submodels_json, []);
        const accessLevel: ErAccessLevel =
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
          dialect: row.dialect,
          owner: row.owner,
          accessLevel,
          subModelCount: subModels.length,
          tableCount: tables.length,
          sharedWith: shareRows.map((s) => s.target),
          createdAt: row.created_at,
          updatedAt: row.updated_at,
        };
      }),
    );

    return summaries.filter((item) => {
      if (scope === 'mine' && item.accessLevel !== 'owner') return false;
      if (scope === 'shared' && item.accessLevel === 'owner') return false;
      if (q) {
        const hay = `${item.name} ${item.description} ${item.dialect}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }

  async findById(user: AuthUser, id: string): Promise<ErProjectRecord> {
    const { row, accessLevel } = await this.loadAuthorizedRow(user, id);
    const shares = await this.db.queryAll<ShareRow>(
      'SELECT id, target, permission, created_at FROM er_project_shares WHERE project_id = ? ORDER BY created_at ASC',
      [id],
    );

    const tables = this.safeJson<ErTable[]>(row.tables_json, []);
    const relations = this.safeJson<ErRelation[]>(row.relations_json, []);
    const subModels = this.safeJson<ErSubModel[]>(row.submodels_json, []);
    const dbConfig = row.db_config_json
      ? this.safeJson<ErDbConnectionConfig | null>(row.db_config_json, null)
      : null;
    const pendingChanges = this.safeJson<ErPendingChange[]>(
      row.pending_changes_json,
      [],
    );
    const history = this.safeJson<ErHistoryEntry[]>(row.history_json, []);

    return {
      id: row.id,
      ownerId: row.owner_id,
      name: row.name,
      description: row.description,
      dialect: row.dialect,
      owner: row.owner,
      accessLevel,
      subModelCount: subModels.length,
      tableCount: tables.length,
      sharedWith: shares.map((s) => s.target),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      tables,
      relations,
      subModels,
      activeSubModelId:
        row.active_submodel_id || subModels[0]?.id || '',
      dbConfig,
      pendingChanges,
      history,
      shares: shares.map((s) => ({
        id: s.id,
        target: s.target,
        permission: s.permission,
        createdAt: s.created_at,
      })),
    };
  }

  async create(
    user: AuthUser,
    input: CreateErProjectInput,
  ): Promise<ErProjectRecord> {
    const name = input.name?.trim();
    if (!name) {
      throw new BadRequestException('O nome do projeto é obrigatório.');
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const dialect: DbDialect = input.dialect ?? 'postgresql';

    let tables: ErTable[] = [];
    let relations: ErRelation[] = [];

    if (input.ddl?.trim()) {
      const parsed = parseDdlScript(input.ddl);
      tables = parsed.tables;
      relations = parsed.relations;
    }

    const mainSubId = `sub_${randomUUID().slice(0, 8)}`;
    const positions: Record<string, { x: number; y: number }> = {};
    tables.forEach((t, idx) => {
      positions[t.id] = {
        x: 70 + (idx % 3) * 340,
        y: 60 + Math.floor(idx / 3) * 280,
      };
    });

    const subModels: ErSubModel[] = [
      {
        id: mainSubId,
        name: 'Principal',
        tableIds: tables.slice(0, 12).map((t) => t.id),
        positions,
      },
    ];

    const history: ErHistoryEntry[] = [
      {
        id: `hist_${randomUUID().slice(0, 8)}`,
        summary: `Projeto "${name}" criado (${tables.length} tabelas).`,
        author: user.name,
        createdAt: now,
      },
    ];

    await this.db.execute(
      `INSERT INTO er_projects (
         id, owner_id, name, description, dialect, owner,
         tables_json, relations_json, submodels_json, active_submodel_id,
         db_config_json, pending_changes_json, history_json,
         created_at, updated_at
       )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, '[]', ?, ?, ?)`,
      [
        id,
        user.id,
        name,
        input.description?.trim() ?? '',
        dialect,
        user.name,
        JSON.stringify(tables),
        JSON.stringify(relations),
        JSON.stringify(subModels),
        mainSubId,
        JSON.stringify(history),
        now,
        now,
      ],
    );

    return this.findById(user, id);
  }

  async update(
    user: AuthUser,
    id: string,
    input: UpdateErProjectInput,
  ): Promise<ErProjectRecord> {
    const existing = await this.findById(user, id);
    if (existing.accessLevel === 'view') {
      throw new ForbiddenException(
        'Você possui permissão apenas de leitura neste projeto.',
      );
    }

    const now = new Date().toISOString();

    const name = input.name?.trim() || existing.name;
    const description =
      input.description !== undefined ? input.description : existing.description;
    const dialect = input.dialect ?? existing.dialect;
    const tables = Array.isArray(input.tables) ? input.tables : existing.tables;
    const relations = Array.isArray(input.relations)
      ? input.relations
      : existing.relations;
    const subModels = Array.isArray(input.subModels)
      ? input.subModels
      : existing.subModels;
    const activeSubModelId =
      input.activeSubModelId ?? existing.activeSubModelId;
    const dbConfig =
      input.dbConfig !== undefined ? input.dbConfig : existing.dbConfig;
    const pendingChanges = Array.isArray(input.pendingChanges)
      ? input.pendingChanges
      : existing.pendingChanges;
    const history = Array.isArray(input.history)
      ? input.history
      : existing.history;

    await this.db.transaction(async (tx) => {
      await tx.execute(
        `UPDATE er_projects
         SET name = ?, description = ?, dialect = ?,
             tables_json = ?, relations_json = ?, submodels_json = ?,
             active_submodel_id = ?, db_config_json = ?,
             pending_changes_json = ?, history_json = ?, updated_at = ?
         WHERE id = ?`,
        [
          name,
          description,
          dialect,
          JSON.stringify(tables),
          JSON.stringify(relations),
          JSON.stringify(subModels),
          activeSubModelId,
          dbConfig ? JSON.stringify(dbConfig) : null,
          JSON.stringify(pendingChanges),
          JSON.stringify(history.slice(0, 60)),
          now,
          id,
        ],
      );

      if (Array.isArray(input.shares) && existing.accessLevel === 'owner') {
        await tx.execute('DELETE FROM er_project_shares WHERE project_id = ?', [
          id,
        ]);
        for (const share of input.shares) {
          const cleanTarget = share.target?.trim();
          if (!cleanTarget) continue;
          await tx.execute(
            'INSERT INTO er_project_shares (id, project_id, target, permission, created_at) VALUES (?, ?, ?, ?, ?)',
            [
              share.id || randomUUID(),
              id,
              cleanTarget,
              share.permission === 'view' ? 'view' : 'edit',
              share.createdAt || now,
            ],
          );
        }
      }
    });

    return this.findById(user, id);
  }

  async transferOwnership(
    user: AuthUser,
    id: string,
    newOwnerEmail: string,
    keepEditAccess: boolean,
  ): Promise<ErProjectRecord> {
    const existing = await this.findById(user, id);
    if (existing.accessLevel !== 'owner') {
      throw new ForbiddenException(
        'Apenas o dono atual pode transferir a posse do projeto.',
      );
    }

    const targetUser = await this.db.queryOne<{
      id: string;
      name: string;
      email: string;
    }>('SELECT id, name, email FROM users WHERE LOWER(email) = LOWER(?)', [
      newOwnerEmail.trim(),
    ]);

    if (!targetUser) {
      throw new NotFoundException(
        `Usuário "${newOwnerEmail}" não encontrado na plataforma.`,
      );
    }

    const now = new Date().toISOString();

    await this.db.transaction(async (tx) => {
      await tx.execute(
        'UPDATE er_projects SET owner_id = ?, owner = ?, updated_at = ? WHERE id = ?',
        [targetUser.id, targetUser.name, now, id],
      );

      await tx.execute(
        'DELETE FROM er_project_shares WHERE project_id = ? AND LOWER(target) = LOWER(?)',
        [id, targetUser.email],
      );

      if (keepEditAccess && targetUser.id !== user.id) {
        await tx.execute(
          `INSERT INTO er_project_shares (id, project_id, target, permission, created_at)
           VALUES (?, ?, ?, 'edit', ?)`,
          [randomUUID(), id, user.email, now],
        );
      }
    });

    return this.findById(
      keepEditAccess
        ? user
        : {
            ...user,
            id: targetUser.id,
            email: targetUser.email,
            name: targetUser.name,
          },
      id,
    );
  }

  async remove(
    user: AuthUser,
    id: string,
  ): Promise<{ deleted: true; id: string }> {
    const existing = await this.findById(user, id);
    if (existing.accessLevel !== 'owner') {
      throw new ForbiddenException(
        'Apenas o proprietário pode excluir este projeto.',
      );
    }
    await this.db.execute('DELETE FROM er_projects WHERE id = ?', [id]);
    return { deleted: true, id };
  }

  async testDbConnection(config: ErDbConnectionTestInput) {
    return this.introspector.testConnection(config);
  }

  async introspectDbReadOnly(
    user: AuthUser,
    id: string,
    config: ErDbConnectionTestInput,
  ): Promise<ErProjectRecord> {
    const existing = await this.findById(user, id);
    if (existing.accessLevel === 'view') {
      throw new ForbiddenException('Sem permissão de edição neste projeto.');
    }

    const { tables, relations } =
      await this.introspector.readSchemaReadOnly(config);

    // Salva metadados da conexão SEM a senha!
    const safeDbConfig: ErDbConnectionConfig = {
      dialect: config.dialect,
      host: config.host,
      port: Number(config.port),
      database: config.database,
      schema: config.schema,
      username: config.username,
      ssl: Boolean(config.ssl),
    };

    const now = new Date().toISOString();
    const positions: Record<string, { x: number; y: number }> = {};
    tables.forEach((t, idx) => {
      positions[t.id] = {
        x: 80 + (idx % 3) * 350,
        y: 60 + Math.floor(idx / 3) * 300,
      };
    });

    const subModels: ErSubModel[] =
      existing.subModels.length > 0
        ? existing.subModels.map((sub, i) =>
            i === 0
              ? {
                  ...sub,
                  tableIds: tables.slice(0, 8).map((t) => t.id),
                  positions,
                }
              : {
                  ...sub,
                  tableIds: sub.tableIds.filter((tid) =>
                    tables.some((t) => t.id === tid),
                  ),
                },
          )
        : [
            {
              id: `sub_${randomUUID().slice(0, 8)}`,
              name: 'Principal',
              tableIds: tables.slice(0, 8).map((t) => t.id),
              positions,
            },
          ];

    const history: ErHistoryEntry[] = [
      {
        id: `hist_${randomUUID().slice(0, 8)}`,
        summary: `DDL lido em modo somente leitura de ${config.dialect} (${config.database}): ${tables.length} tabelas e ${relations.length} relacionamentos.`,
        author: user.name,
        createdAt: now,
      },
      ...existing.history,
    ];

    return this.update(user, id, {
      dialect: config.dialect,
      tables,
      relations,
      subModels,
      activeSubModelId: subModels[0].id,
      dbConfig: safeDbConfig,
      pendingChanges: [],
      history,
    });
  }

  async importDdl(
    user: AuthUser,
    id: string,
    ddl: string,
    mode: 'replace' | 'merge' = 'replace',
  ): Promise<ErProjectRecord> {
    const existing = await this.findById(user, id);
    if (existing.accessLevel === 'view') {
      throw new ForbiddenException('Sem permissão de edição neste projeto.');
    }
    if (!ddl?.trim()) {
      throw new BadRequestException('Informe um script SQL DDL para importar.');
    }

    const parsed = parseDdlScript(ddl);
    if (parsed.tables.length === 0) {
      throw new BadRequestException(
        'Nenhuma instrução CREATE TABLE válida foi encontrada no script informado.',
      );
    }

    const nextTables =
      mode === 'merge'
        ? [
            ...existing.tables,
            ...parsed.tables.filter(
              (nt) =>
                !existing.tables.some(
                  (et) => et.name.toLowerCase() === nt.name.toLowerCase(),
                ),
            ),
          ]
        : parsed.tables;

    const nextRelations =
      mode === 'merge'
        ? [...existing.relations, ...parsed.relations]
        : parsed.relations;

    const activeSubId = existing.activeSubModelId || existing.subModels[0]?.id;
    const nextSubModels = existing.subModels.map((sub) => {
      if (sub.id !== activeSubId) {
        return mode === 'replace'
          ? {
              ...sub,
              tableIds: sub.tableIds.filter((tid) =>
                nextTables.some((t) => t.id === tid),
              ),
            }
          : sub;
      }
      const nextPositions = { ...sub.positions };
      const addedIds = parsed.tables.slice(0, 12).map((t) => t.id);
      addedIds.forEach((tid, idx) => {
        if (!nextPositions[tid]) {
          nextPositions[tid] = {
            x: 80 + (idx % 3) * 350,
            y: 60 + Math.floor(idx / 3) * 300,
          };
        }
      });
      return {
        ...sub,
        tableIds:
          mode === 'replace'
            ? addedIds
            : Array.from(new Set([...sub.tableIds, ...addedIds])),
        positions: nextPositions,
      };
    });

    const history: ErHistoryEntry[] = [
      {
        id: `hist_${randomUUID().slice(0, 8)}`,
        summary: `DDL importado (${mode === 'merge' ? 'mesclado' : 'substituído'}): ${parsed.tables.length} tabela(s) e ${parsed.relations.length} relacionamento(s).`,
        author: user.name,
        createdAt: new Date().toISOString(),
      },
      ...existing.history,
    ];

    return this.update(user, id, {
      tables: nextTables,
      relations: nextRelations,
      subModels: nextSubModels,
      history,
    });
  }

  /**
   * Assistente de Modelagem com IA:
   * Converte texto livre em plano de ajustes de banco + preview SQL para revisão antes de aplicar.
   */
  async planAiAdjustment(
    user: AuthUser,
    id: string,
    prompt: string,
  ): Promise<ErAiPlanResponse> {
    const project = await this.findById(user, id);
    if (project.accessLevel === 'view') {
      throw new ForbiddenException('Sem permissão de edição neste projeto.');
    }
    if (!prompt?.trim()) {
      throw new BadRequestException(
        'Descreva o ajuste desejado no modelo de banco de dados.',
      );
    }

    const schemaContext = this.serializeSchemaContext(project);
    const result = await this.geminiService.generateJson<{
      summary?: string;
      operations?: ErAiOperation[];
    }>({
      prompt: `Banco de destino: ${project.dialect}\n\nModelo atual:\n${schemaContext}\n\nPedido do usuário:\n${prompt.trim()}`,
      systemInstruction: [
        'Você é um arquiteto de dados especialista em modelagem entidade-relacionamento (DER) e DDL SQL.',
        'Converta o pedido em texto livre do usuário em um plano estruturado de alterações no banco de dados.',
        'Retorne EXCLUSIVAMENTE JSON válido no formato:',
        '{',
        '  "summary": "Resumo claro em português do que será alterado no modelo",',
        '  "operations": [ ... ]',
        '}',
        'Tipos de operações permitidas em "operations":',
        '1. { "op": "create_table", "tableName": "NOME_TABELA", "description": "opcional", "columns": [{ "name": "id_...", "type": "int", "primaryKey": true, "identity": true, "nullable": false }, { "name": "created_at", "type": "datetime", "nullable": false, "defaultValue": "CURRENT_TIMESTAMP" }] }',
        '2. { "op": "rename_table", "tableName": "NOME_ATUAL", "newName": "NOVO_NOME" }',
        '3. { "op": "drop_table", "tableName": "NOME_TABELA" }',
        '4. { "op": "add_column", "tableName": "NOME_TABELA", "column": { "name": "email", "type": "varchar", "length": "120", "nullable": true, "primaryKey": false, "identity": false, "defaultValue": "" } }',
        '5. { "op": "rename_column", "tableName": "NOME_TABELA", "columnName": "NOME_ATUAL", "newName": "NOVO_NOME" }',
        '6. { "op": "drop_column", "tableName": "NOME_TABELA", "columnName": "NOME_COLUNA" }',
        '7. { "op": "add_relation", "name": "fk_filha_pai", "fromTable": "TABELA_FILHA", "fromColumn": "id_pai", "toTable": "TABELA_PAI", "toColumn": "id_pai", "cardinality": "1xN", "optional": false, "onDelete": "NONE|CASCADE|SET NULL|RESTRICT" }',
        '8. { "op": "drop_relation", "fromTable": "TABELA_FILHA", "toTable": "TABELA_PAI" }',
        'Regras:',
        '- Para relacionamentos NxN, crie a tabela associativa intermediária (create_table) e duas operações add_relation.',
        '- Quando criar uma nova tabela, inclua sempre chave primária (PK + identity) e colunas de controle (created_at, updated_at).',
        '- Ao criar um relacionamento 1xN onde a coluna FK ainda não existe na tabela filha, inclua add_column antes de add_relation (ou já inclua a coluna na create_table).',
        '- Respeite os nomes reais das tabelas existentes no modelo atual quando o usuário se referir a elas.',
      ].join('\n'),
      temperature: 0.2,
    });

    const operations = Array.isArray(result.data?.operations)
      ? result.data.operations
      : [];
    const sqlStatements = operations.map((op) =>
      this.operationToSql(op, project.dialect),
    );

    return {
      summary:
        result.data?.summary?.trim() ||
        `Plano gerado com ${operations.length} operação(ões) de modelagem.`,
      operations,
      sqlStatements,
      model: result.model,
    };
  }

  /**
   * Resumo executivo por IA focado no SubModel ativo (para relatório HTML e PDF).
   */
  async summarizeSubModel(
    user: AuthUser,
    id: string,
    subModelId: string,
  ): Promise<ErAiSummary> {
    const project = await this.findById(user, id);
    const subModel =
      project.subModels.find((s) => s.id === subModelId) ??
      project.subModels[0];

    const subTableIds = new Set(subModel?.tableIds ?? []);
    const subTables = project.tables.filter((t) => subTableIds.has(t.id));
    const subRelations = project.relations.filter(
      (r) => subTableIds.has(r.fromTableId) && subTableIds.has(r.toTableId),
    );

    if (!this.geminiService.isConfigured() || subTables.length === 0) {
      return this.buildFallbackSubModelSummary(
        project,
        subModel?.name ?? 'Principal',
        subTables,
        subRelations,
      );
    }

    const context = this.serializeSubModelContext(
      project,
      subModel?.name ?? 'Principal',
      subTables,
      subRelations,
    );

    try {
      const result = await this.geminiService.generateJson<{
        overview?: string;
        highlights?: string[];
        attentionPoints?: string[];
      }>({
        prompt: context,
        systemInstruction: [
          'Você é um arquiteto de dados gerando um resumo executivo sucinto de um SubModel (DER).',
          'Analise as tabelas, chaves primárias, estrangeiras, cardinalidades e colunas do SubModel ativo.',
          'Retorne exclusivamente JSON válido em português:',
          '{ "overview": "Parágrafo curto (2-3 frases) explicando o domínio e papel das tabelas deste SubModel.", "highlights": ["Até 4 destaques estruturais curtos"], "attentionPoints": ["Até 3 pontos de atenção de modelagem, integridade referencial ou alterações pendentes"] }',
        ].join('\n'),
        temperature: 0.25,
      });

      const overview = result.data?.overview?.trim();
      if (!overview) {
        return this.buildFallbackSubModelSummary(
          project,
          subModel?.name ?? 'Principal',
          subTables,
          subRelations,
        );
      }

      return {
        overview,
        highlights: (result.data?.highlights ?? []).slice(0, 4),
        attentionPoints: (result.data?.attentionPoints ?? []).slice(0, 3),
        generatedByAi: true,
        model: result.model,
      };
    } catch {
      return this.buildFallbackSubModelSummary(
        project,
        subModel?.name ?? 'Principal',
        subTables,
        subRelations,
      );
    }
  }

  private operationToSql(op: ErAiOperation, dialect: DbDialect): string {
    switch (op.op) {
      case 'create_table': {
        const fakeTable: ErTable = {
          id: 'tmp',
          name: op.tableName,
          columns: (op.columns ?? []).map((c, i) => ({
            id: `c${i}`,
            name: c.name,
            type: c.type || 'varchar',
            length: c.length,
            nullable: c.nullable ?? !c.primaryKey,
            primaryKey: Boolean(c.primaryKey),
            identity: Boolean(c.identity),
            defaultValue: c.defaultValue,
          })),
        };
        return generateCreateTableSql(fakeTable, dialect);
      }
      case 'rename_table':
        return dialect === 'mysql'
          ? `RENAME TABLE ${op.tableName} TO ${op.newName};`
          : `ALTER TABLE ${op.tableName} RENAME TO ${op.newName};`;
      case 'drop_table':
        return `DROP TABLE ${op.tableName};`;
      case 'add_column': {
        const typeStr = formatColumnType(op.column);
        const nullStr = op.column.nullable === false ? ' NOT NULL' : '';
        const defStr = op.column.defaultValue?.trim()
          ? ` DEFAULT ${op.column.defaultValue.trim()}`
          : '';
        return `ALTER TABLE ${op.tableName} ADD COLUMN ${op.column.name} ${typeStr}${nullStr}${defStr};`;
      }
      case 'rename_column':
        return `ALTER TABLE ${op.tableName} RENAME COLUMN ${op.columnName} TO ${op.newName};`;
      case 'drop_column':
        return `ALTER TABLE ${op.tableName} DROP COLUMN ${op.columnName};`;
      case 'add_relation':
        return generateAddRelationSql({
          name:
            op.name ||
            `fk_${op.fromTable.toLowerCase()}_${op.toTable.toLowerCase()}`,
          fromTable: op.fromTable,
          fromColumn: op.fromColumn,
          toTable: op.toTable,
          toColumn: op.toColumn,
          onDelete: op.onDelete,
        });
      case 'drop_relation':
        return `-- Remover relacionamento entre ${op.fromTable} e ${op.toTable}\nALTER TABLE ${op.fromTable} DROP ${dialect === 'mysql' ? 'FOREIGN KEY' : 'CONSTRAINT'} ${op.name || `fk_${op.fromTable.toLowerCase()}_${op.toTable.toLowerCase()}`};`;
    }
  }

  private serializeSchemaContext(project: ErProjectRecord): string {
    const tableById = new Map(project.tables.map((t) => [t.id, t.name]));
    const lines = [`Projeto: ${project.name} (${project.dialect})`, '', 'Tabelas:'];
    for (const t of project.tables) {
      const cols = t.columns
        .map(
          (c) =>
            `${c.name} ${formatColumnType(c)}${c.primaryKey ? ' PK' : ''}${!c.nullable ? ' NOT NULL' : ''}`,
        )
        .join(', ');
      lines.push(`- ${t.name}: [${cols}]`);
    }
    if (project.relations.length > 0) {
      lines.push('', 'Relacionamentos:');
      for (const r of project.relations) {
        lines.push(
          `- ${tableById.get(r.fromTableId) ?? r.fromTableId}.${r.fromColumn} -> ${tableById.get(r.toTableId) ?? r.toTableId}.${r.toColumn} (${r.cardinality})`,
        );
      }
    }
    return lines.join('\n');
  }

  private serializeSubModelContext(
    project: ErProjectRecord,
    subModelName: string,
    tables: ErTable[],
    relations: ErRelation[],
  ): string {
    const tableById = new Map(tables.map((t) => [t.id, t.name]));
    const lines = [
      `Projeto: ${project.name} (${project.dialect})`,
      `SubModel ativo: ${subModelName}`,
      `Tabelas no SubModel: ${tables.length}`,
      `Relacionamentos no SubModel: ${relations.length}`,
      `Alterações DDL pendentes no projeto: ${project.pendingChanges.length}`,
      '',
    ];
    for (const t of tables) {
      const cols = t.columns
        .map(
          (c) =>
            `${c.name} ${formatColumnType(c)}${c.primaryKey ? ' [PK]' : ''}${!c.nullable ? ' NOT NULL' : ''}`,
        )
        .join(', ');
      lines.push(`- ${t.name}: ${cols}`);
    }
    if (relations.length > 0) {
      lines.push('', 'Relacionamentos:');
      for (const r of relations) {
        lines.push(
          `- ${r.name}: ${tableById.get(r.fromTableId)}.${r.fromColumn} -> ${tableById.get(r.toTableId)}.${r.toColumn} (${r.cardinality}${r.optional ? ', opcional' : ', obrigatório'})`,
        );
      }
    }
    return lines.join('\n');
  }

  private buildFallbackSubModelSummary(
    project: ErProjectRecord,
    subModelName: string,
    tables: ErTable[],
    relations: ErRelation[],
  ): ErAiSummary {
    const totalCols = tables.reduce((s, t) => s + t.columns.length, 0);
    const tablesWithoutPk = tables.filter(
      (t) => !t.columns.some((c) => c.primaryKey),
    );
    return {
      overview: `O SubModel "${subModelName}" do projeto "${project.name}" (${project.dialect}) apresenta ${tables.length} tabela(s), ${totalCols} coluna(s) e ${relations.length} relacionamento(s) mapeados.`,
      highlights: tables
        .slice(0, 4)
        .map((t) => `Tabela ${t.name}: ${t.columns.length} coluna(s).`),
      attentionPoints: [
        ...(tablesWithoutPk.length > 0
          ? [
              `Tabelas sem chave primária definida: ${tablesWithoutPk.map((t) => t.name).join(', ')}.`,
            ]
          : ['Todas as tabelas deste SubModel possuem chave primária definida.']),
        ...(project.pendingChanges.length > 0
          ? [
              `Existem ${project.pendingChanges.length} comando(s) DDL pendente(s) no script de atualização.`,
            ]
          : []),
      ],
      generatedByAi: false,
    };
  }

  private async loadAuthorizedRow(
    user: AuthUser,
    id: string,
  ): Promise<{ row: ErProjectRow; accessLevel: ErAccessLevel }> {
    const row = await this.db.queryOne<ErProjectRow>(
      `SELECT p.*, COALESCE(u.name, p.owner) AS owner
       FROM er_projects p
       LEFT JOIN users u ON u.id = p.owner_id
       WHERE p.id = ?`,
      [id],
    );

    if (!row) {
      throw new NotFoundException(`Projeto ER "${id}" não encontrado.`);
    }

    if (row.owner_id === user.id) {
      return { row, accessLevel: 'owner' };
    }

    const share = await this.db.queryOne<{ permission: 'view' | 'edit' }>(
      `SELECT permission FROM er_project_shares
       WHERE project_id = ? AND LOWER(target) = LOWER(?)
       LIMIT 1`,
      [id, user.email],
    );

    if (!share) {
      throw new ForbiddenException(
        'Você não tem permissão para acessar este projeto.',
      );
    }

    return {
      row,
      accessLevel: share.permission === 'view' ? 'view' : 'edit',
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
