export type DbDialect = 'mysql' | 'postgresql' | 'sqlserver' | 'sqlite';

export type ErAccessLevel = 'owner' | 'edit' | 'view';

export type OnDeleteAction = 'NONE' | 'CASCADE' | 'SET NULL' | 'RESTRICT';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  initials: string;
  avatarUrl: string | null;
  provider: 'local' | 'google' | 'both';
}

export interface ErColumn {
  id: string;
  name: string;
  type: string;
  length?: string;
  nullable: boolean;
  primaryKey: boolean;
  identity: boolean;
  defaultValue?: string;
}

export interface ErTable {
  id: string;
  name: string;
  description?: string;
  columns: ErColumn[];
}

export interface ErRelation {
  id: string;
  name: string;
  fromTableId: string;
  fromColumn: string;
  toTableId: string;
  toColumn: string;
  cardinality: '1xN' | '1x1';
  optional: boolean;
  onDelete?: OnDeleteAction;
}

export interface ErSubModel {
  id: string;
  name: string;
  tableIds: string[];
  positions: Record<string, { x: number; y: number }>;
}

export interface ErDbConnectionConfig {
  dialect: DbDialect;
  host: string;
  port: number;
  database: string;
  schema?: string;
  username: string;
  ssl?: boolean;
}

export interface ErDbConnectionTestInput extends ErDbConnectionConfig {
  password?: string;
}

export interface ErPendingChange {
  id: string;
  sql: string;
  description: string;
  createdAt: string;
}

export interface ErHistoryEntry {
  id: string;
  summary: string;
  author: string;
  createdAt: string;
}

export interface ErShare {
  id: string;
  target: string;
  permission: 'view' | 'edit';
  createdAt: string;
}

export interface ErProjectSummary {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  dialect: DbDialect;
  owner: string;
  accessLevel: ErAccessLevel;
  subModelCount: number;
  tableCount: number;
  sharedWith: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ErProjectRecord extends ErProjectSummary {
  tables: ErTable[];
  relations: ErRelation[];
  subModels: ErSubModel[];
  activeSubModelId: string;
  dbConfig: ErDbConnectionConfig | null;
  pendingChanges: ErPendingChange[];
  history: ErHistoryEntry[];
  shares: ErShare[];
}

export type ErAiOperation =
  | {
      op: 'create_table';
      tableName: string;
      description?: string;
      columns: Array<{
        name: string;
        type: string;
        length?: string;
        nullable?: boolean;
        primaryKey?: boolean;
        identity?: boolean;
        defaultValue?: string;
      }>;
    }
  | {
      op: 'rename_table';
      tableName: string;
      newName: string;
    }
  | {
      op: 'drop_table';
      tableName: string;
    }
  | {
      op: 'add_column';
      tableName: string;
      column: {
        name: string;
        type: string;
        length?: string;
        nullable?: boolean;
        primaryKey?: boolean;
        identity?: boolean;
        defaultValue?: string;
      };
    }
  | {
      op: 'rename_column';
      tableName: string;
      columnName: string;
      newName: string;
    }
  | {
      op: 'drop_column';
      tableName: string;
      columnName: string;
    }
  | {
      op: 'add_relation';
      name?: string;
      fromTable: string;
      fromColumn: string;
      toTable: string;
      toColumn: string;
      cardinality?: '1xN' | '1x1';
      optional?: boolean;
      onDelete?: OnDeleteAction;
    }
  | {
      op: 'drop_relation';
      fromTable: string;
      toTable: string;
      name?: string;
    };

export interface ErAiPlanResponse {
  summary: string;
  operations: ErAiOperation[];
  sqlStatements: string[];
  model: string;
}

export interface ErAiSummary {
  overview: string;
  highlights: string[];
  attentionPoints: string[];
  generatedByAi: boolean;
  model?: string;
}
