import {
  AuthUser,
  MindMapAiSummary,
  MindMapNode,
  MindMapRecord,
  MindMapSummary,
} from '../types/mindmap';

export const API_BASE_URL =
  import.meta.env.VITE_API_URL || 'http://localhost:3001/api';

export const HUB_URL = import.meta.env.VITE_HUB_URL || 'http://localhost:3000';

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
      throw new Error(
        'A requisição excedeu o tempo limite. Tente novamente em instantes.',
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 401 && options?.redirectOn401 !== false) {
    redirectToHubLogin();
    throw new Error('Sessão expirada. Redirecionando para login...');
  }

  if (!response.ok) {
    let message = `Erro na requisição (${response.status})`;
    try {
      const data = (await response.json()) as { message?: string | string[] };
      if (Array.isArray(data.message)) {
        message = data.message.join(', ');
      } else if (typeof data.message === 'string') {
        message = data.message;
      }
    } catch {
      // ignore json parse error
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export const mindMapAuthApi = {
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

export const mindMapApi = {
  list(search?: string): Promise<MindMapSummary[]> {
    const query = search?.trim()
      ? `?q=${encodeURIComponent(search.trim())}`
      : '';
    return request<MindMapSummary[]>(`/mindmaps${query}`);
  },

  getById(id: string): Promise<MindMapRecord> {
    return request<MindMapRecord>(`/mindmaps/${encodeURIComponent(id)}`);
  },

  create(payload: {
    name: string;
    backgroundColor?: string;
    root?: MindMapNode;
  }): Promise<MindMapRecord> {
    return request<MindMapRecord>('/mindmaps', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  update(
    id: string,
    payload: Partial<
      Pick<
        MindMapRecord,
        'name' | 'backgroundColor' | 'root' | 'executors' | 'shares'
      >
    >,
    options?: { keepalive?: boolean },
  ): Promise<MindMapRecord> {
    return request<MindMapRecord>(`/mindmaps/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
      keepalive: options?.keepalive,
    });
  },

  duplicate(id: string): Promise<MindMapRecord> {
    return request<MindMapRecord>(
      `/mindmaps/${encodeURIComponent(id)}/duplicate`,
      { method: 'POST' },
    );
  },

  remove(id: string): Promise<{ deleted: true; id: string }> {
    return request<{ deleted: true; id: string }>(
      `/mindmaps/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    );
  },

  generateWithAi(payload: {
    text: string;
    title?: string;
  }): Promise<MindMapRecord> {
    return request<MindMapRecord>('/mindmaps/ai/generate', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  explainWithAi(id: string): Promise<{ explanation: string; model: string }> {
    return request<{ explanation: string; model: string }>(
      `/mindmaps/${encodeURIComponent(id)}/ai/explain`,
      { method: 'POST' },
      { timeoutMs: 45_000 },
    );
  },

  summarizeForExport(id: string): Promise<MindMapAiSummary> {
    return request<MindMapAiSummary>(
      `/mindmaps/${encodeURIComponent(id)}/ai/summary`,
      { method: 'POST' },
      { timeoutMs: 45_000 },
    );
  },

  expandNodeWithAi(
    id: string,
    payload: { nodeId: string; instruction?: string },
  ): Promise<{ children: MindMapNode[]; model: string }> {
    return request<{ children: MindMapNode[]; model: string }>(
      `/mindmaps/${encodeURIComponent(id)}/ai/expand-node`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    );
  },
};
