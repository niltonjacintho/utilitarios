import React from 'react';
import {
  Copy,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { MindMapSummary } from '../types/mindmap';
import { formatDateTime } from '../lib/tree';

interface MapLibraryProps {
  maps: MindMapSummary[];
  loading: boolean;
  error: string | null;
  search: string;
  onSearchChange: (value: string) => void;
  onRefresh: () => void;
  onOpenMap: (id: string) => void;
  onCreateNew: () => void;
  onOpenGenerateAi: () => void;
  onDuplicateMap: (id: string) => void;
  onDeleteMap: (id: string, name: string) => void;
  userName?: string;
}

export function MapLibrary({
  maps,
  loading,
  error,
  search,
  onSearchChange,
  onRefresh,
  onOpenMap,
  onCreateNew,
  onOpenGenerateAi,
  onDuplicateMap,
  onDeleteMap,
  userName = 'Jacintho, Nilton',
}: MapLibraryProps) {
  return (
    <main className="mx-auto w-full max-w-[1280px] flex-1 px-6 py-8 sm:px-8">
      <div>
        <h1 className="text-[26px] font-bold tracking-tight text-[#0C2340]">
          Biblioteca de mapas
        </h1>
        <p className="mt-1 text-[14px] text-[#64748B]">
          Olá, {userName}. Abra um mapa mental para estruturar ideias, comentar e exportar.
        </p>
      </div>

      {/* Aba ativa */}
      <div className="mt-6 border-b border-[#E2E8F0]">
        <button
          type="button"
          className="border-b-2 border-[#0B3B78] px-1 pb-2.5 text-[14px] font-semibold text-[#0B3B78]"
        >
          Meus e compartilhados
        </button>
      </div>

      {/* Barra de busca e ações */}
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[260px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#94A3B8]" />
          <input
            type="text"
            value={search}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Buscar por nome"
            className="h-10 w-full rounded-lg border border-[#CBD5E1] bg-white pl-9 pr-3 text-[14px] text-[#0F172A] outline-none transition-colors placeholder:text-[#94A3B8] focus:border-[#0B3B78]"
          />
        </div>

        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-3.5 text-[13.5px] font-medium text-[#334155] transition-colors hover:bg-[#F8FAFC]"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Atualizar
        </button>

        <button
          type="button"
          onClick={onOpenGenerateAi}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-3.5 text-[13.5px] font-medium text-[#0B3B78] transition-colors hover:border-[#0B3B78] hover:bg-[#EFF6FF]"
        >
          <Sparkles className="h-4 w-4" />
          Gerar com IA
        </button>

        <button
          type="button"
          onClick={onCreateNew}
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#0B3B78] px-4 text-[13.5px] font-semibold text-white transition-colors hover:bg-[#092E5F]"
        >
          <Plus className="h-4 w-4" />
          Novo mapa
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
                <th className="px-5 py-3.5">Proprietário</th>
                <th className="px-5 py-3.5">Criado em</th>
                <th className="px-5 py-3.5">Última alteração</th>
                <th className="px-5 py-3.5 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#EEF2F6] text-[14px]">
              {loading && maps.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-10 text-center text-[#64748B]"
                  >
                    Carregando mapas...
                  </td>
                </tr>
              ) : maps.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-5 py-10 text-center text-[#64748B]"
                  >
                    Nenhum mapa encontrado. Clique em <strong>Novo mapa</strong> ou{' '}
                    <strong>Gerar com IA</strong> para começar.
                  </td>
                </tr>
              ) : (
                maps.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => onOpenMap(item.id)}
                    className="group cursor-pointer transition-colors hover:bg-[#F1F6FC]"
                  >
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-2.5">
                        <span className="font-semibold text-[#0F172A] group-hover:text-[#0B3B78]">
                          {item.name}
                        </span>
                        <span className="rounded-full bg-[#EEF2F7] px-2 py-0.5 text-[11.5px] font-medium text-[#475569]">
                          {item.itemCount} {item.itemCount === 1 ? 'item' : 'itens'}
                        </span>
                        {item.accessLevel !== 'owner' && (
                          <span className="rounded-full bg-[#EFF6FF] px-2 py-0.5 text-[11px] font-medium text-[#0B3B78]">
                            Compartilhado ({item.accessLevel === 'edit' ? 'Editor' : 'Leitor'})
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-5 py-4 text-[#475569]">{item.owner}</td>
                    <td className="px-5 py-4 text-[#475569]">
                      {formatDateTime(item.createdAt)}
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
                          onClick={() => onDuplicateMap(item.id)}
                          title="Duplicar mapa para sua biblioteca"
                          className="rounded-md p-1.5 text-[#64748B] transition-colors hover:bg-white hover:text-[#0B3B78]"
                        >
                          <Copy className="h-4 w-4" />
                        </button>
                        {item.accessLevel === 'owner' && (
                          <button
                            type="button"
                            onClick={() => onDeleteMap(item.id, item.name)}
                            title="Excluir mapa"
                            className="rounded-md p-1.5 text-[#64748B] transition-colors hover:bg-white hover:text-red-600"
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
