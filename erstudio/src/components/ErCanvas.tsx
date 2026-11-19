'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link2, Maximize2, Minus, Plus } from 'lucide-react';
import { ErRelation, ErSubModel, ErTable } from '@/types/erstudio';
import { formatColType, getTableCardSize } from '@/lib/er-utils';

interface ErCanvasProps {
  allTables: ErTable[];
  allRelations: ErRelation[];
  subModel: ErSubModel;
  expanded: boolean;
  readOnly: boolean;
  zoom: number;
  pan: { x: number; y: number };
  onZoomChange: (z: number) => void;
  onPanChange: (p: { x: number; y: number }) => void;
  onMoveTable: (tableId: string, x: number, y: number) => void;
  onOpenTable: (tableId: string) => void;
  onAddRelatedForTable: (tableId: string) => void;
  onRemoveRelatedForTable: (tableId: string) => void;
  onRequestNewRelation: (fromTableId: string, toTableId: string) => void;
  onOpenRelation: (relId: string) => void;
  onDeleteRelation: (relId: string) => void;
}

export function ErCanvas({
  allTables,
  allRelations,
  subModel,
  expanded,
  readOnly,
  zoom,
  pan,
  onZoomChange,
  onPanChange,
  onMoveTable,
  onOpenTable,
  onAddRelatedForTable,
  onRemoveRelatedForTable,
  onRequestNewRelation,
  onOpenRelation,
  onDeleteRelation,
}: ErCanvasProps) {
  const selectedIds = useMemo(
    () => new Set(subModel.tableIds),
    [subModel.tableIds],
  );
  const visibleTables = useMemo(
    () => allTables.filter((t) => selectedIds.has(t.id)),
    [allTables, selectedIds],
  );
  const visibleRelations = useMemo(
    () =>
      allRelations.filter(
        (r) => selectedIds.has(r.fromTableId) && selectedIds.has(r.toTableId),
      ),
    [allRelations, selectedIds],
  );

  const fkColsByTable = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const r of allRelations) {
      const s = map.get(r.fromTableId) ?? new Set<string>();
      s.add(r.fromColumn.toLowerCase());
      map.set(r.fromTableId, s);
    }
    return map;
  }, [allRelations]);

  const placed = useMemo(() => {
    return visibleTables.map((table, idx) => {
      const pos = subModel.positions[table.id] ?? {
        x: 70 + (idx % 3) * (expanded ? 470 : 340),
        y: 50 + Math.floor(idx / 3) * 280,
      };
      const size = getTableCardSize(table, expanded);
      return {
        table,
        x: pos.x,
        y: pos.y,
        width: size.width,
        height: size.height,
      };
    });
  }, [visibleTables, subModel.positions, expanded]);

  const placedMap = useMemo(
    () => new Map(placed.map((p) => [p.table.id, p])),
    [placed],
  );

  const stageSize = useMemo(() => {
    const maxX = placed.reduce((m, p) => Math.max(m, p.x + p.width + 160), 1200);
    const maxY = placed.reduce((m, p) => Math.max(m, p.y + p.height + 140), 760);
    return { width: maxX, height: maxY };
  }, [placed]);

  const containerRef = useRef<HTMLDivElement | null>(null);
  const [linkingFromId, setLinkingFromId] = useState<string | null>(null);
  const [selectedRelId, setSelectedRelId] = useState<string | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const [dragLink, setDragLink] = useState<{
    fromTableId: string;
    sx: number;
    sy: number;
    cx: number;
    cy: number;
    hoverTableId: string | null;
    moved: boolean;
  } | null>(null);

  const dragLinkRef = useRef(dragLink);
  dragLinkRef.current = dragLink;

  const dragRef = useRef<
    | { kind: 'pan'; sx: number; sy: number; ox: number; oy: number }
    | { kind: 'table'; tableId: string; sx: number; sy: number; ox: number; oy: number }
    | { kind: 'link'; fromTableId: string; sx: number; sy: number; fromButton?: boolean }
    | null
  >(null);

  const clientToStage = (clientX: number, clientY: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: (clientX - rect.left - pan.x) / zoom,
      y: (clientY - rect.top - pan.y) / zoom,
    };
  };

  const findTableAtPoint = (
    sx: number,
    sy: number,
    excludeId: string,
  ): string | null => {
    const pad = 10;
    for (let i = placed.length - 1; i >= 0; i--) {
      const p = placed[i];
      if (p.table.id === excludeId) continue;
      if (
        sx >= p.x - pad &&
        sx <= p.x + p.width + pad &&
        sy >= p.y - pad &&
        sy <= p.y + p.height + pad
      ) {
        return p.table.id;
      }
    }
    return null;
  };

  const startDragLink = (
    tableId: string,
    anchorX: number,
    anchorY: number,
    e: React.MouseEvent,
    fromButton = false,
  ) => {
    if (readOnly || e.button !== 0) return;
    e.stopPropagation();
    e.preventDefault();
    setSelectedRelId(null);
    setLinkingFromId(null);
    const pt = clientToStage(e.clientX, e.clientY);
    dragRef.current = {
      kind: 'link',
      fromTableId: tableId,
      sx: anchorX,
      sy: anchorY,
      fromButton,
    };
    setDragLink({
      fromTableId: tableId,
      sx: anchorX,
      sy: anchorY,
      cx: pt.x,
      cy: pt.y,
      hoverTableId: null,
      moved: false,
    });
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        dragRef.current = null;
        setDragLink(null);
        setLinkingFromId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const countHiddenRelated = (tableId: string): number => {
    const relatedIds = new Set<string>();
    for (const r of allRelations) {
      if (r.fromTableId === tableId) relatedIds.add(r.toTableId);
      if (r.toTableId === tableId) relatedIds.add(r.fromTableId);
    }
    let hidden = 0;
    relatedIds.forEach((id) => {
      if (!selectedIds.has(id)) hidden++;
    });
    return hidden;
  };

  const countVisibleRelated = (tableId: string): number => {
    const relatedIds = new Set<string>();
    for (const r of allRelations) {
      if (r.fromTableId === tableId && selectedIds.has(r.toTableId)) {
        relatedIds.add(r.toTableId);
      }
      if (r.toTableId === tableId && selectedIds.has(r.fromTableId)) {
        relatedIds.add(r.fromTableId);
      }
    }
    return relatedIds.size;
  };

  const handleCanvasDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-er-interactive="true"]')) {
      return;
    }
    setSelectedRelId(null);
    setLinkingFromId(null);
    setIsPanning(true);
    dragRef.current = {
      kind: 'pan',
      sx: e.clientX,
      sy: e.clientY,
      ox: pan.x,
      oy: pan.y,
    };
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    if (d.kind === 'pan') {
      onPanChange({
        x: d.ox + (e.clientX - d.sx),
        y: d.oy + (e.clientY - d.sy),
      });
    } else if (d.kind === 'table') {
      const nx = Math.max(20, Math.round(d.ox + (e.clientX - d.sx) / zoom));
      const ny = Math.max(20, Math.round(d.oy + (e.clientY - d.sy) / zoom));
      onMoveTable(d.tableId, nx, ny);
    } else if (d.kind === 'link') {
      const pt = clientToStage(e.clientX, e.clientY);
      const hoverTableId = findTableAtPoint(pt.x, pt.y, d.fromTableId);
      const moved = Math.hypot(pt.x - d.sx, pt.y - d.sy) > 8;
      setDragLink({
        fromTableId: d.fromTableId,
        sx: d.sx,
        sy: d.sy,
        cx: pt.x,
        cy: pt.y,
        hoverTableId,
        moved,
      });
    }
  };

  const stopDrag = () => {
    const d = dragRef.current;
    const currentLink = dragLinkRef.current;
    dragRef.current = null;
    setIsPanning(false);

    if (d?.kind === 'link') {
      setDragLink(null);
      if (
        currentLink?.hoverTableId &&
        currentLink.hoverTableId !== d.fromTableId
      ) {
        onRequestNewRelation(d.fromTableId, currentLink.hoverTableId);
      } else if (d.fromButton && !currentLink?.moved) {
        // Se apenas clicou no ícone Link2 sem arrastar, ativa modo clique-para-ligar
        setLinkingFromId(d.fromTableId);
      }
    }
  };

  return (
    <div
      ref={containerRef}
      className={`er-dot-grid relative flex-1 overflow-hidden select-none ${
        linkingFromId || dragLink
          ? 'cursor-crosshair'
          : isPanning
            ? 'cursor-grabbing'
            : 'cursor-grab'
      }`}
      onMouseDown={handleCanvasDown}
      onMouseMove={handleMouseMove}
      onMouseUp={stopDrag}
      onMouseLeave={stopDrag}
      onWheel={(e) => {
        if (e.ctrlKey || e.metaKey) {
          e.preventDefault();
          const delta = e.deltaY < 0 ? 0.1 : -0.1;
          onZoomChange(
            Math.min(1.8, Math.max(0.4, Number((zoom + delta).toFixed(2)))),
          );
        }
      }}
    >
      {(linkingFromId || dragLink) && (
        <div className="pointer-events-none absolute left-1/2 top-3 z-30 -translate-x-1/2 rounded-full bg-[#0F1D3D] px-4 py-1.5 text-[12.5px] font-medium text-white shadow-md">
          {dragLink
            ? dragLink.hoverTableId
              ? 'Solte sobre a tabela destacada para criar o relacionamento FK'
              : 'Arraste a linha até a tabela pai (referenciada) e solte (ESC para cancelar)'
            : 'Clique na tabela pai (referenciada) para criar o relacionamento FK (ESC para cancelar)'}
        </div>
      )}

      {visibleTables.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center px-6 text-center">
          <h3 className="text-[18px] font-bold text-[#0F172A]">
            Nenhuma tabela neste SubModel
          </h3>
          <p className="mt-1.5 max-w-[440px] text-[14px] text-[#64748B]">
            Marque tabelas na aba <strong>Tabelas</strong>, leia o DDL na aba{' '}
            <strong>Origem</strong> ou use <strong>+ Nova tabela</strong> /{' '}
            <strong>Assistente</strong> para começar a modelar.
          </p>
        </div>
      ) : (
        <div
          className="absolute left-0 top-0 origin-top-left"
          style={{
            width: stageSize.width,
            height: stageSize.height,
            transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
          }}
        >
          {/* Linhas de relacionamento FK */}
          <svg
            width={stageSize.width}
            height={stageSize.height}
            className="pointer-events-none absolute inset-0 overflow-visible"
          >
            <defs>
              <marker
                id="er-canvas-arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#1E3A5F" />
              </marker>
              <marker
                id="er-canvas-arrow-sel"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto-start-reverse"
              >
                <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#1D5FD6" />
              </marker>
            </defs>

            {visibleRelations.map((rel) => {
              const from = placedMap.get(rel.fromTableId);
              const to = placedMap.get(rel.toTableId);
              if (!from || !to) return null;

              const fromLeftOfTo = from.x + from.width <= to.x + 12;
              const sx = fromLeftOfTo ? from.x + from.width : from.x;
              const sy = from.y + Math.min(from.height - 20, 62);
              const ex = fromLeftOfTo ? to.x : to.x + to.width;
              const ey = to.y + Math.min(to.height - 20, 62);
              const midX = Math.round((sx + ex) / 2);
              const d = `M ${sx} ${sy} L ${midX} ${sy} L ${midX} ${ey} L ${ex} ${ey}`;
              const isSelected = selectedRelId === rel.id;

              return (
                <g key={rel.id} className="pointer-events-auto">
                  <path
                    d={d}
                    fill="none"
                    stroke="transparent"
                    strokeWidth={18}
                    className="cursor-pointer"
                    data-er-interactive="true"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedRelId(rel.id);
                    }}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setSelectedRelId(null);
                      onOpenRelation(rel.id);
                    }}
                  >
                    <title>
                      {rel.name} ({rel.cardinality}) — duplo clique para abrir
                      relacionamento
                    </title>
                  </path>
                  <path
                    d={d}
                    fill="none"
                    stroke={isSelected ? '#1D5FD6' : '#1E3A5F'}
                    strokeWidth={isSelected ? 2.4 : 1.6}
                    strokeDasharray={rel.optional ? '5 4' : undefined}
                    markerEnd={
                      isSelected
                        ? 'url(#er-canvas-arrow-sel)'
                        : 'url(#er-canvas-arrow)'
                    }
                    className="pointer-events-none"
                  />
                  {isSelected && (
                    <foreignObject
                      x={midX - 96}
                      y={Math.round((sy + ey) / 2) - 18}
                      width={192}
                      height={36}
                    >
                      <div
                        data-er-interactive="true"
                        onMouseDown={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => {
                          e.stopPropagation();
                          setSelectedRelId(null);
                          onOpenRelation(rel.id);
                        }}
                        className="flex items-center justify-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-2 py-1 text-[11px] shadow-md"
                      >
                        <span className="truncate font-semibold text-[#0F1D3D]">
                          {rel.cardinality}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedRelId(null);
                            onOpenRelation(rel.id);
                          }}
                          className="rounded bg-[#EFF6FF] px-1.5 py-0.5 font-semibold text-[#1D5FD6] hover:bg-[#DBEAFE]"
                        >
                          Editar
                        </button>
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onDeleteRelation(rel.id);
                              setSelectedRelId(null);
                            }}
                            className="rounded bg-red-50 px-1.5 py-0.5 font-semibold text-red-600 hover:bg-red-100"
                          >
                            Remover
                          </button>
                        )}
                      </div>
                    </foreignObject>
                  )}
                </g>
              );
            })}
          </svg>

          {/* Cards das Tabelas */}
          {placed.map(({ table, x, y, width, height }) => {
            const fkSet = fkColsByTable.get(table.id) ?? new Set<string>();
            const hiddenRel = countHiddenRelated(table.id);
            const visibleRel = countVisibleRelated(table.id);
            const isDragSource = dragLink?.fromTableId === table.id;
            const isDragTarget = dragLink?.hoverTableId === table.id;

            return (
              <div
                key={table.id}
                data-er-interactive="true"
                style={{ left: x, top: y, width }}
                onClick={(e) => {
                  e.stopPropagation();
                  if (linkingFromId) {
                    if (linkingFromId !== table.id) {
                      onRequestNewRelation(linkingFromId, table.id);
                    }
                    setLinkingFromId(null);
                  }
                }}
                onDoubleClick={(e) => {
                  e.stopPropagation();
                  onOpenTable(table.id);
                }}
                className={[
                  'group absolute rounded-xl border bg-white shadow-[0_6px_20px_rgba(15,29,61,0.1)] transition-shadow',
                  isDragTarget
                    ? 'border-[#1D5FD6] ring-4 ring-[#1D5FD6]/30 shadow-[0_12px_28px_rgba(29,95,214,0.22)]'
                    : linkingFromId === table.id || isDragSource
                      ? 'border-[#1D5FD6] ring-2 ring-[#1D5FD6]/40'
                      : 'border-[#CBD5E1] hover:shadow-[0_10px_24px_rgba(15,29,61,0.14)]',
                ].join(' ')}
              >
                {/* Badge flutuante quando a tabela é alvo do arrasto */}
                {isDragTarget && (
                  <div className="pointer-events-none absolute -top-7 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-full bg-[#1D5FD6] px-2.5 py-0.5 text-[11px] font-bold text-white shadow">
                    Solte para conectar
                  </div>
                )}

                {/* Pontos de conexão (handles) nas 4 bordas para arrastar linha entre tabelas */}
                {!readOnly && (
                  <>
                    <button
                      type="button"
                      aria-label={`Conectar a partir da borda esquerda de ${table.name}`}
                      title="Arraste até outra tabela para criar relacionamento"
                      onMouseDown={(e) =>
                        startDragLink(table.id, x, y + Math.round(height / 2), e)
                      }
                      className="absolute -left-2 top-1/2 z-20 h-4 w-4 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-[#1D5FD6] bg-white opacity-60 shadow-sm transition-all hover:scale-125 hover:bg-[#1D5FD6] group-hover:opacity-100"
                    />
                    <button
                      type="button"
                      aria-label={`Conectar a partir da borda direita de ${table.name}`}
                      title="Arraste até outra tabela para criar relacionamento"
                      onMouseDown={(e) =>
                        startDragLink(
                          table.id,
                          x + width,
                          y + Math.round(height / 2),
                          e,
                        )
                      }
                      className="absolute -right-2 top-1/2 z-20 h-4 w-4 -translate-y-1/2 cursor-crosshair rounded-full border-2 border-[#1D5FD6] bg-white opacity-60 shadow-sm transition-all hover:scale-125 hover:bg-[#1D5FD6] group-hover:opacity-100"
                    />
                    <button
                      type="button"
                      aria-label={`Conectar a partir do topo de ${table.name}`}
                      title="Arraste até outra tabela para criar relacionamento"
                      onMouseDown={(e) =>
                        startDragLink(table.id, x + Math.round(width / 2), y, e)
                      }
                      className="absolute -top-2 left-1/2 z-20 h-4 w-4 -translate-x-1/2 cursor-crosshair rounded-full border-2 border-[#1D5FD6] bg-white opacity-60 shadow-sm transition-all hover:scale-125 hover:bg-[#1D5FD6] group-hover:opacity-100"
                    />
                    <button
                      type="button"
                      aria-label={`Conectar a partir da base de ${table.name}`}
                      title="Arraste até outra tabela para criar relacionamento"
                      onMouseDown={(e) =>
                        startDragLink(
                          table.id,
                          x + Math.round(width / 2),
                          y + height,
                          e,
                        )
                      }
                      className="absolute -bottom-2 left-1/2 z-20 h-4 w-4 -translate-x-1/2 cursor-crosshair rounded-full border-2 border-[#1D5FD6] bg-white opacity-60 shadow-sm transition-all hover:scale-125 hover:bg-[#1D5FD6] group-hover:opacity-100"
                    />
                  </>
                )}

                <div className="overflow-hidden rounded-[11px]">
                {/* Cabeçalho dark-navy arrastável (igual às imagens!) */}
                <div
                  onMouseDown={(e) => {
                    if (e.button !== 0 || linkingFromId || readOnly) return;
                    if ((e.target as HTMLElement).closest('button')) return;
                    e.stopPropagation();
                    dragRef.current = {
                      kind: 'table',
                      tableId: table.id,
                      sx: e.clientX,
                      sy: e.clientY,
                      ox: x,
                      oy: y,
                    };
                  }}
                  className="flex cursor-move items-center justify-between gap-2 bg-[#0F1D3D] px-3 py-2 text-white"
                >
                  <span
                    className="truncate text-[12.5px] font-bold tracking-tight"
                    title={`${table.name} (duplo clique para editar colunas)`}
                  >
                    {table.name}
                  </span>

                  <div className="flex shrink-0 items-center gap-1">
                    {!readOnly && (
                      <button
                        type="button"
                        onMouseDown={(e) =>
                          startDragLink(
                            table.id,
                            x + width,
                            y + 20,
                            e,
                            true,
                          )
                        }
                        title="Arraste (ou clique) para criar relacionamento FK com outra tabela"
                        className="flex h-5 w-5 cursor-crosshair items-center justify-center rounded-full bg-white/15 text-blue-100 hover:bg-[#2563EB] hover:text-white"
                      >
                        <Link2 className="h-3 w-3" />
                      </button>
                    )}
                    {visibleRel > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onRemoveRelatedForTable(table.id);
                        }}
                        title={`Ocultar ${visibleRel} tabela(s) relacionada(s) do SubModel`}
                        className="rounded-full bg-white/15 px-1.5 py-0.5 text-[10px] font-bold text-blue-100 hover:bg-white/25"
                      >
                        -{visibleRel}
                      </button>
                    )}
                    {hiddenRel > 0 && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onAddRelatedForTable(table.id);
                        }}
                        title={`Trazer +${hiddenRel} tabela(s) relacionada(s) para o SubModel`}
                        className="rounded-full bg-[#2563EB] px-1.5 py-0.5 text-[10px] font-bold text-white hover:bg-[#1D4ED8]"
                      >
                        +{hiddenRel}
                      </button>
                    )}
                  </div>
                </div>

                {/* Cabeçalho de colunas quando modo Nulo/Identity/Default está ativo */}
                {expanded && (
                  <div className="grid grid-cols-[1fr_92px_62px_26px_74px] gap-1 border-b border-[#E2E8F0] bg-[#F1F5F9] px-2.5 py-1 text-[9.5px] font-bold uppercase tracking-wide text-[#64748B]">
                    <span>Campo</span>
                    <span>Tipo</span>
                    <span>Nulo</span>
                    <span>ID</span>
                    <span>Default</span>
                  </div>
                )}

                {/* Linhas de colunas */}
                <div className="divide-y divide-[#F1F5F9]">
                  {table.columns.map((col) => {
                    const isFk = fkSet.has(col.name.toLowerCase());
                    return expanded ? (
                      <div
                        key={col.id}
                        className={[
                          'grid grid-cols-[1fr_92px_62px_26px_74px] items-center gap-1 px-2.5 py-1 text-[11px]',
                          col.primaryKey ? 'bg-[#FEF7DC]' : 'bg-white',
                        ].join(' ')}
                      >
                        <div className="flex min-w-0 items-center gap-1">
                          {col.primaryKey && (
                            <span className="shrink-0 text-[9.5px] font-extrabold text-[#B45309]">
                              PK
                            </span>
                          )}
                          {isFk && (
                            <span className="shrink-0 text-[9.5px] font-extrabold text-[#2563EB]">
                              FK
                            </span>
                          )}
                          <span
                            className={`truncate ${col.primaryKey ? 'font-bold text-[#0F172A]' : 'font-medium text-[#1E293B]'}`}
                            title={col.name}
                          >
                            {col.name}
                          </span>
                        </div>
                        <span className="truncate font-mono text-[10.5px] text-[#475569]">
                          {formatColType(col)}
                        </span>
                        <span className="text-[10px] text-[#64748B]">
                          {col.nullable ? 'NULL' : 'NOT NULL'}
                        </span>
                        <span className="text-[10px] font-bold text-[#0F766E]">
                          {col.identity ? 'ID' : ''}
                        </span>
                        <span
                          className="truncate font-mono text-[10px] text-[#64748B]"
                          title={col.defaultValue ?? ''}
                        >
                          {col.defaultValue ?? ''}
                        </span>
                      </div>
                    ) : (
                      <div
                        key={col.id}
                        className={[
                          'flex items-center justify-between gap-2 px-2.5 py-1 text-[11.5px]',
                          col.primaryKey ? 'bg-[#FEF7DC]' : 'bg-white',
                        ].join(' ')}
                      >
                        <div className="flex min-w-0 items-center gap-1">
                          {col.primaryKey && (
                            <span className="shrink-0 text-[9.5px] font-extrabold text-[#B45309]">
                              PK
                            </span>
                          )}
                          {isFk && (
                            <span className="shrink-0 text-[9.5px] font-extrabold text-[#2563EB]">
                              FK
                            </span>
                          )}
                          <span
                            className={`truncate ${col.primaryKey ? 'font-bold text-[#0F172A]' : 'font-medium text-[#1E293B]'}`}
                            title={col.name}
                          >
                            {col.name}
                          </span>
                        </div>
                        <span className="shrink-0 font-mono text-[10.5px] text-[#475569]">
                          {formatColType(col)}
                        </span>
                      </div>
                    );
                  })}
                </div>
                </div>
              </div>
            );
          })}

          {/* Linha dinâmica de arrasto para criação de relacionamento */}
          {dragLink && (
            <svg
              width={stageSize.width}
              height={stageSize.height}
              className="pointer-events-none absolute inset-0 z-30 overflow-visible"
            >
              <defs>
                <marker
                  id="er-drag-arrow"
                  viewBox="0 0 10 10"
                  refX="8"
                  refY="5"
                  markerWidth="7"
                  markerHeight="7"
                  orient="auto-start-reverse"
                >
                  <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#1D5FD6" />
                </marker>
              </defs>
              {(() => {
                const dx = dragLink.cx - dragLink.sx;
                const bend = Math.max(40, Math.abs(dx) * 0.45);
                const c1x = dragLink.sx + (dx >= 0 ? bend : -bend);
                const c2x = dragLink.cx - (dx >= 0 ? bend : -bend);
                const pathD = `M ${dragLink.sx} ${dragLink.sy} C ${c1x} ${dragLink.sy}, ${c2x} ${dragLink.cy}, ${dragLink.cx} ${dragLink.cy}`;
                return (
                  <>
                    <path
                      d={pathD}
                      fill="none"
                      stroke="#1D5FD6"
                      strokeWidth={2.5}
                      strokeDasharray="6 4"
                      markerEnd="url(#er-drag-arrow)"
                    />
                    <circle
                      cx={dragLink.sx}
                      cy={dragLink.sy}
                      r={4.5}
                      fill="#1D5FD6"
                    />
                    <circle
                      cx={dragLink.cx}
                      cy={dragLink.cy}
                      r={dragLink.hoverTableId ? 6 : 4}
                      fill={dragLink.hoverTableId ? '#1D5FD6' : '#FFFFFF'}
                      stroke="#1D5FD6"
                      strokeWidth={2}
                    />
                  </>
                );
              })()}
            </svg>
          )}
        </div>
      )}

      {/* Controles flutuantes de Zoom à esquerda inferior (igual às imagens!) */}
      <div
        data-er-interactive="true"
        className="absolute bottom-4 left-4 z-20 flex flex-col overflow-hidden rounded-lg border border-[#CBD5E1] bg-white shadow-md"
      >
        <button
          type="button"
          onClick={() =>
            onZoomChange(Math.min(1.8, Number((zoom + 0.1).toFixed(2))))
          }
          title="Aumentar zoom"
          className="flex h-8 w-8 items-center justify-center border-b border-[#E2E8F0] text-[#334155] hover:bg-[#F1F5F9]"
        >
          <Plus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() =>
            onZoomChange(Math.max(0.4, Number((zoom - 0.1).toFixed(2))))
          }
          title="Diminuir zoom"
          className="flex h-8 w-8 items-center justify-center border-b border-[#E2E8F0] text-[#334155] hover:bg-[#F1F5F9]"
        >
          <Minus className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => {
            onZoomChange(1);
            onPanChange({ x: 24, y: 24 });
          }}
          title="Centralizar (100%)"
          className="flex h-8 w-8 items-center justify-center text-[#334155] hover:bg-[#F1F5F9]"
        >
          <Maximize2 className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Minimapa no canto inferior direito (igual às imagens!) */}
      {placed.length > 0 && (
        <div
          data-er-interactive="true"
          className="pointer-events-none absolute bottom-4 right-4 z-20 overflow-hidden rounded-lg border border-[#CBD5E1] bg-white/90 p-2 shadow-md"
        >
          <svg
            width={136}
            height={88}
            viewBox={`0 0 ${stageSize.width} ${stageSize.height}`}
          >
            {placed.map((p) => (
              <rect
                key={p.table.id}
                x={p.x}
                y={p.y}
                width={p.width}
                height={p.height}
                rx={18}
                fill="#0F1D3D"
                opacity={0.85}
              />
            ))}
          </svg>
        </div>
      )}
    </div>
  );
}
