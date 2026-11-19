'use client';

import React, { useMemo, useRef, useState } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import {
  FlowchartEdge,
  FlowchartLane,
  FlowchartNode,
  FlowchartNodeType,
} from '@/types/flowchart';
import {
  computeLaneBounds,
  computeOrthogonalEdgePath,
  findLaneAtY,
  getNodeMeta,
  LANE_HEADER_WIDTH,
  NODE_TYPE_LIST,
} from '@/lib/flowchart-utils';

export type SelectionTarget =
  | { kind: 'node'; id: string }
  | { kind: 'edge'; id: string }
  | { kind: 'lane'; id: string }
  | null;

interface FlowchartCanvasProps {
  lanes: FlowchartLane[];
  nodes: FlowchartNode[];
  edges: FlowchartEdge[];
  backgroundColor: string;
  zoom: number;
  pan: { x: number; y: number };
  connectMode: boolean;
  connectSourceId: string | null;
  selection: SelectionTarget;
  readOnly: boolean;
  onPanChange: (pan: { x: number; y: number }) => void;
  onZoomChange: (zoom: number) => void;
  onSelect: (target: SelectionTarget) => void;
  onAddNodeFromPalette: (type: FlowchartNodeType) => void;
  onQuickAddConnected: (sourceNodeId: string, type: FlowchartNodeType) => void;
  onMoveNode: (nodeId: string, x: number, y: number, laneId: string) => void;
  onStartConnectFrom: (nodeId: string) => void;
  onCompleteConnectTo: (targetNodeId: string) => void;
  onCommitInlineTitle: (nodeId: string, title: string) => void;
  onDeleteNode: (nodeId: string) => void;
}

function PaletteGlyph({ type }: { type: FlowchartNodeType }) {
  const meta = getNodeMeta(type);
  switch (type) {
    case 'start':
    case 'end':
      return (
        <svg viewBox="0 0 28 18" className="h-4 w-6">
          <rect
            x="2"
            y="3"
            width="24"
            height="12"
            rx="6"
            fill={meta.fill}
            stroke={meta.stroke}
            strokeWidth="1.6"
          />
        </svg>
      );
    case 'decision':
      return (
        <svg viewBox="0 0 28 20" className="h-4 w-6">
          <polygon
            points="14,2 26,10 14,18 2,10"
            fill={meta.fill}
            stroke={meta.stroke}
            strokeWidth="1.6"
          />
        </svg>
      );
    case 'io':
      return (
        <svg viewBox="0 0 28 18" className="h-4 w-6">
          <polygon
            points="6,2 26,2 22,16 2,16"
            fill={meta.fill}
            stroke={meta.stroke}
            strokeWidth="1.6"
          />
        </svg>
      );
    case 'subprocess':
      return (
        <svg viewBox="0 0 28 18" className="h-4 w-6">
          <rect
            x="2"
            y="2"
            width="24"
            height="14"
            rx="2"
            fill={meta.fill}
            stroke={meta.stroke}
            strokeWidth="1.5"
          />
          <line x1="6" y1="2" x2="6" y2="16" stroke={meta.stroke} strokeWidth="1.3" />
          <line x1="22" y1="2" x2="22" y2="16" stroke={meta.stroke} strokeWidth="1.3" />
        </svg>
      );
    case 'document':
      return (
        <svg viewBox="0 0 28 20" className="h-4 w-6">
          <path
            d="M3 3h22v12q-5.5-3-11 0t-11 0Z"
            fill={meta.fill}
            stroke={meta.stroke}
            strokeWidth="1.5"
          />
        </svg>
      );
    case 'database':
      return (
        <svg viewBox="0 0 28 22" className="h-4 w-6">
          <path
            d="M4 6c0-2.5 20-2.5 20 0v10c0 2.5-20 2.5-20 0Z"
            fill={meta.fill}
            stroke={meta.stroke}
            strokeWidth="1.5"
          />
          <ellipse
            cx="14"
            cy="6"
            rx="10"
            ry="2.5"
            fill={meta.fill}
            stroke={meta.stroke}
            strokeWidth="1.4"
          />
        </svg>
      );
    case 'manual':
      return (
        <svg viewBox="0 0 28 18" className="h-4 w-6">
          <polygon
            points="2,2 26,2 22,16 6,16"
            fill={meta.fill}
            stroke={meta.stroke}
            strokeWidth="1.5"
          />
        </svg>
      );
    case 'delay':
      return (
        <svg viewBox="0 0 28 18" className="h-4 w-6">
          <path
            d="M3 2h14a7 7 0 0 1 0 14H3Z"
            fill={meta.fill}
            stroke={meta.stroke}
            strokeWidth="1.5"
          />
        </svg>
      );
    case 'connector':
      return (
        <svg viewBox="0 0 22 22" className="h-4 w-5">
          <circle
            cx="11"
            cy="11"
            r="7.5"
            fill={meta.fill}
            stroke={meta.stroke}
            strokeWidth="1.6"
          />
        </svg>
      );
    case 'note':
      return (
        <svg viewBox="0 0 24 22" className="h-4 w-5">
          <path
            d="M3 2h13l5 5v13H3Z"
            fill={meta.fill}
            stroke={meta.stroke}
            strokeWidth="1.5"
          />
          <path d="M16 2v5h5" fill="none" stroke={meta.stroke} strokeWidth="1.3" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 28 18" className="h-4 w-6">
          <rect
            x="2"
            y="2"
            width="24"
            height="14"
            rx="3"
            fill={meta.fill}
            stroke={meta.stroke}
            strokeWidth="1.5"
          />
        </svg>
      );
  }
}

