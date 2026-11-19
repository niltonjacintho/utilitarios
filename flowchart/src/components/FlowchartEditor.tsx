'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  Download,
  GitCommitHorizontal,
  LayoutGrid,
  Maximize2,
  PanelRight,
  Plus,
  Redo2,
  Share2,
  Sparkles,
  Undo2,
  Upload,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  FlowchartEdge,
  FlowchartLane,
  FlowchartNode,
  FlowchartNodeType,
  FlowchartRecord,
  FlowchartStatus,
} from '@/types/flowchart';
import { flowchartApi } from '@/lib/api';
import {
  computeLaneBounds,
  createId,
  formatRoleLabel,
  formatStatusLabel,
  getNodeMeta,
  organizeFlowchart,
  validateFlowchart,
} from '@/lib/flowchart-utils';
import {
  exportFlowchartCsv,
  exportFlowchartHtml,
  exportFlowchartJson,
  exportFlowchartMarkdown,
  exportFlowchartPdf,
  exportFlowchartPng,
  openPdfPreviewWindow,
} from '@/lib/exporters';
import { FlowchartCanvas, SelectionTarget } from './FlowchartCanvas';
import { SidePanel, SideTab } from './SidePanel';
import { AiFlowchartModal, ImportJsonModal, ShareModal } from './Modals';
import { AiProcessingOverlay } from './AiProcessingOverlay';

interface FlowchartEditorProps {
  chart: FlowchartRecord;
  userName: string;
  onChartUpdated: (updated: FlowchartRecord) => void;
  onBackToLibrary: () => void;
}

interface GraphSnapshot {
  lanes: FlowchartLane[];
  nodes: FlowchartNode[];
  edges: FlowchartEdge[];
}

