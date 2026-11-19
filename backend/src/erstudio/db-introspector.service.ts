import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Client as PgClient } from 'pg';
import * as mysql from 'mysql2/promise';
import {
  ErColumn,
  ErDbConnectionTestInput,
  ErRelation,
  ErTable,
} from './erstudio.types';

/**
 * Serviço de introspecção de DDL estritamente SOMENTE LEITURA.
 * Nenhuma operação de escrita (INSERT, UPDATE, DELETE, CREATE, ALTER, DROP) é executada no banco conectado.
 */
@Injectable()
export class DbIntrospectorService {
  private readonly logger = new Logger(DbIntrospectorService.name);

  async testConnection(
    config: ErDbConnectionTestInput,
  ): Promise<{ ok: true; message: string; tableCount: number }> {
    const schema = await this.readSchemaReadOnly(config);
    return {
      ok: true,
      message: `Conexão somente leitura estabelecida com sucesso (${config.dialect}).`,
      tableCount: schema.tables.length,
    };
  }

  async readSchemaReadOnly(config: ErDbConnectionTestInput): Promise<{
    tables: ErTable[];
    relations: ErRelation[];
  }> {
    if (!config.database?.trim()) {
      throw new BadRequestException(
        'Informe o nome do banco de dados (ou caminho do arquivo SQLite).',
      );
    }

    switch (config.dialect) {
      case 'postgresql':
        return this.introspectPostgresReadOnly(config);
      case 'mysql':
        return this.introspectMysqlReadOnly(config);
      case 'sqlite':
        return this.introspectSqliteReadOnly(config);
      default:
        throw new BadRequestException(
          `Leitura direta de "${config.dialect}" ainda não suportada via driver; cole o script DDL na aba Origem.`,
        );
    }
  }