function NodeShapeBackground({
  node,
  selected,
}: {
  node: FlowchartNode;
  selected: boolean;
}) {
  const meta = getNodeMeta(node.type);
  const w = node.width;
  const h = node.height;
  const stroke = selected ? '#0284C7' : meta.stroke;
  const strokeWidth = selected ? 2.4 : 1.7;

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className="pointer-events-none absolute inset-0 overflow-visible"
    >
      {node.type === 'start' || node.type === 'end' ? (
        <rect
          x={1}
          y={1}
          width={w - 2}
          height={h - 2}
          rx={Math.round((h - 2) / 2)}
          fill={meta.fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      ) : node.type === 'decision' ? (
        <polygon
          points={`${w / 2},2 ${w - 2},${h / 2} ${w / 2},${h - 2} 2,${h / 2}`}
          fill={meta.fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      ) : node.type === 'io' ? (
        <polygon
          points={`18,2 ${w - 2},2 ${w - 18},${h - 2} 2,${h - 2}`}
          fill={meta.fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      ) : node.type === 'subprocess' ? (
        <>
          <rect
            x={1}
            y={1}
            width={w - 2}
            height={h - 2}
            rx={8}
            fill={meta.fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
          <line x1={12} y1={1} x2={12} y2={h - 1} stroke={stroke} strokeWidth={1.3} />
          <line x1={w - 12} y1={1} x2={w - 12} y2={h - 1} stroke={stroke} strokeWidth={1.3} />
        </>
      ) : node.type === 'database' ? (
        <>
          <path
            d={`M 2 11 C 2 2, ${w - 2} 2, ${w - 2} 11 L ${w - 2} ${h - 11} C ${w - 2} ${h}, 2 ${h}, 2 ${h - 11} Z`}
            fill={meta.fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
          <ellipse
            cx={w / 2}
            cy={11}
            rx={(w - 4) / 2}
            ry={7}
            fill={meta.fill}
            stroke={stroke}
            strokeWidth={1.4}
          />
        </>
      ) : node.type === 'document' ? (
        <path
          d={`M 2 6 Q 2 2 6 2 L ${w - 6} 2 Q ${w - 2} 2 ${w - 2} 6 L ${w - 2} ${h - 10} Q ${w * 0.75} ${h - 20} ${w / 2} ${h - 8} Q ${w * 0.25} ${h + 3} 2 ${h - 8} Z`}
          fill={meta.fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      ) : node.type === 'manual' ? (
        <polygon
          points={`2,2 ${w - 2},2 ${w - 16},${h - 2} 16,${h - 2}`}
          fill={meta.fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      ) : node.type === 'delay' ? (
        <path
          d={`M 2 2 L ${w - h / 2} 2 A ${(h - 4) / 2} ${(h - 4) / 2} 0 0 1 ${w - h / 2} ${h - 2} L 2 ${h - 2} Z`}
          fill={meta.fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      ) : node.type === 'connector' ? (
        <circle
          cx={w / 2}
          cy={h / 2}
          r={Math.min(w, h) / 2 - 2}
          fill={meta.fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      ) : node.type === 'note' ? (
        <>
          <path
            d={`M 2 2 L ${w - 16} 2 L ${w - 2} 16 L ${w - 2} ${h - 2} L 2 ${h - 2} Z`}
            fill={meta.fill}
            stroke={stroke}
            strokeWidth={strokeWidth}
          />
          <path
            d={`M ${w - 16} 2 L ${w - 16} 16 L ${w - 2} 16`}
            fill="none"
            stroke={stroke}
            strokeWidth={1.3}
          />
        </>
      ) : (
        <rect
          x={1}
          y={1}
          width={w - 2}
          height={h - 2}
          rx={10}
          fill={meta.fill}
          stroke={stroke}
          strokeWidth={strokeWidth}
        />
      )}
    </svg>
  );
}

export function FlowchartCanvas({
  lanes,
  nodes,
  edges,
  backgroundColor,
  zoom,
  pan,
  connectMode,
  connectSourceId,
  selection,
  readOnly,
  onPanChange,
  onZoomChange,
  onSelect,
  onAddNodeFromPalette,
  onQuickAddConnected,
  onMoveNode,
  onStartConnectFrom,
  onCompleteConnectTo,
  onCommitInlineTitle,
  onDeleteNode,
}: FlowchartCanvasProps) {
  const laneBounds = useMemo(() => computeLaneBounds(lanes), [lanes]);
  const nodeMap = useMemo(() => new Map(nodes.map((n) => [n.id, n])), [nodes]);

  const stageWidth = useMemo(() => {
    const rightmost = nodes.reduce((max, n) => Math.max(max, n.x + n.width + 160), 1160);
    return Math.max(1160, rightmost);
  }, [nodes]);

  const stageHeight = useMemo(() => {
    const laneH = laneBounds.reduce((sum, b) => sum + b.lane.height, 0);
    const bottomNode = nodes.reduce((max, n) => Math.max(max, n.y + n.height + 90), laneH);
    return Math.max(520, laneH, bottomNode);
  }, [laneBounds, nodes]);

  const [editingNodeId, setEditingNodeId] = useState<string | null>(null);
  const [titleDraft, setTitleDraft] = useState('');

  const dragState = useRef<
    | { kind: 'pan'; startX: number; startY: number; origX: number; origY: number }
    | { kind: 'node'; nodeId: string; startX: number; startY: number; origX: number; origY: number }
    | null
  >(null);
  const [isPanning, setIsPanning] = useState(false);

  const selectedNodeId = selection?.kind === 'node' ? selection.id : null;
  const selectedEdgeId = selection?.kind === 'edge' ? selection.id : null;
  const selectedLaneId = selection?.kind === 'lane' ? selection.id : null;

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-fc-interactive="true"]')) {
      return;
    }
    onSelect(null);
    setEditingNodeId(null);
    setIsPanning(true);
    dragState.current = {
      kind: 'pan',
      startX: e.clientX,
      startY: e.clientY,
      origX: pan.x,
      origY: pan.y,
    };
  };

  const handleNodeMouseDown = (
    e: React.MouseEvent<HTMLDivElement>,
    node: FlowchartNode,
  ) => {
    if (e.button !== 0) return;
    e.stopPropagation();

    if (connectMode && !readOnly) {
      if (!connectSourceId) {
        onStartConnectFrom(node.id);
      } else if (connectSourceId !== node.id) {
        onCompleteConnectTo(node.id);
      }
      return;
    }

    onSelect({ kind: 'node', id: node.id });
    if (readOnly || editingNodeId === node.id) return;

    dragState.current = {
      kind: 'node',
      nodeId: node.id,
      startX: e.clientX,
      startY: e.clientY,
      origX: node.x,
      origY: node.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const st = dragState.current;
    if (!st) return;

    if (st.kind === 'pan') {
      onPanChange({
        x: st.origX + (e.clientX - st.startX),
        y: st.origY + (e.clientY - st.startY),
      });
      return;
    }

    if (st.kind === 'node') {
      const node = nodeMap.get(st.nodeId);
      if (!node) return;
      const dx = (e.clientX - st.startX) / zoom;
      const dy = (e.clientY - st.startY) / zoom;
      const nextX = Math.max(LANE_HEADER_WIDTH + 14, Math.round(st.origX + dx));
      const nextY = Math.max(12, Math.round(st.origY + dy));
      const targetLane = findLaneAtY(lanes, nextY + node.height / 2);
      onMoveNode(node.id, nextX, nextY, targetLane?.id ?? node.laneId);
    }
  };

  const stopDrag = () => {
    dragState.current = null;
    setIsPanning(false);
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const delta = e.deltaY < 0 ? 0.1 : -0.1;
      onZoomChange(Math.min(2, Math.max(0.4, Number((zoom + delta).toFixed(2)))));
    }
  };

  const startInlineEdit = (node: FlowchartNode) => {
    if (readOnly) return;
    setEditingNodeId(node.id);
    setTitleDraft(node.title);
  };

  return (
    <div className="relative flex min-h-0 flex-1 overflow-hidden">
      {/* Paleta vertical esquerda (símbolos fiéis às imagens) */}
      <div className="z-10 flex w-[54px] shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-[#E2E8F0] bg-white py-2.5 shadow-sm">
        {NODE_TYPE_LIST.map((item) => (
          <button
            key={item.type}
            type="button"
            disabled={readOnly}
            onClick={() => onAddNodeFromPalette(item.type)}
            title={`Adicionar ${item.label}`}
            className="flex h-9 w-10 items-center justify-center rounded-lg border border-transparent transition-colors hover:border-[#CBD5E1] hover:bg-[#F1F5F9] disabled:opacity-40"
          >
            <PaletteGlyph type={item.type} />
          </button>
        ))}
      </div>

      {/* Área do Canvas */}
      <div
        className={`flowchart-dot-grid relative flex-1 overflow-hidden select-none ${
          connectMode
            ? 'cursor-crosshair'
            : isPanning
              ? 'cursor-grabbing'
              : 'cursor-grab'
        }`}
        style={{ backgroundColor }}
        onMouseDown={handleCanvasMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={stopDrag}
        onMouseLeave={stopDrag}
        onWheel={handleWheel}
      >
        {connectMode && (
          <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full bg-[#0B3B78] px-4 py-1.5 text-[12.5px] font-medium text-white shadow-md">
            {connectSourceId
              ? 'Clique no elemento de destino para concluir a conexão'
              : 'Modo Conectar: clique no elemento de origem'}
          </div>
        )}

        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            width: stageWidth,
            height: stageHeight,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          {/* Raias (Swimlanes) */}
          {laneBounds.map(({ lane, top }) => {
            const isSelectedLane = selectedLaneId === lane.id;
            return (
              <div
                key={lane.id}
                style={{
                  top,
                  left: 0,
                  width: stageWidth,
                  height: lane.height,
                }}
                className={[
                  'absolute flex border bg-white/75',
                  isSelectedLane
                    ? 'border-[#0284C7] ring-1 ring-[#0284C7]/40'
                    : 'border-[#CBD5E1]',
                ].join(' ')}
              >
                <button
                  type="button"
                  data-fc-interactive="true"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect({ kind: 'lane', id: lane.id });
                  }}
                  style={{ width: LANE_HEADER_WIDTH }}
                  title={`Raia: ${lane.name} (clique para editar)`}
                  className="flex h-full shrink-0 items-center justify-center border-r border-[#CBD5E1] bg-[#EDF1F7] text-[#334155] transition-colors hover:bg-[#E2E8F0]"
                >
                  <span className="-rotate-90 whitespace-nowrap text-[12.5px] font-semibold tracking-tight">
                    {lane.name}
                  </span>
                </button>
              </div>
            );
          })}

          {/* Camada SVG de Conexões Ortogonais */}
          <svg
            width={stageWidth}
            height={stageHeight}
            className="pointer-events-none absolute inset-0 overflow-visible"
          >
            <defs>
              <marker
                id="fc-editor-arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#1E293B" />
              </marker>
              <marker
                id="fc-editor-arrow-selected"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#0284C7" />
              </marker>
            </defs>

            {edges.map((edge) => {
              const src = nodeMap.get(edge.sourceId);
              const tgt = nodeMap.get(edge.targetId);
              if (!src || !tgt) return null;
              const { path, labelX, labelY } = computeOrthogonalEdgePath(
                src,
                tgt,
              );
              const isSelected = selectedEdgeId === edge.id;

              return (
                <g key={edge.id} className="pointer-events-auto">
                  {/* Área invisível mais larga para facilitar clique */}
                  <path
                    d={path}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={14}
                    className="cursor-pointer"
                    data-fc-interactive="true"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelect({ kind: 'edge', id: edge.id });
                    }}
                  />
                  <path
                    d={path}
                    fill="none"
                    stroke={isSelected ? '#0284C7' : '#1E293B'}
                    strokeWidth={isSelected ? 2.4 : 1.6}
                    markerEnd={
                      isSelected
                        ? 'url(#fc-editor-arrow-selected)'
                        : 'url(#fc-editor-arrow)'
                    }
                    className="pointer-events-none"
                  />

                  {edge.label?.trim() && (
                    <g
                      data-fc-interactive="true"
                      className="cursor-pointer"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect({ kind: 'edge', id: edge.id });
                      }}
                    >
                      <rect
                        x={labelX - Math.max(18, edge.label.length * 4 + 9)}
                        y={labelY - 11}
                        width={Math.max(36, edge.label.length * 8 + 18)}
                        height={22}
                        rx={6}
                        fill="#FFFFFF"
                        stroke={isSelected ? '#0284C7' : '#CBD5E1'}
                        strokeWidth={isSelected ? 1.5 : 1}
                      />
                      <text
                        x={labelX}
                        y={labelY + 4}
                        textAnchor="middle"
                        className="fill-[#334155] text-[11.5px] font-semibold"
                      >
                        {edge.label}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Camada de Nós */}
          {nodes.map((node) => {
            const meta = getNodeMeta(node.type);
            const isSelected = selectedNodeId === node.id;
            const isConnectSource = connectSourceId === node.id;
            const isEditing = editingNodeId === node.id;

            return (
              <div
                key={node.id}
                data-fc-interactive="true"
                style={{
                  left: node.x,
                  top: node.y,
                  width: node.width,
                  height: node.height,
                }}
                onMouseDown={(e) => handleNodeMouseDown(e, node)}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  startInlineEdit(node);
                }}
                className={[
                  'group absolute flex items-center justify-center',
                  connectMode ? 'cursor-crosshair' : 'cursor-move',
                ].join(' ')}
              >
                {/* Mini toolbar flutuante acima do nó selecionado (fiel às imagens!) */}
                {isSelected && !readOnly && !isEditing && (
                  <div
                    data-fc-interactive="true"
                    onMouseDown={(e) => e.stopPropagation()}
                    className="absolute -top-12 left-1/2 z-30 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-[#CBD5E1] bg-white px-2 py-1.5 shadow-lg"
                  >
                    {(['process', 'io', 'decision', 'database'] as FlowchartNodeType[]).map(
                      (quickType) => (
                        <button
                          key={quickType}
                          type="button"
                          onClick={() => onQuickAddConnected(node.id, quickType)}
                          title={`Conectar novo: ${getNodeMeta(quickType).label}`}
                          className="flex h-7 w-7 items-center justify-center rounded-md hover:bg-[#F1F5F9]"
                        >
                          <PaletteGlyph type={quickType} />
                        </button>
                      ),
                    )}
                    <span className="mx-0.5 h-4 w-px bg-[#E2E8F0]" />
                    <button
                      type="button"
                      onClick={() => startInlineEdit(node)}
                      title="Editar título"
                      className="flex h-7 w-7 items-center justify-center rounded-md text-[#475569] hover:bg-[#F1F5F9] hover:text-[#0B3B78]"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeleteNode(node.id)}
                      title="Excluir elemento"
                      className="flex h-7 w-7 items-center justify-center rounded-md text-[#64748B] hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                )}

                <NodeShapeBackground
                  node={node}
                  selected={isSelected || isConnectSource}
                />

                {/* Texto ou input inline */}
                <div
                  className={[
                    'relative z-10 flex w-full items-center justify-center px-4 text-center',
                    node.type === 'decision' ? 'px-7' : '',
                  ].join(' ')}
                  style={{ color: meta.textColor }}
                >
                  {isEditing ? (
                    <input
                      type="text"
                      value={titleDraft}
                      autoFocus
                      onChange={(e) => setTitleDraft(e.target.value)}
                      onBlur={() => {
                        setEditingNodeId(null);
                        onCommitInlineTitle(
                          node.id,
                          titleDraft.trim() || node.title,
                        );
                      }}
                      onKeyDown={(e) => {
                        e.stopPropagation();
                        if (e.key === 'Enter') {
                          setEditingNodeId(null);
                          onCommitInlineTitle(
                            node.id,
                            titleDraft.trim() || node.title,
                          );
                        } else if (e.key === 'Escape') {
                          setEditingNodeId(null);
                        }
                      }}
                      className="w-full rounded border border-[#0284C7] bg-white px-1.5 py-0.5 text-center text-[12.5px] font-semibold text-[#0F172A] outline-none"
                    />
                  ) : (
                    <span className="line-clamp-3 break-words text-[12.5px] font-semibold leading-tight">
                      {node.title}
                    </span>
                  )}
                </div>

                {/* Alça rápida na direita para iniciar conexão */}
                {!readOnly && !connectMode && (
                  <button
                    type="button"
                    data-fc-interactive="true"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onStartConnectFrom(node.id);
                    }}
                    title="Conectar a outro elemento"
                    className="absolute -right-2 top-1/2 z-20 flex h-4 w-4 -translate-y-1/2 items-center justify-center rounded-full border border-[#0B3B78] bg-white opacity-0 shadow transition-opacity group-hover:opacity-100"
                  >
                    <span className="h-1.5 w-1.5 rounded-full bg-[#0B3B78]" />
                  </button>
                )}

                {/* Subtítulo Owner abaixo do nó (igual às fotos!) */}
                {node.owner?.trim() && (
                  <div className="pointer-events-none absolute -bottom-5 left-1/2 w-max max-w-[220px] -translate-x-1/2 truncate text-[11px] text-[#64748B]">
                    {node.owner}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
