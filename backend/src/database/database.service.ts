import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { DatabaseSync, SQLInputValue } from 'node:sqlite';
import { Pool, PoolClient } from 'pg';
import { hashPassword } from '../auth/password.util';
import { MindMapNode } from '../mindmap/mindmap.types';

const DEFAULT_USER_EMAIL = 'nilton@hub.local';
const DEFAULT_USER_NAME = 'Jacintho, Nilton';
const DEFAULT_USER_PASSWORD = '123456';

export interface DbExecutor {
  queryAll<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T[]>;
  queryOne<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[],
  ): Promise<T | undefined>;
  execute(sql: string, params?: unknown[]): Promise<{ changes: number }>;
}

/**
 * Converte placeholders '?' (fora de strings entre aspas simples) para '$1, $2...' no PostgreSQL.
 */
function toPostgresPlaceholders(sql: string): string {
  let idx = 0;
  let inSingleQuote = false;
  let out = '';

  for (let i = 0; i < sql.length; i++) {
    const ch = sql[i];
    if (ch === "'") {
      out += ch;
      if (inSingleQuote && sql[i + 1] === "'") {
        out += "'";
        i++;
      } else {
        inSingleQuote = !inSingleQuote;
      }
    } else if (ch === '?' && !inSingleQuote) {
      idx += 1;
      out += `$${idx}`;
    } else {
      out += ch;
    }
  }

  return out;
}

