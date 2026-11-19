import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, FileText, MessageSquare, Minus, Plus } from 'lucide-react';
import { MindMapExecutor, MindMapNode } from '../types/mindmap';
import { computeMindMapLayout, getNodePalette } from '../lib/layout';

interface MindMapCanvasProps {
  root: MindMapNode;
  backgroundColor: string;
  executors: MindMapExecutor[];
  selectedNodeId: string | null;
  editingNodeId: string | null;
  zoom: number;
  pan: { x: number; y: number };
  onPanChange: (next: { x: number; y: number }) => void;
  onZoomChange: (nextZoom: number) => void;
  onSelectNode: (id: string | null) => void;
  onStartEditNode: (id: string) => void;
  onCommitEditNode: (id: string, text: string) => void;
  onCancelEditNode: () => void;
  onToggleCollapse: (id: string) => void;
  onOpenCommentsForNode: (id: string) => void;
  onOpenDetailsForNode: (id: string) => void;
}

export function MindMapCanvas({
  root,
  backgroundColor,
  executors,
  selectedNodeId,
  editingNodeId,
  zoom,
  pan,
  onPanChange,
  onZoomChange,
  onSelectNode,
  onStartEditNode,
  onCommitEditNode,
  onCancelEditNode,
  onToggleCollapse,
  onOpenCommentsForNode,
  onOpenDetailsForNode,
}: MindMapCanvasProps) {
  const layout = useMemo(() => computeMindMapLayout(root), [root]);
  const executorById = useMemo(
    () => new Map(executors.map((e) => [e.id, e.name])),
    [executors],
  );

  const [draftText, setDraftText] = useState('');
  const [dragging, setDragging] = useState(false);
  const dragOrigin = useRef<{ x: number; y: number; panX: number; panY: number } | null>(
    null,
  );
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (editingNodeId) {
      const target = layout.nodes.find((item) => item.id === editingNodeId);
      setDraftText(target?.node.text ?? '');
      requestAnimationFrame(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      });
    }
  }, [editingNodeId, layout.nodes]);

  const handleMouseDown = (event: React.MouseEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    if ((event.target as HTMLElement).closest('[data-mindmap-node="true"]')) {
      return;
    }
    onSelectNode(null);
    setDragging(true);
    dragOrigin.current = {
      x: event.clientX,
      y: event.clientY,
      panX: pan.x,
      panY: pan.y,
    };
  };

  const handleMouseMove = (event: React.MouseEvent<HTMLDivElement>) => {
    if (!dragging || !dragOrigin.current) return;
    onPanChange({
      x: dragOrigin.current.panX + (event.clientX - dragOrigin.current.x),
      y: dragOrigin.current.panY + (event.clientY - dragOrigin.current.y),
    });
  };

  const stopDragging = () => {
    setDragging(false);
    dragOrigin.current = null;
  };

  const handleWheel = (event: React.WheelEvent<HTMLDivElement>) => {
    if (event.ctrlKey || event.metaKey) {
      event.preventDefault();
      const delta = event.deltaY < 0 ? 0.1 : -0.1;
      onZoomChange(Math.min(2, Math.max(0.4, Number((zoom + delta).toFixed(2)))));
    }
  };

  return (
    <div
      className={`mindmap-dot-grid relative flex-1 overflow-hidden select-none ${
        dragging ? 'cursor-grabbing' : 'cursor-grab'
      }`}
      style={{ backgroundColor }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={stopDragging}
      onMouseLeave={stopDragging}
      onWheel={handleWheel}
    >
      <div
        className="absolute left-0 top-0 origin-top-left"
        style={{
          width: layout.width,
          height: layout.height,
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
        }}
      >
        {/* Curvas Bézier conectando os nós */}
        <svg
          width={layout.width}
          height={layout.height}
          className="pointer-events-none absolute inset-0 overflow-visible"
        >
          {layout.edges.map((edge) => (
            <path
              key={edge.id}
              d={edge.path}
              fill="none"
              stroke={edge.stroke}
              strokeWidth={2}
              strokeLinecap="round"
            />
          ))}
        </svg>

        {/* Nós */}
        {layout.nodes.map((item) => {
          const palette = getNodePalette(item.depth);
          const isSelected = selectedNodeId === item.id;
          const isEditing = editingNodeId === item.id;
          const hasNotes = Boolean(item.node.notes?.trim());
          const commentsCount = item.node.comments?.length ?? 0;
          const hasChildren = item.node.children.length > 0;
          const executorName = item.node.executorId
            ? executorById.get(item.node.executorId)
            : null;

          return (
            <div
              key={item.id}
              data-mindmap-node="true"
              style={{
                left: item.x,
                top: item.y,
                width: item.width,
                minHeight: item.height,
                backgroundColor: palette.bg,
                borderColor: isSelected ? '#0B3B78' : palette.border,
                color: palette.text,
              }}
              onClick={(e) => {
                e.stopPropagation();
                onSelectNode(item.id);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                onStartEditNode(item.id);
              }}
              className={[
                'absolute flex cursor-pointer items-center rounded-xl border-[1.8px] px-4 py-2 transition-shadow',
                item.depth === 0
                  ? 'justify-center text-center shadow-md'
                  : 'justify-start text-left shadow-[0_1px_3px_rgba(15,23,42,0.06)]',
                isSelected
                  ? 'ring-2 ring-[#1976D2]/45 shadow-md'
                  : 'hover:shadow-md',
              ].join(' ')}
            >
              {/* Indicadores superiores discretos (notas / comentários) */}
              {(hasNotes || commentsCount > 0) && (
                <div className="absolute -top-3 left-2 flex items-center gap-1">
                  {hasNotes && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenDetailsForNode(item.id);
                      }}
                      title="Ver notas do item"
                      className="flex h-[20px] w-[20px] items-center justify-center rounded-full border border-[#CBD5E1] bg-white text-[#475569] shadow-sm transition-colors hover:border-[#0B3B78] hover:text-[#0B3B78]"
                    >
                      <FileText className="h-3 w-3" />
                    </button>
                  )}
                  {commentsCount > 0 && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenCommentsForNode(item.id);
                      }}
                      title={`${commentsCount} comentário(s)`}
                      className="flex h-[20px] min-w-[20px] items-center justify-center gap-0.5 rounded-full border border-[#CBD5E1] bg-white px-1 text-[10px] font-semibold text-[#475569] shadow-sm transition-colors hover:border-[#0B3B78] hover:text-[#0B3B78]"
                    >
                      <MessageSquare className="h-2.5 w-2.5" />
                      {commentsCount > 1 && <span>{commentsCount}</span>}
                    </button>
                  )}
                </div>
              )}

              {/* Conteúdo do nó ou input inline */}
              <div className="flex w-full items-center gap-2">
                {item.node.completed && (
                  <span
                    className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"
                    title="Tarefa concluída"
                  >
                    <Check className="h-3 w-3" />
                  </span>
                )}

                {isEditing ? (
                  <input
                    ref={inputRef}
                    type="text"
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    onBlur={() =>
                      onCommitEditNode(
                        item.id,
                        draftText.trim() || item.node.text,
                      )
                    }
                    onKeyDown={(e) => {
                      e.stopPropagation();
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        onCommitEditNode(
                          item.id,
                          draftText.trim() || item.node.text,
                        );
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        onCancelEditNode();
                      }
                    }}
                    className={[
                      'w-full rounded px-1 py-0.5 text-[13.5px] outline-none ring-1 ring-[#1976D2]',
                      item.depth === 0
                        ? 'bg-[#123B7A] text-center font-bold text-white'
                        : 'bg-white text-[#0F172A]',
                    ].join(' ')}
                  />
                ) : (
                  <div className="min-w-0 flex-1">
                    <div
                      className={[
                        'break-words leading-snug',
                        item.depth === 0
                          ? 'text-[15px] font-bold'
                          : 'text-[13.5px] font-medium',
                        item.node.completed ? 'line-through opacity-75' : '',
                      ].join(' ')}
                    >
                      {item.node.text}
                    </div>
                    {executorName && (
                      <div className="mt-0.5 text-[11px] opacity-75">
                        {executorName}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Botão circular de colapsar / expandir subárvore */}
              {hasChildren && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleCollapse(item.id);
                  }}
                  title={
                    item.node.collapsed
                      ? `Expandir (${item.node.children.length})`
                      : 'Recolher sub-itens'
                  }
                  className="absolute -right-3 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full border border-[#127A7D] bg-white text-[#0F2937] shadow-sm transition-transform hover:scale-110"
                >
                  {item.node.collapsed ? (
                    <Plus className="h-3.5 w-3.5" />
                  ) : (
                    <Minus className="h-3.5 w-3.5" />
                  )}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
