'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Check,
  Copy,
  Download,
  Globe,
  History,
  Layers,
  Link2,
  Pencil,
  Plus,
  Search,
  Share2,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import {
  DbDialect,
  ErAiPlanResponse,
  ErColumn,
  ErHistoryEntry,
  ErPendingChange,
  ErProjectRecord,
  ErRelation,
  ErShare,
  ErTable,
  OnDeleteAction,
} from '@/types/erstudio';
import {
  COLUMN_TYPES,
  createId,
  FIELD_PRESET_LANGUAGES,
  FIELD_PRESETS,
  FieldPresetLang,
  formatColType,
  formatDateTime,
  formatDialectLabel,
  formatUpdateScript,
} from '@/lib/er-utils';
import { AiProcessingState } from './AiProcessingOverlay';

function ModalBackdrop({
  title,
  subtitle,
  maxWidth = 'max-w-[640px]',
  onClose,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  maxWidth?: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4 backdrop-blur-[1px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`flex max-h-[90vh] w-full ${maxWidth} flex-col overflow-hidden rounded-2xl border border-[#CBD5E1] bg-white shadow-2xl`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[#E2E8F0] px-6 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-[18px] font-bold text-[#0F1D3D]">
              {title}
            </h2>
            {subtitle && (
              <p className="mt-0.5 text-[13px] text-[#64748B]">{subtitle}</p>
            )}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-lg p-1.5 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>

        {footer && (
          <div className="flex flex-wrap items-center justify-end gap-2.5 border-t border-[#E2E8F0] bg-[#FAFBFD] px-6 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* =========================================================================
 * 1. Novo Projeto
 * ========================================================================= */
export function NewProjectModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (payload: {
    name: string;
    description?: string;
    dialect: DbDialect;
    ddl?: string;
  }) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [dialect, setDialect] = useState<DbDialect>('postgresql');
  const [ddl, setDdl] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Informe o nome do projeto.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit({
        name: name.trim(),
        description: description.trim() || undefined,
        dialect,
        ddl: ddl.trim() || undefined,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao criar projeto.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalBackdrop
      title="Novo projeto de DER"
      subtitle="Defina o banco alvo e, se quiser, cole um script DDL inicial."
      maxWidth="max-w-[580px]"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#CBD5E1] bg-white px-4 py-2 text-[13.5px] font-medium text-[#334155] hover:bg-[#F8FAFC]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="new-er-project-form"
            disabled={submitting}
            className="rounded-lg bg-[#1D5FD6] px-4 py-2 text-[13.5px] font-semibold text-white hover:bg-[#174DB3] disabled:opacity-60"
          >
            {submitting ? 'Criando...' : 'Criar projeto'}
          </button>
        </>
      }
    >
      <form id="new-er-project-form" onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700">
            {error}
          </div>
        )}

        <div>
          <label className="block text-[12px] font-bold uppercase tracking-wide text-[#475569]">
            Nome do projeto *
          </label>
          <input
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Plataforma Financeira, ERP Vendas..."
            className="mt-1.5 h-10 w-full rounded-lg border border-[#CBD5E1] px-3 text-[14px] text-[#0F172A] outline-none focus:border-[#1D5FD6]"
          />
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="block text-[12px] font-bold uppercase tracking-wide text-[#475569]">
              Banco de dados alvo
            </label>
            <select
              value={dialect}
              onChange={(e) => setDialect(e.target.value as DbDialect)}
              className="mt-1.5 h-10 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-[14px] text-[#0F172A] outline-none focus:border-[#1D5FD6]"
            >
              <option value="postgresql">PostgreSQL</option>
              <option value="mysql">MySQL</option>
              <option value="sqlserver">SQL Server</option>
              <option value="sqlite">SQLite</option>
            </select>
          </div>
          <div>
            <label className="block text-[12px] font-bold uppercase tracking-wide text-[#475569]">
              Descrição
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Opcional"
              className="mt-1.5 h-10 w-full rounded-lg border border-[#CBD5E1] px-3 text-[14px] text-[#0F172A] outline-none focus:border-[#1D5FD6]"
            />
          </div>
        </div>

        <div>
          <label className="block text-[12px] font-bold uppercase tracking-wide text-[#475569]">
            DDL SQL inicial (opcional)
          </label>
          <textarea
            rows={5}
            value={ddl}
            onChange={(e) => setDdl(e.target.value)}
            placeholder="CREATE TABLE clientes (id INT PRIMARY KEY, nome VARCHAR(120) NOT NULL);"
            className="mt-1.5 w-full rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] p-3 font-mono text-[12.5px] text-[#0F172A] outline-none focus:border-[#1D5FD6] focus:bg-white"
          />
          <p className="mt-1 text-[12px] text-[#64748B]">
            Você também poderá conectar diretamente a um banco (somente leitura) dentro do editor na aba <strong>Origem</strong>.
          </p>
        </div>
      </form>
    </ModalBackdrop>
  );
}

/* =========================================================================
 * 2. Editar metadados do Projeto
 * ========================================================================= */
export function EditProjectModal({
  project,
  onClose,
  onSave,
}: {
  project: ErProjectRecord;
  onClose: () => void;
  onSave: (patch: { name: string; description: string; dialect: DbDialect }) => void;
}) {
  const [name, setName] = useState(project.name);
  const [description, setDescription] = useState(project.description);
  const [dialect, setDialect] = useState<DbDialect>(project.dialect);

  return (
    <ModalBackdrop
      title="Editar projeto"
      maxWidth="max-w-[480px]"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#CBD5E1] bg-white px-4 py-2 text-[13.5px] font-medium text-[#334155] hover:bg-[#F8FAFC]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              if (!name.trim()) return;
              onSave({
                name: name.trim(),
                description: description.trim(),
                dialect,
              });
              onClose();
            }}
            className="rounded-lg bg-[#1D5FD6] px-4 py-2 text-[13.5px] font-semibold text-white hover:bg-[#174DB3]"
          >
            Salvar alterações
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-[12px] font-bold uppercase tracking-wide text-[#475569]">
            Nome do projeto
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1.5 h-10 w-full rounded-lg border border-[#CBD5E1] px-3 text-[14px] text-[#0F172A] outline-none focus:border-[#1D5FD6]"
          />
        </div>
        <div>
          <label className="block text-[12px] font-bold uppercase tracking-wide text-[#475569]">
            Descrição
          </label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="mt-1.5 h-10 w-full rounded-lg border border-[#CBD5E1] px-3 text-[14px] text-[#0F172A] outline-none focus:border-[#1D5FD6]"
          />
        </div>
        <div>
          <label className="block text-[12px] font-bold uppercase tracking-wide text-[#475569]">
            Banco de dados alvo
          </label>
          <select
            value={dialect}
            onChange={(e) => setDialect(e.target.value as DbDialect)}
            className="mt-1.5 h-10 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-[14px] text-[#0F172A] outline-none focus:border-[#1D5FD6]"
          >
            <option value="postgresql">PostgreSQL</option>
            <option value="mysql">MySQL</option>
            <option value="sqlserver">SQL Server</option>
            <option value="sqlite">SQLite</option>
          </select>
        </div>
      </div>
    </ModalBackdrop>
  );
}

/* =========================================================================
 * 3. Novo SubModel
 * ========================================================================= */
export function NewSubModelModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string, copyActiveTables: boolean) => void;
}) {
  const [name, setName] = useState('');
  const [copyActive, setCopyActive] = useState(false);

  return (
    <ModalBackdrop
      title="Novo SubModel (DER)"
      subtitle="Crie uma visão dedicada de um domínio ou módulo do banco de dados."
      maxWidth="max-w-[460px]"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#CBD5E1] bg-white px-4 py-2 text-[13.5px] font-medium text-[#334155] hover:bg-[#F8FAFC]"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!name.trim()}
            onClick={() => {
              if (!name.trim()) return;
              onCreate(name.trim(), copyActive);
              onClose();
            }}
            className="rounded-lg bg-[#1D5FD6] px-4 py-2 text-[13.5px] font-semibold text-white hover:bg-[#174DB3] disabled:opacity-50"
          >
            Criar SubModel
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-[12px] font-bold uppercase tracking-wide text-[#475569]">
            Nome do SubModel *
          </label>
          <input
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Faturamento, Empresa Pagadora, Cadastros..."
            className="mt-1.5 h-10 w-full rounded-lg border border-[#CBD5E1] px-3 text-[14px] text-[#0F172A] outline-none focus:border-[#1D5FD6]"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-[13.5px] text-[#334155]">
          <input
            type="checkbox"
            checked={copyActive}
            onChange={(e) => setCopyActive(e.target.checked)}
            className="h-4 w-4 rounded accent-[#1D5FD6]"
          />
          Copiar tabelas e posições do SubModel ativo
        </label>
      </div>
    </ModalBackdrop>
  );
}

/* =========================================================================
 * 4. Detalhes / Edição de Tabela (imagens 15.41.34 e 15.41.45)
 * ========================================================================= */
export function TableDetailModal({
  table,
  relations,
  readOnly,
  initialEditMode = false,
  onClose,
  onSaveTable,
  onDeleteTable,
}: {
  table: ErTable;
  relations: ErRelation[];
  readOnly: boolean;
  initialEditMode?: boolean;
  onClose: () => void;
  onSaveTable: (
    updated: ErTable,
    sqlStatements: string[],
    summary: string,
  ) => void;
  onDeleteTable: (tableId: string) => void;
}) {
  const [editMode, setEditMode] = useState(initialEditMode && !readOnly);
  const [renaming, setRenaming] = useState(false);
  const [tableName, setTableName] = useState(table.name);
  const [columns, setColumns] = useState<ErColumn[]>(() =>
    table.columns.map((c) => ({ ...c })),
  );
  const [error, setError] = useState<string | null>(null);

  const fkCols = useMemo(() => {
    const set = new Set<string>();
    for (const r of relations) {
      if (r.fromTableId === table.id) {
        set.add(r.fromColumn.toLowerCase());
      }
    }
    return set;
  }, [relations, table.id]);

  const addColumnRow = () => {
    setColumns((prev) => [
      ...prev,
      {
        id: createId('col'),
        name: `nova_coluna_${prev.length + 1}`,
        type: 'varchar',
        length: '100',
        nullable: true,
        primaryKey: false,
        identity: false,
        defaultValue: '',
      },
    ]);
  };

  const updateCol = (id: string, patch: Partial<ErColumn>) => {
    setColumns((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    );
  };

  const removeCol = (id: string) => {
    setColumns((prev) => prev.filter((c) => c.id !== id));
  };

  const handleSave = () => {
    const cleanName = tableName.trim();
    if (!cleanName) {
      setError('O nome da tabela não pode ficar vazio.');
      return;
    }
    const cleanCols = columns
      .map((c) => ({
        ...c,
        name: c.name.trim(),
        type: c.type.trim() || 'varchar',
        length: c.length?.trim() || undefined,
        defaultValue: c.defaultValue?.trim() || undefined,
      }))
      .filter((c) => Boolean(c.name));

    if (cleanCols.length === 0) {
      setError('A tabela precisa ter ao menos uma coluna.');
      return;
    }

    const sqlStatements: string[] = [];
    const summaries: string[] = [];

    if (cleanName !== table.name) {
      sqlStatements.push(`ALTER TABLE ${table.name} RENAME TO ${cleanName};`);
      summaries.push(`Renomeou ${table.name} para ${cleanName}`);
    }

    const origById = new Map(table.columns.map((c) => [c.id, c]));
    const newById = new Map(cleanCols.map((c) => [c.id, c]));

    for (const oldCol of table.columns) {
      if (!newById.has(oldCol.id)) {
        sqlStatements.push(
          `ALTER TABLE ${cleanName} DROP COLUMN ${oldCol.name};`,
        );
        summaries.push(`Removeu coluna ${cleanName}.${oldCol.name}`);
      }
    }

    for (const col of cleanCols) {
      const prev = origById.get(col.id);
      const typeSpec = formatColType(col);
      const nullSql = col.nullable ? 'NULL' : 'NOT NULL';
      const defSql = col.defaultValue ? ` DEFAULT ${col.defaultValue}` : '';
      if (!prev) {
        sqlStatements.push(
          `ALTER TABLE ${cleanName} ADD COLUMN ${col.name} ${typeSpec} ${nullSql}${defSql};`,
        );
        summaries.push(`Adicionou coluna ${cleanName}.${col.name}`);
      } else {
        if (prev.name !== col.name) {
          sqlStatements.push(
            `ALTER TABLE ${cleanName} RENAME COLUMN ${prev.name} TO ${col.name};`,
          );
          summaries.push(
            `Renomeou coluna ${cleanName}.${prev.name} para ${col.name}`,
          );
        }
        const changedType =
          prev.type !== col.type ||
          (prev.length ?? '') !== (col.length ?? '') ||
          prev.nullable !== col.nullable ||
          (prev.defaultValue ?? '') !== (col.defaultValue ?? '');
        if (changedType) {
          sqlStatements.push(
            `ALTER TABLE ${cleanName} MODIFY COLUMN ${col.name} ${typeSpec} ${nullSql}${defSql};`,
          );
          summaries.push(`Alterou coluna ${cleanName}.${col.name}`);
        }
      }
    }

    onSaveTable(
      { ...table, name: cleanName, columns: cleanCols },
      sqlStatements,
      summaries.join('; ') || `Editou tabela ${cleanName}`,
    );
    onClose();
  };

  return (
    <ModalBackdrop
      title={`Tabela ${tableName || table.name}`}
      subtitle={`${columns.length} coluna(s) cadastrada(s)`}
      maxWidth={editMode ? 'max-w-[820px]' : 'max-w-[700px]'}
      onClose={onClose}
      footer={
        editMode || renaming ? (
          <>
            <button
              type="button"
              onClick={() => {
                setTableName(table.name);
                setColumns(table.columns.map((c) => ({ ...c })));
                setEditMode(false);
                setRenaming(false);
                setError(null);
              }}
              className="rounded-lg border border-[#CBD5E1] bg-white px-4 py-2 text-[13.5px] font-medium text-[#334155] hover:bg-[#F8FAFC]"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSave}
              className="rounded-lg bg-[#1D5FD6] px-4 py-2 text-[13.5px] font-semibold text-white hover:bg-[#174DB3]"
            >
              Salvar alterações
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#CBD5E1] bg-white px-4 py-2 text-[13.5px] font-medium text-[#334155] hover:bg-[#F8FAFC]"
          >
            Fechar
          </button>
        )
      }
    >
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700">
          {error}
        </div>
      )}

      {/* Barra de ações igual à imagem 15.41.34 */}
      {!readOnly && (
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setEditMode((v) => !v)}
            className={[
              'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition-colors',
              editMode
                ? 'border-[#1D5FD6] bg-[#EFF6FF] text-[#1D5FD6]'
                : 'border-[#CBD5E1] bg-white text-[#1E293B] hover:bg-[#F8FAFC]',
            ].join(' ')}
          >
            <Pencil className="h-3.5 w-3.5" />
            {editMode ? 'Modo visualização' : 'Editar colunas'}
          </button>

          <button
            type="button"
            onClick={() => setRenaming((v) => !v)}
            className={[
              'inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[13px] font-semibold transition-colors',
              renaming
                ? 'border-[#1D5FD6] bg-[#EFF6FF] text-[#1D5FD6]'
                : 'border-[#CBD5E1] bg-white text-[#1E293B] hover:bg-[#F8FAFC]',
            ].join(' ')}
          >
            Renomear tabela
          </button>

          <button
            type="button"
            onClick={() => {
              if (
                window.confirm(
                  `Deseja realmente excluir a tabela "${table.name}" do modelo?`,
                )
              ) {
                onDeleteTable(table.id);
                onClose();
              }
            }}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-1.5 text-[13px] font-semibold text-red-600 hover:bg-red-100"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Excluir tabela
          </button>
        </div>
      )}

      {renaming && !readOnly && (
        <div className="mb-4 rounded-xl border border-[#BFDBFE] bg-[#F8FBFF] p-3.5">
          <label className="block text-[11.5px] font-bold uppercase tracking-wide text-[#475569]">
            Novo nome da tabela
          </label>
          <input
            type="text"
            value={tableName}
            onChange={(e) => setTableName(e.target.value)}
            className="mt-1.5 h-9 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 font-mono text-[13.5px] font-semibold text-[#0F172A] outline-none focus:border-[#1D5FD6]"
          />
        </div>
      )}

      {!editMode ? (
        <div className="overflow-x-auto rounded-xl border border-[#E2E8F0]">
          <table className="w-full border-collapse text-left text-[13px]">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                <th className="px-4 py-2.5">Campo</th>
                <th className="px-3 py-2.5">Tipo</th>
                <th className="px-3 py-2.5">Nulo</th>
                <th className="px-3 py-2.5">Identity</th>
                <th className="px-3 py-2.5">Default</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF2F6]">
              {columns.map((col) => {
                const isFk = fkCols.has(col.name.toLowerCase());
                return (
                  <tr
                    key={col.id}
                    className={col.primaryKey ? 'bg-[#FEF7DC]' : 'bg-white'}
                  >
                    <td className="px-4 py-2.5 font-medium text-[#0F172A]">
                      {col.primaryKey && (
                        <span className="mr-1.5 rounded bg-[#FEF3C7] px-1.5 py-0.5 text-[10px] font-bold text-[#92400E]">
                          PK
                        </span>
                      )}
                      {isFk && (
                        <span className="mr-1.5 rounded bg-[#DBEAFE] px-1.5 py-0.5 text-[10px] font-bold text-[#1D4ED8]">
                          FK
                        </span>
                      )}
                      {col.name}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[12.5px] text-[#475569]">
                      {formatColType(col)}
                    </td>
                    <td className="px-3 py-2.5 text-[#475569]">
                      {col.nullable ? 'Sim' : 'Não'}
                    </td>
                    <td className="px-3 py-2.5 text-[#475569]">
                      {col.identity ? 'Sim' : '—'}
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[12px] text-[#64748B]">
                      {col.defaultValue ?? '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        /* Modo de edição inline igual à imagem 15.41.45 */
        <div className="space-y-3">
          <div className="overflow-x-auto rounded-xl border border-[#E2E8F0]">
            <table className="w-full border-collapse text-left text-[12.5px]">
              <thead>
                <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[10.5px] font-bold uppercase tracking-wider text-[#64748B]">
                  <th className="px-2.5 py-2">Campo</th>
                  <th className="px-2 py-2">Tipo</th>
                  <th className="px-2 py-2 w-[74px]">Tam.</th>
                  <th className="px-2 py-2 text-center">PK</th>
                  <th className="px-2 py-2 text-center">Nulo</th>
                  <th className="px-2 py-2 text-center">Ident.</th>
                  <th className="px-2 py-2">Default</th>
                  <th className="w-9 px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-[#EEF2F6]">
                {columns.map((col) => (
                  <tr
                    key={col.id}
                    className={col.primaryKey ? 'bg-[#FEF9E7]/70' : 'bg-white'}
                  >
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        value={col.name}
                        onChange={(e) =>
                          updateCol(col.id, { name: e.target.value })
                        }
                        className="h-8 w-full min-w-[130px] rounded border border-[#CBD5E1] px-2 font-mono text-[12px] text-[#0F172A] outline-none focus:border-[#1D5FD6]"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        value={
                          COLUMN_TYPES.includes(col.type.toLowerCase())
                            ? col.type.toLowerCase()
                            : col.type
                        }
                        onChange={(e) =>
                          updateCol(col.id, { type: e.target.value })
                        }
                        className="h-8 rounded border border-[#CBD5E1] bg-white px-2 text-[12px] text-[#0F172A] outline-none focus:border-[#1D5FD6]"
                      >
                        {!COLUMN_TYPES.includes(col.type.toLowerCase()) && (
                          <option value={col.type}>{col.type}</option>
                        )}
                        {COLUMN_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        value={col.length ?? ''}
                        onChange={(e) =>
                          updateCol(col.id, { length: e.target.value })
                        }
                        placeholder="ex: 120"
                        className="h-8 w-[68px] rounded border border-[#CBD5E1] px-2 font-mono text-[12px] text-[#0F172A] outline-none focus:border-[#1D5FD6]"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={col.primaryKey}
                        onChange={(e) =>
                          updateCol(col.id, {
                            primaryKey: e.target.checked,
                            nullable: e.target.checked ? false : col.nullable,
                          })
                        }
                        className="h-4 w-4 accent-[#B45309]"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={col.nullable}
                        disabled={col.primaryKey}
                        onChange={(e) =>
                          updateCol(col.id, { nullable: e.target.checked })
                        }
                        className="h-4 w-4 accent-[#1D5FD6]"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={col.identity}
                        onChange={(e) =>
                          updateCol(col.id, { identity: e.target.checked })
                        }
                        className="h-4 w-4 accent-[#0F766E]"
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        type="text"
                        value={col.defaultValue ?? ''}
                        onChange={(e) =>
                          updateCol(col.id, { defaultValue: e.target.value })
                        }
                        placeholder="Opcional"
                        className="h-8 w-full min-w-[90px] rounded border border-[#CBD5E1] px-2 font-mono text-[12px] text-[#0F172A] outline-none focus:border-[#1D5FD6]"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <button
                        type="button"
                        onClick={() => removeCol(col.id)}
                        title="Remover coluna"
                        className="rounded p-1 text-[#94A3B8] hover:bg-red-50 hover:text-red-600"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <button
            type="button"
            onClick={addColumnRow}
            className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[#94A3B8] bg-[#F8FAFC] px-3.5 py-2 text-[13px] font-semibold text-[#1D5FD6] hover:border-[#1D5FD6] hover:bg-[#EFF6FF]"
          >
            <Plus className="h-4 w-4" />
            Adicionar coluna
          </button>
        </div>
      )}
    </ModalBackdrop>
  );
}

/* =========================================================================
 * 5. Nova Tabela
 * ========================================================================= */
export function NewTableModal({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (table: ErTable, sql: string) => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [columns, setColumns] = useState<ErColumn[]>([
    {
      id: createId('col'),
      name: 'id',
      type: 'int',
      nullable: false,
      primaryKey: true,
      identity: true,
    },
    {
      id: createId('col'),
      name: 'nome',
      type: 'varchar',
      length: '150',
      nullable: false,
      primaryKey: false,
      identity: false,
    },
  ]);

  const handleCreate = () => {
    const cleanName = name.trim();
    if (!cleanName) return;
    const cleanCols = columns
      .map((c) => ({
        ...c,
        name: c.name.trim(),
        length: c.length?.trim() || undefined,
      }))
      .filter((c) => Boolean(c.name));
    if (cleanCols.length === 0) return;

    const pks = cleanCols.filter((c) => c.primaryKey).map((c) => c.name);
    const colDefs = cleanCols.map(
      (c) =>
        `  ${c.name} ${formatColType(c)}${c.nullable ? '' : ' NOT NULL'}${c.identity ? ' AUTO_INCREMENT' : ''}`,
    );
    if (pks.length > 0) {
      colDefs.push(`  PRIMARY KEY (${pks.join(', ')})`);
    }
    const sql = `CREATE TABLE ${cleanName} (\n${colDefs.join(',\n')}\n);`;

    onCreate(
      {
        id: createId('tbl'),
        name: cleanName,
        description: description.trim() || undefined,
        columns: cleanCols,
      },
      sql,
    );
    onClose();
  };

  return (
    <ModalBackdrop
      title="Nova tabela"
      subtitle="A nova tabela será adicionada ao projeto e incluída no SubModel ativo."
      maxWidth="max-w-[680px]"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#CBD5E1] bg-white px-4 py-2 text-[13.5px] font-medium text-[#334155] hover:bg-[#F8FAFC]"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!name.trim()}
            onClick={handleCreate}
            className="rounded-lg bg-[#1D5FD6] px-4 py-2 text-[13.5px] font-semibold text-white hover:bg-[#174DB3] disabled:opacity-50"
          >
            Criar tabela
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-[11.5px] font-bold uppercase tracking-wide text-[#475569]">
              Nome da tabela *
            </label>
            <input
              type="text"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: CLIENTE, PEDIDO, FATURA..."
              className="mt-1 h-9 w-full rounded-lg border border-[#CBD5E1] px-3 font-mono text-[13.5px] text-[#0F172A] outline-none focus:border-[#1D5FD6]"
            />
          </div>
          <div>
            <label className="block text-[11.5px] font-bold uppercase tracking-wide text-[#475569]">
              Descrição
            </label>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Opcional"
              className="mt-1 h-9 w-full rounded-lg border border-[#CBD5E1] px-3 text-[13.5px] text-[#0F172A] outline-none focus:border-[#1D5FD6]"
            />
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11.5px] font-bold uppercase tracking-wide text-[#475569]">
              Colunas iniciais
            </span>
            <button
              type="button"
              onClick={() =>
                setColumns((prev) => [
                  ...prev,
                  {
                    id: createId('col'),
                    name: `campo_${prev.length + 1}`,
                    type: 'varchar',
                    length: '100',
                    nullable: true,
                    primaryKey: false,
                    identity: false,
                  },
                ])
              }
              className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-[#1D5FD6] hover:underline"
            >
              <Plus className="h-3.5 w-3.5" />
              Adicionar coluna
            </button>
          </div>

          <div className="space-y-1.5">
            {columns.map((col) => (
              <div
                key={col.id}
                className="grid grid-cols-[1fr_110px_70px_44px_56px_32px] items-center gap-1.5"
              >
                <input
                  type="text"
                  value={col.name}
                  onChange={(e) =>
                    setColumns((prev) =>
                      prev.map((c) =>
                        c.id === col.id ? { ...c, name: e.target.value } : c,
                      ),
                    )
                  }
                  className="h-8 rounded border border-[#CBD5E1] px-2 font-mono text-[12px]"
                />
                <select
                  value={col.type}
                  onChange={(e) =>
                    setColumns((prev) =>
                      prev.map((c) =>
                        c.id === col.id ? { ...c, type: e.target.value } : c,
                      ),
                    )
                  }
                  className="h-8 rounded border border-[#CBD5E1] bg-white px-1.5 text-[12px]"
                >
                  {COLUMN_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  value={col.length ?? ''}
                  onChange={(e) =>
                    setColumns((prev) =>
                      prev.map((c) =>
                        c.id === col.id ? { ...c, length: e.target.value } : c,
                      ),
                    )
                  }
                  placeholder="Tam."
                  className="h-8 rounded border border-[#CBD5E1] px-2 font-mono text-[12px]"
                />
                <label className="flex items-center justify-center gap-1 text-[11px] font-semibold text-[#92400E]">
                  <input
                    type="checkbox"
                    checked={col.primaryKey}
                    onChange={(e) =>
                      setColumns((prev) =>
                        prev.map((c) =>
                          c.id === col.id
                            ? {
                                ...c,
                                primaryKey: e.target.checked,
                                nullable: e.target.checked ? false : c.nullable,
                              }
                            : c,
                        ),
                      )
                    }
                  />
                  PK
                </label>
                <label className="flex items-center justify-center gap-1 text-[11px] text-[#475569]">
                  <input
                    type="checkbox"
                    checked={col.nullable}
                    disabled={col.primaryKey}
                    onChange={(e) =>
                      setColumns((prev) =>
                        prev.map((c) =>
                          c.id === col.id
                            ? { ...c, nullable: e.target.checked }
                            : c,
                        ),
                      )
                    }
                  />
                  Null
                </label>
                <button
                  type="button"
                  onClick={() =>
                    setColumns((prev) => prev.filter((c) => c.id !== col.id))
                  }
                  className="flex h-8 w-8 items-center justify-center rounded text-[#94A3B8] hover:bg-red-50 hover:text-red-600"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
    </ModalBackdrop>
  );
}

/* =========================================================================
 * 6. Relacionamento — Criar / Editar (imagem 15.42.09)
 * ========================================================================= */
export function RelationModal({
  tables,
  initialFromId,
  initialToId,
  existingRelation,
  readOnly = false,
  onClose,
  onSave,
  onDelete,
}: {
  tables: ErTable[];
  initialFromId?: string;
  initialToId?: string;
  existingRelation?: ErRelation | null;
  readOnly?: boolean;
  onClose: () => void;
  onSave: (payload: {
    relation: ErRelation;
    addFkColumn?: ErColumn;
    updateFkColumn?: {
      tableId: string;
      columnName: string;
      nullable: boolean;
      primaryKey: boolean;
    };
    sqlStatements: string[];
    isEdit: boolean;
  }) => void;
  onDelete?: (relId: string) => void;
}) {
  const isEdit = Boolean(existingRelation);

  const [fromTableId, setFromTableId] = useState(
    existingRelation?.fromTableId ?? initialFromId ?? tables[0]?.id ?? '',
  );
  const [toTableId, setToTableId] = useState(
    existingRelation?.toTableId ??
      initialToId ??
      tables[1]?.id ??
      tables[0]?.id ??
      '',
  );
  const [cardinality, setCardinality] = useState<'1xN' | '1x1'>(
    existingRelation?.cardinality ?? '1xN',
  );
  const [onDeleteAction, setOnDeleteAction] = useState<OnDeleteAction>(
    existingRelation?.onDelete ?? 'NONE',
  );

  const initialChildTable = tables.find(
    (t) =>
      t.id ===
      (existingRelation?.fromTableId ?? initialFromId ?? tables[0]?.id ?? ''),
  );
  const initialChildFkCol = existingRelation
    ? initialChildTable?.columns.find(
        (c) =>
          c.name.toLowerCase() === existingRelation.fromColumn.toLowerCase(),
      )
    : undefined;

  const [asPrimaryKey, setAsPrimaryKey] = useState(
    Boolean(initialChildFkCol?.primaryKey),
  );
  const [optional, setOptional] = useState(
    existingRelation ? existingRelation.optional : false,
  );

  const fromTable = tables.find((t) => t.id === fromTableId) ?? tables[0];
  const toTable =
    tables.find((t) => t.id === toTableId) ?? tables[1] ?? tables[0];

  const parentPk = useMemo(() => {
    if (!toTable) return undefined;
    if (
      existingRelation &&
      existingRelation.toTableId === toTable.id &&
      existingRelation.toColumn
    ) {
      const exact = toTable.columns.find(
        (c) => c.name.toLowerCase() === existingRelation.toColumn.toLowerCase(),
      );
      if (exact) return exact;
    }
    return toTable.columns.find((c) => c.primaryKey) ?? toTable.columns[0];
  }, [toTable, existingRelation]);

  const defaultFkColName = parentPk
    ? parentPk.name
    : `ID_${toTable?.name ?? 'REF'}`;

  const [fkColumnName, setFkColumnName] = useState(
    existingRelation?.fromColumn ?? defaultFkColName,
  );
  const [fkName, setFkName] = useState(
    existingRelation?.name ??
      `fk_${fromTable?.name.toLowerCase() ?? 'filha'}_${toTable?.name.toLowerCase() ?? 'pai'}`,
  );

  const handleInvert = () => {
    if (readOnly) return;
    const nextFromId = toTableId;
    const nextToId = fromTableId;
    const nextFrom = tables.find((t) => t.id === nextFromId);
    const nextTo = tables.find((t) => t.id === nextToId);
    setFromTableId(nextFromId);
    setToTableId(nextToId);
    if (nextFrom && nextTo) {
      const nextPk =
        nextTo.columns.find((c) => c.primaryKey) ?? nextTo.columns[0];
      setFkColumnName(nextPk ? nextPk.name : `ID_${nextTo.name}`);
      setFkName(
        `fk_${nextFrom.name.toLowerCase()}_${nextTo.name.toLowerCase()}`,
      );
    }
  };

  const existsOnChild = fromTable?.columns.some(
    (c) => c.name.toLowerCase() === fkColumnName.trim().toLowerCase(),
  );

  const effectiveOptional = optional && !asPrimaryKey;

  const sqlPreview = useMemo(() => {
    if (!fromTable || !toTable || !parentPk) return '';
    const lines: string[] = [];
    const cleanCol = fkColumnName.trim() || defaultFkColName;
    const colTypeUpper = formatColType(parentPk).toUpperCase();

    if (existingRelation) {
      const origFrom = tables.find(
        (t) => t.id === existingRelation.fromTableId,
      );
      lines.push(
        `ALTER TABLE ${origFrom?.name ?? fromTable.name} DROP CONSTRAINT ${existingRelation.name};`,
      );
    }

    if (!existsOnChild) {
      lines.push(
        `ALTER TABLE ${fromTable.name} ADD COLUMN ${cleanCol} ${colTypeUpper}${effectiveOptional ? '' : ' NOT NULL'};`,
      );
    } else if (existingRelation) {
      const childCol = fromTable.columns.find(
        (c) => c.name.toLowerCase() === cleanCol.toLowerCase(),
      );
      if (childCol && childCol.nullable !== effectiveOptional) {
        lines.push(
          `ALTER TABLE ${fromTable.name} MODIFY COLUMN ${cleanCol} ${colTypeUpper} ${effectiveOptional ? 'NULL' : 'NOT NULL'};`,
        );
      }
    }

    const delClause =
      onDeleteAction !== 'NONE' ? ` ON DELETE ${onDeleteAction}` : '';
    lines.push(
      `ALTER TABLE ${fromTable.name} ADD CONSTRAINT ${fkName.trim() || 'fk_rel'} FOREIGN KEY (${cleanCol}) REFERENCES ${toTable.name} (${parentPk.name})${delClause};`,
    );
    return lines.join('\n');
  }, [
    fromTable,
    toTable,
    parentPk,
    fkColumnName,
    defaultFkColName,
    existsOnChild,
    effectiveOptional,
    onDeleteAction,
    fkName,
    existingRelation,
    tables,
  ]);

  const handleSubmit = () => {
    if (readOnly || !fromTable || !toTable || !parentPk) return;
    const cleanCol = fkColumnName.trim() || defaultFkColName;
    const sqlStatements = sqlPreview.split('\n').filter(Boolean);

    const addFkColumn: ErColumn | undefined = existsOnChild
      ? undefined
      : {
          id: createId('col'),
          name: cleanCol,
          type: parentPk.type,
          length: parentPk.length,
          nullable: effectiveOptional,
          primaryKey: asPrimaryKey,
          identity: false,
        };

    const updateFkColumn = existsOnChild
      ? {
          tableId: fromTable.id,
          columnName: cleanCol,
          nullable: effectiveOptional,
          primaryKey: asPrimaryKey,
        }
      : undefined;

    onSave({
      relation: {
        id: existingRelation?.id ?? createId('rel'),
        name:
          fkName.trim() ||
          `fk_${fromTable.name.toLowerCase()}_${toTable.name.toLowerCase()}`,
        fromTableId: fromTable.id,
        fromColumn: cleanCol,
        toTableId: toTable.id,
        toColumn: parentPk.name,
        cardinality,
        optional: effectiveOptional,
        onDelete: onDeleteAction,
      },
      addFkColumn,
      updateFkColumn,
      sqlStatements,
      isEdit,
    });
    onClose();
  };

  const noticeText = asPrimaryKey
    ? `Relacionamento identificador: a coluna de FK faz parte da chave primária de ${fromTable?.name ?? ''}.`
    : effectiveOptional
      ? 'Relacionamento opcional: a coluna de FK aceita nulo.'
      : 'Relacionamento obrigatório: a coluna de FK é NOT NULL.';

  return (
    <ModalBackdrop
      title={isEdit ? 'Editar relacionamento' : 'Novo relacionamento'}
      maxWidth="max-w-[660px]"
      onClose={onClose}
      footer={
        <>
          {isEdit && !readOnly && existingRelation && onDelete && (
            <button
              type="button"
              onClick={() => {
                if (
                  window.confirm(
                    `Remover o relacionamento "${existingRelation.name}"?`,
                  )
                ) {
                  onDelete(existingRelation.id);
                  onClose();
                }
              }}
              className="mr-auto inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-[13px] font-semibold text-red-600 hover:bg-red-100"
            >
              <Trash2 className="h-4 w-4" />
              Excluir relacionamento
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#CBD5E1] bg-white px-4 py-2 text-[13.5px] font-medium text-[#334155] hover:bg-[#F8FAFC]"
          >
            {readOnly ? 'Fechar' : 'Cancelar'}
          </button>
          {!readOnly && (
            <button
              type="button"
              disabled={!fromTable || !toTable || fromTable.id === toTable.id}
              onClick={handleSubmit}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#1D5FD6] px-4 py-2 text-[13.5px] font-semibold text-white hover:bg-[#174DB3] disabled:opacity-50"
            >
              <Link2 className="h-4 w-4" />
              {isEdit ? 'Salvar relacionamento' : 'Criar relacionamento'}
            </button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        {/* Banner superior azul claro: TABELA FILHA <-> Inverter <-> TABELA PAI */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#D9E4F2] bg-[#EFF4FB] px-4 py-3.5">
          <div className="min-w-0 flex-1">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-[#64748B]">
              Tabela Filha (recebe a FK)
            </div>
            <div
              className="mt-0.5 truncate text-[15px] font-extrabold text-[#0F1D3D]"
              title={fromTable?.name}
            >
              {fromTable?.name}
            </div>
          </div>

          <button
            type="button"
            disabled={readOnly}
            onClick={handleInvert}
            title="Inverter direção entre tabela filha e tabela pai"
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg border border-[#93B4E8] bg-white px-3.5 text-[13px] font-semibold text-[#1D5FD6] shadow-sm transition-colors hover:bg-[#EFF6FF] disabled:opacity-50"
          >
            <ArrowLeftRight className="h-3.5 w-3.5" />
            Inverter
          </button>

          <div className="min-w-0 flex-1 text-right">
            <div className="text-[10.5px] font-bold uppercase tracking-wider text-[#64748B]">
              Tabela Pai (referenciada)
            </div>
            <div
              className="mt-0.5 truncate text-[15px] font-extrabold text-[#0F1D3D]"
              title={toTable?.name}
            >
              {toTable?.name}
            </div>
          </div>
        </div>

        {/* Linha: NOME DA FK * | TIPO DE RELACIONAMENTO | ON DELETE */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_auto_auto]">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[#475569]">
              Nome da FK *
            </label>
            <input
              type="text"
              disabled={readOnly}
              value={fkName}
              onChange={(e) => setFkName(e.target.value)}
              className="mt-1.5 h-10 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 font-mono text-[13px] text-[#0F172A] outline-none focus:border-[#1D5FD6] disabled:bg-[#F8FAFC]"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[#475569]">
              Tipo de relacionamento
            </label>
            <div className="mt-1.5 inline-flex h-10 items-center rounded-lg border border-[#CBD5E1] bg-[#F1F5F9] p-1">
              {(['1xN', '1x1'] as const).map((card) => (
                <button
                  key={card}
                  type="button"
                  disabled={readOnly}
                  onClick={() => setCardinality(card)}
                  className={[
                    'h-full rounded-md px-3 text-[13px] font-bold transition-colors',
                    cardinality === card
                      ? 'border border-[#1D5FD6] bg-white text-[#0F1D3D] shadow-sm'
                      : 'text-[#64748B] hover:text-[#0F172A]',
                  ].join(' ')}
                >
                  {card === '1xN' ? '1 x N' : '1 x 1'}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[#475569]">
              ON DELETE
            </label>
            <select
              disabled={readOnly}
              value={onDeleteAction}
              onChange={(e) =>
                setOnDeleteAction(e.target.value as OnDeleteAction)
              }
              className="mt-1.5 h-10 rounded-lg border border-[#CBD5E1] bg-white px-3 text-[13px] text-[#0F172A] outline-none focus:border-[#1D5FD6] disabled:bg-[#F8FAFC]"
            >
              <option value="NONE">Não definir</option>
              <option value="CASCADE">CASCADE</option>
              <option value="SET NULL">SET NULL</option>
              <option value="RESTRICT">RESTRICT</option>
            </select>
          </div>
        </div>

        {/* Checkboxes iguais à imagem 15.42.09 */}
        <div className="space-y-2.5 pt-1 text-[13.5px] text-[#1E293B]">
          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              disabled={readOnly}
              checked={asPrimaryKey}
              onChange={(e) => {
                setAsPrimaryKey(e.target.checked);
                if (e.target.checked) setOptional(false);
              }}
              className="h-4 w-4 rounded accent-[#1D5FD6]"
            />
            <span>
              A coluna de FK faz parte da chave primária de{' '}
              <strong>{fromTable?.name}</strong>
            </span>
          </label>
          <label className="flex cursor-pointer items-center gap-2.5">
            <input
              type="checkbox"
              disabled={readOnly || asPrimaryKey}
              checked={effectiveOptional}
              onChange={(e) => setOptional(e.target.checked)}
              className="h-4 w-4 rounded accent-[#1D5FD6]"
            />
            <span>Relacionamento opcional (aceita nulo)</span>
          </label>
        </div>

        {/* Seção COLUNAS (igual à imagem 15.42.09) */}
        <div>
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-[#475569]">
            Colunas
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#E2E8F0] bg-[#FAFBFD] px-4 py-3">
            <div className="min-w-0 flex-1">
              <span className="inline-block rounded bg-[#FEF3C7] px-1.5 py-0.5 text-[10px] font-extrabold text-[#92400E]">
                PK
              </span>
              <div
                className="mt-1 truncate text-[13.5px] font-bold text-[#0F172A]"
                title={`${toTable?.name}.${parentPk?.name}`}
              >
                {toTable?.name}.{parentPk?.name}
              </div>
              <div className="font-mono text-[12px] text-[#64748B]">
                {parentPk ? formatColType(parentPk) : 'int'}
              </div>
            </div>

            <span className="text-[16px] font-bold text-[#64748B]">→</span>

            <div className="min-w-[200px] flex-1">
              <input
                type="text"
                disabled={readOnly}
                value={fkColumnName}
                onChange={(e) => setFkColumnName(e.target.value)}
                className="h-9 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 font-mono text-[13px] font-medium text-[#0F172A] outline-none focus:border-[#1D5FD6] disabled:bg-[#F8FAFC]"
              />
              <div className="mt-1 font-mono text-[11.5px] text-[#64748B]">
                {(parentPk ? formatColType(parentPk) : 'int').toUpperCase()} ·{' '}
                {existsOnChild ? 'coluna existente' : 'coluna nova'}
              </div>
            </div>
          </div>
        </div>

        {/* Faixa de aviso amarela */}
        <div className="rounded-lg border border-[#F5E0A3] bg-[#FEF6D8] px-3.5 py-2.5 text-[12.5px] font-medium text-[#92400E]">
          • {noticeText}
        </div>

        {/* RESUMO DO QUE SERÁ APLICADO */}
        <div>
          <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-[#475569]">
            Resumo do que será aplicado
          </div>
          <pre className="overflow-x-auto rounded-xl bg-[#0F172A] p-3.5 font-mono text-[12px] leading-relaxed text-[#E2E8F0]">
            {sqlPreview}
          </pre>
        </div>
      </div>
    </ModalBackdrop>
  );
}

/* =========================================================================
 * 7. Conjunto de Campos (imagem 15.40.27 — multilíngue PT / EN / ES)
 * ========================================================================= */
export function FieldSetModal({
  tables,
  onClose,
  onApply,
}: {
  tables: ErTable[];
  onClose: () => void;
  onApply: (payload: {
    mode: 'existing' | 'separate';
    targetTableId?: string;
    newTableName?: string;
    columns: ErColumn[];
    sqlStatements: string[];
    summary: string;
  }) => void;
}) {
  const [lang, setLang] = useState<FieldPresetLang>('pt');
  const [presetSearch, setPresetSearch] = useState('');
  const [selectedPresetId, setSelectedPresetId] = useState(FIELD_PRESETS[0].id);
  const preset =
    FIELD_PRESETS.find((p) => p.id === selectedPresetId) ?? FIELD_PRESETS[0];

  const [mode, setMode] = useState<'existing' | 'separate'>(
    tables.length > 0 ? 'existing' : 'separate',
  );
  const [targetTableId, setTargetTableId] = useState(tables[0]?.id ?? '');
  const [newTableName, setNewTableName] = useState(
    preset.defaultTableName[lang],
  );
  const [customTableName, setCustomTableName] = useState(false);
  const [prefix, setPrefix] = useState('');
  const [applyNotNull, setApplyNotNull] = useState(true);
  const [selectedFieldKeys, setSelectedFieldKeys] = useState<string[]>(() =>
    preset.fields.filter((f) => f.recommended).map((f) => f.key),
  );

  // Ao trocar de conjunto, redefine os recomendados e o nome padrão da tabela
  useEffect(() => {
    setNewTableName(preset.defaultTableName[lang]);
    setCustomTableName(false);
    setSelectedFieldKeys(
      preset.fields.filter((f) => f.recommended).map((f) => f.key),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset.id]);

  // Ao trocar de idioma, ajusta automaticamente o nome da tabela padrão (se não personalizado)
  useEffect(() => {
    if (!customTableName) {
      setNewTableName(preset.defaultTableName[lang]);
    }
  }, [lang, preset, customTableName]);

  const categories = useMemo(() => {
    const q = presetSearch.trim().toLowerCase();
    const map = new Map<string, typeof FIELD_PRESETS>();
    for (const p of FIELD_PRESETS) {
      if (q) {
        const hay = [
          p.title[lang],
          p.title.pt,
          p.title.en,
          p.title.es,
          p.category[lang],
          p.summary[lang],
          ...p.fields.map((f) => f.name[lang]),
        ]
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) continue;
      }
      const catLabel = p.category[lang];
      const list = map.get(catLabel) ?? [];
      list.push(p);
      map.set(catLabel, list);
    }
    return Array.from(map.entries());
  }, [lang, presetSearch]);

  const toggleField = (fkey: string) => {
    setSelectedFieldKeys((prev) =>
      prev.includes(fkey) ? prev.filter((k) => k !== fkey) : [...prev, fkey],
    );
  };

  const prefixPlaceholder =
    lang === 'en'
      ? 'e.g. billing, shipping'
      : lang === 'es'
        ? 'Ej.: facturacion, envio'
        : 'Ex.: cobranca, entrega';

  const handleApply = () => {
    const chosen = preset.fields.filter((f) =>
      selectedFieldKeys.includes(f.key),
    );
    if (chosen.length === 0) return;

    const cleanPrefix = prefix.trim()
      ? `${prefix.trim().replace(/_+$/, '')}_`
      : '';

    const cols: ErColumn[] = chosen.map((f) => ({
      id: createId('col'),
      name: `${cleanPrefix}${f.name[lang]}`,
      type: f.type,
      length: f.length,
      nullable: applyNotNull ? f.nullable : true,
      primaryKey: false,
      identity: false,
    }));

    const langTag = lang.toUpperCase();

    if (mode === 'existing') {
      const tbl = tables.find((t) => t.id === targetTableId);
      if (!tbl) return;
      const sqlStatements = cols.map(
        (c) =>
          `ALTER TABLE ${tbl.name} ADD COLUMN ${c.name} ${formatColType(c)} ${c.nullable ? 'NULL' : 'NOT NULL'};`,
      );
      onApply({
        mode: 'existing',
        targetTableId: tbl.id,
        columns: cols,
        sqlStatements,
        summary: `Adicionou conjunto "${preset.title[lang]}" [${langTag}] (${cols.length} campos) em ${tbl.name}`,
      });
    } else {
      const tName = newTableName.trim() || preset.defaultTableName[lang];
      const pkCol: ErColumn = {
        id: createId('col'),
        name: `id_${tName.toLowerCase()}`,
        type: 'int',
        nullable: false,
        primaryKey: true,
        identity: true,
      };
      const allCols = [pkCol, ...cols];
      const defs = allCols.map(
        (c) =>
          `  ${c.name} ${formatColType(c)}${c.nullable ? '' : ' NOT NULL'}${c.identity ? ' AUTO_INCREMENT' : ''}`,
      );
      defs.push(`  PRIMARY KEY (${pkCol.name})`);
      const sql = `CREATE TABLE ${tName} (\n${defs.join(',\n')}\n);`;
      onApply({
        mode: 'separate',
        newTableName: tName,
        columns: allCols,
        sqlStatements: [sql],
        summary: `Criou tabela ${tName} a partir do conjunto "${preset.title[lang]}" [${langTag}]`,
      });
    }
    onClose();
  };

  return (
    <ModalBackdrop
      title="Conjunto de campos"
      subtitle="Escolha o idioma dos nomes das colunas e tabelas e adicione blocos padronizados ao modelo."
      maxWidth="max-w-[920px]"
      onClose={onClose}
      footer={
        <>
          <span className="mr-auto text-[12.5px] text-[#64748B]">
            {selectedFieldKeys.length} campo(s) selecionado(s) · Idioma:{' '}
            <strong className="text-[#0F1D3D]">
              {FIELD_PRESET_LANGUAGES.find((l) => l.id === lang)?.label}
            </strong>
          </span>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#CBD5E1] bg-white px-4 py-2 text-[13.5px] font-medium text-[#334155] hover:bg-[#F8FAFC]"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={selectedFieldKeys.length === 0}
            onClick={handleApply}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#1D5FD6] px-4 py-2 text-[13.5px] font-semibold text-white hover:bg-[#174DB3] disabled:opacity-50"
          >
            <Layers className="h-4 w-4" />
            Adicionar ao modelo
          </button>
        </>
      }
    >
      {/* Barra de seleção de idioma (Português padrão / Inglês / Espanhol) */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#D9E4F2] bg-[#EFF4FB] px-4 py-2.5">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-[#0F1D3D]">
          <Globe className="h-4 w-4 text-[#1D5FD6]" />
          <span>Qual idioma deseja utilizar nos nomes dos campos e tabelas?</span>
        </div>
        <div className="inline-flex items-center gap-1 rounded-lg border border-[#CBD5E1] bg-white p-1">
          {FIELD_PRESET_LANGUAGES.map((opt) => {
            const active = lang === opt.id;
            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => setLang(opt.id)}
                className={[
                  'rounded-md px-3 py-1 text-[12.5px] font-semibold transition-colors',
                  active
                    ? 'bg-[#0F1D3D] text-white shadow-sm'
                    : 'text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0F172A]',
                ].join(' ')}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-[260px_1fr]">
        {/* Coluna esquerda: busca + categorias com scroll */}
        <div className="flex max-h-[470px] flex-col border-r border-[#E2E8F0] pr-4">
          <div className="relative mb-3 shrink-0">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#94A3B8]" />
            <input
              type="text"
              value={presetSearch}
              onChange={(e) => setPresetSearch(e.target.value)}
              placeholder="Filtrar conjuntos ou campos..."
              className="h-8 w-full rounded-lg border border-[#CBD5E1] bg-white pl-8 pr-2.5 text-[12.5px] outline-none focus:border-[#1D5FD6]"
            />
          </div>

          <div className="flex-1 space-y-4 overflow-y-auto pr-1">
            {categories.length === 0 ? (
              <div className="py-6 text-center text-[12.5px] text-[#64748B]">
                Nenhum conjunto encontrado.
              </div>
            ) : (
              categories.map(([cat, list]) => (
                <div key={cat}>
                  <div className="mb-1.5 text-[10.5px] font-bold uppercase tracking-wider text-[#64748B]">
                    {cat}
                  </div>
                  <div className="space-y-1">
                    {list.map((item) => {
                      const active = item.id === preset.id;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setSelectedPresetId(item.id)}
                          className={[
                            'w-full rounded-xl border px-3 py-2 text-left transition-colors',
                            active
                              ? 'border-[#1D5FD6] bg-[#EFF6FF]'
                              : 'border-transparent hover:bg-[#F8FAFC]',
                          ].join(' ')}
                        >
                          <div className="text-[13px] font-bold text-[#0F1D3D]">
                            {item.title[lang]}
                          </div>
                          <div className="mt-0.5 text-[11px] text-[#64748B]">
                            {item.fields.length} campos ·{' '}
                            <span className="font-mono">
                              {item.defaultTableName[lang]}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Coluna direita: configuração e checklist */}
        <div className="space-y-4">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-[16px] font-bold text-[#0F1D3D]">
                {preset.title[lang]}
              </h3>
              <span className="rounded-full bg-[#EAF0F9] px-2 py-0.5 font-mono text-[11px] font-bold text-[#0F1D3D]">
                {preset.defaultTableName[lang]}
              </span>
            </div>
            <p className="mt-0.5 text-[13px] text-[#475569]">
              {preset.summary[lang]}
            </p>
            <p className="mt-0.5 text-[11.5px] text-[#64748B]">
              Base: {preset.basis}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                Destino
              </label>
              <div className="mt-1 grid grid-cols-2 gap-1 rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] p-1">
                <button
                  type="button"
                  disabled={tables.length === 0}
                  onClick={() => setMode('existing')}
                  className={[
                    'rounded-md py-1.5 text-[12px] font-semibold',
                    mode === 'existing'
                      ? 'bg-[#0F1D3D] text-white'
                      : 'text-[#475569]',
                  ].join(' ')}
                >
                  Na própria tabela
                </button>
                <button
                  type="button"
                  onClick={() => setMode('separate')}
                  className={[
                    'rounded-md py-1.5 text-[12px] font-semibold',
                    mode === 'separate'
                      ? 'bg-[#0F1D3D] text-white'
                      : 'text-[#475569]',
                  ].join(' ')}
                >
                  Em tabela separada
                </button>
              </div>
            </div>

            {mode === 'existing' ? (
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                  Tabela de destino
                </label>
                <select
                  value={targetTableId}
                  onChange={(e) => setTargetTableId(e.target.value)}
                  className="mt-1 h-10 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 text-[13px] font-medium"
                >
                  {tables.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                  Nome da nova tabela
                </label>
                <input
                  type="text"
                  value={newTableName}
                  onChange={(e) => {
                    setNewTableName(e.target.value);
                    setCustomTableName(true);
                  }}
                  className="mt-1 h-10 w-full rounded-lg border border-[#CBD5E1] px-3 font-mono text-[13px]"
                />
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 items-end gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                Prefixo das colunas (opcional)
              </label>
              <input
                type="text"
                value={prefix}
                onChange={(e) => setPrefix(e.target.value)}
                placeholder={prefixPlaceholder}
                className="mt-1 h-9 w-full rounded-lg border border-[#CBD5E1] px-3 font-mono text-[12.5px]"
              />
            </div>

            <label className="flex cursor-pointer items-center gap-2 pb-2 text-[12.5px] text-[#334155]">
              <input
                type="checkbox"
                checked={applyNotNull}
                onChange={(e) => setApplyNotNull(e.target.checked)}
                className="h-4 w-4 accent-[#1D5FD6]"
              />
              Aplicar o NOT NULL sugerido
            </label>
          </div>

          {/* Lista de campos com atalhos Todos / Recomendados / Nenhum */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
                Campos do conjunto ({preset.fields.length})
              </span>
              <div className="flex items-center gap-2 text-[12px] font-semibold text-[#1D5FD6]">
                <button
                  type="button"
                  onClick={() =>
                    setSelectedFieldKeys(preset.fields.map((f) => f.key))
                  }
                  className="hover:underline"
                >
                  Todos
                </button>
                <span className="text-[#CBD5E1]">·</span>
                <button
                  type="button"
                  onClick={() =>
                    setSelectedFieldKeys(
                      preset.fields
                        .filter((f) => f.recommended)
                        .map((f) => f.key),
                    )
                  }
                  className="hover:underline"
                >
                  Recomendados
                </button>
                <span className="text-[#CBD5E1]">·</span>
                <button
                  type="button"
                  onClick={() => setSelectedFieldKeys([])}
                  className="hover:underline"
                >
                  Nenhum
                </button>
              </div>
            </div>

            <div className="max-h-[245px] divide-y divide-[#EEF2F6] overflow-y-auto rounded-xl border border-[#E2E8F0]">
              {preset.fields.map((f) => {
                const checked = selectedFieldKeys.includes(f.key);
                const colName = f.name[lang];
                return (
                  <label
                    key={f.key}
                    className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 hover:bg-[#F8FAFC]"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleField(f.key)}
                        className="h-4 w-4 accent-[#1D5FD6]"
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[12.5px] font-semibold text-[#0F172A]">
                            {prefix.trim()
                              ? `${prefix.trim().replace(/_+$/, '')}_${colName}`
                              : colName}
                          </span>
                          {f.recommended && (
                            <span className="rounded bg-[#E6F0FF] px-1.5 py-0.5 text-[9.5px] font-bold uppercase text-[#1D5FD6]">
                              Recomendado
                            </span>
                          )}
                        </div>
                        <div className="text-[11.5px] text-[#64748B]">
                          {f.hint[lang]}
                        </div>
                      </div>
                    </div>
                    <span className="shrink-0 font-mono text-[11.5px] text-[#475569]">
                      {formatColType(f)}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </ModalBackdrop>
  );
}

/* =========================================================================
 * 8. Assistente de Modelagem com IA (imagem 15.41.00)
 * ========================================================================= */
const AI_EXAMPLES = [
  'Adicione uma coluna telefone varchar(20) na tabela Empresa',
  'Crie uma tabela Auditoria ligada à Empresa com data, usuario e acao',
  'Adicione um relacionamento N para N entre Pedido e Produto',
  'Adicione colunas de auditoria (created_at, updated_at) na tabela principal',
];

export function AiAssistantModal({
  onClose,
  onAnalyze,
  onApplyPlan,
}: {
  onClose: () => void;
  onAnalyze: (prompt: string) => Promise<ErAiPlanResponse>;
  onApplyPlan: (plan: ErAiPlanResponse) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [plan, setPlan] = useState<ErAiPlanResponse | null>(null);

  const handleAnalyze = async () => {
    if (!prompt.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const result = await onAnalyze(prompt.trim());
      setPlan(result);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível analisar com a IA.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <ModalBackdrop
      title="Assistente de modelagem"
      subtitle="Descreva em linguagem natural os ajustes desejados no banco de dados. Você revisa o plano e o SQL antes de aplicar."
      maxWidth="max-w-[680px]"
      onClose={onClose}
      footer={
        plan ? (
          <>
            <button
              type="button"
              onClick={() => setPlan(null)}
              className="rounded-lg border border-[#CBD5E1] bg-white px-4 py-2 text-[13.5px] font-medium text-[#334155] hover:bg-[#F8FAFC]"
            >
              Ajustar pedido
            </button>
            <button
              type="button"
              onClick={() => {
                onApplyPlan(plan);
                onClose();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F1D3D] px-4 py-2 text-[13.5px] font-semibold text-white hover:bg-[#1E3A5F]"
            >
              <Check className="h-4 w-4" />
              Aplicar ao modelo
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-[#CBD5E1] bg-white px-4 py-2 text-[13.5px] font-medium text-[#334155] hover:bg-[#F8FAFC]"
            >
              Cancelar
            </button>
            <button
              type="button"
              disabled={loading || !prompt.trim()}
              onClick={handleAnalyze}
              className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F1D3D] px-4 py-2 text-[13.5px] font-semibold text-white hover:bg-[#1E3A5F] disabled:opacity-50"
            >
              <Sparkles className="h-4 w-4" />
              {loading ? 'Analisando...' : 'Analisar'}
            </button>
          </>
        )
      }
    >
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <AiProcessingState title="Convertendo sua solicitação em ajustes de banco de dados..." />
      ) : plan ? (
        <div className="space-y-4">
          <div className="rounded-xl border border-[#BFDBFE] bg-[#F5F8FF] p-4">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11.5px] font-bold uppercase tracking-wider text-[#1D5FD6]">
                Plano sugerido pela IA
              </span>
              <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold text-[#475569]">
                {plan.model}
              </span>
            </div>
            <p className="mt-1.5 text-[14px] text-[#0F172A]">{plan.summary}</p>
          </div>

          <div>
            <div className="mb-1.5 text-[11.5px] font-bold uppercase tracking-wider text-[#64748B]">
              Operações no modelo ({plan.operations.length})
            </div>
            <ul className="space-y-1.5 text-[13px] text-[#334155]">
              {plan.operations.map((op, i) => (
                <li
                  key={i}
                  className="rounded-lg border border-[#E2E8F0] bg-[#FAFBFD] px-3 py-2"
                >
                  <span className="mr-2 rounded bg-[#0F1D3D] px-1.5 py-0.5 font-mono text-[10.5px] font-bold text-white">
                    {op.op}
                  </span>
                  {'tableName' in op && <strong>{op.tableName}</strong>}
                  {op.op === 'rename_table' && ` → ${op.newName}`}
                  {op.op === 'add_column' &&
                    ` + ${op.column.name} (${formatColType(op.column)})`}
                  {op.op === 'rename_column' &&
                    `.${op.columnName} → ${op.newName}`}
                  {op.op === 'drop_column' && `.${op.columnName}`}
                  {op.op === 'add_relation' &&
                    `${op.fromTable}.${op.fromColumn} → ${op.toTable}.${op.toColumn}`}
                  {op.op === 'drop_relation' &&
                    `${op.fromTable} × ${op.toTable}`}
                </li>
              ))}
            </ul>
          </div>

          {plan.sqlStatements.length > 0 && (
            <div>
              <div className="mb-1.5 text-[11.5px] font-bold uppercase tracking-wider text-[#64748B]">
                Prévia SQL que irá para o Script de Atualização
              </div>
              <pre className="max-h-[220px] overflow-auto rounded-xl bg-[#0F172A] p-4 font-mono text-[12px] leading-relaxed text-[#E2E8F0]">
                {plan.sqlStatements.join('\n\n')}
              </pre>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-[12px] font-bold uppercase tracking-wide text-[#475569]">
              O que você deseja ajustar no modelo?
            </label>
            <textarea
              rows={4}
              autoFocus
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Ex.: Crie a tabela Pagamento ligada à Empresa com valor decimal(14,2), data_vencimento date e status varchar(30)..."
              className="mt-1.5 w-full rounded-xl border border-[#CBD5E1] p-3 text-[14px] text-[#0F172A] outline-none focus:border-[#1D5FD6]"
            />
          </div>

          <div>
            <div className="mb-2 text-[11.5px] font-bold uppercase tracking-wider text-[#64748B]">
              Exemplos rápidos
            </div>
            <div className="flex flex-wrap gap-2">
              {AI_EXAMPLES.map((ex) => (
                <button
                  key={ex}
                  type="button"
                  onClick={() => setPrompt(ex)}
                  className="rounded-full border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-1.5 text-left text-[12px] text-[#334155] transition-colors hover:border-[#1D5FD6] hover:bg-[#EFF6FF] hover:text-[#1D5FD6]"
                >
                  {ex}
                </button>
              ))}
            </div>
          </div>

          <p className="text-[12px] text-[#64748B]">
            O banco de dados conectado nunca é alterado diretamente. Os ajustes são aplicados no modelo visual e adicionados ao <strong>Script de atualização (.sql)</strong>.
          </p>
        </div>
      )}
    </ModalBackdrop>
  );
}

/* =========================================================================
 * 9. Script de Atualização (imagem 15.42.53)
 * ========================================================================= */
export function UpdateScriptModal({
  projectName,
  dialect,
  pendingChanges,
  readOnly,
  onClose,
  onMarkApplied,
}: {
  projectName: string;
  dialect: DbDialect;
  pendingChanges: ErPendingChange[];
  readOnly: boolean;
  onClose: () => void;
  onMarkApplied: () => void;
}) {
  const [targetDialect, setTargetDialect] = useState<DbDialect>(dialect);
  const [copied, setCopied] = useState(false);

  const scriptText = useMemo(
    () => formatUpdateScript(projectName, targetDialect, pendingChanges),
    [projectName, targetDialect, pendingChanges],
  );

  const handleCopy = async () => {
    await navigator.clipboard.writeText(scriptText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDownload = () => {
    const blob = new Blob([scriptText], { type: 'text/sql;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${projectName.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-update.sql`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <ModalBackdrop
      title="Script de atualização"
      subtitle="Copie ou baixe o script SQL para aplicar manualmente no seu banco. O ER Studio nunca executa alterações no banco conectado."
      maxWidth="max-w-[740px]"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#CBD5E1] bg-white px-4 py-2 text-[13.5px] font-medium text-[#334155] hover:bg-[#F8FAFC]"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={handleDownload}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-3.5 py-2 text-[13.5px] font-semibold text-[#0F1D3D] hover:bg-[#F8FAFC]"
          >
            <Download className="h-4 w-4" />
            Baixar .sql
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-3.5 py-2 text-[13.5px] font-semibold text-[#0F1D3D] hover:bg-[#F8FAFC]"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-emerald-600" />
                Copiado!
              </>
            ) : (
              <>
                <Copy className="h-4 w-4" />
                Copiar
              </>
            )}
          </button>
          {!readOnly && pendingChanges.length > 0 && (
            <button
              type="button"
              onClick={() => {
                onMarkApplied();
                onClose();
              }}
              className="rounded-lg bg-[#1D5FD6] px-4 py-2 text-[13.5px] font-semibold text-white hover:bg-[#174DB3]"
            >
              Marcar como aplicado
            </button>
          )}
        </>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <label className="block text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
              Banco de destino
            </label>
            <select
              value={targetDialect}
              onChange={(e) => setTargetDialect(e.target.value as DbDialect)}
              className="mt-1 h-9 rounded-lg border border-[#CBD5E1] bg-white px-3 text-[13.5px] font-medium text-[#0F172A]"
            >
              <option value="mysql">MySQL</option>
              <option value="postgresql">PostgreSQL</option>
              <option value="sqlserver">SQL Server</option>
              <option value="sqlite">SQLite</option>
            </select>
          </div>
          <span className="rounded-full bg-[#EAF0F9] px-3 py-1 text-[12px] font-semibold text-[#0F1D3D]">
            {pendingChanges.length} comando(s) pendente(s)
          </span>
        </div>

        <pre className="max-h-[380px] overflow-auto rounded-xl bg-[#0F172A] p-4 font-mono text-[12.5px] leading-relaxed text-[#E2E8F0]">
          {scriptText}
        </pre>
      </div>
    </ModalBackdrop>
  );
}

/* =========================================================================
 * 10. Compartilhar e Transferir Posse (imagem 15.41.19)
 * ========================================================================= */
export function ShareProjectModal({
  project,
  users,
  isOwner,
  onClose,
  onUpdateShares,
  onTransferOwnership,
}: {
  project: ErProjectRecord;
  users: Array<{ id: string; name: string; email: string }>;
  isOwner: boolean;
  onClose: () => void;
  onUpdateShares: (shares: ErShare[]) => void;
  onTransferOwnership: (
    newOwnerEmail: string,
    keepEditAccess: boolean,
  ) => Promise<void>;
}) {
  const [target, setTarget] = useState('');
  const [permission, setPermission] = useState<'view' | 'edit'>('view');
  const [transferEmail, setTransferEmail] = useState('');
  const [keepEditAccess, setKeepEditAccess] = useState(true);
  const [transferring, setTransferring] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAddShare = () => {
    const clean = target.trim().toLowerCase();
    if (!clean) return;
    if (project.shares.some((s) => s.target.toLowerCase() === clean)) {
      setError('Este usuário já possui acesso ao projeto.');
      return;
    }
    setError(null);
    onUpdateShares([
      ...project.shares,
      {
        id: createId('shr'),
        target: clean,
        permission,
        createdAt: new Date().toISOString(),
      },
    ]);
    setTarget('');
  };

  const handleRemoveShare = (id: string) => {
    onUpdateShares(project.shares.filter((s) => s.id !== id));
  };

  const handleTransfer = async () => {
    if (!transferEmail.trim()) return;
    setTransferring(true);
    setError(null);
    try {
      await onTransferOwnership(transferEmail.trim(), keepEditAccess);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'Erro ao transferir posse.',
      );
    } finally {
      setTransferring(false);
    }
  };

  return (
    <ModalBackdrop
      title={`Compartilhar "${project.name}"`}
      subtitle={`Proprietário atual: ${project.owner} · Banco: ${formatDialectLabel(project.dialect)}`}
      maxWidth="max-w-[580px]"
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-[#CBD5E1] bg-white px-4 py-2 text-[13.5px] font-medium text-[#334155] hover:bg-[#F8FAFC]"
        >
          Fechar
        </button>
      }
    >
      <div className="space-y-6">
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700">
            {error}
          </div>
        )}

        {isOwner && (
          <div className="space-y-2.5">
            <label className="block text-[11.5px] font-bold uppercase tracking-wider text-[#64748B]">
              Compartilhar com usuário ou e-mail
            </label>
            <div className="flex flex-wrap gap-2">
              <input
                type="text"
                list="er-users-datalist"
                value={target}
                onChange={(e) => setTarget(e.target.value)}
                placeholder="Selecione ou digite o e-mail"
                className="h-10 min-w-[210px] flex-1 rounded-lg border border-[#CBD5E1] px-3 text-[13.5px]"
              />
              <datalist id="er-users-datalist">
                {users.map((u) => (
                  <option key={u.id} value={u.email}>
                    {u.name} ({u.email})
                  </option>
                ))}
              </datalist>
              <select
                value={permission}
                onChange={(e) =>
                  setPermission(e.target.value as 'view' | 'edit')
                }
                className="h-10 rounded-lg border border-[#CBD5E1] bg-white px-3 text-[13.5px]"
              >
                <option value="view">Leitura</option>
                <option value="edit">Edição</option>
              </select>
              <button
                type="button"
                onClick={handleAddShare}
                className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#1D5FD6] px-4 text-[13.5px] font-semibold text-white hover:bg-[#174DB3]"
              >
                <Share2 className="h-4 w-4" />
                Compartilhar
              </button>
            </div>
          </div>
        )}

        {/* Compartilhamentos ativos */}
        <div>
          <div className="mb-2 text-[11.5px] font-bold uppercase tracking-wider text-[#64748B]">
            Acesso compartilhado ({project.shares.length})
          </div>
          {project.shares.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] px-4 py-4 text-center text-[13px] text-[#64748B]">
              Este projeto ainda não foi compartilhado com ninguém.
            </div>
          ) : (
            <div className="divide-y divide-[#EEF2F6] rounded-xl border border-[#E2E8F0]">
              {project.shares.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center justify-between gap-2 px-3.5 py-2.5 text-[13.5px]"
                >
                  <div>
                    <div className="font-semibold text-[#0F172A]">
                      {s.target}
                    </div>
                    <div className="text-[11.5px] text-[#64748B]">
                      {s.permission === 'edit'
                        ? 'Pode editar'
                        : 'Somente leitura'}
                    </div>
                  </div>
                  {isOwner && (
                    <button
                      type="button"
                      onClick={() => handleRemoveShare(s.id)}
                      className="rounded-lg p-1.5 text-[#94A3B8] hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Transferir Posse (igual à imagem 15.41.19) */}
        {isOwner && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4">
            <div className="text-[11.5px] font-bold uppercase tracking-wider text-amber-800">
              Transferir posse
            </div>
            <p className="mt-1 text-[12.5px] text-amber-900/80">
              Passe a propriedade deste projeto para outro usuário cadastrado no Hub.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <select
                value={transferEmail}
                onChange={(e) => setTransferEmail(e.target.value)}
                className="h-10 min-w-[220px] flex-1 rounded-lg border border-amber-300 bg-white px-3 text-[13.5px]"
              >
                <option value="">Selecione o novo proprietário...</option>
                {users.map((u) => (
                  <option key={u.id} value={u.email}>
                    {u.name} ({u.email})
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={!transferEmail || transferring}
                onClick={handleTransfer}
                className="h-10 rounded-lg bg-[#0F1D3D] px-4 text-[13.5px] font-semibold text-white hover:bg-[#1E3A5F] disabled:opacity-50"
              >
                {transferring ? 'Transferindo...' : 'Transferir'}
              </button>
            </div>
            <label className="mt-2.5 flex cursor-pointer items-center gap-2 text-[12.5px] text-amber-900">
              <input
                type="checkbox"
                checked={keepEditAccess}
                onChange={(e) => setKeepEditAccess(e.target.checked)}
                className="h-4 w-4 accent-[#0F1D3D]"
              />
              Continuar com acesso de edição após transferir
            </label>
          </div>
        )}
      </div>
    </ModalBackdrop>
  );
}

/* =========================================================================
 * 11. Histórico de alterações
 * ========================================================================= */
export function HistoryModal({
  history,
  onClose,
}: {
  history: ErHistoryEntry[];
  onClose: () => void;
}) {
  return (
    <ModalBackdrop
      title="Histórico de alterações"
      subtitle={`${history.length} registro(s) salvo(s) no projeto`}
      maxWidth="max-w-[560px]"
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-[#CBD5E1] bg-white px-4 py-2 text-[13.5px] font-medium text-[#334155] hover:bg-[#F8FAFC]"
        >
          Fechar
        </button>
      }
    >
      {history.length === 0 ? (
        <div className="rounded-xl border border-dashed border-[#CBD5E1] bg-[#F8FAFC] p-6 text-center text-[13.5px] text-[#64748B]">
          Nenhuma alteração registrada ainda.
        </div>
      ) : (
        <div className="space-y-2.5">
          {history.map((item) => (
            <div
              key={item.id}
              className="flex items-start gap-3 rounded-xl border border-[#E2E8F0] bg-[#FAFBFD] px-4 py-3"
            >
              <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#EAF0F9] text-[#0F1D3D]">
                <History className="h-3.5 w-3.5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-semibold text-[#0F172A]">
                  {item.summary}
                </div>
                <div className="mt-0.5 text-[12px] text-[#64748B]">
                  {item.author} · {formatDateTime(item.createdAt)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </ModalBackdrop>
  );
}
