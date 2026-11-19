import { AuthProviders, AuthUser } from '@/types/hub';

const PUBLIC_API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

async function authRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${PUBLIC_API_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    let message = `Erro na autenticação (${response.status})`;
    try {
      const data = (await response.json()) as { message?: string | string[] };
      if (Array.isArray(data.message)) message = data.message.join(', ');
      else if (typeof data.message === 'string') message = data.message;
    } catch {
      // ignore json parse errors
    }
    throw new Error(message);
  }

  return (await response.json()) as T;
}

export const authApi = {
  me(): Promise<{ authenticated: boolean; user: AuthUser | null }> {
    return authRequest<{ authenticated: boolean; user: AuthUser | null }>(
      '/auth/me',
    );
  },

  providers(): Promise<AuthProviders> {
    return authRequest<AuthProviders>('/auth/providers');
  },

  login(payload: {
    email: string;
    password: string;
  }): Promise<{ user: AuthUser }> {
    return authRequest<{ user: AuthUser }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  register(payload: {
    name: string;
    email: string;
    password: string;
  }): Promise<{ user: AuthUser }> {
    return authRequest<{ user: AuthUser }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  logout(): Promise<{ loggedOut: boolean }> {
    return authRequest<{ loggedOut: boolean }>('/auth/logout', {
      method: 'POST',
    });
  },

  getGoogleAuthUrl(redirect?: string | null): string {
    const url = new URL(`${PUBLIC_API_URL}/auth/google`);
    if (redirect) {
      url.searchParams.set('redirect', redirect);
    }
    return url.toString();
  },
};
