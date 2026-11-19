'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Loader2 } from 'lucide-react';
import {
  AuthUser,
  DbDialect,
  ErProjectRecord,
  ErProjectSummary,
} from '@/types/erstudio';
import { erAuthApi, erStudioApi, redirectToHubLogin } from '@/lib/api';
import { TopBar } from './TopBar';
import { ProjectLibrary, ProjectScope } from './ProjectLibrary';
import { ErEditor } from './ErEditor';
import { NewProjectModal } from './ErModals';

const LAST_OPENED_KEY = 'erstudio_last_opened_project_id';

export function ErStudioApp() {
  const [authLoading, setAuthLoading] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);

  const [allProjects, setAllProjects] = useState<ErProjectSummary[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [listError, setListError] = useState<string | null>(null);

  const [scope, setScope] = useState<ProjectScope>('all');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<'recent' | 'name'>('recent');

  const [lastOpenedId, setLastOpenedId] = useState<string | null>(null);
  const [activeProject, setActiveProject] = useState<ErProjectRecord | null>(
    null,
  );
  const [openingProject, setOpeningProject] = useState(false);

  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [autoSave, setAutoSave] = useState(true);
  const [topBarSave, setTopBarSave] = useState({ saving: false, dirty: false });
  const manualSaveRef = useRef<(() => Promise<void>) | null>(null);

  // Carrega último projeto aberto do localStorage
  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(LAST_OPENED_KEY);
      if (saved) setLastOpenedId(saved);
    } catch {
      // ignore
    }
  }, []);

  // Verifica sessão compartilhada com o Hub
  useEffect(() => {
    let mounted = true;
    erAuthApi
      .me()
      .then((res) => {
        if (!mounted) return;
        if (!res.authenticated || !res.user) {
          redirectToHubLogin();
          return;
        }
        setUser(res.user);
        setAuthLoading(false);
      })
      .catch(() => {
        if (!mounted) return;
        redirectToHubLogin();
      });
    return () => {
      mounted = false;
    };
  }, []);

  const loadProjects = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const list = await erStudioApi.list({ scope: 'all', sort: 'recent' });
      setAllProjects(list);
    } catch (err) {
      setListError(
        err instanceof Error ? err.message : 'Erro ao carregar projetos.',
      );
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void loadProjects();
  }, [user, loadProjects]);

  const counts = useMemo(() => {
    const mine = allProjects.filter((p) => p.accessLevel === 'owner').length;
    const shared = allProjects.filter((p) => p.accessLevel !== 'owner').length;
    return { all: allProjects.length, mine, shared };
  }, [allProjects]);

  const filteredProjects = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = allProjects.filter((p) => {
      if (scope === 'mine' && p.accessLevel !== 'owner') return false;
      if (scope === 'shared' && p.accessLevel === 'owner') return false;
      if (q) {
        return (
          p.name.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q)
        );
      }
      return true;
    });

    if (sort === 'name') {
      return [...list].sort((a, b) =>
        a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' }),
      );
    }
    return [...list].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }, [allProjects, scope, search, sort]);

  const lastOpenedProject = useMemo(() => {
    if (allProjects.length === 0) return null;
    if (lastOpenedId) {
      const found = allProjects.find((p) => p.id === lastOpenedId);
      if (found) return found;
    }
    return allProjects[0];
  }, [allProjects, lastOpenedId]);

  const handleOpenProject = async (id: string) => {
    setOpeningProject(true);
    setListError(null);
    try {
      const record = await erStudioApi.getById(id);
      setActiveProject(record);
      setLastOpenedId(record.id);
      try {
        window.localStorage.setItem(LAST_OPENED_KEY, record.id);
      } catch {
        // ignore
      }
    } catch (err) {
      setListError(
        err instanceof Error ? err.message : 'Não foi possível abrir o projeto.',
      );
    } finally {
      setOpeningProject(false);
    }
  };

  const handleCreateProject = async (payload: {
    name: string;
    description?: string;
    dialect: DbDialect;
    ddl?: string;
  }) => {
    const created = await erStudioApi.create(payload);
    setActiveProject(created);
    setLastOpenedId(created.id);
    try {
      window.localStorage.setItem(LAST_OPENED_KEY, created.id);
    } catch {
      // ignore
    }
    void loadProjects();
  };

  const handleDeleteProject = async (id: string, name: string) => {
    if (
      !window.confirm(
        `Deseja excluir permanentemente o projeto "${name}" e todos os seus SubModels?`,
      )
    ) {
      return;
    }
    try {
      await erStudioApi.remove(id);
      setAllProjects((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      setListError(
        err instanceof Error ? err.message : 'Erro ao excluir projeto.',
      );
    }
  };

  const handleProjectSaved = useCallback((saved: ErProjectRecord) => {
    setAllProjects((prev) => {
      const exists = prev.some((p) => p.id === saved.id);
      const summary: ErProjectSummary = {
        id: saved.id,
        ownerId: saved.ownerId,
        name: saved.name,
        description: saved.description,
        dialect: saved.dialect,
        owner: saved.owner,
        accessLevel: saved.accessLevel,
        subModelCount: saved.subModels.length,
        tableCount: saved.tables.length,
        sharedWith: saved.sharedWith,
        createdAt: saved.createdAt,
        updatedAt: saved.updatedAt,
      };
      if (!exists) return [summary, ...prev];
      return prev.map((p) => (p.id === saved.id ? summary : p));
    });
  }, []);

  const handleGoHome = async () => {
    if (manualSaveRef.current && topBarSave.dirty) {
      await manualSaveRef.current();
    }
    setActiveProject(null);
    setTopBarSave({ saving: false, dirty: false });
    void loadProjects();
  };

  const handleLogout = async () => {
    try {
      await erAuthApi.logout();
    } finally {
      redirectToHubLogin();
    }
  };

  if (authLoading || !user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#F3F6FB] text-[#0F1D3D]">
        <Loader2 className="h-8 w-8 animate-spin text-[#1D5FD6]" />
        <p className="mt-3 text-[14px] font-medium text-[#475569]">
          Verificando sessão do Hub...
        </p>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#F3F6FB]">
      <TopBar
        user={user}
        inEditor={Boolean(activeProject)}
        saving={topBarSave.saving}
        dirty={topBarSave.dirty}
        autoSave={autoSave}
        onToggleAutoSave={setAutoSave}
        onManualSave={() => {
          if (manualSaveRef.current) void manualSaveRef.current();
        }}
        onGoHome={() => void handleGoHome()}
        onLogout={() => void handleLogout()}
      />

      {openingProject ? (
        <div className="flex flex-1 flex-col items-center justify-center text-[#0F1D3D]">
          <Loader2 className="h-8 w-8 animate-spin text-[#1D5FD6]" />
          <p className="mt-3 text-[14px] font-medium text-[#475569]">
            Carregando modelo de dados...
          </p>
        </div>
      ) : activeProject ? (
        <ErEditor
          key={activeProject.id}
          initialProject={activeProject}
          user={user}
          autoSave={autoSave}
          onSyncTopBar={setTopBarSave}
          onRegisterManualSave={(fn) => {
            manualSaveRef.current = fn;
          }}
          onProjectSaved={handleProjectSaved}
          onBack={() => void handleGoHome()}
        />
      ) : (
        <ProjectLibrary
          projects={filteredProjects}
          allCount={counts.all}
          mineCount={counts.mine}
          sharedCount={counts.shared}
          lastOpenedProject={lastOpenedProject}
          loading={listLoading}
          error={listError}
          scope={scope}
          search={search}
          sort={sort}
          onScopeChange={setScope}
          onSearchChange={setSearch}
          onSortChange={setSort}
          onOpenProject={(id) => void handleOpenProject(id)}
          onCreateNew={() => setNewProjectOpen(true)}
          onDeleteProject={(id, name) => void handleDeleteProject(id, name)}
        />
      )}

      {newProjectOpen && (
        <NewProjectModal
          onClose={() => setNewProjectOpen(false)}
          onSubmit={handleCreateProject}
        />
      )}
    </div>
  );
}