export function FlowchartEditor({
  chart,
  userName,
  onChartUpdated,
  onBackToLibrary,
}: FlowchartEditorProps) {
  const [localChart, setLocalChart] = useState<FlowchartRecord>(chart);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [selection, setSelection] = useState<SelectionTarget>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 24, y: 24 });

  const [connectMode, setConnectMode] = useState(false);
  const [connectSourceId, setConnectSourceId] = useState<string | null>(null);

  const [sideOpen, setSideOpen] = useState(true);
  const [sideTab, setSideTab] = useState<SideTab>('properties');

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(chart.name);

  const [exportOpen, setExportOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [aiOpen, setAiOpen] = useState(false);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiOverlay, setAiOverlay] = useState<{
    title: string;
    steps: string[];
  } | null>(null);

  // Histórico Undo/Redo
  const [past, setPast] = useState<GraphSnapshot[]>([]);
  const [future, setFuture] = useState<GraphSnapshot[]>([]);

  const latestRef = useRef<FlowchartRecord>(chart);
  const dirtyRef = useRef(false);
  const savingPromiseRef = useRef<Promise<void> | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const statusMenuRef = useRef<HTMLDivElement | null>(null);

  const readOnly = localChart.accessLevel === 'view';

  useEffect(() => {
    setLocalChart(chart);
    latestRef.current = chart;
    setTitleDraft(chart.name);
    setDirty(false);
    dirtyRef.current = false;
    setSaveError(null);
    setPast([]);
    setFuture([]);
  }, [chart.id]);

  // Sincroniza cor de fundo vinda do TopBar
  useEffect(() => {
    if (chart.backgroundColor !== latestRef.current.backgroundColor) {
      setLocalChart((prev) => {
        const next = { ...prev, backgroundColor: chart.backgroundColor };
        latestRef.current = next;
        return next;
      });
    }
  }, [chart.backgroundColor]);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((curr) => (curr === msg ? null : curr));
    }, 3200);
  }, []);

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (
        exportMenuRef.current &&
        !exportMenuRef.current.contains(e.target as Node)
      ) {
        setExportOpen(false);
      }
      if (
        statusMenuRef.current &&
        !statusMenuRef.current.contains(e.target as Node)
      ) {
        setStatusOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const applyChange = useCallback(
    (
      updater: (prev: FlowchartRecord) => FlowchartRecord,
      options?: { recordHistory?: boolean },
    ) => {
      setLocalChart((prev) => {
        if (options?.recordHistory !== false) {
          setPast((p) => [
            ...p.slice(-29),
            { lanes: prev.lanes, nodes: prev.nodes, edges: prev.edges },
          ]);
          setFuture([]);
        }
        const updated = updater(prev);
        const next: FlowchartRecord = {
          ...updated,
          nodeCount: updated.nodes.length,
          edgeCount: updated.edges.length,
        };
        latestRef.current = next;
        return next;
      });
      dirtyRef.current = true;
      setDirty(true);
      setSaveError(null);
    },
    [],
  );

  const handleSave = useCallback(
    async (options?: { keepalive?: boolean }) => {
      const snap = latestRef.current;
      if (readOnly || (!dirtyRef.current && !options?.keepalive)) return;

      const task = (async () => {
        setSaving(true);
        setSaveError(null);
        dirtyRef.current = false;
        try {
          const saved = await flowchartApi.update(
            snap.id,
            {
              name: snap.name,
              description: snap.description,
              tags: snap.tags,
              status: snap.status,
              archived: snap.archived,
              backgroundColor: snap.backgroundColor,
              lanes: snap.lanes,
              nodes: snap.nodes,
              edges: snap.edges,
              comments: snap.comments,
              shares: snap.shares,
            },
            { keepalive: options?.keepalive },
          );
          if (!dirtyRef.current) {
            setLocalChart((prev) => ({
              ...prev,
              updatedAt: saved.updatedAt,
              versions: saved.versions,
            }));
            onChartUpdated(saved);
            setDirty(false);
          }
        } catch (err) {
          dirtyRef.current = true;
          setDirty(true);
          const msg =
            err instanceof Error ? err.message : 'Erro ao salvar fluxograma.';
          setSaveError(msg);
          showToast(msg);
        } finally {
          setSaving(false);
          savingPromiseRef.current = null;
        }
      })();

      savingPromiseRef.current = task;
      await task;
    },
    [onChartUpdated, readOnly, showToast],
  );

  const flushPendingSave = useCallback(async () => {
    if (savingPromiseRef.current) await savingPromiseRef.current;
    if (dirtyRef.current) await handleSave();
  }, [handleSave]);

  // Auto-save contínuo (500ms)
  useEffect(() => {
    if (!dirty || readOnly) return;
    const timer = setTimeout(() => {
      void handleSave();
    }, 500);
    return () => clearTimeout(timer);
  }, [dirty, localChart, handleSave, readOnly]);

  // Flush ao fechar/ocultar aba
  useEffect(() => {
    const flush = () => {
      if (dirtyRef.current && !readOnly) {
        void handleSave({ keepalive: true });
      }
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [handleSave, readOnly]);

  const issues = useMemo(
    () => validateFlowchart(localChart.nodes, localChart.edges),
    [localChart.nodes, localChart.edges],
  );
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;

  const handleUndo = () => {
    if (past.length === 0 || readOnly) return;
    const previous = past[past.length - 1];
    setPast((p) => p.slice(0, -1));
    setFuture((f) => [
      {
        lanes: localChart.lanes,
        nodes: localChart.nodes,
        edges: localChart.edges,
      },
      ...f.slice(0, 29),
    ]);
    applyChange((prev) => ({ ...prev, ...previous }), { recordHistory: false });
  };

  const handleRedo = () => {
    if (future.length === 0 || readOnly) return;
    const next = future[0];
    setFuture((f) => f.slice(1));
    setPast((p) => [
      ...p,
      {
        lanes: localChart.lanes,
        nodes: localChart.nodes,
        edges: localChart.edges,
      },
    ]);
    applyChange((prev) => ({ ...prev, ...next }), { recordHistory: false });
  };

  const handleAddNodeFromPalette = (type: FlowchartNodeType) => {
    if (readOnly) return;
    const meta = getNodeMeta(type);
    const bounds = computeLaneBounds(localChart.lanes);
    const activeLaneId =
      selection?.kind === 'lane'
        ? selection.id
        : selection?.kind === 'node'
          ? (localChart.nodes.find((n) => n.id === selection.id)?.laneId ??
            localChart.lanes[0]?.id)
          : localChart.lanes[0]?.id;

    const targetBound =
      bounds.find((b) => b.lane.id === activeLaneId) ?? bounds[0];
    const laneNodes = localChart.nodes.filter(
      (n) => n.laneId === targetBound.lane.id,
    );
    const nextX =
      laneNodes.length > 0
        ? Math.max(...laneNodes.map((n) => n.x + n.width)) + 72
        : 92;
    const centerY = targetBound.top + targetBound.lane.height / 2;

    const created: FlowchartNode = {
      id: createId(type),
      type,
      title: meta.defaultTitle,
      laneId: targetBound.lane.id,
      x: nextX,
      y: Math.round(centerY - meta.height / 2),
      width: meta.width,
      height: meta.height,
    };

    applyChange((prev) => ({ ...prev, nodes: [...prev.nodes, created] }));
    setSelection({ kind: 'node', id: created.id });
  };

  const handleQuickAddConnected = (
    sourceId: string,
    type: FlowchartNodeType,
  ) => {
    if (readOnly) return;
    const src = localChart.nodes.find((n) => n.id === sourceId);
    if (!src) return;
    const meta = getNodeMeta(type);
    const existingOut = localChart.edges.filter((e) => e.sourceId === sourceId);

    const offsetY = existingOut.length * 110;
    const created: FlowchartNode = {
      id: createId(type),
      type,
      title: meta.defaultTitle,
      laneId: src.laneId,
      x: src.x + src.width + 78,
      y: Math.max(16, src.y + offsetY),
      width: meta.width,
      height: meta.height,
    };

    const newEdge: FlowchartEdge = {
      id: createId('edge'),
      sourceId,
      targetId: created.id,
      label:
        src.type === 'decision'
          ? existingOut.length === 0
            ? 'Sim'
            : 'Não'
          : undefined,
    };

    applyChange((prev) => ({
      ...prev,
      nodes: [...prev.nodes, created],
      edges: [...prev.edges, newEdge],
    }));
    setSelection({ kind: 'node', id: created.id });
  };

  const handleAddLane = () => {
    if (readOnly) return;
    const created: FlowchartLane = {
      id: createId('lane'),
      name: `Raia ${localChart.lanes.length + 1}`,
      height: 220,
    };
    applyChange((prev) => ({ ...prev, lanes: [...prev.lanes, created] }));
    setSelection({ kind: 'lane', id: created.id });
  };

  const handleOrganize = () => {
    if (readOnly) return;
    const organized = organizeFlowchart(
      localChart.lanes,
      localChart.nodes,
      localChart.edges,
    );
    applyChange((prev) => ({
      ...prev,
      lanes: organized.lanes,
      nodes: organized.nodes,
    }));
    setZoom(1);
    setPan({ x: 24, y: 24 });
    showToast('Fluxograma organizado automaticamente.');
  };

  const handleApplyAi = async (title: string, text: string) => {
    setAiLoading(true);
    setAiError(null);
    try {
      await flushPendingSave();
      const updated = await flowchartApi.applyAiToExisting(localChart.id, {
        title: title || undefined,
        text,
      });
      setLocalChart(updated);
      latestRef.current = updated;
      onChartUpdated(updated);
      setDirty(false);
      dirtyRef.current = false;
      setAiOpen(false);
      setSelection(null);
      setZoom(1);
      setPan({ x: 24, y: 24 });
      showToast('Fluxograma gerado com IA e salvo automaticamente!');
    } catch (err) {
      setAiError(
        err instanceof Error ? err.message : 'Erro ao gerar fluxograma com IA.',
      );
    } finally {
      setAiLoading(false);
    }
  };

  const handleExport = async (
    format: 'png' | 'pdf' | 'html' | 'json' | 'csv' | 'md',
  ) => {
    setExportOpen(false);
    let pdfWin: Window | null = null;
    try {
      if (format === 'pdf') {
        pdfWin = openPdfPreviewWindow(latestRef.current.name);
      }

      await flushPendingSave();
      const snap = latestRef.current;

      if (format === 'png') {
        await exportFlowchartPng(snap);
      } else if (format === 'pdf') {
        setAiOverlay({
          title: 'Gerando PDF do fluxograma com resumo por IA...',
          steps: [
            'Analisando raias, etapas, decisões e comentários...',
            'Redigindo resumo executivo com Gemini...',
            'Preparando layout vetorial A4...',
          ],
        });
        try {
          const summary = await flowchartApi
            .summarizeForExport(snap.id)
            .catch(() => null);
          exportFlowchartPdf(snap, summary, pdfWin);
        } finally {
          setAiOverlay(null);
        }
      } else if (format === 'html') {
        setAiOverlay({
          title: 'Gerando HTML rico com resumo por IA...',
          steps: [
            'Analisando raias, etapas, decisões e comentários...',
            'Redigindo resumo executivo sucinto com Gemini...',
            'Montando relatório interativo e redimensionável...',
          ],
        });
        try {
          const summary = await flowchartApi
            .summarizeForExport(snap.id)
            .catch(() => null);
          exportFlowchartHtml(snap, summary);
          showToast('Relatório HTML rico exportado com sucesso!');
        } finally {
          setAiOverlay(null);
        }
      } else if (format === 'json') {
        exportFlowchartJson(snap);
      } else if (format === 'csv') {
        exportFlowchartCsv(snap);
      } else {
        exportFlowchartMarkdown(snap);
      }
    } catch (err) {
      showToast(err instanceof Error ? err.message : 'Erro ao exportar.');
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Sub-toolbar de 2 linhas fiel às imagens */}
      <div className="shrink-0 border-b border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2">
        {/* Linha 1 */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={async () => {
                await flushPendingSave();
                onBackToLibrary();
              }}
              title="Voltar para Biblioteca de fluxogramas"
              className="rounded-md p-1 text-[#475569] hover:bg-[#E2E8F0]/70 hover:text-[#0F172A]"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>

            {editingTitle && !readOnly ? (
              <input
                type="text"
                autoFocus
                value={titleDraft}
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={() => {
                  const next = titleDraft.trim() || localChart.name;
                  setEditingTitle(false);
                  if (next !== localChart.name) {
                    applyChange((prev) => ({ ...prev, name: next }), {
                      recordHistory: false,
                    });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                  else if (e.key === 'Escape') {
                    setTitleDraft(localChart.name);
                    setEditingTitle(false);
                  }
                }}
                className="rounded border border-[#0B3B78] bg-white px-2 py-0.5 text-[15px] font-semibold outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (readOnly) return;
                  setTitleDraft(localChart.name);
                  setEditingTitle(true);
                }}
                className="text-[15px] font-semibold text-[#0F172A] hover:text-[#0B3B78]"
              >
                {localChart.name}
              </button>
            )}

            <span className="rounded-full bg-[#E2E8F0] px-2.5 py-0.5 text-[12px] font-medium text-[#475569]">
              {formatStatusLabel(localChart.status)}
            </span>
            <span className="rounded-full border border-[#E2E8F0] bg-white px-2.5 py-0.5 text-[12px] font-medium text-[#475569]">
              {formatRoleLabel(localChart.accessLevel)}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={handleUndo}
              disabled={past.length === 0 || readOnly}
              title="Desfazer"
              className="rounded-md p-1.5 text-[#475569] hover:bg-[#E2E8F0]/70 disabled:opacity-35"
            >
              <Undo2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={handleRedo}
              disabled={future.length === 0 || readOnly}
              title="Refazer"
              className="rounded-md p-1.5 text-[#475569] hover:bg-[#E2E8F0]/70 disabled:opacity-35"
            >
              <Redo2 className="h-4 w-4" />
            </button>

            <span className="mx-1 h-4 w-px bg-[#CBD5E1]" />

            <button
              type="button"
              onClick={() =>
                setZoom((z) => Math.max(0.4, Number((z - 0.1).toFixed(2))))
              }
              title="Diminuir zoom"
              className="rounded-md p-1.5 text-[#475569] hover:bg-[#E2E8F0]/70"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() =>
                setZoom((z) => Math.min(2, Number((z + 0.1).toFixed(2))))
              }
              title="Aumentar zoom"
              className="rounded-md p-1.5 text-[#475569] hover:bg-[#E2E8F0]/70"
            >
              <ZoomIn className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                setZoom(1);
                setPan({ x: 24, y: 24 });
              }}
              title="Ajustar visualização"
              className="rounded-md p-1.5 text-[#475569] hover:bg-[#E2E8F0]/70"
            >
              <Maximize2 className="h-4 w-4" />
            </button>

            <button
              type="button"
              disabled={readOnly}
              onClick={handleOrganize}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-2.5 text-[12.5px] font-medium text-[#334155] hover:bg-[#F1F5F9] disabled:opacity-45"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              Organizar
            </button>

            <button
              type="button"
              disabled={readOnly}
              onClick={handleAddLane}
              className="inline-flex h-8 items-center gap-1 rounded-lg border border-[#CBD5E1] bg-white px-2.5 text-[12.5px] font-medium text-[#334155] hover:bg-[#F1F5F9] disabled:opacity-45"
            >
              <Plus className="h-3.5 w-3.5" />
              Raia
            </button>

            {saveError ? (
              <button
                type="button"
                onClick={() => void handleSave()}
                className="inline-flex h-8 items-center rounded-lg border border-red-200 bg-red-50 px-2.5 text-[12px] font-medium text-red-700"
              >
                Erro ao salvar — tentar novamente
              </button>
            ) : (
              <span
                className={[
                  'inline-flex h-8 items-center gap-1 rounded-lg px-2.5 text-[12.5px] font-medium',
                  saving || dirty
                    ? 'bg-amber-50 text-amber-700'
                    : 'bg-[#E6F4EA] text-[#1E7E34]',
                ].join(' ')}
              >
                <Check className="h-3.5 w-3.5" />
                {saving || dirty ? 'Salvando...' : 'Salvo automaticamente'}
              </span>
            )}

            <button
              type="button"
              onClick={() => {
                setSideOpen(true);
                setSideTab('validation');
              }}
              title="Erros / Avisos de validação"
              className={[
                'inline-flex h-8 items-center gap-1 rounded-lg border px-2.5 text-[12.5px] font-medium',
                errorCount > 0
                  ? 'border-red-200 bg-red-50 text-red-700'
                  : warningCount > 0
                    ? 'border-amber-200 bg-amber-50 text-amber-700'
                    : 'border-[#CBD5E1] bg-white text-[#475569]',
              ].join(' ')}
            >
              <AlertTriangle className="h-3.5 w-3.5" />
              {errorCount} / {warningCount}
            </button>
          </div>
        </div>

        {/* Linha 2: IA | Compartilhar | Importar | Exportar | Estado | Conectar | Painel */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          {/* Botão IA (conforme solicitado: "deve se chamar IA e entender texto corrido") */}
          <button
            type="button"
            disabled={readOnly}
            onClick={() => {
              setAiError(null);
              setAiOpen(true);
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#BFDBFE] bg-[#EFF6FF] px-3 text-[13px] font-semibold text-[#0B3B78] transition-colors hover:border-[#0B3B78] hover:bg-[#DBEAFE] disabled:opacity-45"
          >
            <Sparkles className="h-3.5 w-3.5" />
            IA
          </button>

          <button
            type="button"
            disabled={localChart.accessLevel !== 'owner'}
            onClick={() => setShareOpen(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-3 text-[13px] font-medium text-[#334155] hover:bg-[#F1F5F9] disabled:opacity-45"
          >
            <Share2 className="h-3.5 w-3.5" />
            Compartilhar
          </button>

          <button
            type="button"
            disabled={readOnly}
            onClick={() => setImportOpen(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-3 text-[13px] font-medium text-[#334155] hover:bg-[#F1F5F9] disabled:opacity-45"
          >
            <Upload className="h-3.5 w-3.5" />
            Importar
          </button>

          {/* Dropdown Exportar */}
          <div className="relative" ref={exportMenuRef}>
            <button
              type="button"
              onClick={() => setExportOpen((v) => !v)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-3 text-[13px] font-medium text-[#334155] hover:bg-[#F1F5F9]"
            >
              <Download className="h-3.5 w-3.5" />
              Exportar
            </button>
            {exportOpen && (
              <div className="absolute left-0 top-10 z-30 w-52 overflow-hidden rounded-xl border border-[#E2E8F0] bg-white py-1.5 shadow-xl">
                <button
                  type="button"
                  onClick={() => void handleExport('png')}
                  className="block w-full px-4 py-2 text-left text-[13.5px] text-[#0F172A] hover:bg-[#F1F5F9]"
                >
                  Imagem PNG
                </button>
                <button
                  type="button"
                  onClick={() => void handleExport('pdf')}
                  className="block w-full px-4 py-2 text-left text-[13.5px] text-[#0F172A] hover:bg-[#F1F5F9]"
                >
                  Documento PDF
                </button>
                <button
                  type="button"
                  onClick={() => void handleExport('html')}
                  className="block w-full px-4 py-2 text-left text-[13.5px] text-[#0F172A] hover:bg-[#F1F5F9]"
                >
                  Página HTML
                </button>
                <button
                  type="button"
                  onClick={() => void handleExport('json')}
                  className="block w-full px-4 py-2 text-left text-[13.5px] text-[#0F172A] hover:bg-[#F1F5F9]"
                >
                  JSON (.json)
                </button>
                <button
                  type="button"
                  onClick={() => void handleExport('csv')}
                  className="block w-full px-4 py-2 text-left text-[13.5px] text-[#0F172A] hover:bg-[#F1F5F9]"
                >
                  Planilha CSV
                </button>
                <button
                  type="button"
                  onClick={() => void handleExport('md')}
                  className="block w-full px-4 py-2 text-left text-[13.5px] text-[#0F172A] hover:bg-[#F1F5F9]"
                >
                  Markdown (.md)
                </button>
              </div>
            )}
          </div>

          {/* Dropdown Estado */}
          <div className="relative" ref={statusMenuRef}>
            <button
              type="button"
              disabled={readOnly}
              onClick={() => setStatusOpen((v) => !v)}
              className="inline-flex h-8 items-center rounded-lg border border-[#CBD5E1] bg-white px-3 text-[13px] font-medium text-[#334155] hover:bg-[#F1F5F9] disabled:opacity-45"
            >
              Estado
            </button>
            {statusOpen && (
              <div className="absolute left-0 top-10 z-30 w-44 overflow-hidden rounded-xl border border-[#E2E8F0] bg-white py-1.5 shadow-xl">
                {(['draft', 'review', 'published'] as FlowchartStatus[]).map(
                  (st) => (
                    <button
                      key={st}
                      type="button"
                      onClick={() => {
                        setStatusOpen(false);
                        applyChange((prev) => ({ ...prev, status: st }), {
                          recordHistory: false,
                        });
                      }}
                      className={[
                        'block w-full px-4 py-2 text-left text-[13.5px] hover:bg-[#F1F5F9]',
                        localChart.status === st
                          ? 'font-semibold text-[#0B3B78]'
                          : 'text-[#0F172A]',
                      ].join(' ')}
                    >
                      {formatStatusLabel(st)}
                    </button>
                  ),
                )}
              </div>
            )}
          </div>

          <button
            type="button"
            disabled={readOnly}
            onClick={() => {
              setConnectMode((v) => !v);
              setConnectSourceId(null);
            }}
            title="Modo conectar elementos"
            className={[
              'inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors',
              connectMode
                ? 'border-[#0B3B78] bg-[#0B3B78] text-white'
                : 'border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F1F5F9]',
            ].join(' ')}
          >
            <GitCommitHorizontal className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={() => setSideOpen((v) => !v)}
            title="Alternar painel lateral"
            className={[
              'inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors',
              sideOpen
                ? 'border-[#0B3B78] bg-[#EFF6FF] text-[#0B3B78]'
                : 'border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F1F5F9]',
            ].join(' ')}
          >
            <PanelRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Canvas + Painel Lateral */}
      <div className="relative flex min-h-0 flex-1">
        <FlowchartCanvas
          lanes={localChart.lanes}
          nodes={localChart.nodes}
          edges={localChart.edges}
          backgroundColor={localChart.backgroundColor}
          zoom={zoom}
          pan={pan}
          connectMode={connectMode}
          connectSourceId={connectSourceId}
          selection={selection}
          readOnly={readOnly}
          onPanChange={setPan}
          onZoomChange={setZoom}
          onSelect={setSelection}
          onAddNodeFromPalette={handleAddNodeFromPalette}
          onQuickAddConnected={handleQuickAddConnected}
          onMoveNode={(nodeId, x, y, laneId) => {
            applyChange(
              (prev) => ({
                ...prev,
                nodes: prev.nodes.map((n) =>
                  n.id === nodeId ? { ...n, x, y, laneId } : n,
                ),
              }),
              { recordHistory: false },
            );
          }}
          onStartConnectFrom={(nodeId) => {
            setConnectMode(true);
            setConnectSourceId(nodeId);
          }}
          onCompleteConnectTo={(targetId) => {
            if (!connectSourceId || connectSourceId === targetId) return;
            const exists = localChart.edges.some(
              (e) =>
                e.sourceId === connectSourceId && e.targetId === targetId,
            );
            if (!exists) {
              const src = localChart.nodes.find((n) => n.id === connectSourceId);
              const existingOut = localChart.edges.filter(
                (e) => e.sourceId === connectSourceId,
              );
              const edge: FlowchartEdge = {
                id: createId('edge'),
                sourceId: connectSourceId,
                targetId,
                label:
                  src?.type === 'decision'
                    ? existingOut.length === 0
                      ? 'Sim'
                      : 'Não'
                    : undefined,
              };
              applyChange((prev) => ({
                ...prev,
                edges: [...prev.edges, edge],
              }));
              setSelection({ kind: 'edge', id: edge.id });
            }
            setConnectMode(false);
            setConnectSourceId(null);
          }}
          onCommitInlineTitle={(nodeId, title) => {
            applyChange((prev) => ({
              ...prev,
              nodes: prev.nodes.map((n) =>
                n.id === nodeId ? { ...n, title } : n,
              ),
            }));
          }}
          onDeleteNode={(nodeId) => {
            applyChange((prev) => ({
              ...prev,
              nodes: prev.nodes.filter((n) => n.id !== nodeId),
              edges: prev.edges.filter(
                (e) => e.sourceId !== nodeId && e.targetId !== nodeId,
              ),
            }));
            setSelection(null);
          }}
        />

        <SidePanel
          open={sideOpen}
          onToggleOpen={() => setSideOpen((v) => !v)}
          activeTab={sideTab}
          onTabChange={setSideTab}
          chart={localChart}
          selection={selection}
          issues={issues}
          readOnly={readOnly}
          onSelect={setSelection}
          onUpdateChartMeta={(patch) =>
            applyChange((prev) => ({ ...prev, ...patch }), {
              recordHistory: false,
            })
          }
          onUpdateNode={(id, patch) =>
            applyChange((prev) => ({
              ...prev,
              nodes: prev.nodes.map((n) =>
                n.id === id ? { ...n, ...patch } : n,
              ),
            }))
          }
          onDeleteNode={(id) => {
            applyChange((prev) => ({
              ...prev,
              nodes: prev.nodes.filter((n) => n.id !== id),
              edges: prev.edges.filter(
                (e) => e.sourceId !== id && e.targetId !== id,
              ),
            }));
            setSelection(null);
          }}
          onUpdateEdge={(id, patch) =>
            applyChange((prev) => ({
              ...prev,
              edges: prev.edges.map((e) =>
                e.id === id ? { ...e, ...patch } : e,
              ),
            }))
          }
          onDeleteEdge={(id) => {
            applyChange((prev) => ({
              ...prev,
              edges: prev.edges.filter((e) => e.id !== id),
            }));
            setSelection(null);
          }}
          onUpdateLane={(id, patch) =>
            applyChange((prev) => ({
              ...prev,
              lanes: prev.lanes.map((l) =>
                l.id === id ? { ...l, ...patch } : l,
              ),
            }))
          }
          onDeleteLane={(id) => {
            if (localChart.lanes.length <= 1) return;
            const remaining = localChart.lanes.filter((l) => l.id !== id);
            const fallbackLaneId = remaining[0].id;
            applyChange((prev) => ({
              ...prev,
              lanes: remaining,
              nodes: prev.nodes.map((n) =>
                n.laneId === id ? { ...n, laneId: fallbackLaneId } : n,
              ),
            }));
            setSelection(null);
          }}
          onAddComment={(text, nodeId) => {
            applyChange(
              (prev) => ({
                ...prev,
                comments: [
                  {
                    id: createId('cmt'),
                    author: userName,
                    text,
                    nodeId,
                    createdAt: new Date().toISOString(),
                  },
                  ...prev.comments,
                ],
              }),
              { recordHistory: false },
            );
          }}
          onDeleteComment={(commentId) => {
            applyChange(
              (prev) => ({
                ...prev,
                comments: prev.comments.filter((c) => c.id !== commentId),
              }),
              { recordHistory: false },
            );
          }}
          onCreateVersion={async (label) => {
            try {
              await flushPendingSave();
              const updated = await flowchartApi.createVersion(
                localChart.id,
                label || undefined,
              );
              setLocalChart(updated);
              latestRef.current = updated;
              onChartUpdated(updated);
              showToast('Snapshot de versão salvo!');
            } catch (err) {
              showToast(
                err instanceof Error ? err.message : 'Erro ao salvar versão.',
              );
            }
          }}
          onRestoreVersion={async (versionId) => {
            try {
              const restored = await flowchartApi.restoreVersion(
                localChart.id,
                versionId,
              );
              setLocalChart(restored);
              latestRef.current = restored;
              onChartUpdated(restored);
              setDirty(false);
              dirtyRef.current = false;
              showToast('Versão restaurada com sucesso!');
            } catch (err) {
              showToast(
                err instanceof Error
                  ? err.message
                  : 'Erro ao restaurar versão.',
              );
            }
          }}
        />

        {toast && (
          <div className="fixed bottom-5 left-1/2 z-40 -translate-x-1/2 rounded-lg bg-[#0F172A] px-4 py-2.5 text-[13px] font-medium text-white shadow-lg">
            {toast}
          </div>
        )}
      </div>

      {/* Modais */}
      {aiOpen && (
        <AiFlowchartModal
          mode="replace"
          initialTitle={localChart.name}
          loading={aiLoading}
          error={aiError}
          onSubmit={(title, text) => void handleApplyAi(title, text)}
          onClose={() => setAiOpen(false)}
        />
      )}

      {shareOpen && (
        <ShareModal
          chartId={localChart.id}
          shares={localChart.shares}
          onAddShare={(target, permission) => {
            applyChange(
              (prev) => ({
                ...prev,
                shares: [
                  ...prev.shares,
                  {
                    id: createId('shr'),
                    target,
                    permission,
                    createdAt: new Date().toISOString(),
                  },
                ],
              }),
              { recordHistory: false },
            );
          }}
          onRemoveShare={(id) => {
            applyChange(
              (prev) => ({
                ...prev,
                shares: prev.shares.filter((s) => s.id !== id),
              }),
              { recordHistory: false },
            );
          }}
          onClose={() => setShareOpen(false)}
        />
      )}

      {importOpen && (
        <ImportJsonModal
          onImport={(raw) => {
            const parsed = JSON.parse(raw) as Partial<FlowchartRecord>;
            applyChange((prev) => ({
              ...prev,
              name: parsed.name?.trim() || prev.name,
              description: parsed.description ?? prev.description,
              lanes:
                Array.isArray(parsed.lanes) && parsed.lanes.length > 0
                  ? parsed.lanes
                  : prev.lanes,
              nodes: Array.isArray(parsed.nodes) ? parsed.nodes : prev.nodes,
              edges: Array.isArray(parsed.edges) ? parsed.edges : prev.edges,
            }));
            setImportOpen(false);
            showToast('Fluxograma importado e salvo automaticamente.');
          }}
          onClose={() => setImportOpen(false)}
        />
      )}

      {aiOverlay && (
        <AiProcessingOverlay title={aiOverlay.title} steps={aiOverlay.steps} />
      )}
    </div>
  );
}
