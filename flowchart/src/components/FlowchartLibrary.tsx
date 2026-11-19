'use client';

import React from 'react';
import {
  Archive,
  ArchiveRestore,
  Copy,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { FlowchartSummary } from '@/types/flowchart';
import {
  formatDateTime,
  formatRoleLabel,
  formatStatusLabel,
} from '@/lib/flowchart-utils';

export type LibraryScope = 'mine' | 'shared' | 'archived';

interface FlowchartLibraryProps {
  userName: string;
  items: FlowchartSummary[];
  loading: boolean;
  error: string | null;
  scope: LibraryScope;
  search: string;
  statusFilter: string;
  onScopeChange: (scope: LibraryScope) => void;
  onSearchChange: (q: string) => void;
  onStatusFilterChange: (status: string) => void;
  onRefresh: () => void;
  onOpen: (id: string) => void;
  onCreateNew: () => void;
  onOpenAi: () => void;
  onDuplicate: (id: string) => void;
  onToggleArchive: (item: FlowchartSummary) => void;
  onDelete: (id: string, name: string) => void;
}

export function FlowchartLibrary({
  userName,
  items,
  loading,
  error,
  scope,
  search,
  statusFilter,
  onScopeChange,
  onSearchChange,
  onStatusFilterChange,
  onRefresh,
  onOpen,
  onCreateNew,
  onOpenAi,
  onDuplicate,
  onToggleArchive,
  onDelete,
}: FlowchartLibraryProps) {
  const tabs: Array<{ id: LibraryScope; label: string }> = [
    { id: 'mine', label: 'Meus modelos' },
    { id: 'shared', label: 'Compartilhados comigo' },
    { id: 'archived', label: 'Arquivados' },
  ];

  return (
    <main className="mx-auto w-full max-w-[1320px] flex-1 overflow-y-auto px-6 py-8 sm:px-8">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight text-[#0C2340]">
          Biblioteca de fluxogramas
        </h1>
        <p className="mt-1 text-[14px] text-[#64748B]">
          Olá, {userName}. Abra um processo para modelar, documentar e compartilhar.
        </p>
      </div>

      {/* 3 Abas fiéis à imagem */}
      <div className="mt-6 flex items-center gap-6 border-b border-[#E2E8F0]">
        {tabs.map((tab) => {
          const active = scope === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => onScopeChange(tab.id)}
              className={[
                'pb-2.5 text-[14px] transition-colors',
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

      {/* Filtros e ações */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar por nome, descrição ou tag"
            className="h-10 w-full rounded-lg border border-[#CBD5E1] bg-white pl-9 pr-3 text-[14px] text-[#0F172A] outline-none placeholder:text-[#94A3B8] focus:border-[#0B3B78]"
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => onStatusFilterChange(e.target.value)}
          className="h-10 rounded-lg border border-[#CBD5E1] bg-white px-3 text-[13.5px] text-[#334155] outline-none focus:border-[#0B3B78]"
        >
          <option value="all">Todos os estados</option>
          <option value="draft">Rascunho</option>
          <option value="review">Em revisão</option>
          <option value="published">Publicado</option>
        </select>

        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-3.5 text-[13.5px] font-medium text-[#334155] hover:bg-[#F8FAFC]"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>

        <button
          type="button"
          onClick={onOpenAi}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[#BFDBFE] bg-[#EFF6FF] px-3.5 text-[13.5px] font-semibold text-[#0B3B78] transition-colors hover:border-[#0B3B78] hover:bg-[#DBEAFE]"
        >
          <Sparkles className="h-4 w-4" />
          IA
        </button>

        <button
          type="button"
          onClick={onCreateNew}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#0B3B78] px-4 text-[13.5px] font-semibold text-white transition-colors hover:bg-[#092E5F]"
        >
          <Plus className="h-4 w-4" />
          Novo fluxograma
        </button>
      </div>

      {error && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-700">
          {error}
        </div>
      )}

      {/* Tabela */}
      <div className="mt-5 overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-[#F8FAFC] text-[12.5px] font-semibold text-[#475569]">
                <th className="px-5 py-3.5">Nome</th>
                <th className="px-5 py-3.5">Descrição</th>
                <th className="px-5 py-3.5">Proprietário</th>
                <th className="px-5 py-3.5">Estado</th>
                <th className="px-5 py-3.5">Seu papel</th>
                <th className="px-5 py-3.5">Última alteração</th>
                <th className="px-5 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF2F6] text-[14px]">
              {loading && items.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-10 text-center text-[#64748B]"
                  >
                    Carregando fluxogramas...
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-10 text-center text-[#64748B]"
                  >
                    Nenhum fluxograma encontrado. Clique em <strong>IA</strong> para gerar a partir de texto corrido ou em <strong>Novo fluxograma</strong>.
                  </td>
                </tr>
              ) : (
                items.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => onOpen(item.id)}
                    className="group cursor-pointer transition-colors hover:bg-[#F1F6FC]"
                  >
                    <td className="px-5 py-4 font-semibold text-[#0F172A] group-hover:text-[#0B3B78]">
                      {item.name}
                    </td>
                    <td className="max-w-[280px] truncate px-5 py-4 text-[13.5px] text-[#64748B]">
                      {item.description || '—'}
                    </td>
                    <td className="px-5 py-4 text-[#475569]">{item.owner}</td>
                    <td className="px-5 py-4">
                      <span
                        className={[
                          'inline-flex rounded-full px-2.5 py-0.5 text-[12px] font-medium',
                          item.status === 'published'
                            ? 'bg-emerald-50 text-emerald-700'
                            : item.status === 'review'
                              ? 'bg-amber-50 text-amber-700'
                              : 'bg-[#EEF2F7] text-[#475569]',
                        ].join(' ')}
                      >
                        {formatStatusLabel(item.status)}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-[#475569]">
                      {formatRoleLabel(item.accessLevel)}
                    </td>
                    <td className="px-5 py-4 text-[#475569]">
                      {formatDateTime(item.updatedAt)}
                    </td>
                    <td
                      className="px-5 py-4 text-right"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => onDuplicate(item.id)}
                          title="Duplicar"
                          className="rounded-md p-1.5 text-[#64748B] hover:bg-white hover:text-[#0B3B78]"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        {item.accessLevel === 'owner' && (
                          <>
                            <button
                              type="button"
                              onClick={() => onToggleArchive(item)}
                              title={item.archived ? 'Restaurar' : 'Arquivar'}
                              className="rounded-md p-1.5 text-[#64748B] hover:bg-white hover:text-[#0B3B78]"
                            >
                              {item.archived ? (
                                <ArchiveRestore className="h-4 w-4" />
                              ) : (
                                <Archive className="h-4 w-4" />
                              )}
                            </button>
                            <button
                              type="button"
                              onClick={() => onDelete(item.id, item.name)}
                              title="Excluir"
                              className="rounded-md p-1.5 text-[#64748B] hover:bg-white hover:text-red-600"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="mt-3 text-right text-[12.5px] text-[#64748B]">
        {items.length} {items.length === 1 ? 'modelo' : 'modelos'}
      </div>
    </main>
  );
}
