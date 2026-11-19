'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  AuthUser,
  FlowchartRecord,
  FlowchartSummary,
} from '@/types/flowchart';
import {
  flowchartApi,
  flowchartAuthApi,
  redirectToHubLogin,
} from '@/lib/api';
import { TopBar } from './TopBar';
import { FlowchartLibrary, LibraryScope } from './FlowchartLibrary';
import { FlowchartEditor } from './FlowchartEditor';
import { AiFlowchartModal, NewFlowchartModal } from './Modals';

const DEFAULT_BACKGROUND = '#F8FAFC';

export function FlowchartApp() {
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);

  const [scope, setScope] = useState<LibraryScope>('mine');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  const [items, setItems] = useState<FlowchartSummary[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [activeChart, setActiveChart] = useState<FlowchartRecord | null>(null);
  const [backgroundColor, setBackgroundColor] = useState(DEFAULT_BACKGROUND);

  const [newModalOpen, setNewModalOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const data = await flowchartApi.list({
        scope,
        q: search,
        status: statusFilter,
      });
      setItems(data);
    } catch (err) {
      setListError(
        err instanceof Error
          ? err.message
          : 'Não foi possível carregar os fluxogramas.',
      );
    } finally {
      setLoadingList(false);
    }
  }, [scope, search, statusFilter]);

  const openById = useCallback(async (id: string) => {
    try {
      const full = await flowchartApi.getById(id);
      setActiveChart(full);
      setBackgroundColor(full.backgroundColor || DEFAULT_BACKGROUND);
      const url = new URL(window.location.href);
      url.searchParams.set('id', id);
      window.history.replaceState({}, '', url.toString());
    } catch (err) {
      setListError(
        err instanceof Error ? err.message : 'Erro ao abrir fluxograma.',
      );
    }
  }, []);

  // Verifica sessão compartilhada com o Hub
  useEffect(() => {
    let active = true;
    async function check() {
      try {
        const res = await flowchartAuthApi.me();
        if (!active) return;
        if (!res.authenticated || !res.user) {
          redirectToHubLogin();
          return;
        }
        setUser(res.user);
      } catch {
        if (active) redirectToHubLogin();
      } finally {
        if (active) setCheckingAuth(false);
      }
    }
    void check();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get('id');
    if (id) void openById(id);
  }, [user, openById]);

  useEffect(() => {
    if (!user) return;
    const timer = setTimeout(() => {
      void loadList();
    }, 180);
    return () => clearTimeout(timer);
  }, [user, loadList]);

  const goHome = () => {
    setActiveChart(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('id');
    window.history.replaceState({}, '', url.toString());
    void loadList();
  };

  const handleLogout = async () => {
    try {
      await flowchartAuthApi.logout();
    } finally {
      redirectToHubLogin();
    }
  };

  const handleBackgroundChange = async (color: string) => {
    setBackgroundColor(color);
    if (activeChart && activeChart.accessLevel !== 'view') {
      setActiveChart({ ...activeChart, backgroundColor: color });
      try {
        const saved = await flowchartApi.update(activeChart.id, {
          backgroundColor: color,
        });
        setActiveChart(saved);
      } catch {
        // ignore
      }
    }
  };

  if (checkingAuth || !user) {
    return (
      <div className="flex h-screen flex-col items-center justify-center bg-[#F8FAFC] text-[#64748B]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#0B3B78] border-t-transparent" />
        <p className="mt-3 text-[14px]">Verificando autenticação...</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col bg-[#F8FAFC]">
      <TopBar
        user={user}
        backgroundColor={backgroundColor}
        onChangeBackground={(c) => void handleBackgroundChange(c)}
        onResetBackground={() => void handleBackgroundChange(DEFAULT_BACKGROUND)}
        onGoHome={goHome}
        onLogout={() => void handleLogout()}
      />

      {activeChart ? (
        <FlowchartEditor
          chart={activeChart}
          userName={user.name}
          onChartUpdated={(updated) => setActiveChart(updated)}
          onBackToLibrary={goHome}
        />
      ) : (
        <FlowchartLibrary
          userName={user.name}
          items={items}
          loading={loadingList}
          error={listError}
          scope={scope}
          search={search}
          statusFilter={statusFilter}
          onScopeChange={setScope}
          onSearchChange={setSearch}
          onStatusFilterChange={setStatusFilter}
          onRefresh={() => void loadList()}
          onOpen={(id) => void openById(id)}
          onCreateNew={() => setNewModalOpen(true)}
          onOpenAi={() => {
            setAiError(null);
            setAiModalOpen(true);
          }}
          onDuplicate={async (id) => {
            try {
              const copy = await flowchartApi.duplicate(id);
              setActiveChart(copy);
              void loadList();
            } catch (err) {
              setListError(
                err instanceof Error ? err.message : 'Erro ao duplicar.',
              );
            }
          }}
          onToggleArchive={async (item) => {
            try {
              await flowchartApi.update(item.id, { archived: !item.archived });
              void loadList();
            } catch (err) {
              setListError(
                err instanceof Error ? err.message : 'Erro ao atualizar.',
              );
            }
          }}
          onDelete={async (id, name) => {
            if (!window.confirm(`Excluir o fluxograma "${name}"?`)) return;
            try {
              await flowchartApi.remove(id);
              void loadList();
            } catch (err) {
              setListError(
                err instanceof Error ? err.message : 'Erro ao excluir.',
              );
            }
          }}
        />
      )}

      {newModalOpen && (
        <NewFlowchartModal
          loading={creating}
          onCreate={async (name, description) => {
            setCreating(true);
            try {
              const created = await flowchartApi.create({
                name,
                description,
                backgroundColor,
              });
              setNewModalOpen(false);
              setActiveChart(created);
              void loadList();
            } catch (err) {
              setListError(
                err instanceof Error ? err.message : 'Erro ao criar.',
              );
            } finally {
              setCreating(false);
            }
          }}
          onClose={() => setNewModalOpen(false)}
        />
      )}

      {aiModalOpen && (
        <AiFlowchartModal
          mode="new"
          loading={generatingAi}
          error={aiError}
          onSubmit={async (title, text) => {
            setGeneratingAi(true);
            setAiError(null);
            try {
              const created = await flowchartApi.generateNewWithAi({
                title: title || undefined,
                text,
              });
              setAiModalOpen(false);
              setActiveChart(created);
              setBackgroundColor(created.backgroundColor || DEFAULT_BACKGROUND);
              void loadList();
            } catch (err) {
              setAiError(
                err instanceof Error
                  ? err.message
                  : 'Erro ao gerar fluxograma com IA.',
              );
            } finally {
              setGeneratingAi(false);
            }
          }}
          onClose={() => setAiModalOpen(false)}
        />
      )}
    </div>
  );
}