const SCHEMA_STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT,
    google_id TEXT UNIQUE,
    avatar_url TEXT,
    provider TEXT NOT NULL DEFAULT 'local',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  )`,
  `CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS mindmaps (
    id TEXT PRIMARY KEY,
    owner_id TEXT,
    name TEXT NOT NULL,
    owner TEXT NOT NULL DEFAULT 'Jacintho, Nilton',
    background_color TEXT NOT NULL DEFAULT '#F8FAFC',
    nodes_json TEXT NOT NULL,
    item_count INTEGER NOT NULL DEFAULT 1,
    completed_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS mindmap_executors (
    id TEXT PRIMARY KEY,
    mindmap_id TEXT NOT NULL,
    name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (mindmap_id) REFERENCES mindmaps(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS mindmap_shares (
    id TEXT PRIMARY KEY,
    mindmap_id TEXT NOT NULL,
    target TEXT NOT NULL,
    permission TEXT NOT NULL DEFAULT 'edit',
    created_at TEXT NOT NULL,
    FOREIGN KEY (mindmap_id) REFERENCES mindmaps(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)`,
  `CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`,
  `CREATE INDEX IF NOT EXISTS idx_mindmaps_owner_id ON mindmaps(owner_id)`,
  `CREATE INDEX IF NOT EXISTS idx_mindmaps_updated_at ON mindmaps(updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_executors_mindmap ON mindmap_executors(mindmap_id)`,
  `CREATE INDEX IF NOT EXISTS idx_shares_mindmap ON mindmap_shares(mindmap_id)`,
  `CREATE TABLE IF NOT EXISTS flowcharts (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    tags_json TEXT NOT NULL DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'draft',
    archived INTEGER NOT NULL DEFAULT 0,
    owner TEXT NOT NULL DEFAULT 'Jacintho, Nilton',
    background_color TEXT NOT NULL DEFAULT '#F8FAFC',
    lanes_json TEXT NOT NULL,
    nodes_json TEXT NOT NULL,
    edges_json TEXT NOT NULL,
    comments_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS flowchart_shares (
    id TEXT PRIMARY KEY,
    flowchart_id TEXT NOT NULL,
    target TEXT NOT NULL,
    permission TEXT NOT NULL DEFAULT 'edit',
    created_at TEXT NOT NULL,
    FOREIGN KEY (flowchart_id) REFERENCES flowcharts(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS flowchart_versions (
    id TEXT PRIMARY KEY,
    flowchart_id TEXT NOT NULL,
    label TEXT NOT NULL,
    author TEXT NOT NULL,
    snapshot_json TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (flowchart_id) REFERENCES flowcharts(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_flowcharts_owner_id ON flowcharts(owner_id)`,
  `CREATE INDEX IF NOT EXISTS idx_flowcharts_updated_at ON flowcharts(updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_flowchart_shares_chart ON flowchart_shares(flowchart_id)`,
  `CREATE INDEX IF NOT EXISTS idx_flowchart_versions_chart ON flowchart_versions(flowchart_id)`,
  `CREATE TABLE IF NOT EXISTS er_projects (
    id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    dialect TEXT NOT NULL DEFAULT 'postgresql',
    owner TEXT NOT NULL DEFAULT 'Jacintho, Nilton',
    tables_json TEXT NOT NULL DEFAULT '[]',
    relations_json TEXT NOT NULL DEFAULT '[]',
    submodels_json TEXT NOT NULL DEFAULT '[]',
    active_submodel_id TEXT NOT NULL DEFAULT '',
    db_config_json TEXT,
    pending_changes_json TEXT NOT NULL DEFAULT '[]',
    history_json TEXT NOT NULL DEFAULT '[]',
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (owner_id) REFERENCES users(id) ON DELETE CASCADE
  )`,
  `CREATE TABLE IF NOT EXISTS er_project_shares (
    id TEXT PRIMARY KEY,
    project_id TEXT NOT NULL,
    target TEXT NOT NULL,
    permission TEXT NOT NULL DEFAULT 'edit',
    created_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES er_projects(id) ON DELETE CASCADE
  )`,
  `CREATE INDEX IF NOT EXISTS idx_er_projects_owner ON er_projects(owner_id)`,
  `CREATE INDEX IF NOT EXISTS idx_er_projects_updated ON er_projects(updated_at DESC)`,
  `CREATE INDEX IF NOT EXISTS idx_er_project_shares_proj ON er_project_shares(project_id)`,
];

@Injectable()
export class DatabaseService
  implements DbExecutor, OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(DatabaseService.name);
  readonly driver: 'postgres' | 'sqlite';

  private pgPool: Pool | null = null;
  private sqliteDb: DatabaseSync | null = null;
  private readonly databaseUrl: string;
  private readonly sqlitePath: string;
  private ready = false;

  constructor(private readonly configService: ConfigService) {
    this.databaseUrl = (
      this.configService.get<string>('DATABASE_URL') ?? ''
    ).trim();
    this.driver = this.databaseUrl ? 'postgres' : 'sqlite';

    const configuredPath = (
      this.configService.get<string>('SQLITE_DB_PATH') ?? ''
    ).trim();
    this.sqlitePath = configuredPath
      ? resolve(configuredPath)
      : resolve(process.cwd(), 'data', 'mindmap.sqlite');
  }

  async onModuleInit(): Promise<void> {
    if (this.driver === 'postgres') {
      await this.initPostgres();
    } else {
      await this.initSqlite();
    }

    await this.createSchema();
    if (this.driver === 'postgres') {
      await this.migrateFromLocalSqliteIfEmpty();
    }
    const defaultUserId = await this.ensureDefaultUser();
    await this.migrateMindMapsOwner(defaultUserId);
    await this.seedInitialMapsIfEmpty(defaultUserId);
    await this.seedInitialFlowchartsIfEmpty(defaultUserId);
    await this.seedInitialErProjectsIfEmpty(defaultUserId);
    this.ready = true;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.pgPool) {
      await this.pgPool.end();
      this.pgPool = null;
    }
    if (this.sqliteDb) {
      this.sqliteDb.close();
      this.sqliteDb = null;
    }
    this.ready = false;
  }

  getInfo(): { driver: 'postgres' | 'sqlite'; connected: boolean } {
    return {
      driver: this.driver,
      connected: this.ready,
    };
  }

  async queryAll<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    if (this.driver === 'postgres') {
      const res = await this.pgPool!.query(
        toPostgresPlaceholders(sql),
        params,
      );
      return res.rows as T[];
    }

    const stmt = this.sqliteDb!.prepare(sql);
    return stmt.all(...(params as SQLInputValue[])) as unknown as T[];
  }

  async queryOne<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ): Promise<T | undefined> {
    if (this.driver === 'postgres') {
      const res = await this.pgPool!.query(
        toPostgresPlaceholders(sql),
        params,
      );
      return (res.rows[0] as T | undefined) ?? undefined;
    }

    const stmt = this.sqliteDb!.prepare(sql);
    return (stmt.get(...(params as SQLInputValue[])) as unknown as T) ?? undefined;
  }

  async execute(
    sql: string,
    params: unknown[] = [],
  ): Promise<{ changes: number }> {
    if (this.driver === 'postgres') {
      const res = await this.pgPool!.query(
        toPostgresPlaceholders(sql),
        params,
      );
      return { changes: res.rowCount ?? 0 };
    }

    const stmt = this.sqliteDb!.prepare(sql);
    const info = stmt.run(...(params as SQLInputValue[]));
    return { changes: Number(info.changes ?? 0) };
  }

  async transaction<T>(fn: (tx: DbExecutor) => Promise<T>): Promise<T> {
    if (this.driver === 'postgres') {
      const client: PoolClient = await this.pgPool!.connect();
      const txExecutor: DbExecutor = {
        queryAll: async <R = Record<string, unknown>>(
          sql: string,
          params: unknown[] = [],
        ) => {
          const res = await client.query(toPostgresPlaceholders(sql), params);
          return res.rows as R[];
        },
        queryOne: async <R = Record<string, unknown>>(
          sql: string,
          params: unknown[] = [],
        ) => {
          const res = await client.query(toPostgresPlaceholders(sql), params);
          return (res.rows[0] as R | undefined) ?? undefined;
        },
        execute: async (sql: string, params: unknown[] = []) => {
          const res = await client.query(toPostgresPlaceholders(sql), params);
          return { changes: res.rowCount ?? 0 };
        },
      };

      try {
        await client.query('BEGIN');
        const result = await fn(txExecutor);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    }

    // SQLite local
    const db = this.sqliteDb!;
    db.exec('BEGIN');
    try {
      const result = await fn(this);
      db.exec('COMMIT');
      return result;
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
  }

  private async initPostgres(): Promise<void> {
    const sslEnv = (
      this.configService.get<string>('DATABASE_SSL') ?? ''
    ).trim().toLowerCase();
    const isLocalHost =
      this.databaseUrl.includes('localhost') ||
      this.databaseUrl.includes('127.0.0.1');

    const useSsl =
      sslEnv === 'true' ||
      sslEnv === '1' ||
      (sslEnv !== 'false' && sslEnv !== '0' && !isLocalHost);

    this.pgPool = new Pool({
      connectionString: this.databaseUrl,
      ssl: useSsl ? { rejectUnauthorized: false } : false,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000,
    });

    // Valida conectividade logo no boot
    await this.pgPool.query('SELECT 1');
    this.logger.log(
      `PostgreSQL conectado com sucesso (SSL: ${useSsl ? 'ativo' : 'inativo'})`,
    );
  }

  private async initSqlite(): Promise<void> {
    mkdirSync(dirname(this.sqlitePath), { recursive: true });
    const sqlite = await import('node:sqlite');
    this.sqliteDb = new sqlite.DatabaseSync(this.sqlitePath);
    this.sqliteDb.exec('PRAGMA journal_mode = WAL;');
    this.sqliteDb.exec('PRAGMA foreign_keys = ON;');
    this.logger.log(`SQLite conectado em ${this.sqlitePath}`);
  }

  private async createSchema(): Promise<void> {
    for (const stmt of SCHEMA_STATEMENTS) {
      await this.execute(stmt);
    }
  }

  private async migrateFromLocalSqliteIfEmpty(): Promise<void> {
    if (!existsSync(this.sqlitePath)) return;

    const userCountRow = await this.queryOne<{ total: number | string }>(
      'SELECT COUNT(*) as total FROM users',
    );
    if (Number(userCountRow?.total ?? 0) > 0) {
      return;
    }

    try {
      const sqlite = await import('node:sqlite');
      const localDb = new sqlite.DatabaseSync(this.sqlitePath, {
        readOnly: true,
      });

      const tableSpecs: Array<{ table: string; columns: string[] }> = [
        {
          table: 'users',
          columns: [
            'id',
            'name',
            'email',
            'password_hash',
            'google_id',
            'avatar_url',
            'provider',
            'created_at',
            'updated_at',
          ],
        },
        {
          table: 'sessions',
          columns: ['token_hash', 'user_id', 'expires_at', 'created_at'],
        },
        {
          table: 'mindmaps',
          columns: [
            'id',
            'owner_id',
            'name',
            'owner',
            'background_color',
            'nodes_json',
            'item_count',
            'completed_count',
            'created_at',
            'updated_at',
          ],
        },
        {
          table: 'mindmap_executors',
          columns: ['id', 'mindmap_id', 'name', 'created_at'],
        },
        {
          table: 'mindmap_shares',
          columns: ['id', 'mindmap_id', 'target', 'permission', 'created_at'],
        },
        {
          table: 'flowcharts',
          columns: [
            'id',
            'owner_id',
            'name',
            'description',
            'tags_json',
            'status',
            'archived',
            'owner',
            'background_color',
            'lanes_json',
            'nodes_json',
            'edges_json',
            'comments_json',
            'created_at',
            'updated_at',
          ],
        },
        {
          table: 'flowchart_shares',
          columns: [
            'id',
            'flowchart_id',
            'target',
            'permission',
            'created_at',
          ],
        },
        {
          table: 'flowchart_versions',
          columns: [
            'id',
            'flowchart_id',
            'label',
            'author',
            'snapshot_json',
            'created_at',
          ],
        },
        {
          table: 'er_projects',
          columns: [
            'id',
            'owner_id',
            'name',
            'description',
            'dialect',
            'owner',
            'tables_json',
            'relations_json',
            'submodels_json',
            'active_submodel_id',
            'db_config_json',
            'pending_changes_json',
            'history_json',
            'created_at',
            'updated_at',
          ],
        },
        {
          table: 'er_project_shares',
          columns: ['id', 'project_id', 'target', 'permission', 'created_at'],
        },
      ];

      let migratedTotal = 0;
      await this.transaction(async (tx) => {
        for (const spec of tableSpecs) {
          let rows: Array<Record<string, unknown>> = [];
          try {
            rows = localDb
              .prepare(`SELECT * FROM ${spec.table}`)
              .all() as Array<Record<string, unknown>>;
          } catch {
            continue;
          }
          if (rows.length === 0) continue;

          const colList = spec.columns.join(', ');
          const placeholders = spec.columns.map(() => '?').join(', ');
          const insertSql = `INSERT INTO ${spec.table} (${colList}) VALUES (${placeholders}) ON CONFLICT DO NOTHING`;

          for (const row of rows) {
            const values = spec.columns.map((c) => row[c] ?? null);
            await tx.execute(insertSql, values);
            migratedTotal++;
          }
        }
      });

      localDb.close();
      if (migratedTotal > 0) {
        this.logger.log(
          `Migração inicial concluída: ${migratedTotal} registro(s) copiados do SQLite local para o PostgreSQL (Neon).`,
        );
      }
    } catch (err) {
      this.logger.warn(
        `Aviso: não foi possível migrar dados do SQLite local: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  private async ensureDefaultUser(): Promise<string> {
    const existing = await this.queryOne<{ id: string }>(
      'SELECT id FROM users WHERE LOWER(email) = LOWER(?)',
      [DEFAULT_USER_EMAIL],
    );

    if (existing) {
      return existing.id;
    }

    const totalUsers = await this.queryOne<{ total: number | string }>(
      'SELECT COUNT(*) as total FROM users',
    );

    if (Number(totalUsers?.total ?? 0) > 0) {
      const first = await this.queryOne<{ id: string }>(
        'SELECT id FROM users ORDER BY created_at ASC LIMIT 1',
      );
      if (first) return first.id;
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const passwordHash = hashPassword(DEFAULT_USER_PASSWORD);

    await this.execute(
      `INSERT INTO users (id, name, email, password_hash, provider, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'local', ?, ?)`,
      [id, DEFAULT_USER_NAME, DEFAULT_USER_EMAIL, passwordHash, now, now],
    );

    return id;
  }

  private async migrateMindMapsOwner(defaultUserId: string): Promise<void> {
    if (this.driver === 'sqlite') {
      const columns = await this.queryAll<{ name: string }>(
        'PRAGMA table_info(mindmaps)',
      );
      const hasOwnerId = columns.some((col) => col.name === 'owner_id');
      if (!hasOwnerId) {
        await this.execute(
          'ALTER TABLE mindmaps ADD COLUMN owner_id TEXT REFERENCES users(id) ON DELETE CASCADE',
        );
        this.logger.log(
          'Migração aplicada: coluna owner_id adicionada em mindmaps (1xN com users).',
        );
      }
      await this.execute(
        'CREATE INDEX IF NOT EXISTS idx_mindmaps_owner_id ON mindmaps(owner_id)',
      );
    }

    await this.execute(
      `UPDATE mindmaps
       SET owner_id = ?
       WHERE owner_id IS NULL OR owner_id = ''`,
      [defaultUserId],
    );
  }

  private async seedInitialMapsIfEmpty(ownerId: string): Promise<void> {
    const row = await this.queryOne<{ total: number | string }>(
      'SELECT COUNT(*) as total FROM mindmaps',
    );
    if (Number(row?.total ?? 0) > 0) {
      return;
    }

    const ownerRow = await this.queryOne<{ name: string }>(
      'SELECT name FROM users WHERE id = ?',
      [ownerId],
    );
    const ownerName = ownerRow?.name ?? DEFAULT_USER_NAME;

    const now = new Date().toISOString();
    const map1Id = randomUUID();
    const map1Root: MindMapNode = {
      id: 'root-1',
      text: 'Planejamento Novembro 2026',
      notes: 'Mapa consolidado de entregas prioritárias do mês.',
      completed: false,
      children: [
        {
          id: 'n-invoices',
          text: 'Faturamento & Invoices',
          children: [
            {
              id: 'n-invoices-1',
              text: 'Homologar Invoices',
              notes: 'Validar layout final de notas com o time fiscal.',
              completed: false,
              children: [],
            },
            {
              id: 'n-invoices-2',
              text: 'Deploy PRD',
              completed: false,
              children: [],
            },
          ],
        },
        {
          id: 'n-integracao',
          text: 'Projeto Integração Bancária',
          children: [],
        },
        {
          id: 'n-apresentacao',
          text: 'Apresentar e homologar entregas — Quinta-feira',
          comments: [
            {
              id: 'c-1',
              author: ownerName,
              text: 'Confirmar pauta da apresentação com os stakeholders.',
              createdAt: now,
            },
          ],
          children: [],
        },
        {
          id: 'n-tesouraria',
          text: 'Descomissionamento Módulo Legado',
          comments: [
            {
              id: 'c-2',
              author: ownerName,
              text: 'Validar janela de desligamento sem impacto operacional.',
              createdAt: now,
            },
          ],
          children: [],
        },
        {
          id: 'n-agendamento',
          text: 'Agendamento automático de pagamentos',
          notes: 'Priorizar lotes recorrentes e alertas de falha.',
          comments: [
            {
              id: 'c-3',
              author: ownerName,
              text: 'Revisar retry exponencial no serviço de liquidação.',
              createdAt: now,
            },
          ],
          children: [],
        },
        {
          id: 'n-seguranca',
          text: 'Rotação de credenciais — 16/11',
          notes: 'Atualizar secrets no cofre e validar health checks.',
          children: [
            {
              id: 'n-seg-1',
              text: 'Remover áreas automáticas antigas',
              notes: 'Limpar configurações legadas após virada.',
              children: [],
            },
            {
              id: 'n-seg-2',
              text: 'Criar diálogo de pendências',
              notes: 'Listar itens pendentes antes de finalizar publicação.',
              children: [],
            },
          ],
        },
      ],
    };

    await this.execute(
      `INSERT INTO mindmaps (id, owner_id, name, owner, background_color, nodes_json, item_count, completed_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        map1Id,
        ownerId,
        'Planejamento Novembro 2026',
        ownerName,
        '#F8FAFC',
        JSON.stringify(map1Root),
        11,
        0,
        now,
        now,
      ],
    );

    const map2Id = randomUUID();
    const map2Root: MindMapNode = {
      id: 'root-2',
      text: 'Arquitetura Plataforma de Diagramas',
      children: [
        {
          id: 'n-arch-1',
          text: 'Frontend React',
          children: [
            { id: 'n-arch-1a', text: 'Canvas interativo', children: [] },
            {
              id: 'n-arch-1b',
              text: 'Exportação PNG, PDF, HTML, CSV e MD',
              children: [],
            },
          ],
        },
        {
          id: 'n-arch-2',
          text: 'API NestJS + PostgreSQL',
          children: [
            { id: 'n-arch-2a', text: 'Usuários 1xN Mapas', children: [] },
            {
              id: 'n-arch-2b',
              text: 'Tradução de texto com Gemini AI',
              children: [],
            },
          ],
        },
      ],
    };

    await this.execute(
      `INSERT INTO mindmaps (id, owner_id, name, owner, background_color, nodes_json, item_count, completed_count, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        map2Id,
        ownerId,
        'Arquitetura Plataforma de Diagramas',
        ownerName,
        '#F8FAFC',
        JSON.stringify(map2Root),
        7,
        0,
        now,
        now,
      ],
    );
  }

  private async seedInitialFlowchartsIfEmpty(ownerId: string): Promise<void> {
    const row = await this.queryOne<{ total: number | string }>(
      'SELECT COUNT(*) as total FROM flowcharts',
    );
    if (Number(row?.total ?? 0) > 0) {
      return;
    }

    const ownerRow = await this.queryOne<{ name: string }>(
      'SELECT name FROM users WHERE id = ?',
      [ownerId],
    );
    const ownerName = ownerRow?.name ?? DEFAULT_USER_NAME;

    const now = new Date().toISOString();
    const chartId = randomUUID();

    const lanes = [
      { id: 'lane_portal', name: 'Portal de Pagamentos', height: 210 },
      { id: 'lane_capg', name: 'CAPG', height: 260 },
    ];

    const nodes = [
      {
        id: 'start_74851859',
        type: 'start',
        title: 'Solicitação de pagamento criada',
        description:
          'Evento inicial disparado quando uma nova solicitação é registrada no portal.',
        owner: '',
        trigger: 'Nova solicitação no portal',
        laneId: 'lane_portal',
        x: 92,
        y: 78,
        width: 174,
        height: 58,
      },
      {
        id: 'proc_solicitar',
        type: 'process',
        title: 'Solicitar aprovação de pagamento',
        description:
          'Encaminha os dados da solicitação para validação e aprovação.',
        owner: 'Time do portal de pagamentos',
        laneId: 'lane_portal',
        x: 344,
        y: 72,
        width: 194,
        height: 70,
      },
      {
        id: 'dec_aprovado',
        type: 'decision',
        title: 'Pagamento aprovado?',
        description: 'Avaliação de alçada e conformidade pela equipe CAPG.',
        owner: '',
        laneId: 'lane_capg',
        x: 590,
        y: 288,
        width: 164,
        height: 98,
      },
      {
        id: 'proc_liquidacao',
        type: 'process',
        title: 'Realizar liquidação',
        description: 'Efetua a liquidação financeira da solicitação aprovada.',
        owner: 'Time do CAPG',
        laneId: 'lane_capg',
        x: 848,
        y: 238,
        width: 178,
        height: 66,
      },
      {
        id: 'proc_mensagem',
        type: 'process',
        title: 'Enviar mensagem ao solicitante',
        description: 'Notifica o solicitante com o motivo da recusa.',
        owner: 'Time do CAPG',
        laneId: 'lane_capg',
        x: 848,
        y: 356,
        width: 178,
        height: 66,
      },
      {
        id: 'end_liquidado',
        type: 'end',
        title: 'Pagamento liquidado',
        laneId: 'lane_capg',
        x: 1106,
        y: 244,
        width: 162,
        height: 54,
      },
      {
        id: 'end_encerrada',
        type: 'end',
        title: 'Solicitação encerrada',
        laneId: 'lane_capg',
        x: 1106,
        y: 362,
        width: 162,
        height: 54,
      },
    ];

    const edges = [
      { id: 'edge_1', sourceId: 'start_74851859', targetId: 'proc_solicitar' },
      { id: 'edge_2', sourceId: 'proc_solicitar', targetId: 'dec_aprovado' },
      {
        id: 'edge_3',
        sourceId: 'dec_aprovado',
        targetId: 'proc_liquidacao',
        label: 'Sim',
      },
      {
        id: 'edge_4',
        sourceId: 'dec_aprovado',
        targetId: 'proc_mensagem',
        label: 'Não',
      },
      { id: 'edge_5', sourceId: 'proc_liquidacao', targetId: 'end_liquidado' },
      { id: 'edge_6', sourceId: 'proc_mensagem', targetId: 'end_encerrada' },
    ];

    await this.execute(
      `INSERT INTO flowcharts (
         id, owner_id, name, description, tags_json, status, archived, owner,
         background_color, lanes_json, nodes_json, edges_json, comments_json,
         created_at, updated_at
       )
       VALUES (?, ?, ?, ?, ?, 'draft', 0, ?, '#F8FAFC', ?, ?, ?, '[]', ?, ?)`,
      [
        chartId,
        ownerId,
        'Navegação Portal',
        'Fluxo de solicitação, aprovação e liquidação de pagamentos.',
        JSON.stringify(['pagamentos', 'portal']),
        ownerName,
        JSON.stringify(lanes),
        JSON.stringify(nodes),
        JSON.stringify(edges),
        now,
        now,
      ],
    );
  }

  private async seedInitialErProjectsIfEmpty(ownerId: string): Promise<void> {
    const row = await this.queryOne<{ total: number | string }>(
      'SELECT COUNT(*) as total FROM er_projects',
    );
    if (Number(row?.total ?? 0) > 0) {
      return;
    }

    const ownerRow = await this.queryOne<{ name: string }>(
      'SELECT name FROM users WHERE id = ?',
      [ownerId],
    );
    const ownerName = ownerRow?.name ?? DEFAULT_USER_NAME;
    const now = new Date().toISOString();

    const tables = [
      {
        id: 'tbl_emp_pagadora',
        name: 'EMPRESA_PAGADORA',
        description: 'Cadastro principal de empresas pagadoras e contas SAP.',
        columns: [
          { id: 'c1', name: 'ID_EMPRESA_PAGADORA', type: 'int', nullable: false, primaryKey: true, identity: true },
          { id: 'c2', name: 'NM_EMPRESA_PAGADORA', type: 'varchar', length: '255', nullable: false, primaryKey: false, identity: false },
          { id: 'c3', name: 'NR_CNPJ', type: 'varchar', length: '50', nullable: true, primaryKey: false, identity: false, defaultValue: 'NULL' },
          { id: 'c4', name: 'NR_CR', type: 'varchar', length: '50', nullable: true, primaryKey: false, identity: false, defaultValue: "''" },
          { id: 'c5', name: 'NR_BANCO', type: 'varchar', length: '10', nullable: true, primaryKey: false, identity: false, defaultValue: 'NULL' },
          { id: 'c6', name: 'NR_CONTA', type: 'varchar', length: '50', nullable: true, primaryKey: false, identity: false, defaultValue: 'NULL' },
          { id: 'c7', name: 'ES_ATIVO', type: 'char', length: '1', nullable: true, primaryKey: false, identity: false, defaultValue: "'S'" },
          { id: 'c8', name: 'IS_ACTIVE', type: 'tinyint', length: '1', nullable: false, primaryKey: false, identity: false, defaultValue: '1' },
          { id: 'c9', name: 'CREATED_AT', type: 'datetime', nullable: false, primaryKey: false, identity: false, defaultValue: 'CURRENT_TIMESTAMP' },
          { id: 'c10', name: 'UPDATED_AT', type: 'datetime', nullable: false, primaryKey: false, identity: false, defaultValue: 'CURRENT_TIMESTAMP' },
        ],
      },
      {
        id: 'tbl_emp_conta_sap',
        name: 'EMPRESA_PAGADORA_CONTA_SAP_PADRAO',
        description: 'Contas contábeis SAP padrão por empresa pagadora.',
        columns: [
          { id: 'c11', name: 'ID_EMPRESA_CONTA_SAP', type: 'int', nullable: false, primaryKey: true, identity: true },
          { id: 'c12', name: 'ID_EMPRESA_PAGADORA', type: 'int', nullable: false, primaryKey: false, identity: false },
          { id: 'c13', name: 'ID_CONTA_EMPRESA', type: 'varchar', length: '20', nullable: false, primaryKey: false, identity: false },
          { id: 'c14', name: 'BANCO_EMPRESA', type: 'varchar', length: '4', nullable: false, primaryKey: false, identity: false },
          { id: 'c15', name: 'IS_ACTIVE', type: 'tinyint', length: '1', nullable: false, primaryKey: false, identity: false, defaultValue: '1' },
          { id: 'c16', name: 'CREATED_AT', type: 'datetime', nullable: false, primaryKey: false, identity: false, defaultValue: 'CURRENT_TIMESTAMP' },
          { id: 'c17', name: 'UPDATED_AT', type: 'datetime', nullable: false, primaryKey: false, identity: false, defaultValue: 'CURRENT_TIMESTAMP' },
        ],
      },
      {
        id: 'tbl_emp_conta',
        name: 'EMPRESA_PAGADORA_CONTA',
        description: 'Contas bancárias vinculadas à empresa pagadora.',
        columns: [
          { id: 'c18', name: 'ID_EMPRESA_PAGADORA_CONTA', type: 'int', nullable: false, primaryKey: true, identity: true },
          { id: 'c19', name: 'ID_EMPRESA_PAGADORA', type: 'int', nullable: false, primaryKey: false, identity: false },
          { id: 'c20', name: 'NR_BANCO', type: 'varchar', length: '10', nullable: true, primaryKey: false, identity: false, defaultValue: 'NULL' },
          { id: 'c21', name: 'NR_CONTA', type: 'varchar', length: '50', nullable: true, primaryKey: false, identity: false, defaultValue: 'NULL' },
          { id: 'c22', name: 'NR_CONTA_SAP', type: 'varchar', length: '10', nullable: true, primaryKey: false, identity: false, defaultValue: 'NULL' },
          { id: 'c23', name: 'ES_ATIVO', type: 'char', length: '1', nullable: true, primaryKey: false, identity: false, defaultValue: "'S'" },
          { id: 'c24', name: 'CREATED_AT', type: 'datetime', nullable: false, primaryKey: false, identity: false, defaultValue: 'CURRENT_TIMESTAMP' },
        ],
      },
      {
        id: 'tbl_emp_hist',
        name: 'EMPRESA_PAGADORA_HISTORICO',
        description: 'Auditoria de alterações nas empresas pagadoras.',
        columns: [
          { id: 'c25', name: 'ID_HISTORICO', type: 'int', nullable: false, primaryKey: true, identity: true },
          { id: 'c26', name: 'ID_EMPRESA_PAGADORA', type: 'int', nullable: false, primaryKey: false, identity: false },
          { id: 'c27', name: 'NM_EMAIL_USUARIO', type: 'varchar', length: '225', nullable: false, primaryKey: false, identity: false },
          { id: 'c28', name: 'DS_TIPO', type: 'varchar', length: '50', nullable: false, primaryKey: false, identity: false },
          { id: 'c29', name: 'CREATED_AT', type: 'datetime', nullable: false, primaryKey: false, identity: false, defaultValue: 'CURRENT_TIMESTAMP' },
        ],
      },
      {
        id: 'tbl_aprovacao',
        name: 'APROVACAO',
        description: 'Registro de aprovações de pagamento.',
        columns: [
          { id: 'c30', name: 'ID_APROVACAO', type: 'int', nullable: false, primaryKey: true, identity: true },
          { id: 'c31', name: 'ID_EMPRESA_PAGADORA', type: 'int', nullable: false, primaryKey: false, identity: false },
          { id: 'c32', name: 'NM_APROVADOR', type: 'varchar', length: '120', nullable: false, primaryKey: false, identity: false },
          { id: 'c33', name: 'DS_STATUS', type: 'varchar', length: '30', nullable: false, primaryKey: false, identity: false, defaultValue: "'PENDENTE'" },
          { id: 'c34', name: 'DT_APROVACAO', type: 'datetime', nullable: true, primaryKey: false, identity: false },
        ],
      },
      {
        id: 'tbl_agend_forn',
        name: 'AGENDAMENTO_CONTA_FORNECEDOR',
        description: 'Agendamentos de contas a pagar para fornecedores.',
        columns: [
          { id: 'c35', name: 'ID_AGENDAMENTO', type: 'int', nullable: false, primaryKey: true, identity: true },
          { id: 'c36', name: 'ID_EMPRESA_PAGADORA', type: 'int', nullable: false, primaryKey: false, identity: false },
          { id: 'c37', name: 'NM_FORNECEDOR', type: 'varchar', length: '180', nullable: false, primaryKey: false, identity: false },
          { id: 'c38', name: 'VL_PAGAMENTO', type: 'decimal', length: '14,2', nullable: false, primaryKey: false, identity: false },
          { id: 'c39', name: 'DT_VENCIMENTO', type: 'date', nullable: false, primaryKey: false, identity: false },
        ],
      },
    ];

    const relations = [
      {
        id: 'rel_1',
        name: 'fk_conta_sap_empresa_pagadora',
        fromTableId: 'tbl_emp_conta_sap',
        fromColumn: 'ID_EMPRESA_PAGADORA',
        toTableId: 'tbl_emp_pagadora',
        toColumn: 'ID_EMPRESA_PAGADORA',
        cardinality: '1xN',
        optional: false,
        onDelete: 'NONE',
      },
      {
        id: 'rel_2',
        name: 'fk_conta_empresa_pagadora',
        fromTableId: 'tbl_emp_conta',
        fromColumn: 'ID_EMPRESA_PAGADORA',
        toTableId: 'tbl_emp_pagadora',
        toColumn: 'ID_EMPRESA_PAGADORA',
        cardinality: '1xN',
        optional: false,
        onDelete: 'NONE',
      },
      {
        id: 'rel_3',
        name: 'fk_historico_empresa_pagadora',
        fromTableId: 'tbl_emp_hist',
        fromColumn: 'ID_EMPRESA_PAGADORA',
        toTableId: 'tbl_emp_pagadora',
        toColumn: 'ID_EMPRESA_PAGADORA',
        cardinality: '1xN',
        optional: false,
        onDelete: 'CASCADE',
      },
      {
        id: 'rel_4',
        name: 'fk_aprovacao_empresa_pagadora',
        fromTableId: 'tbl_aprovacao',
        fromColumn: 'ID_EMPRESA_PAGADORA',
        toTableId: 'tbl_emp_pagadora',
        toColumn: 'ID_EMPRESA_PAGADORA',
        cardinality: '1xN',
        optional: true,
        onDelete: 'NONE',
      },
      {
        id: 'rel_5',
        name: 'fk_agendamento_empresa_pagadora',
        fromTableId: 'tbl_agend_forn',
        fromColumn: 'ID_EMPRESA_PAGADORA',
        toTableId: 'tbl_emp_pagadora',
        toColumn: 'ID_EMPRESA_PAGADORA',
        cardinality: '1xN',
        optional: false,
        onDelete: 'NONE',
      },
    ];

    const subModels = [
      {
        id: 'sub_empresa_pagadora',
        name: 'Empresa Pagadora',
        tableIds: [
          'tbl_emp_pagadora',
          'tbl_emp_hist',
          'tbl_emp_conta_sap',
          'tbl_emp_conta',
        ],
        positions: {
          tbl_emp_hist: { x: 70, y: 40 },
          tbl_emp_conta_sap: { x: 70, y: 260 },
          tbl_emp_conta: { x: 70, y: 520 },
          tbl_emp_pagadora: { x: 520, y: 170 },
        },
      },
      {
        id: 'sub_principal',
        name: 'Principal',
        tableIds: ['tbl_emp_pagadora', 'tbl_aprovacao', 'tbl_agend_forn'],
        positions: {
          tbl_aprovacao: { x: 80, y: 80 },
          tbl_agend_forn: { x: 80, y: 340 },
          tbl_emp_pagadora: { x: 510, y: 140 },
        },
      },
    ];

    const history = [
      {
        id: 'hist_seed_1',
        summary: 'Projeto inicial "CAPG" criado com 6 tabelas e 2 SubModels.',
        author: ownerName,
        createdAt: now,
      },
    ];

    await this.execute(
      `INSERT INTO er_projects (
         id, owner_id, name, description, dialect, owner,
         tables_json, relations_json, submodels_json, active_submodel_id,
         db_config_json, pending_changes_json, history_json,
         created_at, updated_at
       )
       VALUES (?, ?, ?, ?, 'mysql', ?, ?, ?, ?, 'sub_empresa_pagadora', NULL, '[]', ?, ?, ?)`,
      [
        randomUUID(),
        ownerId,
        'CAPG',
        'Modelo entidade-relacionamento de contas a pagar e empresas pagadoras.',
        ownerName,
        JSON.stringify(tables),
        JSON.stringify(relations),
        JSON.stringify(subModels),
        JSON.stringify(history),
        now,
        now,
      ],
    );
  }
}
