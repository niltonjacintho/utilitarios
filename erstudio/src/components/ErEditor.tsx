'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  Database,
  Download,
  FileCode2,
  History,
  Layers,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Search,
  Share2,
  ShieldCheck,
  Sparkles,
  Table2,
  Trash2,
  Undo2,
} from 'lucide-react';
import {
  AuthUser,
  DbDialect,
  ErAiPlanResponse,
  ErColumn,
  ErDbConnectionTestInput,
  ErProjectRecord,
  ErRelation,
  ErShare,
  ErSubModel,
  ErTable,
} from '@/types/erstudio';
import { erStudioApi } from '@/lib/api';
import {
  applyAiOperationsToProject,
  createId,
  formatAccessLabel,
  formatDialectLabel,
  layoutSubModelCircular,
  layoutSubModelHierarchical,
} from '@/lib/er-utils';
import {
  exportSubModelHtml,
  exportSubModelPdf,
  exportSubModelPng,
  openPdfPreviewWindow,
} from '@/lib/exporters';
import { AiProcessingOverlay } from './AiProcessingOverlay';
import { ErCanvas } from './ErCanvas';
import {
  AiAssistantModal,
  EditProjectModal,
  FieldSetModal,
  HistoryModal,
  NewSubModelModal,
  NewTableModal,
  RelationModal,
  ShareProjectModal,
  TableDetailModal,
  UpdateScriptModal,
} from './ErModals';

interface ErEditorProps {
  initialProject: ErProjectRecord;
  user: AuthUser;
  autoSave: boolean;
  onSyncTopBar: (state: { saving: boolean; dirty: boolean }) => void;
  onRegisterManualSave: (fn: (() => Promise<void>) | null) => void;
  onProjectSaved: (project: ErProjectRecord) => void;
  onBack: () => void;
}

const DEFAULT_PORTS: Record<DbDialect, number> = {
  postgresql: 5432,
  mysql: 3306,
  sqlserver: 1433,
  sqlite: 0,
};

