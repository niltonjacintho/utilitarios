import {
  AuthUser,
  DbDialect,
  ErAiPlanResponse,
  ErAiSummary,
  ErDbConnectionTestInput,
  ErProjectRecord,
  ErProjectSummary,
} from '@/types/erstudio';

export const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

export const HUB_URL =
  process.env.NEXT_PUBLIC_HUB_URL ?? 'http://localhost:3000';

export function redirectToHubLogin(): void {
  const loginUrl = new URL('/login', HUB_URL);
  loginUrl.searchParams.set('redirect', window.location.href);
  window.location.href = loginUrl.toString();
}

async function request<T>(
  path: string,
  init?: RequestInit,
  options?: { redirectOn401?: boolean; timeoutMs?: number },
): Promise<T> {
  const controller = new AbortController();
  const timeoutMs = options?.timeoutMs ?? 30_000;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      signal: init?.signal ?? controller.signal,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        ...(init?.headers ?? {}),
      },
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Tempo limite excedido na comunicação com a API.');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401 && options?.redirectOn401 !== false) {
    redirectToHubLogin();
    throw new Error('Sessão expirada.');
  }

  if (!response.ok) {
    let message = `Erro na requisição (${response.status})`;
    try {
      const data = (await response.json()) as { message?: string | string[] };
      if (Array.isArray(data.message)) message = data.message.join(', ');
      else if (typeof data.message === 'string') message = data.message;
    } catch {
      // ignore
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export const erAuthApi = {
  me(): Promise<{ authenticated: boolean; user: AuthUser | null }> {
    return request<{ authenticated: boolean; user: AuthUser | null }>(
      '/auth/me',
      undefined,
      { redirectOn401: false },
    );
  },

  logout(): Promise<{ loggedOut: boolean }> {
    return request<{ loggedOut: boolean }>(
      '/auth/logout',
      { method: 'POST' },
      { redirectOn401: false },
    );
  },
};

export const erStudioApi = {
  listUsers(): Promise<Array<{ id: string; name: string; email: string }>> {
    return request<Array<{ id: string; name: string; email: string }>>(
      '/erstudio/users/lookup',
    );
  },

  list(params?: {
    scope?: 'all' | 'mine' | 'shared';
    q?: string;
    sort?: 'recent' | 'name';
  }): Promise<ErProjectSummary[]> {
    const query = new URLSearchParams();
    if (params?.scope) query.set('scope', params.scope);
    if (params?.q?.trim()) query.set('q', params.q.trim());
    if (params?.sort) query.set('sort', params.sort);
    const qs = query.toString();
    return request<ErProjectSummary[]>(`/erstudio${qs ? `?${qs}` : ''}`);
  },

  getById(id: string): Promise<ErProjectRecord> {
    return request<ErProjectRecord>(`/erstudio/${encodeURIComponent(id)}`);
  },

  create(payload: {
    name: string;
    description?: string;
    dialect?: DbDialect;
    ddl?: string;
  }): Promise<ErProjectRecord> {
    return request<ErProjectRecord>('/erstudio', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  update(
    id: string,
    payload: Partial<
      Pick<
        ErProjectRecord,
        | 'name'
        | 'description'
        | 'dialect'
        | 'tables'
        | 'relations'
        | 'subModels'
        | 'activeSubModelId'
        | 'dbConfig'
        | 'pendingChanges'
        | 'history'
        | 'shares'
      >
    >,
    options?: { keepalive?: boolean },
  ): Promise<ErProjectRecord> {
    return request<ErProjectRecord>(`/erstudio/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
      keepalive: options?.keepalive,
    });
  },

  remove(id: string): Promise<{ deleted: true; id: string }> {
    return request<{ deleted: true; id: string }>(
      `/erstudio/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    );
  },

  transferOwnership(
    id: string,
    payload: { newOwnerEmail: string; keepEditAccess: boolean },
  ): Promise<ErProjectRecord> {
    return request<ErProjectRecord>(
      `/erstudio/${encodeURIComponent(id)}/transfer-ownership`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },

  testDbConnection(
    config: ErDbConnectionTestInput,
  ): Promise<{ ok: true; message: string; tableCount: number }> {
    return request<{ ok: true; message: string; tableCount: number }>(
      '/erstudio/db/test',
      {
        method: 'POST',
        body: JSON.stringify(config),
      },
      { timeoutMs: 20_000 },
    );
  },

  introspectDbReadOnly(
    id: string,
    config: ErDbConnectionTestInput,
  ): Promise<ErProjectRecord> {
    return request<ErProjectRecord>(
      `/erstudio/${encodeURIComponent(id)}/db/introspect`,
      {
        method: 'POST',
        body: JSON.stringify(config),
      },
      { timeoutMs: 30_000 },
    );
  },

  importDdl(
    id: string,
    payload: { ddl: string; mode?: 'replace' | 'merge' },
  ): Promise<ErProjectRecord> {
    return request<ErProjectRecord>(
      `/erstudio/${encodeURIComponent(id)}/ddl/import`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },

  planAiAdjustment(id: string, prompt: string): Promise<ErAiPlanResponse> {
    return request<ErAiPlanResponse>(
      `/erstudio/${encodeURIComponent(id)}/ai/plan`,
      {
        method: 'POST',
        body: JSON.stringify({ prompt }),
      },
      { timeoutMs: 45_000 },
    );
  },

  summarizeSubModel(id: string, subModelId: string): Promise<ErAiSummary> {
    return request<ErAiSummary>(
      `/erstudio/${encodeURIComponent(id)}/submodels/${encodeURIComponent(subModelId)}/ai/summary`,
      { method: 'POST' },
      { timeoutMs: 45_000 },
    );
  },
};
