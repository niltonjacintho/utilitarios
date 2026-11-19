'use client';

import React from 'react';
import { Plus, Search, Trash2 } from 'lucide-react';
import { ErProjectSummary } from '@/types/erstudio';
import {
  formatAccessLabel,
  formatDateTime,
  formatDialectLabel,
} from '@/lib/er-utils';

export type ProjectScope = 'all' | 'mine' | 'shared';

interface ProjectLibraryProps {
  projects: ErProjectSummary[];
  allCount: number;
  mineCount: number;
  sharedCount: number;
  lastOpenedProject: ErProjectSummary | null;
  loading: boolean;
  error: string | null;
  scope: ProjectScope;
  search: string;
  sort: 'recent' | 'name';
  onScopeChange: (scope: ProjectScope) => void;
  onSearchChange: (q: string) => void;
  onSortChange: (sort: 'recent' | 'name') => void;
  onOpenProject: (id: string) => void;
  onCreateNew: () => void;
  onDeleteProject: (id: string, name: string) => void;
}

export function ProjectLibrary({
  projects,
  allCount,
  mineCount,
  sharedCount,
  lastOpenedProject,
  loading,
  error,
  scope,
  search,
  sort,
  onScopeChange,
  onSearchChange,
  onSortChange,
  onOpenProject,
  onCreateNew,
  onDeleteProject,
}: ProjectLibraryProps) {
  const tabs: Array<{ id: ProjectScope; label: string; count: number }> = [
    { id: 'all', label: 'Todos', count: allCount },
    { id: 'mine', label: 'Meus projetos', count: mineCount },
    { id: 'shared', label: 'Compartilhados comigo', count: sharedCount },
  ];

  return (
    <main className="mx-auto w-full max-w-[1320px] flex-1 overflow-y-auto px-6 py-8 sm:px-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold tracking-tight text-[#0C2340]">
            Projetos
          </h1>
          <p className="mt-1 text-[14px] text-[#64748B]">
            Escolha um projeto para abrir o editor de DER ou crie um novo.
          </p>
        </div>

        <button
          type="button"
          onClick={onCreateNew}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#1D5FD6] px-4 text-[14px] font-semibold text-white shadow-sm transition-colors hover:bg-[#174DB3]"
        >
          <Plus className="h-4 w-4" />
          Novo projeto
        </button>
      </div>

      {/* Banner CONTINUAR DE ONDE PAROU (igual à imagem 15.39.28) */}
      {lastOpenedProject && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#DCE5F2] bg-[#EAF0F9] px-5 py-3.5">
          <div>
            <div className="text-[11px] font-bold uppercase tracking-wider text-[#64748B]">
              Continuar de onde parou
            </div>
            <div className="mt-0.5 text-[16px] font-bold text-[#0F172A]">
              {lastOpenedProject.name}
              <span className="ml-2 text-[12.5px] font-medium text-[#475569]">
                · {formatDialectLabel(lastOpenedProject.dialect)} ·{' '}
                {lastOpenedProject.tableCount} tabelas ·{' '}
                {lastOpenedProject.subModelCount} SubModels
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={() => onOpenProject(lastOpenedProject.id)}
            className="rounded-lg border border-[#CBD5E1] bg-white px-4 py-2 text-[13.5px] font-semibold text-[#0F1D3D] shadow-sm hover:border-[#1D5FD6] hover:text-[#1D5FD6]"
          >
            Continuar
          </button>
        </div>
      )}

      {/* Card principal com Abas + Busca + Tabela */}
      <div className="mt-6 overflow-hidden rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_2px_10px_rgba(15,23,42,0.03)]">
        {/* Abas com badges */}
        <div className="flex flex-wrap items-center gap-6 border-b border-[#E2E8F0] px-6 pt-4">
          {tabs.map((tab) => {
            const active = scope === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onScopeChange(tab.id)}
                className={[
                  'inline-flex items-center gap-2 pb-3 text-[14px] transition-colors',
                  active
                    ? 'border-b-2 border-[#1D5FD6] font-semibold text-[#1D5FD6]'
                    : 'font-medium text-[#475569] hover:text-[#0F172A]',
                ].join(' ')}
              >
                <span>{tab.label}</span>
                <span
                  className={[
                    'rounded-full px-2 py-0.5 text-[11.5px] font-semibold',
                    active
                      ? 'bg-[#E6F0FF] text-[#1D5FD6]'
                      : 'bg-[#F1F5F9] text-[#64748B]',
                  ].join(' ')}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Busca + Ordenar por */}
        <div className="flex flex-wrap items-center gap-3 border-b border-[#EEF2F6] px-6 py-4">
          <div className="relative min-w-[260px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
            <input
              type="text"
              value={search}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder="Buscar por nome ou descrição"
              className="h-10 w-full rounded-lg border border-[#CBD5E1] bg-white pl-9 pr-3 text-[14px] text-[#0F172A] outline-none placeholder:text-[#94A3B8] focus:border-[#1D5FD6]"
            />
          </div>

          <div className="flex items-center gap-2 text-[13.5px] text-[#64748B]">
            <span>Ordenar por</span>
            <select
              value={sort}
              onChange={(e) => onSortChange(e.target.value as 'recent' | 'name')}
              className="h-10 rounded-lg border border-[#CBD5E1] bg-white px-3 font-medium text-[#0F172A] outline-none focus:border-[#1D5FD6]"
            >
              <option value="recent">Mais recentes</option>
              <option value="name">Nome (A–Z)</option>
            </select>
          </div>
        </div>

        {error && (
          <div className="mx-6 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-700">
            {error}
          </div>
        )}

        {/* Tabela de projetos */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-[#E2E8F0] bg-[#FAFBFD] text-[11.5px] font-bold uppercase tracking-wider text-[#64748B]">
                <th className="px-6 py-3.5">Projeto</th>
                <th className="px-4 py-3.5">Banco</th>
                <th className="px-4 py-3.5">Acesso</th>
                <th className="px-4 py-3.5 text-center">SubModels</th>
                <th className="px-4 py-3.5">Compartilhado com</th>
                <th className="px-4 py-3.5">Última alteração</th>
                <th className="px-6 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF2F6] text-[14px]">
              {loading && projects.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-10 text-center text-[#64748B]"
                  >
                    Carregando projetos...
                  </td>
                </tr>
              ) : projects.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-10 text-center text-[#64748B]"
                  >
                    Nenhum projeto encontrado. Clique em <strong>+ Novo projeto</strong> para começar.
                  </td>
                </tr>
              ) : (
                projects.map((proj) => (
                  <tr
                    key={proj.id}
                    className="transition-colors hover:bg-[#F8FAFE]"
                  >
                    <td className="px-6 py-4">
                      <button
                        type="button"
                        onClick={() => onOpenProject(proj.id)}
                        className="text-left font-bold text-[#1D5FD6] hover:underline"
                      >
                        {proj.name}
                      </button>
                      {proj.description && (
                        <div className="mt-0.5 max-w-[300px] truncate text-[12px] text-[#64748B]">
                          {proj.description}
                        </div>
                      )}
                    </td>
                    <td className="px-4 py-4 text-[#334155]">
                      {formatDialectLabel(proj.dialect)}
                    </td>
                    <td className="px-4 py-4">
                      <span className="inline-flex rounded-full bg-[#EAF0F9] px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-[#0F1D3D]">
                        {formatAccessLabel(proj.accessLevel)}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-center font-semibold text-[#0F172A]">
                      {proj.subModelCount}
                    </td>
                    <td className="px-4 py-4 text-[13px] text-[#64748B]">
                      {proj.sharedWith.length > 0
                        ? proj.sharedWith.join(', ')
                        : '—'}
                    </td>
                    <td className="px-4 py-4 text-[13.5px] text-[#475569]">
                      {formatDateTime(proj.updatedAt)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => onOpenProject(proj.id)}
                          className="rounded-lg bg-[#1D5FD6] px-3.5 py-1.5 text-[13px] font-semibold text-white transition-colors hover:bg-[#174DB3]"
                        >
                          Abrir
                        </button>
                        {proj.accessLevel === 'owner' && (
                          <button
                            type="button"
                            onClick={() => onDeleteProject(proj.id, proj.name)}
                            title="Excluir projeto"
                            className="rounded-lg border border-[#E2E8F0] p-1.5 text-[#64748B] hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
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
    </main>
  );
}
