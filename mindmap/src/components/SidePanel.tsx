import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  GitBranchPlus,
  Plus,
  Send,
  Sparkles,
  Trash2,
} from 'lucide-react';
import {
  MindMapExecutor,
  MindMapNode,
  MindMapRecord,
} from '../types/mindmap';
import { formatDateTime } from '../lib/tree';

export type SidePanelTab = 'item' | 'comments';

interface SidePanelProps {
  open: boolean;
  onToggleOpen: () => void;
  activeTab: SidePanelTab;
  onChangeTab: (tab: SidePanelTab) => void;
  map: MindMapRecord;
  selectedNode: MindMapNode | null;
  isRootSelected: boolean;
  executors: MindMapExecutor[];
  expandingAi: boolean;
  onUpdateNode: (patch: Partial<MindMapNode>) => void;
  onAddChild: () => void;
  onAddSibling: () => void;
  onDeleteSelected: () => void;
  onExpandWithAi: () => void;
  onAddComment: (text: string) => void;
  onDeleteComment: (commentId: string) => void;
}

export function SidePanel({
  open,
  onToggleOpen,
  activeTab,
  onChangeTab,
  map,
  selectedNode,
  isRootSelected,
  executors,
  expandingAi,
  onUpdateNode,
  onAddChild,
  onAddSibling,
  onDeleteSelected,
  onExpandWithAi,
  onAddComment,
  onDeleteComment,
}: SidePanelProps) {
  const [commentText, setCommentText] = useState('');

  const handleSubmitComment = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = commentText.trim();
    if (!trimmed) return;
    onAddComment(trimmed);
    setCommentText('');
  };

  return (
    <>
      {open && (
        <aside className="flex w-[320px] shrink-0 flex-col border-l border-[#E2E8F0] bg-white">
          {/* Abas Item | Comentários */}
          <div className="grid grid-cols-2 border-b border-[#E2E8F0]">
            <button
              type="button"
              onClick={() => onChangeTab('item')}
              className={[
                'py-3 text-[13.5px] font-medium transition-colors',
                activeTab === 'item'
                  ? 'border-b-2 border-[#0B3B78] font-semibold text-[#0B3B78]'
                  : 'text-[#64748B] hover:text-[#0F172A]',
              ].join(' ')}
            >
              Item
            </button>
            <button
              type="button"
              onClick={() => onChangeTab('comments')}
              className={[
                'py-3 text-[13.5px] font-medium transition-colors',
                activeTab === 'comments'
                  ? 'border-b-2 border-[#0B3B78] font-semibold text-[#0B3B78]'
                  : 'text-[#64748B] hover:text-[#0F172A]',
              ].join(' ')}
            >
              Comentários
              {selectedNode && (selectedNode.comments?.length ?? 0) > 0 && (
                <span className="ml-1.5 rounded-full bg-[#E2ECF8] px-1.5 py-0.5 text-[11px] font-semibold text-[#0B3B78]">
                  {selectedNode.comments?.length}
                </span>
              )}
            </button>
          </div>

          {/* Conteúdo */}
          <div className="flex-1 overflow-y-auto p-5">
            {activeTab === 'item' ? (
              !selectedNode ? (
                <div className="space-y-6">
                  <div>
                    <h2 className="text-[15.5px] font-bold text-[#0F172A]">
                      Detalhes do mapa
                    </h2>
                    <dl className="mt-3 space-y-2.5 text-[13.5px]">
                      <div className="grid grid-cols-[120px_1fr] gap-2">
                        <dt className="text-[#64748B]">Nome</dt>
                        <dd className="font-medium text-[#0F172A]">
                          {map.name}
                        </dd>
                      </div>
                      <div className="grid grid-cols-[120px_1fr] gap-2">
                        <dt className="text-[#64748B]">Itens</dt>
                        <dd className="font-medium text-[#0F172A]">
                          {map.itemCount}
                        </dd>
                      </div>
                      <div className="grid grid-cols-[120px_1fr] gap-2">
                        <dt className="text-[#64748B]">Tarefas concluídas</dt>
                        <dd className="font-medium text-[#0F172A]">
                          {map.completedCount}
                        </dd>
                      </div>
                      <div className="grid grid-cols-[120px_1fr] gap-2">
                        <dt className="text-[#64748B]">Última alteração</dt>
                        <dd className="font-medium text-[#0F172A]">
                          {formatDateTime(map.updatedAt)}
                        </dd>
                      </div>
                    </dl>
                  </div>

                  <div className="border-t border-[#E2E8F0] pt-5">
                    <h3 className="text-[14.5px] font-semibold text-[#0F172A]">
                      Atalhos
                    </h3>
                    <ul className="mt-2.5 list-disc space-y-1.5 pl-5 text-[13px] text-[#475569]">
                      <li>Insert: novo filho</li>
                      <li>Enter: novo irmão</li>
                      <li>Delete: excluir item</li>
                      <li>F6: detalhes da tarefa</li>
                      <li>Alt+N: comentários</li>
                      <li>Setas: navegar entre itens</li>
                      <li>Duplo clique ou digitar: editar texto</li>
                    </ul>
                  </div>

                  <div className="rounded-lg border border-[#DBEAFE] bg-[#EFF6FF] p-3.5 text-[13px] leading-relaxed text-[#334155]">
                    Selecione um item no mapa para editar suas propriedades.
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <label className="block text-[12px] font-semibold uppercase tracking-wide text-[#64748B]">
                      Texto do item
                    </label>
                    <input
                      type="text"
                      value={selectedNode.text}
                      onChange={(e) => onUpdateNode({ text: e.target.value })}
                      className="mt-1.5 w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-[14px] text-[#0F172A] outline-none focus:border-[#0B3B78]"
                    />
                  </div>

                  {/* Ações rápidas */}
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={onAddChild}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-2.5 py-2 text-[12.5px] font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      Novo filho
                    </button>
                    <button
                      type="button"
                      onClick={onAddSibling}
                      disabled={isRootSelected}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-2.5 py-2 text-[12.5px] font-medium text-[#0F172A] hover:bg-[#F8FAFC] disabled:cursor-not-allowed disabled:opacity-45"
                    >
                      <GitBranchPlus className="h-3.5 w-3.5" />
                      Novo irmão
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={onExpandWithAi}
                    disabled={expandingAi}
                    className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-2 text-[13px] font-medium text-[#0B3B78] transition-colors hover:bg-[#DBEAFE] disabled:opacity-60"
                  >
                    <Sparkles className="h-3.5 w-3.5" />
                    {expandingAi
                      ? 'Gerando sub-itens com IA...'
                      : 'Expandir sub-itens com IA'}
                  </button>

                  <div className="border-t border-[#E2E8F0] pt-4 space-y-3.5">
                    <label className="flex cursor-pointer items-center gap-2.5 text-[13.5px] font-medium text-[#0F172A]">
                      <input
                        type="checkbox"
                        checked={Boolean(selectedNode.completed)}
                        onChange={(e) =>
                          onUpdateNode({ completed: e.target.checked })
                        }
                        className="h-4 w-4 rounded border-[#CBD5E1] accent-[#0B3B78]"
                      />
                      Tarefa concluída
                    </label>

                    <div>
                      <label className="block text-[12px] font-semibold uppercase tracking-wide text-[#64748B]">
                        Executor
                      </label>
                      <select
                        value={selectedNode.executorId ?? ''}
                        onChange={(e) =>
                          onUpdateNode({
                            executorId: e.target.value || null,
                          })
                        }
                        className="mt-1.5 w-full rounded-lg border border-[#CBD5E1] bg-white px-3 py-2 text-[13.5px] text-[#0F172A] outline-none focus:border-[#0B3B78]"
                      >
                        <option value="">Sem executor</option>
                        {executors.map((exec) => (
                          <option key={exec.id} value={exec.id}>
                            {exec.name}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-[12px] font-semibold uppercase tracking-wide text-[#64748B]">
                        Prazo
                      </label>
                      <input
                        type="date"
                        value={selectedNode.dueDate ?? ''}
                        onChange={(e) =>
                          onUpdateNode({
                            dueDate: e.target.value || null,
                          })
                        }
                        className="mt-1.5 w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-[13.5px] text-[#0F172A] outline-none focus:border-[#0B3B78]"
                      />
                    </div>

                    <div>
                      <label className="block text-[12px] font-semibold uppercase tracking-wide text-[#64748B]">
                        Notas / Descrição
                      </label>
                      <textarea
                        rows={4}
                        value={selectedNode.notes ?? ''}
                        onChange={(e) =>
                          onUpdateNode({ notes: e.target.value })
                        }
                        placeholder="Adicione detalhes, links ou critérios de aceite..."
                        className="mt-1.5 w-full resize-y rounded-lg border border-[#CBD5E1] px-3 py-2 text-[13.5px] text-[#0F172A] outline-none placeholder:text-[#94A3B8] focus:border-[#0B3B78]"
                      />
                    </div>
                  </div>

                  {!isRootSelected && (
                    <div className="border-t border-[#E2E8F0] pt-4">
                      <button
                        type="button"
                        onClick={onDeleteSelected}
                        className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] font-medium text-red-700 transition-colors hover:bg-red-100"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Excluir item
                      </button>
                    </div>
                  )}
                </div>
              )
            ) : !selectedNode ? (
              <div className="rounded-lg border border-[#DBEAFE] bg-[#EFF6FF] p-3.5 text-[13px] leading-relaxed text-[#334155]">
                Selecione um item no mapa para ver e adicionar comentários.
              </div>
            ) : (
              <div className="flex h-full flex-col justify-between gap-4">
                <div className="space-y-3">
                  <div className="text-[12px] font-semibold uppercase tracking-wide text-[#64748B]">
                    Item: <span className="text-[#0F172A]">{selectedNode.text}</span>
                  </div>

                  {(selectedNode.comments?.length ?? 0) === 0 ? (
                    <p className="text-[13px] text-[#64748B]">
                      Nenhum comentário neste item ainda.
                    </p>
                  ) : (
                    <div className="space-y-2.5">
                      {(selectedNode.comments ?? []).map((comment) => (
                        <div
                          key={comment.id}
                          className="rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-3"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-[12.5px] font-semibold text-[#0F172A]">
                                {comment.author}
                              </div>
                              <div className="text-[11px] text-[#64748B]">
                                {formatDateTime(comment.createdAt)}
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => onDeleteComment(comment.id)}
                              title="Remover comentário"
                              className="text-[#94A3B8] hover:text-red-600"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                          <p className="mt-2 whitespace-pre-wrap text-[13px] text-[#334155]">
                            {comment.text}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <form
                  onSubmit={handleSubmitComment}
                  className="border-t border-[#E2E8F0] pt-3"
                >
                  <textarea
                    rows={3}
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Escreva um comentário..."
                    className="w-full resize-none rounded-lg border border-[#CBD5E1] px-3 py-2 text-[13px] text-[#0F172A] outline-none placeholder:text-[#94A3B8] focus:border-[#0B3B78]"
                  />
                  <button
                    type="submit"
                    disabled={!commentText.trim()}
                    className="mt-2 inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-[#0B3B78] px-3 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#092E5F] disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Adicionar comentário
                  </button>
                </form>
              </div>
            )}
          </div>
        </aside>
      )}

      {/* Botão flutuante no canto inferior direito (igual às imagens) */}
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
