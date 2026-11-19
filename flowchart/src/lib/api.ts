import {
  AuthUser,
  FlowchartAiSummary,
  FlowchartRecord,
  FlowchartStatus,
  FlowchartSummary,
} from '@/types/flowchart';

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
    throw new Error('Sessão expirada. Redirecionando para o login...');
  }

  if (!response.ok) {
    let message = `Erro na requisição (${response.status})`;
    try {
      const data = (await response.json()) as { message?: string | string[] };
      if (Array.isArray(data.message)) message = data.message.join(', ');
      else if (typeof data.message === 'string') message = data.message;
    } catch {
      // ignore json parse error
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export const flowchartAuthApi = {
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

export const flowchartApi = {
  list(params?: {
    scope?: 'mine' | 'shared' | 'archived';
    q?: string;
    status?: string;
  }): Promise<FlowchartSummary[]> {
    const query = new URLSearchParams();
    if (params?.scope) query.set('scope', params.scope);
    if (params?.q?.trim()) query.set('q', params.q.trim());
    if (params?.status && params.status !== 'all') {
      query.set('status', params.status);
    }
    const qs = query.toString();
    return request<FlowchartSummary[]>(`/flowcharts${qs ? `?${qs}` : ''}`);
  },

  getById(id: string): Promise<FlowchartRecord> {
    return request<FlowchartRecord>(`/flowcharts/${encodeURIComponent(id)}`);
  },

  create(payload: {
    name: string;
    description?: string;
    tags?: string[];
    status?: FlowchartStatus;
    backgroundColor?: string;
  }): Promise<FlowchartRecord> {
    return request<FlowchartRecord>('/flowcharts', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  update(
    id: string,
    payload: Partial<
      Pick<
        FlowchartRecord,
        | 'name'
        | 'description'
        | 'tags'
        | 'status'
        | 'archived'
        | 'backgroundColor'
        | 'lanes'
        | 'nodes'
        | 'edges'
        | 'comments'
        | 'shares'
      >
    >,
    options?: { keepalive?: boolean },
  ): Promise<FlowchartRecord> {
    return request<FlowchartRecord>(`/flowcharts/${encodeURIComponent(id)}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
      keepalive: options?.keepalive,
    });
  },

  duplicate(id: string): Promise<FlowchartRecord> {
    return request<FlowchartRecord>(
      `/flowcharts/${encodeURIComponent(id)}/duplicate`,
      { method: 'POST' },
    );
  },

  remove(id: string): Promise<{ deleted: true; id: string }> {
    return request<{ deleted: true; id: string }>(
      `/flowcharts/${encodeURIComponent(id)}`,
      { method: 'DELETE' },
    );
  },

  createVersion(id: string, label?: string): Promise<FlowchartRecord> {
    return request<FlowchartRecord>(
      `/flowcharts/${encodeURIComponent(id)}/versions`,
      {
        method: 'POST',
        body: JSON.stringify({ label }),
      },
    );
  },

  restoreVersion(id: string, versionId: string): Promise<FlowchartRecord> {
    return request<FlowchartRecord>(
      `/flowcharts/${encodeURIComponent(id)}/versions/${encodeURIComponent(versionId)}/restore`,
      { method: 'POST' },
    );
  },

  generateNewWithAi(payload: {
    text: string;
    title?: string;
  }): Promise<FlowchartRecord> {
    return request<FlowchartRecord>(
      '/flowcharts/ai/generate',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      { timeoutMs: 45_000 },
    );
  },

  applyAiToExisting(
    id: string,
    payload: { text: string; title?: string },
  ): Promise<FlowchartRecord> {
    return request<FlowchartRecord>(
      `/flowcharts/${encodeURIComponent(id)}/ai/generate`,
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
      { timeoutMs: 45_000 },
    );
  },

  summarizeForExport(id: string): Promise<FlowchartAiSummary> {
    return request<FlowchartAiSummary>(
      `/flowcharts/${encodeURIComponent(id)}/ai/summary`,
      { method: 'POST' },
      { timeoutMs: 45_000 },
    );
  },
};
