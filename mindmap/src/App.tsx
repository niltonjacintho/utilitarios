import React, { useCallback, useEffect, useState } from 'react';
import { AuthUser, MindMapRecord, MindMapSummary } from './types/mindmap';
import { mindMapApi, mindMapAuthApi, redirectToHubLogin } from './lib/api';
import { TopBar } from './components/TopBar';
import { MapLibrary } from './components/MapLibrary';
import { MapEditor } from './components/MapEditor';
import { GenerateAiModal, NewMapModal } from './components/Modals';

const DEFAULT_BACKGROUND = '#F8FAFC';

export function App() {
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [currentUser, setCurrentUser] = useState<AuthUser | null>(null);

  const [maps, setMaps] = useState<MindMapSummary[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const [activeMap, setActiveMap] = useState<MindMapRecord | null>(null);
  const [backgroundColor, setBackgroundColor] = useState(DEFAULT_BACKGROUND);

  const [newMapModalOpen, setNewMapModalOpen] = useState(false);
  const [creatingMap, setCreatingMap] = useState(false);

  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [generatingAi, setGeneratingAi] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  const loadMaps = useCallback(async (query?: string) => {
    setLoadingList(true);
    setListError(null);
    try {
      const data = await mindMapApi.list(query);
      setMaps(data);
    } catch (error) {
      setListError(
        error instanceof Error
          ? error.message
          : 'Não foi possível carregar os mapas. Verifique se a API está ativa na porta 3001.',
      );
    } finally {
      setLoadingList(false);
    }
  }, []);

  const openMapById = useCallback(async (id: string) => {
    try {
      const fullMap = await mindMapApi.getById(id);
      setActiveMap(fullMap);
      setBackgroundColor(fullMap.backgroundColor || DEFAULT_BACKGROUND);
      const url = new URL(window.location.href);
      url.searchParams.set('map', id);
      window.history.replaceState({}, '', url.toString());
    } catch (error) {
      setListError(
        error instanceof Error ? error.message : 'Erro ao abrir mapa.',
      );
    }
  }, []);

  // Verifica sessão compartilhada com o Hub antes de carregar os mapas do usuário
  useEffect(() => {
    let active = true;

    async function verifyAuth() {
      try {
        const res = await mindMapAuthApi.me();
        if (!active) return;

        if (!res.authenticated || !res.user) {
          redirectToHubLogin();
          return;
        }

        setCurrentUser(res.user);
      } catch {
        if (active) {
          redirectToHubLogin();
        }
      } finally {
        if (active) {
          setCheckingAuth(false);
        }
      }
    }

    void verifyAuth();
    return () => {
      active = false;
    };
  }, []);

  // Abre ?map=... após autenticar
  useEffect(() => {
    if (!currentUser) return;
    const params = new URLSearchParams(window.location.search);
    const mapId = params.get('map');
    if (mapId) {
      void openMapById(mapId);
    }
  }, [currentUser, openMapById]);

  // Carrega e filtra mapas do usuário autenticado (1xN + compartilhados)
  useEffect(() => {
    if (!currentUser) return;
    const timer = setTimeout(() => {
      void loadMaps(search);
    }, 180);
    return () => clearTimeout(timer);
  }, [currentUser, search, loadMaps]);

  const handleGoToLibrary = () => {
    setActiveMap(null);
    const url = new URL(window.location.href);
    url.searchParams.delete('map');
    window.history.replaceState({}, '', url.toString());
    void loadMaps(search);
  };

  const handleLogout = async () => {
    try {
      await mindMapAuthApi.logout();
    } finally {
      redirectToHubLogin();
    }
  };

  const handleChangeBackground = async (color: string) => {
    setBackgroundColor(color);
    if (activeMap) {
      const updatedLocal = { ...activeMap, backgroundColor: color };
      setActiveMap(updatedLocal);
      try {
        const saved = await mindMapApi.update(activeMap.id, {
          backgroundColor: color,
        });
        setActiveMap(saved);
      } catch {
        // fallback silencioso se falhar
      }
    }
  };

  const handleCreateNewMap = async (name: string) => {
    setCreatingMap(true);
    try {
      const created = await mindMapApi.create({
        name,
        backgroundColor,
      });
      setNewMapModalOpen(false);
      setActiveMap(created);
      void loadMaps(search);
    } catch (error) {
      setListError(
        error instanceof Error ? error.message : 'Erro ao criar mapa.',
      );
    } finally {
      setCreatingMap(false);
    }
  };

  const handleGenerateAi = async (title: string, text: string) => {
    setGeneratingAi(true);
    setAiError(null);
    try {
      const created = await mindMapApi.generateWithAi({
        title: title || undefined,
        text,
      });
      setAiModalOpen(false);
      setActiveMap(created);
      setBackgroundColor(created.backgroundColor || DEFAULT_BACKGROUND);
      void loadMaps(search);
    } catch (error) {
      setAiError(
        error instanceof Error
          ? error.message
          : 'Erro ao gerar mapa mental com IA.',
      );
    } finally {
      setGeneratingAi(false);
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const copy = await mindMapApi.duplicate(id);
      setActiveMap(copy);
      void loadMaps(search);
    } catch (error) {
      setListError(
        error instanceof Error ? error.message : 'Erro ao duplicar mapa.',
      );
    }
  };

  const handleDelete = async (id: string, name: string) => {
    const confirmed = window.confirm(
      `Deseja realmente excluir o mapa "${name}"?`,
    );
    if (!confirmed) return;

    try {
      await mindMapApi.remove(id);
      if (activeMap?.id === id) {
        handleGoToLibrary();
      } else {
        void loadMaps(search);
      }
    } catch (error) {
      setListError(
        error instanceof Error ? error.message : 'Erro ao excluir mapa.',
      );
    }
  };

  if (checkingAuth || !currentUser) {
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
        user={currentUser}
        backgroundColor={backgroundColor}
        onChangeBackground={(c) => void handleChangeBackground(c)}
        onResetBackground={() => void handleChangeBackground(DEFAULT_BACKGROUND)}
        onGoHome={handleGoToLibrary}
        onLogout={() => void handleLogout()}
      />

      {activeMap ? (
        <MapEditor
          map={activeMap}
          userName={currentUser.name}
          onMapUpdated={(updated) => setActiveMap(updated)}
          onBackToLibrary={handleGoToLibrary}
          onDuplicate={(id) => void handleDuplicate(id)}
          onDeleteMap={(id, name) => void handleDelete(id, name)}
        />
      ) : (
        <MapLibrary
          maps={maps}
          loading={loadingList}
          error={listError}
          search={search}
          userName={currentUser.name}
          onSearchChange={setSearch}
          onRefresh={() => void loadMaps(search)}
          onOpenMap={(id) => void openMapById(id)}
          onCreateNew={() => setNewMapModalOpen(true)}
          onOpenGenerateAi={() => {
            setAiError(null);
            setAiModalOpen(true);
          }}
          onDuplicateMap={(id) => void handleDuplicate(id)}
          onDeleteMap={(id, name) => void handleDelete(id, name)}
        />
      )}

      {newMapModalOpen && (
        <NewMapModal
          loading={creatingMap}
          onCreate={(name) => void handleCreateNewMap(name)}
          onClose={() => setNewMapModalOpen(false)}
        />
      )}

      {aiModalOpen && (
        <GenerateAiModal
          loading={generatingAi}
          error={aiError}
          onGenerate={(title, text) => void handleGenerateAi(title, text)}
          onClose={() => setAiModalOpen(false)}
        />
      )}
    </div>
  );
}

export default App;
