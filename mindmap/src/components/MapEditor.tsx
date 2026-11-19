import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Check,
  Download,
  FileCode2,
  Maximize2,
  MessageSquare,
  MoreHorizontal,
  PanelRight,
  Sparkles,
  Users,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { MindMapNode, MindMapRecord } from '../types/mindmap';
import { mindMapApi } from '../lib/api';
import {
  addChildNode,
  addSiblingNode,
  countCompleted,
  countNodes,
  createId,
  deleteNode,
  findNode,
  getAdjacentNodeId,
  markdownToTree,
  setAllCollapsed,
  treeToMarkdown,
  updateNode,
} from '../lib/tree';
import {
  exportAsCsv,
  exportAsHtml,
  exportAsMarkdown,
  exportAsPdf,
  exportAsPng,
  openPdfPreviewWindow,
} from '../lib/exporters';
import { MindMapCanvas } from './MindMapCanvas';
import { SidePanel, SidePanelTab } from './SidePanel';
import {
  ExecutorsModal,
  ExplainAiModal,
  MarkdownModal,
  ShareModal,
} from './Modals';
import { AiProcessingOverlay } from './AiProcessingOverlay';

interface MapEditorProps {
  map: MindMapRecord;
  onMapUpdated: (updated: MindMapRecord) => void;
  onBackToLibrary: () => void;
  onDuplicate: (id: string) => void;
  onDeleteMap: (id: string, name: string) => void;
  userName?: string;
}

