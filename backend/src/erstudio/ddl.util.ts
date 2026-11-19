import { randomUUID } from 'node:crypto';
import {
  DbDialect,
  ErColumn,
  ErRelation,
  ErTable,
} from './erstudio.types';

function cleanIdentifier(raw: string): string {
  return raw
    .trim()
    .replace(/^[`"\[]+|[`"\]]+$/g, '')
    .split('.')
    .pop()!
    .replace(/^[`"\[]+|[`"\]]+$/g, '')
    .trim();
}

function splitTopLevelCommas(body: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inSingle = false;
  let inDouble = false;
  let current = '';

  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (ch === "'" && !inDouble) {
      inSingle = !inSingle;
      current += ch;
    } else if (ch === '"' && !inSingle) {
      inDouble = !inDouble;
      current += ch;
    } else if (!inSingle && !inDouble) {
      if (ch === '(') depth++;
      else if (ch === ')') depth = Math.max(0, depth - 1);
      else if (ch === ',' && depth === 0) {
        if (current.trim()) parts.push(current.trim());
        current = '';
        continue;
      }
      current += ch;
    } else {
      current += ch;
    }
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

export function parseDdlScript(ddl: string): {
  tables: ErTable[];
  relations: ErRelation[];
} {
  const withoutComments = ddl
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\r\n]*/g, ' ');

  const tables: ErTable[] = [];
  const tableByName = new Map<string, ErTable>();
  const pendingFks: Array<{
    name?: string;
    fromTable: string;
    fromColumn: string;
    toTable: string;
    toColumn: string;
    onDelete?: ErRelation['onDelete'];
  }> = [];

  const createRegex =
    /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?([`"\[\]\w.]+)\s*\(/gi;

  let match: RegExpExecArray | null;
  while ((match = createRegex.exec(withoutComments)) !== null) {
    const tableName = cleanIdentifier(match[1]);
    const openIdx = match.index + match[0].length - 1;
    let depth = 0;
    let closeIdx = -1;
    for (let i = openIdx; i < withoutComments.length; i++) {
      if (withoutComments[i] === '(') depth++;
      else if (withoutComments[i] === ')') {
        depth--;
        if (depth === 0) {
          closeIdx = i;
          break;
        }
      }
    }
    if (closeIdx === -1) continue;

    const body = withoutComments.slice(openIdx + 1, closeIdx);
    const items = splitTopLevelCommas(body);
    const columns: ErColumn[] = [];
    const tablePks = new Set<string>();

    for (const item of items) {
      const trimmed = item.trim();
      if (!trimmed) continue;

      // Table-level PRIMARY KEY
      const pkMatch = trimmed.match(
        /^(?:CONSTRAINT\s+[`"\[\]\w]+\s+)?PRIMARY\s+KEY\s*\(([^)]+)\)/i,
      );
      if (pkMatch) {
        pkMatch[1]
          .split(',')
          .map((c) => cleanIdentifier(c).toLowerCase())
          .forEach((c) => tablePks.add(c));
        continue;
      }

      // Table-level FOREIGN KEY
      const fkMatch = trimmed.match(
        /^(?:CONSTRAINT\s+([`"\[\]\w]+)\s+)?FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+([`"\[\]\w.]+)\s*\(([^)]+)\)(.*)$/i,
      );
      if (fkMatch) {
        const rest = fkMatch[5] ?? '';
        const onDel = rest.match(/ON\s+DELETE\s+(CASCADE|SET\s+NULL|RESTRICT)/i);
        pendingFks.push({
          name: fkMatch[1] ? cleanIdentifier(fkMatch[1]) : undefined,
          fromTable: tableName,
          fromColumn: cleanIdentifier(fkMatch[2].split(',')[0]),
          toTable: cleanIdentifier(fkMatch[3]),
          toColumn: cleanIdentifier(fkMatch[4].split(',')[0]),
          onDelete: onDel
            ? (onDel[1].toUpperCase().replace(/\s+/, ' ') as ErRelation['onDelete'])
            : 'NONE',
        });
        continue;
      }

      if (/^(UNIQUE|INDEX|KEY|CHECK|CONSTRAINT)\b/i.test(trimmed)) {
        continue;
      }

      // Column definition
      const colMatch = trimmed.match(
        /^([`"\[\]\w]+)\s+([a-zA-Z0-9_]+)(?:\s*\(([^)]+)\))?(.*)$/,
      );
      if (!colMatch) continue;

      const colName = cleanIdentifier(colMatch[1]);
      let colType = colMatch[2].toLowerCase();
      const colLength = colMatch[3]?.trim() || undefined;
      const rest = colMatch[4] ?? '';

      const isSerial = colType === 'serial' || colType === 'bigserial';
      if (colType === 'serial') colType = 'int';
      if (colType === 'bigserial') colType = 'bigint';

      const primaryKey = /\bPRIMARY\s+KEY\b/i.test(rest);
      const identity =
        isSerial ||
        /\b(AUTO_INCREMENT|AUTOINCREMENT|IDENTITY|GENERATED\s+(?:ALWAYS|BY\s+DEFAULT)\s+AS\s+IDENTITY)\b/i.test(
          rest,
        );
      const notNull = primaryKey || /\bNOT\s+NULL\b/i.test(rest);

      const defaultMatch = rest.match(
        /\bDEFAULT\s+('(?:''|[^'])*'|"[^"]*"|[^\s,]+)/i,
      );
      const defaultValue = defaultMatch ? defaultMatch[1].trim() : undefined;

      // Inline REFERENCES
      const inlineRef = rest.match(
        /\bREFERENCES\s+([`"\[\]\w.]+)\s*\(([^)]+)\)/i,
      );
      if (inlineRef) {
        const onDel = rest.match(/ON\s+DELETE\s+(CASCADE|SET\s+NULL|RESTRICT)/i);
        pendingFks.push({
          fromTable: tableName,
          fromColumn: colName,
          toTable: cleanIdentifier(inlineRef[1]),
          toColumn: cleanIdentifier(inlineRef[2]),
          onDelete: onDel
            ? (onDel[1].toUpperCase().replace(/\s+/, ' ') as ErRelation['onDelete'])
            : 'NONE',
        });
      }

      columns.push({
        id: `col_${randomUUID().slice(0, 8)}`,
        name: colName,
        type: colType,
        length: colLength,
        nullable: !notNull,
        primaryKey,
        identity,
        defaultValue,
      });
    }

    for (const col of columns) {
      if (tablePks.has(col.name.toLowerCase())) {
        col.primaryKey = true;
        col.nullable = false;
      }
    }

    const table: ErTable = {
      id: `tbl_${randomUUID().slice(0, 8)}`,
      name: tableName,
      columns,
    };
    tables.push(table);
    tableByName.set(tableName.toLowerCase(), table);
  }

  // ALTER TABLE ... ADD FOREIGN KEY
  const alterFkRegex =
    /ALTER\s+TABLE\s+([`"\[\]\w.]+)\s+ADD\s+(?:CONSTRAINT\s+([`"\[\]\w]+)\s+)?FOREIGN\s+KEY\s*\(([^)]+)\)\s+REFERENCES\s+([`"\[\]\w.]+)\s*\(([^)]+)\)([^;]*)/gi;
  while ((match = alterFkRegex.exec(withoutComments)) !== null) {
    const rest = match[6] ?? '';
    const onDel = rest.match(/ON\s+DELETE\s+(CASCADE|SET\s+NULL|RESTRICT)/i);
    pendingFks.push({
      name: match[2] ? cleanIdentifier(match[2]) : undefined,
      fromTable: cleanIdentifier(match[1]),
      fromColumn: cleanIdentifier(match[3].split(',')[0]),
      toTable: cleanIdentifier(match[4]),
      toColumn: cleanIdentifier(match[5].split(',')[0]),
      onDelete: onDel
        ? (onDel[1].toUpperCase().replace(/\s+/, ' ') as ErRelation['onDelete'])
        : 'NONE',
    });
  }

  const relations: ErRelation[] = [];
  const seenRel = new Set<string>();

  for (const fk of pendingFks) {
    const fromT = tableByName.get(fk.fromTable.toLowerCase());
    const toT = tableByName.get(fk.toTable.toLowerCase());
    if (!fromT || !toT) continue;

    const fromCol = fromT.columns.find(
      (c) => c.name.toLowerCase() === fk.fromColumn.toLowerCase(),
    );
    const toCol = toT.columns.find(
      (c) => c.name.toLowerCase() === fk.toColumn.toLowerCase(),
    );
    const key = `${fromT.id}:${fromCol?.name ?? fk.fromColumn}->${toT.id}:${toCol?.name ?? fk.toColumn}`;
    if (seenRel.has(key)) continue;
    seenRel.add(key);

    relations.push({
      id: `rel_${randomUUID().slice(0, 8)}`,
      name:
        fk.name ||
        `fk_${fromT.name.toLowerCase()}_${toT.name.toLowerCase()}`,
      fromTableId: fromT.id,
      fromColumn: fromCol?.name ?? fk.fromColumn,
      toTableId: toT.id,
      toColumn: toCol?.name ?? fk.toColumn,
      cardinality: '1xN',
      optional: fromCol ? fromCol.nullable : true,
      onDelete: fk.onDelete ?? 'NONE',
    });
  }

  return { tables, relations };
}

export function formatColumnType(col: { type: string; length?: string }): string {
  return col.length?.trim() ? `${col.type}(${col.length.trim()})` : col.type;
}

export function generateColumnSql(col: ErColumn, dialect: DbDialect): string {
  let typeStr = formatColumnType(col);
  if (col.identity) {
    if (dialect === 'postgresql') {
      typeStr = col.type === 'bigint' ? 'BIGSERIAL' : 'SERIAL';
    } else if (dialect === 'mysql') {
      typeStr = `${typeStr} AUTO_INCREMENT`;
    } else if (dialect === 'sqlserver') {
      typeStr = `${typeStr} IDENTITY(1,1)`;
    } else if (dialect === 'sqlite' && col.primaryKey) {
      typeStr = 'INTEGER PRIMARY KEY AUTOINCREMENT';
    }
  }

  const parts = [col.name, typeStr];
  if (dialect !== 'sqlite' || !(col.identity && col.primaryKey)) {
    parts.push(col.nullable ? 'NULL' : 'NOT NULL');
  }
  if (col.defaultValue?.trim() && !col.identity) {
    parts.push(`DEFAULT ${col.defaultValue.trim()}`);
  }
  return parts.join(' ');
}

export function generateCreateTableSql(
  table: ErTable,
  dialect: DbDialect,
): string {
  const colLines = table.columns.map(
    (col) => `  ${generateColumnSql(col, dialect)}`,
  );
  const pks = table.columns.filter((c) => c.primaryKey);
  if (
    pks.length > 0 &&
    !(dialect === 'sqlite' && pks.length === 1 && pks[0].identity)
  ) {
    colLines.push(`  PRIMARY KEY (${pks.map((c) => c.name).join(', ')})`);
  }
  return `CREATE TABLE ${table.name} (\n${colLines.join(',\n')}\n);`;
}

export function generateAddRelationSql(
  rel: {
    name: string;
    fromTable: string;
    fromColumn: string;
    toTable: string;
    toColumn: string;
    onDelete?: ErRelation['onDelete'];
  },
): string {
  const onDeleteClause =
    rel.onDelete && rel.onDelete !== 'NONE' ? ` ON DELETE ${rel.onDelete}` : '';
  return `ALTER TABLE ${rel.fromTable} ADD CONSTRAINT ${rel.name} FOREIGN KEY (${rel.fromColumn}) REFERENCES ${rel.toTable} (${rel.toColumn})${onDeleteClause};`;
}
