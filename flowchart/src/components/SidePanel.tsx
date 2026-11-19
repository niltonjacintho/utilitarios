'use client';

import React, { useMemo, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  History,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import {
  FlowchartEdge,
  FlowchartLane,
  FlowchartNode,
  FlowchartRecord,
  ValidationIssue,
} from '@/types/flowchart';
import {
  formatDateTime,
  getNodeMeta,
  NODE_TYPE_LIST,
} from '@/lib/flowchart-utils';
import { SelectionTarget } from './FlowchartCanvas';

export type SideTab =
  | 'properties'
  | 'elements'
  | 'validation'
  | 'comments'
  | 'versions';

interface SidePanelProps {
  open: boolean;
  onToggleOpen: () => void;
  activeTab: SideTab;
  onTabChange: (tab: SideTab) => void;
  chart: FlowchartRecord;
  selection: SelectionTarget;
  issues: ValidationIssue[];
  readOnly: boolean;
  onSelect: (target: SelectionTarget) => void;
  onUpdateChartMeta: (patch: {
    name?: string;
    description?: string;
    tags?: string[];
  }) => void;
  onUpdateNode: (id: string, patch: Partial<FlowchartNode>) => void;
  onDeleteNode: (id: string) => void;
  onUpdateEdge: (id: string, patch: Partial<FlowchartEdge>) => void;
  onDeleteEdge: (id: string) => void;
  onUpdateLane: (id: string, patch: Partial<FlowchartLane>) => void;
  onDeleteLane: (id: string) => void;
  onAddComment: (text: string, nodeId: string | null) => void;
  onDeleteComment: (commentId: string) => void;
  onCreateVersion: (label: string) => void;
  onRestoreVersion: (versionId: string) => void;
}

export function SidePanel({
  open,
  onToggleOpen,
  activeTab,
  onTabChange,
  chart,
  selection,
  issues,
  readOnly,
  onSelect,
  onUpdateChartMeta,
  onUpdateNode,
  onDeleteNode,
  onUpdateEdge,
  onDeleteEdge,
  onUpdateLane,
  onDeleteLane,
  onAddComment,
  onDeleteComment,
  onCreateVersion,
  onRestoreVersion,
}: SidePanelProps) {
  const [elementFilter, setElementFilter] = useState('');
  const [commentText, setCommentText] = useState('');
  const [associateSelected, setAssociateSelected] = useState(true);
  const [versionLabel, setVersionLabel] = useState('');

  const laneMap = useMemo(
    () => new Map(chart.lanes.map((l) => [l.id, l.name])),
    [chart.lanes],
  );
  const nodeMap = useMemo(
    () => new Map(chart.nodes.map((n) => [n.id, n])),
    [chart.nodes],
  );

  const selectedNode =
    selection?.kind === 'node' ? (nodeMap.get(selection.id) ?? null) : null;
  const selectedEdge =
    selection?.kind === 'edge'
      ? (chart.edges.find((e) => e.id === selection.id) ?? null)
      : null;
  const selectedLane =
    selection?.kind === 'lane'
      ? (chart.lanes.find((l) => l.id === selection.id) ?? null)
      : null;

  const filteredLanes = useMemo(() => {
    const q = elementFilter.trim().toLowerCase();
    if (!q) return chart.lanes;
    return chart.lanes.filter((l) => l.name.toLowerCase().includes(q));
  }, [chart.lanes, elementFilter]);

  const filteredNodes = useMemo(() => {
    const q = elementFilter.trim().toLowerCase();
    if (!q) return chart.nodes;
    return chart.nodes.filter((n) => {
      const hay = [
        n.title,
        getNodeMeta(n.type).label,
        n.owner ?? '',
        laneMap.get(n.laneId) ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [chart.nodes, elementFilter, laneMap]);

  const totalElements = chart.lanes.length + chart.nodes.length;
  const visibleElements = filteredLanes.length + filteredNodes.length;

  const tabs: Array<{ id: SideTab; label: string }> = [
    { id: 'properties', label: 'Propriedades' },
    { id: 'elements', label: 'Elementos' },
    { id: 'validation', label: 'Validação' },
    { id: 'comments', label: 'Comentários' },
    { id: 'versions', label: 'Versões' },
  ];

  const handleSubmitComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    onAddComment(
      commentText.trim(),
      associateSelected && selectedNode ? selectedNode.id : null,
    );
    setCommentText('');
  };

  return (
    <>
      {open && (
        <aside className="flex w-[340px] shrink-0 flex-col border-l border-[#E2E8F0] bg-white">
          {/* 5 abas organizadas fielmente às imagens */}
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1 border-b border-[#E2E8F0] px-3 pt-2">
            {tabs.map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onTabChange(tab.id)}
                  className={[
                    'pb-2.5 text-[13px] transition-colors',
                    active
                      ? 'border-b-2 border-[#0B3B78] font-semibold text-[#0B3B78]'
                      : 'font-medium text-[#64748B] hover:text-[#0F172A]',
                  ].join(' ')}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {/* ==================== PROPRIEDADES ==================== */}
            {activeTab === 'properties' && (
              <>
                {selectedNode ? (
                  <div className="space-y-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="text-[14.5px] font-semibold text-[#0F172A]">
                          {getNodeMeta(selectedNode.type).label}
                        </div>
                        <div className="font-mono text-[11.5px] text-[#64748B]">
                          {selectedNode.id}
                        </div>
                      </div>
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => onDeleteNode(selectedNode.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-[#E2E8F0] px-2.5 py-1 text-[12px] font-medium text-[#475569] hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Excluir
                        </button>
                      )}
                    </div>

                    <div>
                      <label className="block text-[12px] font-medium text-[#475569]">
                        Título
                      </label>
                      <input
                        type="text"
                        disabled={readOnly}
                        value={selectedNode.title}
                        onChange={(e) =>
                          onUpdateNode(selectedNode.id, { title: e.target.value })
                        }
                        className="mt-1 w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-[13.5px] text-[#0F172A] outline-none focus:border-[#0B3B78]"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-2.5">
                      <div>
                        <label className="block text-[12px] font-medium text-[#475569]">
                          Tipo
                        </label>
                        <select
                          disabled={readOnly}
                          value={selectedNode.type}
                          onChange={(e) => {
                            const nextType = e.target.value as FlowchartNode['type'];
                            const meta = getNodeMeta(nextType);
                            onUpdateNode(selectedNode.id, {
                              type: nextType,
                              width: meta.width,
                              height: meta.height,
                            });
                          }}
                          className="mt-1 w-full rounded-lg border border-[#CBD5E1] bg-white px-2.5 py-2 text-[13px] text-[#0F172A] outline-none focus:border-[#0B3B78]"
                        >
                          {NODE_TYPE_LIST.map((t) => (
                            <option key={t.type} value={t.type}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[12px] font-medium text-[#475569]">
                          Raia
                        </label>
                        <select
                          disabled={readOnly}
                          value={selectedNode.laneId}
                          onChange={(e) =>
                            onUpdateNode(selectedNode.id, {
                              laneId: e.target.value,
                            })
                          }
                          className="mt-1 w-full rounded-lg border border-[#CBD5E1] bg-white px-2.5 py-2 text-[13px] text-[#0F172A] outline-none focus:border-[#0B3B78]"
                        >
                          {chart.lanes.map((lane) => (
                            <option key={lane.id} value={lane.id}>
                              {lane.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[12px] font-medium text-[#475569]">
                        Descrição
                      </label>
                      <textarea
                        rows={3}
                        disabled={readOnly}
                        value={selectedNode.description ?? ''}
                        onChange={(e) =>
                          onUpdateNode(selectedNode.id, {
                            description: e.target.value,
                          })
                        }
                        className="mt-1 w-full resize-y rounded-lg border border-[#CBD5E1] px-3 py-2 text-[13.5px] text-[#0F172A] outline-none focus:border-[#0B3B78]"
                      />
                    </div>

                    <div>
                      <label className="block text-[12px] font-medium text-[#475569]">
                        Owner
                      </label>
                      <input
                        type="text"
                        disabled={readOnly}
                        value={selectedNode.owner ?? ''}
                        onChange={(e) =>
                          onUpdateNode(selectedNode.id, { owner: e.target.value })
                        }
                        placeholder="Pessoa, área ou papel"
                        className="mt-1 w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-[13.5px] text-[#0F172A] outline-none placeholder:text-[#94A3B8] focus:border-[#0B3B78]"
                      />
                    </div>

                    <div>
                      <label className="block text-[12px] font-medium text-[#475569]">
                        Gatilho
                      </label>
                      <input
                        type="text"
                        disabled={readOnly}
                        value={selectedNode.trigger ?? ''}
                        onChange={(e) =>
                          onUpdateNode(selectedNode.id, {
                            trigger: e.target.value,
                          })
                        }
                        placeholder="Evento ou condição disparadora"
                        className="mt-1 w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-[13.5px] text-[#0F172A] outline-none placeholder:text-[#94A3B8] focus:border-[#0B3B78]"
                      />
                    </div>

                    {/* Relacionados (Sucessores / Predecessores) */}
                    <div className="border-t border-[#E2E8F0] pt-4">
                      <h3 className="text-[13px] font-semibold text-[#0F172A]">
                        Relacionados
                      </h3>
                      <div className="mt-2.5 space-y-2">
                        <div className="text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
                          Sucessores
                        </div>
                        {chart.edges.filter((e) => e.sourceId === selectedNode.id)
                          .length === 0 ? (
                          <p className="text-[12.5px] text-[#94A3B8]">
                            Nenhum sucessor conectado.
                          </p>
                        ) : (
                          chart.edges
                            .filter((e) => e.sourceId === selectedNode.id)
                            .map((edge) => {
                              const tgt = nodeMap.get(edge.targetId);
                              return (
                                <button
                                  key={edge.id}
                                  type="button"
                                  onClick={() =>
                                    onSelect({ kind: 'edge', id: edge.id })
                                  }
                                  className="flex w-full items-center justify-between rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-left text-[12.5px] hover:border-[#0B3B78]"
                                >
                                  <span className="truncate font-medium text-[#0F172A]">
                                    → {tgt?.title ?? edge.targetId}
                                  </span>
                                  {edge.label && (
                                    <span className="ml-2 rounded bg-white px-1.5 py-0.5 text-[11px] font-semibold text-[#0B3B78]">
                                      {edge.label}
                                    </span>
                                  )}
                                </button>
                              );
                            })
                        )}

                        <div className="pt-2 text-[11px] font-semibold uppercase tracking-wider text-[#64748B]">
                          Predecessores
                        </div>
                        {chart.edges.filter((e) => e.targetId === selectedNode.id)
                          .length === 0 ? (
                          <p className="text-[12.5px] text-[#94A3B8]">
                            Nenhum predecessor conectado.
                          </p>
                        ) : (
                          chart.edges
                            .filter((e) => e.targetId === selectedNode.id)
                            .map((edge) => {
                              const src = nodeMap.get(edge.sourceId);
                              return (
                                <button
                                  key={edge.id}
                                  type="button"
                                  onClick={() =>
                                    onSelect({ kind: 'node', id: edge.sourceId })
                                  }
                                  className="flex w-full items-center justify-between rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] px-3 py-2 text-left text-[12.5px] hover:border-[#0B3B78]"
                                >
                                  <span className="truncate font-medium text-[#0F172A]">
                                    ← {src?.title ?? edge.sourceId}
                                  </span>
                                  {edge.label && (
                                    <span className="ml-2 rounded bg-white px-1.5 py-0.5 text-[11px] font-semibold text-[#475569]">
                                      {edge.label}
                                    </span>
                                  )}
                                </button>
                              );
                            })
                        )}
                      </div>
                    </div>
                  </div>
                ) : selectedEdge ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[14.5px] font-semibold text-[#0F172A]">
                        Conexão
                      </h3>
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => onDeleteEdge(selectedEdge.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[12px] font-medium text-red-700 hover:bg-red-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Excluir
                        </button>
                      )}
                    </div>
                    <div className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3 text-[13px] text-[#334155]">
                      <strong>
                        {nodeMap.get(selectedEdge.sourceId)?.title ??
                          selectedEdge.sourceId}
                      </strong>{' '}
                      →{' '}
                      <strong>
                        {nodeMap.get(selectedEdge.targetId)?.title ??
                          selectedEdge.targetId}
                      </strong>
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium text-[#475569]">
                        Rótulo da condição (ex.: Sim, Não)
                      </label>
                      <input
                        type="text"
                        disabled={readOnly}
                        value={selectedEdge.label ?? ''}
                        onChange={(e) =>
                          onUpdateEdge(selectedEdge.id, { label: e.target.value })
                        }
                        placeholder="Sim / Não / Condição"
                        className="mt-1 w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-[13.5px] text-[#0F172A] outline-none focus:border-[#0B3B78]"
                      />
                    </div>
                  </div>
                ) : selectedLane ? (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-[14.5px] font-semibold text-[#0F172A]">
                        Raia (Swimlane)
                      </h3>
                      {!readOnly && chart.lanes.length > 1 && (
                        <button
                          type="button"
                          onClick={() => onDeleteLane(selectedLane.id)}
                          className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1 text-[12px] font-medium text-red-700 hover:bg-red-100"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Excluir raia
                        </button>
                      )}
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium text-[#475569]">
                        Nome da raia
                      </label>
                      <input
                        type="text"
                        disabled={readOnly}
                        value={selectedLane.name}
                        onChange={(e) =>
                          onUpdateLane(selectedLane.id, { name: e.target.value })
                        }
                        className="mt-1 w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-[13.5px] text-[#0F172A] outline-none focus:border-[#0B3B78]"
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium text-[#475569]">
                        Altura ({selectedLane.height}px)
                      </label>
                      <input
                        type="range"
                        disabled={readOnly}
                        min={150}
                        max={480}
                        step={10}
                        value={selectedLane.height}
                        onChange={(e) =>
                          onUpdateLane(selectedLane.id, {
                            height: Number(e.target.value),
                          })
                        }
                        className="mt-2 w-full accent-[#0B3B78]"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <h3 className="text-[14.5px] font-semibold text-[#0F172A]">
                      Detalhes do fluxograma
                    </h3>
                    <div>
                      <label className="block text-[12px] font-medium text-[#475569]">
                        Nome do processo
                      </label>
                      <input
                        type="text"
                        disabled={readOnly}
                        value={chart.name}
                        onChange={(e) =>
                          onUpdateChartMeta({ name: e.target.value })
                        }
                        className="mt-1 w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-[13.5px] text-[#0F172A] outline-none focus:border-[#0B3B78]"
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium text-[#475569]">
                        Descrição
                      </label>
                      <textarea
                        rows={3}
                        disabled={readOnly}
                        value={chart.description}
                        onChange={(e) =>
                          onUpdateChartMeta({ description: e.target.value })
                        }
                        placeholder="Resumo do objetivo deste processo..."
                        className="mt-1 w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-[13.5px] text-[#0F172A] outline-none focus:border-[#0B3B78]"
                      />
                    </div>
                    <div>
                      <label className="block text-[12px] font-medium text-[#475569]">
                        Tags (separadas por vírgula)
                      </label>
                      <input
                        type="text"
                        disabled={readOnly}
                        value={chart.tags.join(', ')}
                        onChange={(e) =>
                          onUpdateChartMeta({
                            tags: e.target.value
                              .split(',')
                              .map((t) => t.trim())
                              .filter(Boolean),
                          })
                        }
                        placeholder="financeiro, aprovação, portal"
                        className="mt-1 w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-[13.5px] text-[#0F172A] outline-none focus:border-[#0B3B78]"
                      />
                    </div>
                    <div className="rounded-lg border border-[#DBEAFE] bg-[#EFF6FF] p-3 text-[12.5px] text-[#334155]">
                      Clique em qualquer elemento, conexão ou raia no diagrama para editar suas propriedades.
                    </div>
                  </div>
                )}
              </>
            )}

            {/* ==================== ELEMENTOS ==================== */}
            {activeTab === 'elements' && (
              <div className="space-y-3">
                <div>
                  <label className="block text-[12px] font-medium text-[#475569]">
                    Filtrar elementos
                  </label>
                  <input
                    type="text"
                    value={elementFilter}
                    onChange={(e) => setElementFilter(e.target.value)}
                    placeholder="Título, tipo ou owner"
                    className="mt-1 w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-[13.5px] text-[#0F172A] outline-none placeholder:text-[#94A3B8] focus:border-[#0B3B78]"
                  />
                </div>

                <div className="text-[12px] text-[#64748B]">
                  {visibleElements} de {totalElements} elementos ·{' '}
                  {chart.edges.length} conexões
                </div>

                <div className="space-y-1.5">
                  {filteredLanes.map((lane) => {
                    const active =
                      selection?.kind === 'lane' && selection.id === lane.id;
                    return (
                      <button
                        key={lane.id}
                        type="button"
                        onClick={() => onSelect({ kind: 'lane', id: lane.id })}
                        className={[
                          'flex w-full flex-col rounded-lg border px-3 py-2 text-left transition-colors',
                          active
                            ? 'border-[#0B3B78] bg-[#EFF6FF]'
                            : 'border-transparent hover:bg-[#F8FAFC]',
                        ].join(' ')}
                      >
                        <span className="text-[13.5px] font-semibold text-[#0F172A]">
                          {lane.name}
                        </span>
                        <span className="text-[11.5px] text-[#64748B]">
                          Raia
                        </span>
                      </button>
                    );
                  })}

                  {filteredNodes.map((node) => {
                    const meta = getNodeMeta(node.type);
                    const active =
                      selection?.kind === 'node' && selection.id === node.id;
                    return (
                      <button
                        key={node.id}
                        type="button"
                        onClick={() => onSelect({ kind: 'node', id: node.id })}
                        className={[
                          'flex w-full items-start gap-2.5 rounded-lg border px-3 py-2 text-left transition-colors',
                          active
                            ? 'border-[#0B3B78] bg-[#EFF6FF]'
                            : 'border-transparent hover:bg-[#F8FAFC]',
                        ].join(' ')}
                      >
                        <span
                          className="mt-1 h-3 w-3 shrink-0 rounded-sm border"
                          style={{
                            backgroundColor: meta.fill,
                            borderColor: meta.stroke,
                          }}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-[13.5px] font-semibold text-[#0F172A]">
                            {node.title}
                          </div>
                          <div className="truncate text-[11.5px] text-[#64748B]">
                            {meta.label}
                            {node.owner ? ` · ${node.owner}` : ''} · raia{' '}
                            {laneMap.get(node.laneId) ?? 'Geral'}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* ==================== VALIDAÇÃO ==================== */}
            {activeTab === 'validation' && (
              <div className="space-y-3">
                {issues.length === 0 ? (
                  <div className="flex flex-col items-center rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-8 text-center text-emerald-800">
                    <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                    <p className="mt-2 text-[14px] font-semibold">
                      Fluxograma válido!
                    </p>
                    <p className="mt-1 text-[12.5px] text-emerald-700">
                      Nenhum erro ou aviso estrutural encontrado.
                    </p>
                  </div>
                ) : (
                  issues.map((issue) => (
                    <button
                      key={issue.id}
                      type="button"
                      onClick={() => {
                        if (issue.nodeId) {
                          onSelect({ kind: 'node', id: issue.nodeId });
                          onTabChange('properties');
                        }
                      }}
                      className={[
                        'flex w-full items-start gap-2.5 rounded-xl border p-3 text-left text-[13px]',
                        issue.severity === 'error'
                          ? 'border-red-200 bg-red-50 text-red-800'
                          : 'border-amber-200 bg-amber-50 text-amber-800',
                      ].join(' ')}
                    >
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                      <span>{issue.message}</span>
                    </button>
                  ))
                )}
              </div>
            )}

            {/* ==================== COMENTÁRIOS ==================== */}
            {activeTab === 'comments' && (
              <div className="space-y-4">
                <form onSubmit={handleSubmitComment} className="space-y-2.5">
                  <label className="block text-[12.5px] font-medium text-[#475569]">
                    Novo comentário
                  </label>
                  <textarea
                    rows={3}
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Escreva uma observação sobre o fluxo..."
                    className="w-full resize-y rounded-lg border border-[#CBD5E1] px-3 py-2 text-[13.5px] text-[#0F172A] outline-none focus:border-[#0B3B78]"
                  />

                  {selectedNode && (
                    <label className="flex cursor-pointer items-center gap-2 text-[12.5px] text-[#334155]">
                      <input
                        type="checkbox"
                        checked={associateSelected}
                        onChange={(e) => setAssociateSelected(e.target.checked)}
                        className="h-4 w-4 rounded accent-[#0B3B78]"
                      />
                      <span>Associar a “{selectedNode.title}”</span>
                    </label>
                  )}

                  <button
                    type="submit"
                    disabled={!commentText.trim()}
                    className="rounded-lg bg-[#476788] px-4 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#0B3B78] disabled:opacity-45"
                  >
                    Comentar
                  </button>
                </form>

                <div className="border-t border-[#E2E8F0] pt-4">
                  {chart.comments.length === 0 ? (
                    <p className="text-[13px] text-[#64748B]">
                      Ainda não há comentários.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {chart.comments.map((c) => {
                        const refNode = c.nodeId ? nodeMap.get(c.nodeId) : null;
                        return (
                          <div
                            key={c.id}
                            className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div>
                                <div className="text-[12.5px] font-semibold text-[#0F172A]">
                                  {c.author}
                                </div>
                                <div className="text-[11px] text-[#64748B]">
                                  {formatDateTime(c.createdAt)}
                                </div>
                              </div>
                              {!readOnly && (
                                <button
                                  type="button"
                                  onClick={() => onDeleteComment(c.id)}
                                  className="text-[#94A3B8] hover:text-red-600"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>

                            {refNode && (
                              <button
                                type="button"
                                onClick={() =>
                                  onSelect({ kind: 'node', id: refNode.id })
                                }
                                className="mt-1.5 inline-flex rounded-full bg-[#EFF6FF] px-2 py-0.5 text-[11px] font-semibold text-[#0B3B78] hover:bg-[#DBEAFE]"
                              >
                                {refNode.title}
                              </button>
                            )}

                            <p className="mt-2 whitespace-pre-wrap text-[13px] text-[#334155]">
                              {c.text}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* ==================== VERSÕES ==================== */}
            {activeTab === 'versions' && (
              <div className="space-y-4">
                {!readOnly && (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      onCreateVersion(versionLabel.trim());
                      setVersionLabel('');
                    }}
                    className="space-y-2"
                  >
                    <label className="block text-[12px] font-medium text-[#475569]">
                      Salvar snapshot de versão
                    </label>
                    <input
                      type="text"
                      value={versionLabel}
                      onChange={(e) => setVersionLabel(e.target.value)}
                      placeholder="Ex.: Versão antes da revisão"
                      className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-[13px] text-[#0F172A] outline-none focus:border-[#0B3B78]"
                    />
                    <button
                      type="submit"
                      className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#0B3B78] px-3 py-2 text-[13px] font-semibold text-white hover:bg-[#092E5F]"
                    >
                      <History className="h-3.5 w-3.5" />
                      Salvar versão atual
                    </button>
                  </form>
                )}

                <div className="border-t border-[#E2E8F0] pt-4">
                  {chart.versions.length === 0 ? (
                    <p className="text-[13px] text-[#64748B]">
                      Nenhuma versão salva ainda.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {chart.versions.map((v) => (
                        <div
                          key={v.id}
                          className="flex items-center justify-between gap-2 rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-semibold text-[#0F172A]">
                              {v.label}
                            </div>
                            <div className="text-[11px] text-[#64748B]">
                              {v.author} · {formatDateTime(v.createdAt)}
                            </div>
                          </div>
                          {!readOnly && (
                            <button
                              type="button"
                              onClick={() => onRestoreVersion(v.id)}
                              className="inline-flex shrink-0 items-center gap-1 rounded-md border border-[#CBD5E1] bg-white px-2.5 py-1 text-[12px] font-medium text-[#0B3B78] hover:bg-[#EFF6FF]"
                            >
                              <RotateCcw className="h-3 w-3" />
                              Restaurar
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </aside>
      )}

      {/* Botão circular flutuante no canto inferior direito (igual às imagens) */}
      <button
        type="button"
        onClick={onToggleOpen}
        title={open ? 'Ocultar painel lateral' : 'Mostrar painel lateral'}
        className="fixed bottom-5 right-5 z-20 flex h-10 w-10 items-center justify-center rounded-full bg-[#0B2A5B] text-white shadow-lg transition-transform hover:scale-105 hover:bg-[#0B3B78]"
      >
        {open ? (
          <ChevronRight className="h-5 w-5" />
        ) : (
          <ChevronLeft className="h-5 w-5" />
        )}
      </button>
    </>
  );
}