export function ErEditor({
  initialProject,
  user,
  autoSave,
  onSyncTopBar,
  onRegisterManualSave,
  onProjectSaved,
  onBack,
}: ErEditorProps) {
  const [project, setProject] = useState<ErProjectRecord>(initialProject);
  const [undoStack, setUndoStack] = useState<ErProjectRecord[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<'origin' | 'tables'>('tables');
  const [tableSearch, setTableSearch] = useState('');
  const [expandedCards, setExpandedCards] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 24, y: 24 });

  // Menus dropdown
  const [layoutMenuOpen, setLayoutMenuOpen] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

  // Modais
  const [editProjectOpen, setEditProjectOpen] = useState(false);
  const [newSubModelOpen, setNewSubModelOpen] = useState(false);
  const [newTableOpen, setNewTableOpen] = useState(false);
  const [fieldSetOpen, setFieldSetOpen] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [scriptModalOpen, setScriptModalOpen] = useState(false);
  const [shareModalOpen, setShareModalOpen] = useState(false);
  const [historyModalOpen, setHistoryModalOpen] = useState(false);
  const [selectedTableModal, setSelectedTableModal] = useState<{
    tableId: string;
    editMode: boolean;
  } | null>(null);
  const [newRelationPair, setNewRelationPair] = useState<{
    fromId: string;
    toId: string;
  } | null>(null);
  const [editingRelationId, setEditingRelationId] = useState<string | null>(
    null,
  );

  // Usuários para compartilhamento / transferência de posse
  const [knownUsers, setKnownUsers] = useState<
    Array<{ id: string; name: string; email: string }>
  >([]);

  // Origem: Conexão direta READ-ONLY + Importação DDL
  const [dbForm, setDbForm] = useState<ErDbConnectionTestInput>(() => ({
    dialect: initialProject.dbConfig?.dialect ?? initialProject.dialect,
    host: initialProject.dbConfig?.host ?? 'localhost',
    port:
      initialProject.dbConfig?.port ??
      DEFAULT_PORTS[initialProject.dbConfig?.dialect ?? initialProject.dialect],
    database: initialProject.dbConfig?.database ?? '',
    schema: initialProject.dbConfig?.schema ?? 'public',
    username: initialProject.dbConfig?.username ?? '',
    password: '',
    ssl: initialProject.dbConfig?.ssl ?? false,
  }));
  const [dbBusy, setDbBusy] = useState(false);
  const [dbMessage, setDbMessage] = useState<{
    type: 'ok' | 'error';
    text: string;
  } | null>(null);
  const [ddlInput, setDdlInput] = useState('');
  const [ddlMode, setDdlMode] = useState<'replace' | 'merge'>('replace');
  const [ddlBusy, setDdlBusy] = useState(false);

  // Feedback global e overlay de IA (para relatórios PDF/HTML do SubModel)
  const [toast, setToast] = useState<string | null>(null);
  const [aiOverlay, setAiOverlay] = useState<{
    title: string;
    steps?: string[];
  } | null>(null);

  const readOnly = project.accessLevel === 'view';
  const isOwner = project.accessLevel === 'owner';

  const projectRef = useRef(project);
  projectRef.current = project;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((curr) => (curr === msg ? null : curr));
    }, 3200);
  }, []);

  useEffect(() => {
    onSyncTopBar({ saving, dirty });
  }, [saving, dirty, onSyncTopBar]);

  // Carrega lista de usuários ao abrir o modal de compartilhamento
  useEffect(() => {
    if (!shareModalOpen) return;
    erStudioApi
      .listUsers()
      .then((list) => setKnownUsers(list))
      .catch(() => {
        // fallback silencioso
      });
  }, [shareModalOpen]);

  const activeSubModel: ErSubModel = useMemo(() => {
    return (
      project.subModels.find((s) => s.id === project.activeSubModelId) ??
      project.subModels[0] ?? {
        id: 'sub_default',
        name: 'Principal',
        tableIds: [],
        positions: {},
      }
    );
  }, [project.subModels, project.activeSubModelId]);

  const selectedTableIds = useMemo(
    () => new Set(activeSubModel.tableIds),
    [activeSubModel.tableIds],
  );

  const visibleRelationsCount = useMemo(
    () =>
      project.relations.filter(
        (r) =>
          selectedTableIds.has(r.fromTableId) &&
          selectedTableIds.has(r.toTableId),
      ).length,
    [project.relations, selectedTableIds],
  );

  const persistProject = useCallback(
    async (keepalive = false) => {
      if (readOnly || !dirtyRef.current) return;
      const snap = projectRef.current;
      setSaving(true);
      try {
        const saved = await erStudioApi.update(
          snap.id,
          {
            name: snap.name,
            description: snap.description,
            dialect: snap.dialect,
            tables: snap.tables,
            relations: snap.relations,
            subModels: snap.subModels,
            activeSubModelId: snap.activeSubModelId,
            dbConfig: snap.dbConfig,
            pendingChanges: snap.pendingChanges,
            history: snap.history,
            shares: snap.shares,
          },
          { keepalive },
        );
        setDirty(false);
        onProjectSaved(saved);
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : 'Falha ao salvar alterações.',
        );
      } finally {
        setSaving(false);
      }
    },
    [readOnly, onProjectSaved, showToast],
  );

  useEffect(() => {
    onRegisterManualSave(() => persistProject(false));
    return () => onRegisterManualSave(null);
  }, [onRegisterManualSave, persistProject]);

  // Auto-save contínuo (debounce 500ms)
  useEffect(() => {
    if (!autoSave || !dirty || readOnly) return;
    const timer = setTimeout(() => {
      void persistProject(false);
    }, 500);
    return () => clearTimeout(timer);
  }, [autoSave, dirty, readOnly, project, persistProject]);

  // Flush ao fechar a aba
  useEffect(() => {
    const onPageHide = () => {
      if (dirtyRef.current && !readOnly) {
        void persistProject(true);
      }
    };
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [readOnly, persistProject]);

  const mutateProject = useCallback(
    (
      updater: (prev: ErProjectRecord) => ErProjectRecord,
      options?: { recordUndo?: boolean },
    ) => {
      setProject((prev) => {
        if (options?.recordUndo !== false) {
          setUndoStack((stack) => [...stack.slice(-29), prev]);
        }
        return updater(prev);
      });
      setDirty(true);
    },
    [],
  );

  const handleUndo = () => {
    if (undoStack.length === 0 || readOnly) return;
    const previous = undoStack[undoStack.length - 1];
    setUndoStack((s) => s.slice(0, -1));
    setProject(previous);
    setDirty(true);
    showToast('Última alteração desfeita.');
  };

  const updateActiveSubModel = useCallback(
    (
      updater: (sub: ErSubModel) => ErSubModel,
      options?: { recordUndo?: boolean },
    ) => {
      mutateProject(
        (prev) => ({
          ...prev,
          subModels: prev.subModels.map((s) =>
            s.id === activeSubModel.id ? updater(s) : s,
          ),
        }),
        options,
      );
    },
    [mutateProject, activeSubModel.id],
  );

  // Toggle de tabela no SubModel ativo
  const toggleTableInSubModel = (tableId: string) => {
    updateActiveSubModel((sub) => {
      const exists = sub.tableIds.includes(tableId);
      if (exists) {
        return {
          ...sub,
          tableIds: sub.tableIds.filter((id) => id !== tableId),
        };
      }
      const nextPositions = { ...sub.positions };
      if (!nextPositions[tableId]) {
        const idx = sub.tableIds.length;
        nextPositions[tableId] = {
          x: 70 + (idx % 3) * (expandedCards ? 470 : 340),
          y: 50 + Math.floor(idx / 3) * 270,
        };
      }
      return {
        ...sub,
        tableIds: [...sub.tableIds, tableId],
        positions: nextPositions,
      };
    });
  };

  const addRelatedTables = (seedIds?: string[]) => {
    const base = new Set(seedIds ?? activeSubModel.tableIds);
    if (base.size === 0) return;
    const toAdd = new Set<string>();
    for (const r of project.relations) {
      if (base.has(r.fromTableId) && !selectedTableIds.has(r.toTableId)) {
        toAdd.add(r.toTableId);
      }
      if (base.has(r.toTableId) && !selectedTableIds.has(r.fromTableId)) {
        toAdd.add(r.fromTableId);
      }
    }
    if (toAdd.size === 0) {
      showToast('Todas as tabelas relacionadas já estão neste SubModel.');
      return;
    }
    updateActiveSubModel((sub) => {
      const nextIds = [...sub.tableIds, ...Array.from(toAdd)];
      const nextSub: ErSubModel = { ...sub, tableIds: nextIds };
      return {
        ...nextSub,
        positions: layoutSubModelHierarchical(
          project.tables,
          project.relations,
          nextSub,
          expandedCards,
        ),
      };
    });
    showToast(`+${toAdd.size} tabela(s) relacionada(s) adicionada(s).`);
  };

  const removeRelatedTables = (anchorTableId?: string) => {
    if (anchorTableId) {
      const neighbors = new Set<string>();
      for (const r of project.relations) {
        if (r.fromTableId === anchorTableId) neighbors.add(r.toTableId);
        if (r.toTableId === anchorTableId) neighbors.add(r.fromTableId);
      }
      neighbors.delete(anchorTableId);
      updateActiveSubModel((sub) => ({
        ...sub,
        tableIds: sub.tableIds.filter((id) => !neighbors.has(id)),
      }));
      return;
    }

    // Sem âncora: remove tabelas folha/relacionadas mantendo apenas a 1ª selecionada
    if (activeSubModel.tableIds.length <= 1) return;
    const keep = activeSubModel.tableIds[0];
    updateActiveSubModel((sub) => ({
      ...sub,
      tableIds: [keep],
    }));
  };

  const handleApplyLayout = (kind: 'hierarchical' | 'circular') => {
    setLayoutMenuOpen(false);
    updateActiveSubModel((sub) => ({
      ...sub,
      positions:
        kind === 'hierarchical'
          ? layoutSubModelHierarchical(
              project.tables,
              project.relations,
              sub,
              expandedCards,
            )
          : layoutSubModelCircular(project.tables, sub, expandedCards),
    }));
    setZoom(1);
    setPan({ x: 24, y: 24 });
  };

  // SubModels CRUD
  const handleCreateSubModel = (name: string, copyActive: boolean) => {
    const newSub: ErSubModel = {
      id: createId('sub'),
      name,
      tableIds: copyActive ? [...activeSubModel.tableIds] : [],
      positions: copyActive ? { ...activeSubModel.positions } : {},
    };
    mutateProject((prev) => ({
      ...prev,
      subModels: [...prev.subModels, newSub],
      activeSubModelId: newSub.id,
      history: [
        {
          id: createId('hist'),
          summary: `Criou SubModel "${name}"`,
          author: user.name,
          createdAt: new Date().toISOString(),
        },
        ...prev.history,
      ],
    }));
    showToast(`SubModel "${name}" criado e selecionado.`);
  };

  const handleDeleteSubModel = () => {
    if (project.subModels.length <= 1) {
      showToast('O projeto precisa manter ao menos 1 SubModel.');
      return;
    }
    if (
      !window.confirm(
        `Excluir o SubModel "${activeSubModel.name}"? (As tabelas do projeto não serão apagadas.)`,
      )
    ) {
      return;
    }
    mutateProject((prev) => {
      const remaining = prev.subModels.filter(
        (s) => s.id !== activeSubModel.id,
      );
      return {
        ...prev,
        subModels: remaining,
        activeSubModelId: remaining[0].id,
        history: [
          {
            id: createId('hist'),
            summary: `Removeu SubModel "${activeSubModel.name}"`,
            author: user.name,
            createdAt: new Date().toISOString(),
          },
          ...prev.history,
        ],
      };
    });
  };

  // Tabela CRUD
  const handleCreateTable = (newTable: ErTable, sql: string) => {
    const now = new Date().toISOString();
    mutateProject((prev) => {
      const subModels = prev.subModels.map((s) => {
        if (s.id !== activeSubModel.id) return s;
        const idx = s.tableIds.length;
        return {
          ...s,
          tableIds: [...s.tableIds, newTable.id],
          positions: {
            ...s.positions,
            [newTable.id]: {
              x: 80 + (idx % 3) * (expandedCards ? 470 : 340),
              y: 60 + Math.floor(idx / 3) * 260,
            },
          },
        };
      });
      return {
        ...prev,
        tables: [...prev.tables, newTable],
        subModels,
        pendingChanges: [
          ...prev.pendingChanges,
          {
            id: createId('chg'),
            sql,
            description: `Criou tabela ${newTable.name}`,
            createdAt: now,
          },
        ],
        history: [
          {
            id: createId('hist'),
            summary: `Criou tabela ${newTable.name}`,
            author: user.name,
            createdAt: now,
          },
          ...prev.history,
        ],
      };
    });
    showToast(`Tabela ${newTable.name} criada.`);
  };

  const handleSaveTable = (
    updated: ErTable,
    sqlStatements: string[],
    summary: string,
  ) => {
    const now = new Date().toISOString();
    mutateProject((prev) => {
      const oldTable = prev.tables.find((t) => t.id === updated.id);
      const renamedCols = new Map<string, string>();
      if (oldTable) {
        const newById = new Map(updated.columns.map((c) => [c.id, c]));
        for (const oc of oldTable.columns) {
          const nc = newById.get(oc.id);
          if (nc && nc.name !== oc.name) {
            renamedCols.set(oc.name, nc.name);
          }
        }
      }
      const nextRelations = prev.relations.map((r) => ({
        ...r,
        fromColumn:
          r.fromTableId === updated.id && renamedCols.has(r.fromColumn)
            ? renamedCols.get(r.fromColumn)!
            : r.fromColumn,
        toColumn:
          r.toTableId === updated.id && renamedCols.has(r.toColumn)
            ? renamedCols.get(r.toColumn)!
            : r.toColumn,
      }));

      return {
        ...prev,
        tables: prev.tables.map((t) => (t.id === updated.id ? updated : t)),
        relations: nextRelations,
        pendingChanges: [
          ...prev.pendingChanges,
          ...sqlStatements.map((sql) => ({
            id: createId('chg'),
            sql,
            description: summary,
            createdAt: now,
          })),
        ],
        history: [
          {
            id: createId('hist'),
            summary,
            author: user.name,
            createdAt: now,
          },
          ...prev.history,
        ],
      };
    });
    showToast(summary);
  };

  const handleDeleteTable = (tableId: string) => {
    const tbl = project.tables.find((t) => t.id === tableId);
    if (!tbl) return;
    const now = new Date().toISOString();
    mutateProject((prev) => ({
      ...prev,
      tables: prev.tables.filter((t) => t.id !== tableId),
      relations: prev.relations.filter(
        (r) => r.fromTableId !== tableId && r.toTableId !== tableId,
      ),
      subModels: prev.subModels.map((s) => ({
        ...s,
        tableIds: s.tableIds.filter((id) => id !== tableId),
      })),
      pendingChanges: [
        ...prev.pendingChanges,
        {
          id: createId('chg'),
          sql: `DROP TABLE ${tbl.name};`,
          description: `Removeu tabela ${tbl.name}`,
          createdAt: now,
        },
      ],
      history: [
        {
          id: createId('hist'),
          summary: `Removeu tabela ${tbl.name}`,
          author: user.name,
          createdAt: now,
        },
        ...prev.history,
      ],
    }));
    showToast(`Tabela ${tbl.name} removida.`);
  };

  // Relacionamento CRUD (Criar / Editar via duplo clique na linha)
  const handleSaveRelation = (payload: {
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
  }) => {
    const now = new Date().toISOString();
    const actionLabel = payload.isEdit
      ? `Atualizou relacionamento ${payload.relation.name}`
      : `Criou relacionamento ${payload.relation.name}`;

    mutateProject((prev) => {
      let nextTables = prev.tables;
      if (payload.addFkColumn) {
        nextTables = nextTables.map((t) =>
          t.id === payload.relation.fromTableId
            ? { ...t, columns: [...t.columns, payload.addFkColumn!] }
            : t,
        );
      } else if (payload.updateFkColumn) {
        const upd = payload.updateFkColumn;
        nextTables = nextTables.map((t) =>
          t.id === upd.tableId
            ? {
                ...t,
                columns: t.columns.map((c) =>
                  c.name.toLowerCase() === upd.columnName.toLowerCase()
                    ? {
                        ...c,
                        nullable: upd.nullable,
                        primaryKey: upd.primaryKey,
                      }
                    : c,
                ),
              }
            : t,
        );
      }

      const nextRelations = payload.isEdit
        ? prev.relations.map((r) =>
            r.id === payload.relation.id ? payload.relation : r,
          )
        : [...prev.relations, payload.relation];

      return {
        ...prev,
        tables: nextTables,
        relations: nextRelations,
        pendingChanges: [
          ...prev.pendingChanges,
          ...payload.sqlStatements.map((sql) => ({
            id: createId('chg'),
            sql,
            description: actionLabel,
            createdAt: now,
          })),
        ],
        history: [
          {
            id: createId('hist'),
            summary: actionLabel,
            author: user.name,
            createdAt: now,
          },
          ...prev.history,
        ],
      };
    });
    showToast(`${actionLabel}.`);
  };

  const handleDeleteRelation = (relId: string) => {
    const rel = project.relations.find((r) => r.id === relId);
    if (!rel) return;
    const fromTbl = project.tables.find((t) => t.id === rel.fromTableId);
    const now = new Date().toISOString();
    mutateProject((prev) => ({
      ...prev,
      relations: prev.relations.filter((r) => r.id !== relId),
      pendingChanges: [
        ...prev.pendingChanges,
        {
          id: createId('chg'),
          sql: `ALTER TABLE ${fromTbl?.name ?? rel.fromTableId} DROP CONSTRAINT ${rel.name};`,
          description: `Removeu FK ${rel.name}`,
          createdAt: now,
        },
      ],
      history: [
        {
          id: createId('hist'),
          summary: `Removeu relacionamento ${rel.name}`,
          author: user.name,
          createdAt: now,
        },
        ...prev.history,
      ],
    }));
    showToast(`Relacionamento ${rel.name} removido.`);
  };

  // Conjunto de campos
  const handleApplyFieldSet = (payload: {
    mode: 'existing' | 'separate';
    targetTableId?: string;
    newTableName?: string;
    columns: ErColumn[];
    sqlStatements: string[];
    summary: string;
  }) => {
    const now = new Date().toISOString();
    mutateProject((prev) => {
      if (payload.mode === 'existing' && payload.targetTableId) {
        return {
          ...prev,
          tables: prev.tables.map((t) =>
            t.id === payload.targetTableId
              ? { ...t, columns: [...t.columns, ...payload.columns] }
              : t,
          ),
          pendingChanges: [
            ...prev.pendingChanges,
            ...payload.sqlStatements.map((sql) => ({
              id: createId('chg'),
              sql,
              description: payload.summary,
              createdAt: now,
            })),
          ],
          history: [
            {
              id: createId('hist'),
              summary: payload.summary,
              author: user.name,
              createdAt: now,
            },
            ...prev.history,
          ],
        };
      }

      const newTbl: ErTable = {
        id: createId('tbl'),
        name: payload.newTableName || 'CONJUNTO',
        columns: payload.columns,
      };
      return {
        ...prev,
        tables: [...prev.tables, newTbl],
        subModels: prev.subModels.map((s) =>
          s.id === activeSubModel.id
            ? {
                ...s,
                tableIds: [...s.tableIds, newTbl.id],
                positions: {
                  ...s.positions,
                  [newTbl.id]: {
                    x: 80 + (s.tableIds.length % 3) * 340,
                    y: 60 + Math.floor(s.tableIds.length / 3) * 260,
                  },
                },
              }
            : s,
        ),
        pendingChanges: [
          ...prev.pendingChanges,
          ...payload.sqlStatements.map((sql) => ({
            id: createId('chg'),
            sql,
            description: payload.summary,
            createdAt: now,
          })),
        ],
        history: [
          {
            id: createId('hist'),
            summary: payload.summary,
            author: user.name,
            createdAt: now,
          },
          ...prev.history,
        ],
      };
    });
    showToast(payload.summary);
  };

  // Assistente IA: envia texto para o backend (garantindo que o estado atual foi salvo antes)
  const handleAnalyzeWithAi = async (
    prompt: string,
  ): Promise<ErAiPlanResponse> => {
    if (dirtyRef.current && !readOnly) {
      await persistProject(false);
    }
    return erStudioApi.planAiAdjustment(project.id, prompt);
  };

  const handleApplyAiPlan = (plan: ErAiPlanResponse) => {
    mutateProject((prev) =>
      applyAiOperationsToProject(
        prev,
        plan.operations,
        plan.sqlStatements,
        plan.summary,
        user.name,
      ),
    );
    showToast('Ajustes da IA aplicados ao modelo e adicionados ao script SQL.');
  };

  // Origem: Teste e leitura SOMENTE LEITURA do banco conectado
  const handleTestDb = async () => {
    setDbBusy(true);
    setDbMessage(null);
    try {
      const res = await erStudioApi.testDbConnection(dbForm);
      setDbMessage({ type: 'ok', text: res.message });
    } catch (err) {
      setDbMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Falha ao testar conexão.',
      });
    } finally {
      setDbBusy(false);
    }
  };

  const handleIntrospectDb = async () => {
    if (readOnly) return;
    setDbBusy(true);
    setDbMessage(null);
    try {
      const updated = await erStudioApi.introspectDbReadOnly(
        project.id,
        dbForm,
      );
      setProject(updated);
      setDirty(false);
      onProjectSaved(updated);
      setDbMessage({
        type: 'ok',
        text: `DDL lido em modo somente leitura: ${updated.tables.length} tabela(s) e ${updated.relations.length} FK(s).`,
      });
      setSidebarTab('tables');
      showToast(
        `Leitura concluída (${updated.tables.length} tabelas importadas).`,
      );
    } catch (err) {
      setDbMessage({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Falha ao ler DDL do banco de dados.',
      });
    } finally {
      setDbBusy(false);
    }
  };

  const handleImportDdl = async () => {
    if (readOnly || !ddlInput.trim()) return;
    setDdlBusy(true);
    setDbMessage(null);
    try {
      const updated = await erStudioApi.importDdl(project.id, {
        ddl: ddlInput,
        mode: ddlMode,
      });
      setProject(updated);
      setDirty(false);
      onProjectSaved(updated);
      setDdlInput('');
      setSidebarTab('tables');
      showToast(
        `DDL importado com sucesso (${updated.tables.length} tabelas no projeto).`,
      );
    } catch (err) {
      setDbMessage({
        type: 'error',
        text: err instanceof Error ? err.message : 'Falha ao importar DDL.',
      });
    } finally {
      setDdlBusy(false);
    }
  };

  // Exportação do SubModel ativo (PNG / PDF / HTML com resumo executivo por IA)
  const handleExport = async (format: 'png' | 'pdf' | 'html') => {
    setExportMenuOpen(false);
    if (dirtyRef.current && !readOnly) {
      await persistProject(false);
    }

    if (format === 'png') {
      try {
        await exportSubModelPng(projectRef.current, expandedCards);
        showToast(`Imagem PNG do SubModel "${activeSubModel.name}" baixada.`);
      } catch (err) {
        showToast(
          err instanceof Error ? err.message : 'Erro ao exportar PNG.',
        );
      }
      return;
    }

    let pdfWindow: Window | null = null;
    if (format === 'pdf') {
      try {
        pdfWindow = openPdfPreviewWindow(
          `${projectRef.current.name} — ${activeSubModel.name}`,
        );
      } catch (err) {
        showToast(
          err instanceof Error
            ? err.message
            : 'Permita pop-ups para gerar o PDF.',
        );
        return;
      }
    }

    setAiOverlay({
      title: `Gerando relatório ${format.toUpperCase()} do SubModel "${activeSubModel.name}"`,
      steps: [
        'Analisando tabelas, chaves e relacionamentos do SubModel ativo...',
        'Gerando resumo executivo com Gemini...',
        `Montando diagrama DER e dicionário em ${format.toUpperCase()}...`,
      ],
    });

    try {
      let summary = null;
      try {
        summary = await erStudioApi.summarizeSubModel(
          projectRef.current.id,
          activeSubModel.id,
        );
      } catch {
        summary = null;
      }

      if (format === 'pdf') {
        exportSubModelPdf(
          projectRef.current,
          expandedCards,
          summary,
          pdfWindow,
        );
      } else {
        exportSubModelHtml(projectRef.current, expandedCards, summary);
        showToast(`Página HTML do SubModel "${activeSubModel.name}" baixada.`);
      }
    } catch (err) {
      if (pdfWindow && !pdfWindow.closed) pdfWindow.close();
      showToast(
        err instanceof Error ? err.message : 'Erro ao gerar relatório.',
      );
    } finally {
      setAiOverlay(null);
    }
  };

  const handleBack = async () => {
    if (dirtyRef.current && !readOnly) {
      await persistProject(false);
    }
    onBack();
  };

  // Tabelas filtradas na sidebar
  const filteredTables = useMemo(() => {
    const q = tableSearch.trim().toLowerCase();
    if (!q) return project.tables;
    return project.tables.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        t.columns.some((c) => c.name.toLowerCase().includes(q)),
    );
  }, [project.tables, tableSearch]);

  const relCountByTable = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of project.relations) {
      map.set(r.fromTableId, (map.get(r.fromTableId) ?? 0) + 1);
      map.set(r.toTableId, (map.get(r.toTableId) ?? 0) + 1);
    }
    return map;
  }, [project.relations]);

  const modalTable = selectedTableModal
    ? project.tables.find((t) => t.id === selectedTableModal.tableId) ?? null
    : null;

  const editingRelation = editingRelationId
    ? project.relations.find((r) => r.id === editingRelationId) ?? null
    : null;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-[#F1F5F9]">
      {/* Faixa superior do Projeto + SubModel (DER) */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#DCE4EE] bg-white px-4 py-2.5">
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-3 py-1.5 text-[13px] font-semibold text-[#334155] hover:bg-[#F8FAFC]"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Projetos
          </button>

          <div className="h-6 w-px bg-[#E2E8F0]" />

          <div className="flex items-center gap-2">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                Projeto · {formatDialectLabel(project.dialect)}
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[15px] font-bold text-[#0F1D3D]">
                  {project.name}
                </span>
                <span className="rounded-full bg-[#EAF0F9] px-2 py-0.5 text-[10px] font-bold text-[#0F1D3D]">
                  {formatAccessLabel(project.accessLevel)}
                </span>
                {!readOnly && (
                  <button
                    type="button"
                    onClick={() => setEditProjectOpen(true)}
                    className="text-[12px] font-semibold text-[#1D5FD6] hover:underline"
                  >
                    Editar
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="h-6 w-px bg-[#E2E8F0]" />

          {/* Seletor de SubModel (DER) */}
          <div className="flex flex-wrap items-center gap-2">
            <div>
              <div className="text-[10px] font-bold uppercase tracking-wider text-[#64748B]">
                SubModel (DER)
              </div>
              <div className="flex items-center gap-1.5">
                <select
                  value={activeSubModel.id}
                  onChange={(e) => {
                    const id = e.target.value;
                    mutateProject(
                      (prev) => ({ ...prev, activeSubModelId: id }),
                      { recordUndo: false },
                    );
                  }}
                  className="h-8 rounded-lg border border-[#CBD5E1] bg-white px-2.5 text-[13px] font-semibold text-[#0F1D3D] outline-none focus:border-[#1D5FD6]"
                >
                  {project.subModels.map((sub) => (
                    <option key={sub.id} value={sub.id}>
                      {sub.name} ({sub.tableIds.length})
                    </option>
                  ))}
                </select>

                {!readOnly && (
                  <>
                    <button
                      type="button"
                      onClick={() => setNewSubModelOpen(true)}
                      className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#CBD5E1] bg-white px-2.5 text-[12.5px] font-semibold text-[#0F1D3D] hover:bg-[#F8FAFC]"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Novo SubModel
                    </button>

                    {project.subModels.length > 1 && (
                      <button
                        type="button"
                        onClick={handleDeleteSubModel}
                        title="Excluir SubModel ativo"
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-red-200 bg-white px-2.5 text-[12.5px] font-semibold text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Excluir
                      </button>
                    )}
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShareModalOpen(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-3 text-[12.5px] font-semibold text-[#334155] hover:bg-[#F8FAFC]"
          >
            <Share2 className="h-3.5 w-3.5" />
            Compartilhar
          </button>
          <button
            type="button"
            onClick={() => setHistoryModalOpen(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-3 text-[12.5px] font-semibold text-[#334155] hover:bg-[#F8FAFC]"
          >
            <History className="h-3.5 w-3.5" />
            Histórico
          </button>
        </div>
      </div>

      {/* Área principal: Sidebar esquerda + Canvas com toolbar de 2 linhas */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        {sidebarOpen && (
          <aside className="flex w-[320px] shrink-0 flex-col border-r border-[#DCE4EE] bg-white">
            {/* Abas Origem / Tabelas */}
            <div className="grid grid-cols-2 border-b border-[#E2E8F0]">
              <button
                type="button"
                onClick={() => setSidebarTab('origin')}
                className={[
                  'flex items-center justify-center gap-1.5 py-2.5 text-[13px] font-semibold transition-colors',
                  sidebarTab === 'origin'
                    ? 'border-b-2 border-[#1D5FD6] bg-[#F8FBFF] text-[#1D5FD6]'
                    : 'text-[#64748B] hover:text-[#0F172A]',
                ].join(' ')}
              >
                <Database className="h-3.5 w-3.5" />
                Origem
              </button>
              <button
                type="button"
                onClick={() => setSidebarTab('tables')}
                className={[
                  'flex items-center justify-center gap-1.5 py-2.5 text-[13px] font-semibold transition-colors',
                  sidebarTab === 'tables'
                    ? 'border-b-2 border-[#1D5FD6] bg-[#F8FBFF] text-[#1D5FD6]'
                    : 'text-[#64748B] hover:text-[#0F172A]',
                ].join(' ')}
              >
                <Table2 className="h-3.5 w-3.5" />
                Tabelas ({project.tables.length})
              </button>
            </div>

            {sidebarTab === 'origin' ? (
              /* Aba ORIGEM: Conexão direta READ-ONLY + Importação DDL */
              <div className="flex-1 space-y-5 overflow-y-auto p-4">
                <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 text-[12px] text-emerald-900">
                  <div className="flex items-center gap-1.5 font-bold">
                    <ShieldCheck className="h-4 w-4 text-emerald-700" />
                    Acesso estritamente SOMENTE LEITURA
                  </div>
                  <p className="mt-1 text-emerald-800/90">
                    A conexão lê apenas metadados (DDL) do banco de origem. Nenhuma alteração é gravada no banco conectado.
                  </p>
                </div>

                {dbMessage && (
                  <div
                    className={[
                      'rounded-lg border px-3 py-2 text-[12.5px]',
                      dbMessage.type === 'ok'
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                        : 'border-red-200 bg-red-50 text-red-700',
                    ].join(' ')}
                  >
                    {dbMessage.text}
                  </div>
                )}

                <div className="space-y-2.5">
                  <div className="text-[11.5px] font-bold uppercase tracking-wider text-[#475569]">
                    Conectar direto ao banco (DDL)
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-[#64748B]">
                      Engine
                    </label>
                    <select
                      value={dbForm.dialect}
                      disabled={readOnly}
                      onChange={(e) => {
                        const d = e.target.value as DbDialect;
                        setDbForm((prev) => ({
                          ...prev,
                          dialect: d,
                          port: DEFAULT_PORTS[d],
                          schema: d === 'postgresql' ? prev.schema || 'public' : prev.schema,
                        }));
                      }}
                      className="mt-1 h-9 w-full rounded-lg border border-[#CBD5E1] bg-white px-2.5 text-[13px]"
                    >
                      <option value="postgresql">PostgreSQL</option>
                      <option value="mysql">MySQL</option>
                      <option value="sqlite">SQLite (arquivo local)</option>
                    </select>
                  </div>

                  {dbForm.dialect === 'sqlite' ? (
                    <div>
                      <label className="block text-[11px] font-semibold text-[#64748B]">
                        Caminho do arquivo .sqlite / .db
                      </label>
                      <input
                        type="text"
                        disabled={readOnly}
                        value={dbForm.database}
                        onChange={(e) =>
                          setDbForm((p) => ({ ...p, database: e.target.value }))
                        }
                        placeholder="/caminho/para/banco.sqlite"
                        className="mt-1 h-9 w-full rounded-lg border border-[#CBD5E1] px-2.5 font-mono text-[12px]"
                      />
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-[1fr_80px] gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-[#64748B]">
                            Host
                          </label>
                          <input
                            type="text"
                            disabled={readOnly}
                            value={dbForm.host}
                            onChange={(e) =>
                              setDbForm((p) => ({ ...p, host: e.target.value }))
                            }
                            placeholder="localhost"
                            className="mt-1 h-9 w-full rounded-lg border border-[#CBD5E1] px-2.5 text-[12.5px]"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-[#64748B]">
                            Porta
                          </label>
                          <input
                            type="number"
                            disabled={readOnly}
                            value={dbForm.port}
                            onChange={(e) =>
                              setDbForm((p) => ({
                                ...p,
                                port: Number(e.target.value) || 0,
                              }))
                            }
                            className="mt-1 h-9 w-full rounded-lg border border-[#CBD5E1] px-2 text-[12.5px]"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-[#64748B]">
                            Database
                          </label>
                          <input
                            type="text"
                            disabled={readOnly}
                            value={dbForm.database}
                            onChange={(e) =>
                              setDbForm((p) => ({
                                ...p,
                                database: e.target.value,
                              }))
                            }
                            placeholder="nome_db"
                            className="mt-1 h-9 w-full rounded-lg border border-[#CBD5E1] px-2.5 text-[12.5px]"
                          />
                        </div>
                        {dbForm.dialect === 'postgresql' && (
                          <div>
                            <label className="block text-[11px] font-semibold text-[#64748B]">
                              Schema
                            </label>
                            <input
                              type="text"
                              disabled={readOnly}
                              value={dbForm.schema ?? 'public'}
                              onChange={(e) =>
                                setDbForm((p) => ({
                                  ...p,
                                  schema: e.target.value,
                                }))
                              }
                              placeholder="public"
                              className="mt-1 h-9 w-full rounded-lg border border-[#CBD5E1] px-2.5 text-[12.5px]"
                            />
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[11px] font-semibold text-[#64748B]">
                            Usuário
                          </label>
                          <input
                            type="text"
                            disabled={readOnly}
                            value={dbForm.username}
                            onChange={(e) =>
                              setDbForm((p) => ({
                                ...p,
                                username: e.target.value,
                              }))
                            }
                            className="mt-1 h-9 w-full rounded-lg border border-[#CBD5E1] px-2.5 text-[12.5px]"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-semibold text-[#64748B]">
                            Senha (não salva)
                          </label>
                          <input
                            type="password"
                            disabled={readOnly}
                            value={dbForm.password ?? ''}
                            onChange={(e) =>
                              setDbForm((p) => ({
                                ...p,
                                password: e.target.value,
                              }))
                            }
                            className="mt-1 h-9 w-full rounded-lg border border-[#CBD5E1] px-2.5 text-[12.5px]"
                          />
                        </div>
                      </div>

                      <label className="flex cursor-pointer items-center gap-2 text-[12px] text-[#475569]">
                        <input
                          type="checkbox"
                          disabled={readOnly}
                          checked={Boolean(dbForm.ssl)}
                          onChange={(e) =>
                            setDbForm((p) => ({ ...p, ssl: e.target.checked }))
                          }
                          className="h-3.5 w-3.5 accent-[#1D5FD6]"
                        />
                        Usar conexão SSL/TLS
                      </label>
                    </>
                  )}

                  <div className="flex flex-col gap-2 pt-1">
                    <button
                      type="button"
                      disabled={dbBusy || readOnly}
                      onClick={handleTestDb}
                      className="h-9 w-full rounded-lg border border-[#CBD5E1] bg-white text-[12.5px] font-semibold text-[#0F1D3D] hover:bg-[#F8FAFC] disabled:opacity-50"
                    >
                      {dbBusy ? 'Conectando...' : 'Testar conexão (read-only)'}
                    </button>
                    <button
                      type="button"
                      disabled={dbBusy || readOnly}
                      onClick={handleIntrospectDb}
                      className="h-9 w-full rounded-lg bg-[#0F1D3D] text-[12.5px] font-semibold text-white hover:bg-[#1E3A5F] disabled:opacity-50"
                    >
                      {dbBusy
                        ? 'Lendo catálogo...'
                        : 'Ler DDL do Banco (Somente Leitura)'}
                    </button>
                  </div>
                </div>

                <hr className="border-[#E2E8F0]" />

                {/* Importar DDL SQL colado */}
                <div className="space-y-2.5">
                  <div className="text-[11.5px] font-bold uppercase tracking-wider text-[#475569]">
                    Ou importar script DDL SQL
                  </div>
                  <textarea
                    rows={6}
                    disabled={readOnly}
                    value={ddlInput}
                    onChange={(e) => setDdlInput(e.target.value)}
                    placeholder="Cole comandos CREATE TABLE / ALTER TABLE..."
                    className="w-full rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] p-2.5 font-mono text-[11.5px] text-[#0F172A] outline-none focus:border-[#1D5FD6] focus:bg-white"
                  />
                  <div className="flex items-center gap-2">
                    <select
                      value={ddlMode}
                      disabled={readOnly}
                      onChange={(e) =>
                        setDdlMode(e.target.value as 'replace' | 'merge')
                      }
                      className="h-9 flex-1 rounded-lg border border-[#CBD5E1] bg-white px-2 text-[12.5px]"
                    >
                      <option value="replace">Substituir modelo</option>
                      <option value="merge">Mesclar ao modelo</option>
                    </select>
                    <button
                      type="button"
                      disabled={ddlBusy || readOnly || !ddlInput.trim()}
                      onClick={handleImportDdl}
                      className="h-9 rounded-lg bg-[#1D5FD6] px-3.5 text-[12.5px] font-semibold text-white hover:bg-[#174DB3] disabled:opacity-50"
                    >
                      {ddlBusy ? 'Importando...' : 'Importar'}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* Aba TABELAS (imagens 15.39.37 / 15.39.55) */
              <div className="flex min-h-0 flex-1 flex-col">
                <div className="space-y-2.5 border-b border-[#EEF2F6] p-3">
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[#94A3B8]" />
                    <input
                      type="text"
                      value={tableSearch}
                      onChange={(e) => setTableSearch(e.target.value)}
                      placeholder="Filtrar tabelas ou colunas..."
                      className="h-8 w-full rounded-lg border border-[#CBD5E1] pl-8 pr-2.5 text-[12.5px] outline-none focus:border-[#1D5FD6]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        updateActiveSubModel((sub) => {
                          const allIds = project.tables.map((t) => t.id);
                          const nextSub = { ...sub, tableIds: allIds };
                          return {
                            ...nextSub,
                            positions: layoutSubModelHierarchical(
                              project.tables,
                              project.relations,
                              nextSub,
                              expandedCards,
                            ),
                          };
                        })
                      }
                      className="rounded-md border border-[#CBD5E1] bg-white py-1 text-[11.5px] font-semibold text-[#334155] hover:bg-[#F8FAFC]"
                    >
                      Marcar todas
                    </button>
                    <button
                      type="button"
                      onClick={() => addRelatedTables()}
                      className="rounded-md border border-[#CBD5E1] bg-white py-1 text-[11.5px] font-semibold text-[#1D5FD6] hover:bg-[#EFF6FF]"
                    >
                      + Relacionadas
                    </button>
                    <button
                      type="button"
                      onClick={() => removeRelatedTables()}
                      className="rounded-md border border-[#CBD5E1] bg-white py-1 text-[11.5px] font-semibold text-[#334155] hover:bg-[#F8FAFC]"
                    >
                      − Relacionadas
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        updateActiveSubModel((sub) => ({
                          ...sub,
                          tableIds: [],
                        }))
                      }
                      className="rounded-md border border-[#CBD5E1] bg-white py-1 text-[11.5px] font-semibold text-[#64748B] hover:bg-[#F8FAFC]"
                    >
                      Limpar
                    </button>
                  </div>

                  <div className="text-[11.5px] font-medium text-[#64748B]">
                    {activeSubModel.tableIds.length} de {project.tables.length}{' '}
                    selecionadas no SubModel
                  </div>
                </div>

                <div className="flex-1 divide-y divide-[#F1F5F9] overflow-y-auto">
                  {filteredTables.length === 0 ? (
                    <div className="p-4 text-center text-[12.5px] text-[#64748B]">
                      Nenhuma tabela encontrada.
                    </div>
                  ) : (
                    filteredTables.map((tbl) => {
                      const checked = selectedTableIds.has(tbl.id);
                      const relCount = relCountByTable.get(tbl.id) ?? 0;
                      return (
                        <div
                          key={tbl.id}
                          className={[
                            'flex items-center justify-between gap-2 px-3 py-2 transition-colors',
                            checked ? 'bg-[#F5F9FF]' : 'hover:bg-[#F8FAFC]',
                          ].join(' ')}
                        >
                          <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleTableInSubModel(tbl.id)}
                              className="mt-0.5 h-4 w-4 shrink-0 rounded accent-[#1D5FD6]"
                            />
                            <div className="min-w-0">
                              <div
                                className="truncate text-[12.5px] font-bold text-[#0F172A]"
                                title={tbl.name}
                              >
                                {tbl.name}
                              </div>
                              <div className="text-[11px] text-[#64748B]">
                                {tbl.columns.length} campos · {relCount} rel.
                              </div>
                            </div>
                          </label>

                          <div className="flex shrink-0 items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() =>
                                setSelectedTableModal({
                                  tableId: tbl.id,
                                  editMode: false,
                                })
                              }
                              title="Inspecionar / Editar tabela"
                              className="rounded p-1 text-[#64748B] hover:bg-white hover:text-[#1D5FD6]"
                            >
                              <Pencil className="h-3.5 w-3.5" />
                            </button>
                            {!readOnly && (
                              <button
                                type="button"
                                onClick={() => {
                                  if (
                                    window.confirm(
                                      `Excluir a tabela "${tbl.name}"?`,
                                    )
                                  ) {
                                    handleDeleteTable(tbl.id);
                                  }
                                }}
                                title="Excluir tabela"
                                className="rounded p-1 text-[#94A3B8] hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </aside>
        )}

        {/* Coluna direita: Toolbar de 2 linhas + Canvas */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
          <div className="flex flex-col gap-2 border-b border-[#DCE4EE] bg-[#FAFBFD] px-4 py-2">
            {/* Linha 1 */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => setSidebarOpen((v) => !v)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-2.5 text-[12.5px] font-semibold text-[#334155] hover:bg-[#F8FAFC]"
                >
                  {sidebarOpen ? (
                    <PanelLeftClose className="h-3.5 w-3.5" />
                  ) : (
                    <PanelLeftOpen className="h-3.5 w-3.5" />
                  )}
                  Painel
                </button>

                <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-2.5 text-[12.5px] font-medium text-[#334155]">
                  <input
                    type="checkbox"
                    checked={expandedCards}
                    onChange={(e) => setExpandedCards(e.target.checked)}
                    className="h-3.5 w-3.5 accent-[#1D5FD6]"
                  />
                  Nulo / Identity / Default
                </label>

                <span className="text-[12.5px] font-medium text-[#64748B]">
                  {activeSubModel.tableIds.length} tabelas ·{' '}
                  {visibleRelationsCount} relacionamentos
                </span>
              </div>

              {!readOnly && (
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setAiModalOpen(true)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#0F1D3D] px-3 text-[12.5px] font-semibold text-white shadow-sm hover:bg-[#1E3A5F]"
                  >
                    <Sparkles className="h-3.5 w-3.5 text-sky-300" />
                    Assistente
                  </button>

                  <button
                    type="button"
                    onClick={() => setFieldSetOpen(true)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-3 text-[12.5px] font-semibold text-[#0F1D3D] hover:bg-[#F8FAFC]"
                  >
                    <Layers className="h-3.5 w-3.5 text-[#1D5FD6]" />+ Conjunto
                    de campos
                  </button>

                  <button
                    type="button"
                    onClick={() => setNewTableOpen(true)}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#1D5FD6] px-3 text-[12.5px] font-semibold text-white hover:bg-[#174DB3]"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Nova tabela
                  </button>
                </div>
              )}
            </div>

            {/* Linha 2 */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#EEF2F6] pt-2">
              <div className="flex flex-wrap items-center gap-2">
                {!readOnly && (
                  <button
                    type="button"
                    disabled={undoStack.length === 0}
                    onClick={handleUndo}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-2.5 text-[12.5px] font-semibold text-[#334155] hover:bg-[#F8FAFC] disabled:opacity-45"
                  >
                    <Undo2 className="h-3.5 w-3.5" />
                    Desfazer
                  </button>
                )}

                {/* Redesenhar dropdown (imagem 15.42.29) */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setLayoutMenuOpen((v) => !v);
                      setExportMenuOpen(false);
                    }}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-2.5 text-[12.5px] font-semibold text-[#334155] hover:bg-[#F8FAFC]"
                  >
                    <LayoutGrid className="h-3.5 w-3.5" />
                    Redesenhar
                    <ChevronDown className="h-3.5 w-3.5 text-[#64748B]" />
                  </button>
                  {layoutMenuOpen && (
                    <div className="absolute left-0 top-9 z-40 w-44 overflow-hidden rounded-xl border border-[#CBD5E1] bg-white py-1 shadow-lg">
                      <button
                        type="button"
                        onClick={() => handleApplyLayout('hierarchical')}
                        className="flex w-full items-center justify-between px-3.5 py-2 text-left text-[13px] font-medium text-[#0F172A] hover:bg-[#EFF6FF] hover:text-[#1D5FD6]"
                      >
                        Hierárquico
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApplyLayout('circular')}
                        className="flex w-full items-center justify-between px-3.5 py-2 text-left text-[13px] font-medium text-[#0F172A] hover:bg-[#EFF6FF] hover:text-[#1D5FD6]"
                      >
                        Circular
                      </button>
                    </div>
                  )}
                </div>

                {/* Exportar dropdown (imagem 15.42.43) */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setExportMenuOpen((v) => !v);
                      setLayoutMenuOpen(false);
                    }}
                    className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-2.5 text-[12.5px] font-semibold text-[#334155] hover:bg-[#F8FAFC]"
                  >
                    <Download className="h-3.5 w-3.5" />
                    Exportar
                    <ChevronDown className="h-3.5 w-3.5 text-[#64748B]" />
                  </button>
                  {exportMenuOpen && (
                    <div className="absolute left-0 top-9 z-40 w-64 overflow-hidden rounded-xl border border-[#CBD5E1] bg-white py-1 shadow-lg">
                      <button
                        type="button"
                        onClick={() => void handleExport('png')}
                        className="flex w-full flex-col px-3.5 py-2 text-left hover:bg-[#EFF6FF]"
                      >
                        <span className="text-[13px] font-semibold text-[#0F172A]">
                          Imagem PNG
                        </span>
                        <span className="text-[11px] text-[#64748B]">
                          Diagrama do SubModel ativo em alta resolução
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleExport('pdf')}
                        className="flex w-full flex-col px-3.5 py-2 text-left hover:bg-[#EFF6FF]"
                      >
                        <span className="text-[13px] font-semibold text-[#0F172A]">
                          PDF (A4 paisagem)
                        </span>
                        <span className="text-[11px] text-[#64748B]">
                          Relatório do SubModel com resumo por IA
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => void handleExport('html')}
                        className="flex w-full flex-col px-3.5 py-2 text-left hover:bg-[#EFF6FF]"
                      >
                        <span className="text-[13px] font-semibold text-[#0F172A]">
                          Página HTML
                        </span>
                        <span className="text-[11px] text-[#64748B]">
                          Arquivo único navegável com resumo por IA
                        </span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={() => setScriptModalOpen(true)}
                className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#0F1D3D] bg-white px-3 text-[12.5px] font-semibold text-[#0F1D3D] hover:bg-[#0F1D3D] hover:text-white"
              >
                <FileCode2 className="h-3.5 w-3.5" />
                Gerar script
                {project.pendingChanges.length > 0 && (
                  <span className="rounded-full bg-[#1D5FD6] px-1.5 py-0.5 text-[10.5px] font-bold text-white">
                    {project.pendingChanges.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* Canvas DER interativo */}
          <ErCanvas
            allTables={project.tables}
            allRelations={project.relations}
            subModel={activeSubModel}
            expanded={expandedCards}
            readOnly={readOnly}
            zoom={zoom}
            pan={pan}
            onZoomChange={setZoom}
            onPanChange={setPan}
            onMoveTable={(tableId, x, y) =>
              updateActiveSubModel(
                (sub) => ({
                  ...sub,
                  positions: { ...sub.positions, [tableId]: { x, y } },
                }),
                { recordUndo: false },
              )
            }
            onOpenTable={(tableId) =>
              setSelectedTableModal({ tableId, editMode: false })
            }
            onAddRelatedForTable={(tableId) => addRelatedTables([tableId])}
            onRemoveRelatedForTable={(tableId) => removeRelatedTables(tableId)}
            onRequestNewRelation={(fromId, toId) =>
              setNewRelationPair({ fromId, toId })
            }
            onOpenRelation={(relId) => setEditingRelationId(relId)}
            onDeleteRelation={handleDeleteRelation}
          />
        </div>
      </div>

      {/* Toast discreto */}
      {toast && (
        <div className="fixed bottom-5 left-1/2 z-50 -translate-x-1/2 rounded-full bg-[#0F1D3D] px-4 py-2 text-[13px] font-medium text-white shadow-xl">
          {toast}
        </div>
      )}

      {/* Overlay de processamento IA para exportação de relatório */}
      {aiOverlay && (
        <AiProcessingOverlay title={aiOverlay.title} steps={aiOverlay.steps} />
      )}

      {/* Modais */}
      {editProjectOpen && (
        <EditProjectModal
          project={project}
          onClose={() => setEditProjectOpen(false)}
          onSave={(patch) =>
            mutateProject((prev) => ({
              ...prev,
              ...patch,
              history: [
                {
                  id: createId('hist'),
                  summary: `Atualizou dados do projeto (${patch.name})`,
                  author: user.name,
                  createdAt: new Date().toISOString(),
                },
                ...prev.history,
              ],
            }))
          }
        />
      )}

      {newSubModelOpen && (
        <NewSubModelModal
          onClose={() => setNewSubModelOpen(false)}
          onCreate={handleCreateSubModel}
        />
      )}

      {newTableOpen && (
        <NewTableModal
          onClose={() => setNewTableOpen(false)}
          onCreate={handleCreateTable}
        />
      )}

      {modalTable && (
        <TableDetailModal
          table={modalTable}
          relations={project.relations}
          readOnly={readOnly}
          initialEditMode={selectedTableModal?.editMode}
          onClose={() => setSelectedTableModal(null)}
          onSaveTable={handleSaveTable}
          onDeleteTable={handleDeleteTable}
        />
      )}

      {(newRelationPair || editingRelation) && (
        <RelationModal
          key={editingRelation?.id ?? `${newRelationPair?.fromId}-${newRelationPair?.toId}`}
          tables={project.tables}
          initialFromId={newRelationPair?.fromId}
          initialToId={newRelationPair?.toId}
          existingRelation={editingRelation}
          readOnly={readOnly}
          onClose={() => {
            setNewRelationPair(null);
            setEditingRelationId(null);
          }}
          onSave={handleSaveRelation}
          onDelete={handleDeleteRelation}
        />
      )}

      {fieldSetOpen && (
        <FieldSetModal
          tables={project.tables}
          onClose={() => setFieldSetOpen(false)}
          onApply={handleApplyFieldSet}
        />
      )}

      {aiModalOpen && (
        <AiAssistantModal
          onClose={() => setAiModalOpen(false)}
          onAnalyze={handleAnalyzeWithAi}
          onApplyPlan={handleApplyAiPlan}
        />
      )}

      {scriptModalOpen && (
        <UpdateScriptModal
          projectName={project.name}
          dialect={project.dialect}
          pendingChanges={project.pendingChanges}
          readOnly={readOnly}
          onClose={() => setScriptModalOpen(false)}
          onMarkApplied={() => {
            mutateProject((prev) => ({
              ...prev,
              pendingChanges: [],
              history: [
                {
                  id: createId('hist'),
                  summary: 'Marcou script de atualização como aplicado',
                  author: user.name,
                  createdAt: new Date().toISOString(),
                },
                ...prev.history,
              ],
            }));
            showToast('Alterações pendentes marcadas como aplicadas.');
          }}
        />
      )}

      {shareModalOpen && (
        <ShareProjectModal
          project={project}
          users={knownUsers}
          isOwner={isOwner}
          onClose={() => setShareModalOpen(false)}
          onUpdateShares={(shares: ErShare[]) =>
            mutateProject((prev) => ({
              ...prev,
              shares,
              sharedWith: shares.map((s) => s.target),
            }))
          }
          onTransferOwnership={async (newOwnerEmail, keepEditAccess) => {
            const updated = await erStudioApi.transferOwnership(project.id, {
              newOwnerEmail,
              keepEditAccess,
            });
            setProject(updated);
            setDirty(false);
            onProjectSaved(updated);
            showToast(`Posse transferida para ${newOwnerEmail}.`);
          }}
        />
      )}

      {historyModalOpen && (
        <HistoryModal
          history={project.history}
          onClose={() => setHistoryModalOpen(false)}
        />
      )}
    </div>
  );
}