export function MapEditor({
  map,
  onMapUpdated,
  onBackToLibrary,
  onDuplicate,
  onDeleteMap,
  userName = 'Jacintho, Nilton',
}: MapEditorProps) {
  const [localMap, setLocalMap] = useState<MindMapRecord>(map);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [aiOverlay, setAiOverlay] = useState<{
    title: string;
    steps: string[];
  } | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const latestMapRef = useRef<MindMapRecord>(map);
  const dirtyRef = useRef(false);
  const savingPromiseRef = useRef<Promise<void> | null>(null);

  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(map.name);

  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 24, y: 24 });

  const [sidePanelOpen, setSidePanelOpen] = useState(true);
  const [sideTab, setSideTab] = useState<SidePanelTab>('item');

  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [executorsOpen, setExecutorsOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [markdownOpen, setMarkdownOpen] = useState(false);

  const [explainOpen, setExplainOpen] = useState(false);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explainText, setExplainText] = useState<string | null>(null);
  const [explainModel, setExplainModel] = useState<string | null>(null);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [expandingAi, setExpandingAi] = useState(false);

  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setLocalMap(map);
    latestMapRef.current = map;
    setTitleDraft(map.name);
    setDirty(false);
    dirtyRef.current = false;
    setSaveError(null);
  }, [map.id]);

  // Sincroniza cor de fundo vinda do TopBar e salva automaticamente
  useEffect(() => {
    if (map.backgroundColor !== latestMapRef.current.backgroundColor) {
      setLocalMap((prev) => {
        const next = { ...prev, backgroundColor: map.backgroundColor };
        latestMapRef.current = next;
        return next;
      });
    }
  }, [map.backgroundColor]);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => {
      setToast((current) => (current === message ? null : current));
    }, 3000);
  }, []);

  // Fecha dropdowns ao clicar fora
  useEffect(() => {
    const onDocMouseDown = (event: MouseEvent) => {
      if (
        exportMenuRef.current &&
        !exportMenuRef.current.contains(event.target as Node)
      ) {
        setExportMenuOpen(false);
      }
      if (
        moreMenuRef.current &&
        !moreMenuRef.current.contains(event.target as Node)
      ) {
        setMoreMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', onDocMouseDown);
    return () => document.removeEventListener('mousedown', onDocMouseDown);
  }, []);

  const applyLocalChange = useCallback(
    (updater: (prev: MindMapRecord) => MindMapRecord) => {
      setLocalMap((prev) => {
        const updated = updater(prev);
        const next: MindMapRecord = {
          ...updated,
          itemCount: countNodes(updated.root),
          completedCount: countCompleted(updated.root),
        };
        latestMapRef.current = next;
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
      const snapshot = latestMapRef.current;
      if (!dirtyRef.current && !options?.keepalive) return;

      const task = (async () => {
        setSaving(true);
        setSaveError(null);
        dirtyRef.current = false;
        try {
          const saved = await mindMapApi.update(
            snapshot.id,
            {
              name: snapshot.name,
              backgroundColor: snapshot.backgroundColor,
              root: snapshot.root,
              executors: snapshot.executors,
              shares: snapshot.shares,
            },
            { keepalive: options?.keepalive },
          );
          if (!dirtyRef.current) {
            setLocalMap((prev) => ({
              ...prev,
              updatedAt: saved.updatedAt,
              itemCount: saved.itemCount,
              completedCount: saved.completedCount,
            }));
            onMapUpdated(saved);
            setDirty(false);
          }
        } catch (error) {
          dirtyRef.current = true;
          setDirty(true);
          const msg =
            error instanceof Error ? error.message : 'Erro ao salvar mapa.';
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
    [onMapUpdated, showToast],
  );

  const flushPendingSave = useCallback(async () => {
    if (savingPromiseRef.current) {
      await savingPromiseRef.current;
    }
    if (dirtyRef.current) {
      await handleSave();
    }
  }, [handleSave]);

  // Salvamento automático rápido (500ms após qualquer edição)
  useEffect(() => {
    if (!dirty) return;
    const timer = setTimeout(() => {
      void handleSave();
    }, 500);
    return () => clearTimeout(timer);
  }, [dirty, localMap, handleSave]);

  // Flush automático ao sair/ocultar aba para nunca perder edições
  useEffect(() => {
    const flushOnExit = () => {
      if (dirtyRef.current) {
        void handleSave({ keepalive: true });
      }
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flushOnExit();
    };
    window.addEventListener('pagehide', flushOnExit);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('pagehide', flushOnExit);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [handleSave]);

  const selectedNode = selectedNodeId
    ? findNode(localMap.root, selectedNodeId)
    : null;

  const handleAddChild = useCallback(
    (parentId?: string) => {
      const targetId = parentId ?? selectedNodeId ?? localMap.root.id;
      const result = addChildNode(localMap.root, targetId, 'Novo item');
      applyLocalChange((prev) => ({ ...prev, root: result.root }));
      setSelectedNodeId(result.created.id);
      setEditingNodeId(result.created.id);
    },
    [applyLocalChange, localMap.root, selectedNodeId],
  );

  const handleAddSibling = useCallback(() => {
    if (!selectedNodeId || selectedNodeId === localMap.root.id) return;
    const result = addSiblingNode(localMap.root, selectedNodeId, 'Novo item');
    applyLocalChange((prev) => ({ ...prev, root: result.root }));
    setSelectedNodeId(result.created.id);
    setEditingNodeId(result.created.id);
  }, [applyLocalChange, localMap.root, selectedNodeId]);

  const handleDeleteSelected = useCallback(() => {
    if (!selectedNodeId || selectedNodeId === localMap.root.id) return;
    const result = deleteNode(localMap.root, selectedNodeId);
    applyLocalChange((prev) => ({ ...prev, root: result.root }));
    setSelectedNodeId(result.fallbackId);
    setEditingNodeId(null);
  }, [applyLocalChange, localMap.root, selectedNodeId]);

  // Atalhos de teclado (fiéis ao painel Atalhos das imagens)
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const isInputFocused =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        void handleSave();
        return;
      }

      if (
        isInputFocused ||
        editingNodeId ||
        executorsOpen ||
        shareOpen ||
        markdownOpen ||
        explainOpen
      ) {
        return;
      }

      if (event.key === 'Insert' || event.key === 'Tab') {
        event.preventDefault();
        handleAddChild();
        return;
      }

      if (event.key === 'Enter' && selectedNodeId) {
        event.preventDefault();
        if (selectedNodeId === localMap.root.id) {
          handleAddChild(localMap.root.id);
        } else {
          handleAddSibling();
        }
        return;
      }

      if (
        (event.key === 'Delete' || event.key === 'Backspace') &&
        selectedNodeId &&
        selectedNodeId !== localMap.root.id
      ) {
        event.preventDefault();
        handleDeleteSelected();
        return;
      }

      if (event.key === 'F6') {
        event.preventDefault();
        setSidePanelOpen(true);
        setSideTab('item');
        return;
      }

      if (event.altKey && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        setSidePanelOpen(true);
        setSideTab('comments');
        return;
      }

      if (
        event.key === 'ArrowUp' ||
        event.key === 'ArrowDown' ||
        event.key === 'ArrowLeft' ||
        event.key === 'ArrowRight'
      ) {
        event.preventDefault();
        if (!selectedNodeId) {
          setSelectedNodeId(localMap.root.id);
          return;
        }
        const nextId = getAdjacentNodeId(
          localMap.root,
          selectedNodeId,
          event.key,
        );
        if (nextId) setSelectedNodeId(nextId);
        return;
      }

      // Digitar diretamente com nó selecionado inicia edição
      if (
        selectedNodeId &&
        event.key.length === 1 &&
        !event.ctrlKey &&
        !event.metaKey &&
        !event.altKey
      ) {
        setEditingNodeId(selectedNodeId);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    editingNodeId,
    executorsOpen,
    explainOpen,
    handleAddChild,
    handleAddSibling,
    handleDeleteSelected,
    handleSave,
    localMap.root,
    markdownOpen,
    selectedNodeId,
    shareOpen,
  ]);

  const handleExplainWithAi = async () => {
    setExplainOpen(true);
    setExplainLoading(true);
    setExplainError(null);
    try {
      await flushPendingSave();
      const res = await mindMapApi.explainWithAi(localMap.id);
      setExplainText(res.explanation);
      setExplainModel(res.model);
    } catch (error) {
      setExplainError(
        error instanceof Error
          ? error.message
          : 'Erro ao gerar explicação com IA.',
      );
    } finally {
      setExplainLoading(false);
    }
  };

  const handleExpandNodeWithAi = async () => {
    if (!selectedNodeId) return;
    setExpandingAi(true);
    setAiOverlay({
      title: 'Expandindo sub-itens com Gemini...',
      steps: [
        'Lendo o contexto do nó selecionado e do mapa...',
        'Gerando sugestões práticas de sub-itens...',
        'Adicionando novos itens à hierarquia...',
      ],
    });
    try {
      await flushPendingSave();
      const res = await mindMapApi.expandNodeWithAi(localMap.id, {
        nodeId: selectedNodeId,
      });
      if (res.children.length === 0) {
        showToast('Nenhum sub-item sugerido pela IA.');
        return;
      }
      applyLocalChange((prev) => ({
        ...prev,
        root: updateNode(prev.root, selectedNodeId, (node) => ({
          ...node,
          collapsed: false,
          children: [...node.children, ...res.children],
        })),
      }));
      showToast(`${res.children.length} sub-itens adicionados com IA.`);
    } catch (error) {
      showToast(
        error instanceof Error
          ? error.message
          : 'Erro ao expandir item com IA.',
      );
    } finally {
      setExpandingAi(false);
      setAiOverlay(null);
    }
  };

  const handleExport = async (format: 'png' | 'pdf' | 'html' | 'csv' | 'md') => {
    setExportMenuOpen(false);
    let previewWin: Window | null = null;
    try {
      // Para PDF, abre a janela sincronamente no gesto do usuário (evita bloqueio de pop-up)
      if (format === 'pdf') {
        previewWin = openPdfPreviewWindow(latestMapRef.current.name);
      }

      await flushPendingSave();
      const currentSnapshot = latestMapRef.current;

      if (format === 'png') {
        await exportAsPng(currentSnapshot);
      } else if (format === 'pdf') {
        setAiOverlay({
          title: 'Gerando relatório PDF com resumo por IA...',
          steps: [
            'Analisando nós, notas e comentários com Gemini...',
            'Preparando resumo executivo e destaques...',
            'Montando layout colorido do documento PDF...',
          ],
        });
        try {
          const aiSummary = await mindMapApi
            .summarizeForExport(currentSnapshot.id)
            .catch(() => null);
          exportAsPdf(currentSnapshot, aiSummary, previewWin);
          showToast(
            aiSummary?.generatedByAi
              ? 'PDF pronto com resumo gerado por IA!'
              : 'PDF pronto para impressão/salvamento!',
          );
        } finally {
          setAiOverlay(null);
        }
      } else if (format === 'html') {
        setAiOverlay({
          title: 'Gerando página HTML rica com resumo por IA...',
          steps: [
            'Analisando nós, notas e comentários com Gemini...',
            'Preparando resumo executivo sucinto...',
            'Montando mapa interativo, detalhes e comentários...',
          ],
        });
        try {
          const aiSummary = await mindMapApi
            .summarizeForExport(currentSnapshot.id)
            .catch(() => null);
          exportAsHtml(currentSnapshot, aiSummary);
          showToast(
            aiSummary?.generatedByAi
              ? 'HTML rico exportado com resumo gerado por IA!'
              : 'HTML rico exportado com sucesso!',
          );
        } finally {
          setAiOverlay(null);
        }
      } else if (format === 'csv') {
        exportAsCsv(currentSnapshot);
      } else {
        exportAsMarkdown(currentSnapshot);
      }
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Erro ao exportar mapa.',
      );
    }
  };

  const handleBackClick = async () => {
    await flushPendingSave();
    onBackToLibrary();
  };

  const handleFitView = () => {
    setZoom(1);
    setPan({ x: 24, y: 24 });
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Sub-toolbar de 2 linhas (fiel às imagens) */}
      <div className="shrink-0 border-b border-[#E2E8F0] bg-[#F8FAFC] px-4 py-2.5">
        {/* Linha 1: Voltar + Nome + contagem | Zoom + Autosave + Explicar com IA */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => void handleBackClick()}
              title="Voltar para Biblioteca de mapas"
              className="rounded-md p-1 text-[#475569] transition-colors hover:bg-[#E2E8F0]/70 hover:text-[#0F172A]"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>

            {editingTitle ? (
              <input
                type="text"
                value={titleDraft}
                autoFocus
                onChange={(e) => setTitleDraft(e.target.value)}
                onBlur={() => {
                  const next = titleDraft.trim() || localMap.name;
                  setEditingTitle(false);
                  if (next !== localMap.name) {
                    applyLocalChange((prev) => ({
                      ...prev,
                      name: next,
                      root: { ...prev.root, text: next },
                    }));
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    (e.target as HTMLInputElement).blur();
                  } else if (e.key === 'Escape') {
                    setTitleDraft(localMap.name);
                    setEditingTitle(false);
                  }
                }}
                className="rounded border border-[#0B3B78] bg-white px-2 py-0.5 text-[15px] font-semibold text-[#0F172A] outline-none"
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setTitleDraft(localMap.name);
                  setEditingTitle(true);
                }}
                title="Clique para renomear o mapa"
                className="text-[15px] font-semibold text-[#0F172A] hover:text-[#0B3B78]"
              >
                {localMap.name}
              </button>
            )}

            <span className="rounded-full bg-[#E2E8F0] px-2.5 py-0.5 text-[12px] font-medium text-[#475569]">
              {localMap.itemCount} {localMap.itemCount === 1 ? 'item' : 'itens'}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Controles de zoom */}
            <div className="flex items-center gap-1 text-[#475569]">
              <button
                type="button"
                onClick={() =>
                  setZoom((z) => Math.max(0.4, Number((z - 0.1).toFixed(2))))
                }
                title="Diminuir zoom"
                className="rounded p-1.5 hover:bg-[#E2E8F0]/70 hover:text-[#0F172A]"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="min-w-[44px] text-center text-[12.5px] font-medium text-[#334155]">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() =>
                  setZoom((z) => Math.min(2, Number((z + 0.1).toFixed(2))))
                }
                title="Aumentar zoom"
                className="rounded p-1.5 hover:bg-[#E2E8F0]/70 hover:text-[#0F172A]"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={handleFitView}
                title="Centralizar e ajustar (100%)"
                className="rounded p-1.5 hover:bg-[#E2E8F0]/70 hover:text-[#0F172A]"
              >
                <Maximize2 className="h-4 w-4" />
              </button>
            </div>

            {saveError ? (
              <button
                type="button"
                onClick={() => void handleSave()}
                title={saveError}
                className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-[12.5px] font-medium text-red-700 hover:bg-red-100"
              >
                Erro ao salvar — tentar novamente
              </button>
            ) : (
              <span
                className={[
                  'inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-[12.5px] font-medium',
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
              onClick={() => void handleExplainWithAi()}
              disabled={Boolean(aiOverlay)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-3 text-[13px] font-medium text-[#0F172A] transition-colors hover:border-[#0B3B78] hover:bg-[#EFF6FF] hover:text-[#0B3B78] disabled:opacity-50"
            >
              <Sparkles className="h-3.5 w-3.5" />
              Explicar com IA
            </button>
          </div>
        </div>

        {/* Linha 2: Compartilhar | Comentários | Executores | Markdown | Exportar | ... | Painel */}
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setShareOpen(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#0B2A5B] px-3 text-[13px] font-semibold text-white transition-colors hover:bg-[#0B3B78]"
          >
            <Users className="h-3.5 w-3.5" />
            Compartilhar
          </button>

          <button
            type="button"
            onClick={() => {
              setSidePanelOpen(true);
              setSideTab('comments');
            }}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-3 text-[13px] font-medium text-[#334155] transition-colors hover:bg-[#F1F5F9]"
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Comentários
          </button>

          <button
            type="button"
            onClick={() => setExecutorsOpen(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-3 text-[13px] font-medium text-[#334155] transition-colors hover:bg-[#F1F5F9]"
          >
            <Users className="h-3.5 w-3.5" />
            Executores
          </button>

          <button
            type="button"
            onClick={() => setMarkdownOpen(true)}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-3 text-[13px] font-medium text-[#334155] transition-colors hover:bg-[#F1F5F9]"
          >
            <FileCode2 className="h-3.5 w-3.5" />
            Markdown
          </button>

          {/* Dropdown Exportar (exatamente as 5 opções da imagem!) */}
          <div className="relative" ref={exportMenuRef}>
            <button
              type="button"
              onClick={() => setExportMenuOpen((v) => !v)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-3 text-[13px] font-medium text-[#334155] transition-colors hover:bg-[#F1F5F9]"
            >
              <Download className="h-3.5 w-3.5" />
              Exportar
            </button>

            {exportMenuOpen && (
              <div className="absolute left-0 top-10 z-30 w-52 overflow-hidden rounded-xl border border-[#E2E8F0] bg-white py-1.5 shadow-xl">
                <button
                  type="button"
                  onClick={() => void handleExport('png')}
                  className="block w-full px-4 py-2.5 text-left text-[14px] text-[#0F172A] transition-colors hover:bg-[#F1F5F9]"
                >
                  Imagem PNG
                </button>
                <button
                  type="button"
                  onClick={() => void handleExport('pdf')}
                  className="block w-full px-4 py-2.5 text-left text-[14px] text-[#0F172A] transition-colors hover:bg-[#F1F5F9]"
                >
                  Documento PDF
                </button>
                <button
                  type="button"
                  onClick={() => void handleExport('html')}
                  className="block w-full px-4 py-2.5 text-left text-[14px] text-[#0F172A] transition-colors hover:bg-[#F1F5F9]"
                >
                  Página HTML
                </button>
                <button
                  type="button"
                  onClick={() => void handleExport('csv')}
                  className="block w-full px-4 py-2.5 text-left text-[14px] text-[#0F172A] transition-colors hover:bg-[#F1F5F9]"
                >
                  Planilha CSV
                </button>
                <button
                  type="button"
                  onClick={() => void handleExport('md')}
                  className="block w-full px-4 py-2.5 text-left text-[14px] text-[#0F172A] transition-colors hover:bg-[#F1F5F9]"
                >
                  Markdown (.md)
                </button>
              </div>
            )}
          </div>

          {/* Menu ... */}
          <div className="relative" ref={moreMenuRef}>
            <button
              type="button"
              onClick={() => setMoreMenuOpen((v) => !v)}
              title="Mais ações"
              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-[#CBD5E1] bg-white text-[#334155] transition-colors hover:bg-[#F1F5F9]"
            >
              <MoreHorizontal className="h-4 w-4" />
            </button>

            {moreMenuOpen && (
              <div className="absolute left-0 top-10 z-30 w-48 overflow-hidden rounded-xl border border-[#E2E8F0] bg-white py-1.5 shadow-xl">
                <button
                  type="button"
                  onClick={() => {
                    setMoreMenuOpen(false);
                    applyLocalChange((prev) => ({
                      ...prev,
                      root: setAllCollapsed(prev.root, false),
                    }));
                  }}
                  className="block w-full px-4 py-2 text-left text-[13.5px] text-[#0F172A] hover:bg-[#F1F5F9]"
                >
                  Expandir tudo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMoreMenuOpen(false);
                    applyLocalChange((prev) => ({
                      ...prev,
                      root: setAllCollapsed(prev.root, true),
                    }));
                  }}
                  className="block w-full px-4 py-2 text-left text-[13.5px] text-[#0F172A] hover:bg-[#F1F5F9]"
                >
                  Recolher tudo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMoreMenuOpen(false);
                    onDuplicate(localMap.id);
                  }}
                  className="block w-full px-4 py-2 text-left text-[13.5px] text-[#0F172A] hover:bg-[#F1F5F9]"
                >
                  Duplicar mapa
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMoreMenuOpen(false);
                    onDeleteMap(localMap.id, localMap.name);
                  }}
                  className="block w-full px-4 py-2 text-left text-[13.5px] text-red-600 hover:bg-red-50"
                >
                  Excluir mapa
                </button>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setSidePanelOpen((v) => !v)}
            title="Alternar painel lateral"
            className={[
              'inline-flex h-8 w-8 items-center justify-center rounded-lg border transition-colors',
              sidePanelOpen
                ? 'border-[#0B3B78] bg-[#EFF6FF] text-[#0B3B78]'
                : 'border-[#CBD5E1] bg-white text-[#334155] hover:bg-[#F1F5F9]',
            ].join(' ')}
          >
            <PanelRight className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Área principal: Canvas + Painel Lateral */}
      <div className="relative flex min-h-0 flex-1">
        <MindMapCanvas
          root={localMap.root}
          backgroundColor={localMap.backgroundColor}
          executors={localMap.executors}
          selectedNodeId={selectedNodeId}
          editingNodeId={editingNodeId}
          zoom={zoom}
          pan={pan}
          onPanChange={setPan}
          onZoomChange={setZoom}
          onSelectNode={(id) => {
            setSelectedNodeId(id);
            if (editingNodeId && editingNodeId !== id) {
              setEditingNodeId(null);
            }
          }}
          onStartEditNode={(id) => {
            setSelectedNodeId(id);
            setEditingNodeId(id);
          }}
          onCommitEditNode={(id, text) => {
            setEditingNodeId(null);
            applyLocalChange((prev) => ({
              ...prev,
              name: id === prev.root.id ? text : prev.name,
              root: updateNode(prev.root, id, (node) => ({ ...node, text })),
            }));
          }}
          onCancelEditNode={() => setEditingNodeId(null)}
          onToggleCollapse={(id) => {
            applyLocalChange((prev) => ({
              ...prev,
              root: updateNode(prev.root, id, (node) => ({
                ...node,
                collapsed: !node.collapsed,
              })),
            }));
          }}
          onOpenCommentsForNode={(id) => {
            setSelectedNodeId(id);
            setSidePanelOpen(true);
            setSideTab('comments');
          }}
          onOpenDetailsForNode={(id) => {
            setSelectedNodeId(id);
            setSidePanelOpen(true);
            setSideTab('item');
          }}
        />

        <SidePanel
          open={sidePanelOpen}
          onToggleOpen={() => setSidePanelOpen((v) => !v)}
          activeTab={sideTab}
          onChangeTab={setSideTab}
          map={localMap}
          selectedNode={selectedNode}
          isRootSelected={selectedNodeId === localMap.root.id}
          executors={localMap.executors}
          expandingAi={expandingAi}
          onUpdateNode={(patch: Partial<MindMapNode>) => {
            if (!selectedNodeId) return;
            applyLocalChange((prev) => ({
              ...prev,
              name:
                selectedNodeId === prev.root.id && patch.text
                  ? patch.text
                  : prev.name,
              root: updateNode(prev.root, selectedNodeId, (node) => ({
                ...node,
                ...patch,
              })),
            }));
          }}
          onAddChild={() => handleAddChild()}
          onAddSibling={handleAddSibling}
          onDeleteSelected={handleDeleteSelected}
          onExpandWithAi={() => void handleExpandNodeWithAi()}
          onAddComment={(text) => {
            if (!selectedNodeId) return;
            const comment = {
              id: createId('cmt'),
              author: userName,
              text,
              createdAt: new Date().toISOString(),
            };
            applyLocalChange((prev) => ({
              ...prev,
              root: updateNode(prev.root, selectedNodeId, (node) => ({
                ...node,
                comments: [...(node.comments ?? []), comment],
              })),
            }));
          }}
          onDeleteComment={(commentId) => {
            if (!selectedNodeId) return;
            applyLocalChange((prev) => ({
              ...prev,
              root: updateNode(prev.root, selectedNodeId, (node) => ({
                ...node,
                comments: (node.comments ?? []).filter(
                  (c) => c.id !== commentId,
                ),
              })),
            }));
          }}
        />

        {toast && (
          <div className="fixed bottom-5 left-1/2 z-40 -translate-x-1/2 rounded-lg bg-[#0F172A] px-4 py-2.5 text-[13px] font-medium text-white shadow-lg">
            {toast}
          </div>
        )}
      </div>

      {/* Modais */}
      {executorsOpen && (
        <ExecutorsModal
          executors={localMap.executors}
          onAdd={(name) => {
            applyLocalChange((prev) => ({
              ...prev,
              executors: [
                ...prev.executors,
                {
                  id: createId('exec'),
                  name,
                  createdAt: new Date().toISOString(),
                },
              ],
            }));
          }}
          onRemove={(id) => {
            applyLocalChange((prev) => ({
              ...prev,
              executors: prev.executors.filter((e) => e.id !== id),
            }));
          }}
          onClose={() => setExecutorsOpen(false)}
        />
      )}

      {shareOpen && (
        <ShareModal
          mapId={localMap.id}
          shares={localMap.shares}
          onAddShare={(target, permission) => {
            applyLocalChange((prev) => ({
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
            }));
          }}
          onRemoveShare={(id) => {
            applyLocalChange((prev) => ({
              ...prev,
              shares: prev.shares.filter((s) => s.id !== id),
            }));
          }}
          onClose={() => setShareOpen(false)}
        />
      )}

      {markdownOpen && (
        <MarkdownModal
          initialMarkdown={treeToMarkdown(localMap.root)}
          onDownload={() => exportAsMarkdown(localMap)}
          onApply={(md) => {
            const parsed = markdownToTree(md, localMap.name);
            applyLocalChange((prev) => ({
              ...prev,
              name: parsed.text,
              root: parsed,
            }));
            setSelectedNodeId(null);
            setMarkdownOpen(false);
            showToast('Mapa atualizado a partir do Markdown.');
          }}
          onClose={() => setMarkdownOpen(false)}
        />
      )}

      {explainOpen && (
        <ExplainAiModal
          loading={explainLoading}
          explanation={explainText}
          model={explainModel}
          error={explainError}
          onRetry={() => void handleExplainWithAi()}
          onClose={() => setExplainOpen(false)}
        />
      )}

      {aiOverlay && (
        <AiProcessingOverlay
          title={aiOverlay.title}
          steps={aiOverlay.steps}
        />
      )}
    </div>
  );
}