  private async introspectPostgresReadOnly(
    config: ErDbConnectionTestInput,
  ): Promise<{ tables: ErTable[]; relations: ErRelation[] }> {
    const schemaName = config.schema?.trim() || 'public';
    const client = new PgClient({
      host: config.host?.trim() || 'localhost',
      port: Number(config.port) || 5432,
      database: config.database.trim(),
      user: config.username?.trim(),
      password: config.password ?? '',
      ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
      connectionTimeoutMillis: 8000,
      statement_timeout: 15000,
    });

    try {
      await client.connect();
      // Garante sessão/transação estritamente somente leitura no PostgreSQL
      await client.query('BEGIN TRANSACTION READ ONLY');

      const tablesRes = await client.query<{ table_name: string }>(
        `SELECT table_name
         FROM information_schema.tables
         WHERE table_schema = $1 AND table_type = 'BASE TABLE'
         ORDER BY table_name`,
        [schemaName],
      );

      const colsRes = await client.query<{
        table_name: string;
        column_name: string;
        data_type: string;
        udt_name: string;
        character_maximum_length: number | null;
        numeric_precision: number | null;
        numeric_scale: number | null;
        is_nullable: string;
        column_default: string | null;
        is_identity: string;
      }>(
        `SELECT table_name, column_name, data_type, udt_name,
                character_maximum_length, numeric_precision, numeric_scale,
                is_nullable, column_default, is_identity
         FROM information_schema.columns
         WHERE table_schema = $1
         ORDER BY table_name, ordinal_position`,
        [schemaName],
      );

      const pkRes = await client.query<{
        table_name: string;
        column_name: string;
      }>(
        `SELECT tc.table_name, kcu.column_name
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
         WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = $1`,
        [schemaName],
      );

      const fkRes = await client.query<{
        constraint_name: string;
        from_table: string;
        from_column: string;
        to_table: string;
        to_column: string;
        delete_rule: string;
      }>(
        `SELECT
           tc.constraint_name,
           tc.table_name AS from_table,
           kcu.column_name AS from_column,
           ccu.table_name AS to_table,
           ccu.column_name AS to_column,
           rc.delete_rule
         FROM information_schema.table_constraints tc
         JOIN information_schema.key_column_usage kcu
           ON tc.constraint_name = kcu.constraint_name AND tc.table_schema = kcu.table_schema
         JOIN information_schema.constraint_column_usage ccu
           ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
         JOIN information_schema.referential_constraints rc
           ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.table_schema
         WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = $1`,
        [schemaName],
      );

      await client.query('ROLLBACK');

      const pkSet = new Set(
        pkRes.rows.map((r) => `${r.table_name}::${r.column_name}`),
      );
      const tableMap = new Map<string, ErTable>();
      const tables: ErTable[] = [];

      for (const row of tablesRes.rows) {
        const tbl: ErTable = {
          id: `tbl_${randomUUID().slice(0, 8)}`,
          name: row.table_name,
          columns: [],
        };
        tables.push(tbl);
        tableMap.set(row.table_name, tbl);
      }

      for (const col of colsRes.rows) {
        const tbl = tableMap.get(col.table_name);
        if (!tbl) continue;

        let type = col.data_type === 'character varying'
          ? 'varchar'
          : col.data_type === 'character'
            ? 'char'
            : col.data_type === 'integer'
              ? 'int'
              : col.data_type === 'timestamp without time zone'
                ? 'timestamp'
                : col.data_type === 'timestamp with time zone'
                  ? 'timestamptz'
                  : col.udt_name || col.data_type;

        let length: string | undefined;
        if (col.character_maximum_length) {
          length = String(col.character_maximum_length);
        } else if (
          (type === 'numeric' || type === 'decimal') &&
          col.numeric_precision
        ) {
          length = col.numeric_scale
            ? `${col.numeric_precision},${col.numeric_scale}`
            : String(col.numeric_precision);
        }

        const isIdentity =
          col.is_identity === 'YES' ||
          Boolean(col.column_default && col.column_default.includes('nextval('));

        tbl.columns.push({
          id: `col_${randomUUID().slice(0, 8)}`,
          name: col.column_name,
          type,
          length,
          nullable: col.is_nullable === 'YES',
          primaryKey: pkSet.has(`${col.table_name}::${col.column_name}`),
          identity: isIdentity,
          defaultValue: isIdentity ? undefined : col.column_default ?? undefined,
        });
      }

      const relations: ErRelation[] = [];
      for (const fk of fkRes.rows) {
        const fromT = tableMap.get(fk.from_table);
        const toT = tableMap.get(fk.to_table);
        if (!fromT || !toT) continue;
        const fromCol = fromT.columns.find((c) => c.name === fk.from_column);
        relations.push({
          id: `rel_${randomUUID().slice(0, 8)}`,
          name: fk.constraint_name,
          fromTableId: fromT.id,
          fromColumn: fk.from_column,
          toTableId: toT.id,
          toColumn: fk.to_column,
          cardinality: '1xN',
          optional: fromCol ? fromCol.nullable : true,
          onDelete: this.normalizeDeleteRule(fk.delete_rule),
        });
      }

      return { tables, relations };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Erro ao ler PostgreSQL (somente leitura): ${message}`);
      throw new BadRequestException(
        `Falha ao conectar/ler PostgreSQL (somente leitura): ${message}`,
      );
    } finally {
      await client.end().catch(() => {});
    }
  }

  private async introspectMysqlReadOnly(
    config: ErDbConnectionTestInput,
  ): Promise<{ tables: ErTable[]; relations: ErRelation[] }> {
    const dbName = config.database.trim();
    const conn = await mysql
      .createConnection({
        host: config.host?.trim() || 'localhost',
        port: Number(config.port) || 3306,
        database: dbName,
        user: config.username?.trim(),
        password: config.password ?? '',
        ssl: config.ssl ? { rejectUnauthorized: false } : undefined,
        connectTimeout: 8000,
      })
      .catch((error) => {
        const msg = error instanceof Error ? error.message : String(error);
        throw new BadRequestException(
          `Falha ao conectar ao MySQL (somente leitura): ${msg}`,
        );
      });

    try {
      await conn.query('SET SESSION TRANSACTION READ ONLY');
      await conn.query('START TRANSACTION READ ONLY');

      const [tableRows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT TABLE_NAME
         FROM information_schema.TABLES
         WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE'
         ORDER BY TABLE_NAME`,
        [dbName],
      );

      const [colRows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_TYPE,
                IS_NULLABLE, COLUMN_KEY, EXTRA, COLUMN_DEFAULT
         FROM information_schema.COLUMNS
         WHERE TABLE_SCHEMA = ?
         ORDER BY TABLE_NAME, ORDINAL_POSITION`,
        [dbName],
      );

      const [fkRows] = await conn.query<mysql.RowDataPacket[]>(
        `SELECT kcu.CONSTRAINT_NAME, kcu.TABLE_NAME AS FROM_TABLE,
                kcu.COLUMN_NAME AS FROM_COLUMN,
                kcu.REFERENCED_TABLE_NAME AS TO_TABLE,
                kcu.REFERENCED_COLUMN_NAME AS TO_COLUMN,
                rc.DELETE_RULE
         FROM information_schema.KEY_COLUMN_USAGE kcu
         JOIN information_schema.REFERENTIAL_CONSTRAINTS rc
           ON rc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME AND rc.CONSTRAINT_SCHEMA = kcu.TABLE_SCHEMA
         WHERE kcu.TABLE_SCHEMA = ? AND kcu.REFERENCED_TABLE_NAME IS NOT NULL`,
        [dbName],
      );

      await conn.query('ROLLBACK');

      const tableMap = new Map<string, ErTable>();
      const tables: ErTable[] = [];

      for (const row of tableRows) {
        const name = String(row.TABLE_NAME);
        const tbl: ErTable = {
          id: `tbl_${randomUUID().slice(0, 8)}`,
          name,
          columns: [],
        };
        tables.push(tbl);
        tableMap.set(name, tbl);
      }

      for (const col of colRows) {
        const tbl = tableMap.get(String(col.TABLE_NAME));
        if (!tbl) continue;

        const colTypeRaw = String(col.COLUMN_TYPE ?? '');
        const lenMatch = colTypeRaw.match(/\(([^)]+)\)/);
        const extra = String(col.EXTRA ?? '').toLowerCase();

        tbl.columns.push({
          id: `col_${randomUUID().slice(0, 8)}`,
          name: String(col.COLUMN_NAME),
          type: String(col.DATA_TYPE ?? 'varchar').toLowerCase(),
          length: lenMatch ? lenMatch[1] : undefined,
          nullable: String(col.IS_NULLABLE) === 'YES',
          primaryKey: String(col.COLUMN_KEY) === 'PRI',
          identity: extra.includes('auto_increment'),
          defaultValue:
            col.COLUMN_DEFAULT !== null && col.COLUMN_DEFAULT !== undefined
              ? String(col.COLUMN_DEFAULT)
              : undefined,
        });
      }

      const relations: ErRelation[] = [];
      for (const fk of fkRows) {
        const fromT = tableMap.get(String(fk.FROM_TABLE));
        const toT = tableMap.get(String(fk.TO_TABLE));
        if (!fromT || !toT) continue;
        const fromCol = fromT.columns.find(
          (c) => c.name === String(fk.FROM_COLUMN),
        );
        relations.push({
          id: `rel_${randomUUID().slice(0, 8)}`,
          name: String(fk.CONSTRAINT_NAME),
          fromTableId: fromT.id,
          fromColumn: String(fk.FROM_COLUMN),
          toTableId: toT.id,
          toColumn: String(fk.TO_COLUMN),
          cardinality: '1xN',
          optional: fromCol ? fromCol.nullable : true,
          onDelete: this.normalizeDeleteRule(String(fk.DELETE_RULE ?? '')),
        });
      }

      return { tables, relations };
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(
        `Falha ao ler schema do MySQL (somente leitura): ${msg}`,
      );
    } finally {
      await conn.end().catch(() => {});
    }
  }

  private introspectSqliteReadOnly(config: ErDbConnectionTestInput): {
    tables: ErTable[];
    relations: ErRelation[];
  } {
    const filePath = resolve(config.database.trim());
    if (!existsSync(filePath)) {
      throw new BadRequestException(
        `Arquivo SQLite não encontrado: ${filePath}`,
      );
    }

    const db = new DatabaseSync(filePath, { readOnly: true });
    try {
      const tableRows = db
        .prepare(
          `SELECT name FROM sqlite_master
           WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
           ORDER BY name`,
        )
        .all() as Array<{ name: string }>;

      const tables: ErTable[] = [];
      const tableMap = new Map<string, ErTable>();

      for (const row of tableRows) {
        const escaped = row.name.replace(/"/g, '""');
        const colRows = db
          .prepare(`PRAGMA table_info("${escaped}")`)
          .all() as Array<{
          name: string;
          type: string;
          notnull: number;
          dflt_value: string | null;
          pk: number;
        }>;

        const columns: ErColumn[] = colRows.map((c) => {
          const typeStr = (c.type || 'text').toLowerCase();
          const typeMatch = typeStr.match(/^([a-z0-9_]+)(?:\(([^)]+)\))?/);
          return {
            id: `col_${randomUUID().slice(0, 8)}`,
            name: c.name,
            type: typeMatch?.[1] || 'text',
            length: typeMatch?.[2],
            nullable: c.notnull === 0 && c.pk === 0,
            primaryKey: c.pk > 0,
            identity: c.pk === 1 && (typeMatch?.[1] === 'integer' || typeMatch?.[1] === 'int'),
            defaultValue: c.dflt_value ?? undefined,
          };
        });

        const tbl: ErTable = {
          id: `tbl_${randomUUID().slice(0, 8)}`,
          name: row.name,
          columns,
        };
        tables.push(tbl);
        tableMap.set(row.name, tbl);
      }

      const relations: ErRelation[] = [];
      for (const tbl of tables) {
        const escaped = tbl.name.replace(/"/g, '""');
        const fkRows = db
          .prepare(`PRAGMA foreign_key_list("${escaped}")`)
          .all() as Array<{
          id: number;
          table: string;
          from: string;
          to: string;
          on_delete: string;
        }>;

        for (const fk of fkRows) {
          const target = tableMap.get(fk.table);
          if (!target) continue;
          const fromCol = tbl.columns.find((c) => c.name === fk.from);
          relations.push({
            id: `rel_${randomUUID().slice(0, 8)}`,
            name: `fk_${tbl.name.toLowerCase()}_${target.name.toLowerCase()}`,
            fromTableId: tbl.id,
            fromColumn: fk.from,
            toTableId: target.id,
            toColumn: fk.to || target.columns.find((c) => c.primaryKey)?.name || 'id',
            cardinality: '1xN',
            optional: fromCol ? fromCol.nullable : true,
            onDelete: this.normalizeDeleteRule(fk.on_delete),
          });
        }
      }

      return { tables, relations };
    } finally {
      db.close();
    }
  }

  private normalizeDeleteRule(rule: string): ErRelation['onDelete'] {
    const up = rule.toUpperCase();
    if (up === 'CASCADE') return 'CASCADE';
    if (up === 'SET NULL') return 'SET NULL';
    if (up === 'RESTRICT') return 'RESTRICT';
    return 'NONE';
  }
}
