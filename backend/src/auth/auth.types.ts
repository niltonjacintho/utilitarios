import type { Request } from 'express';

export type AuthProvider = 'local' | 'google' | 'both';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  initials: string;
  avatarUrl: string | null;
  provider: AuthProvider;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthProvidersResponse {
  local: boolean;
  google: boolean;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}
