import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import type { CookieOptions, Request } from 'express';
import { DatabaseService } from '../database/database.service';
import {
  AuthProvider,
  AuthProvidersResponse,
  AuthUser,
  LoginInput,
  RegisterInput,
} from './auth.types';
import { hashPassword, verifyPassword } from './password.util';

export const SESSION_COOKIE_NAME = 'hub_session';
export const OAUTH_STATE_COOKIE_NAME = 'hub_oauth_state';

interface UserRow {
  id: string;
  name: string;
  email: string;
  password_hash: string | null;
  google_id: string | null;
  avatar_url: string | null;
  provider: AuthProvider;
  created_at: string;
  updated_at: string;
}

interface GoogleTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface GoogleUserInfo {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  picture?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly googleClientId: string;
  private readonly googleClientSecret: string;
  private readonly googleCallbackUrl: string;
  private readonly hubAppUrl: string;
  private readonly allowedOrigins: string[];
  private readonly sessionTtlDays: number;
  private readonly cookieSameSite: 'lax' | 'none' | 'strict';
  private readonly cookieSecure: boolean;
  private readonly cookieDomain: string | undefined;

  constructor(
    private readonly db: DatabaseService,
    private readonly configService: ConfigService,
  ) {
    this.googleClientId = (
      this.configService.get<string>('GOOGLE_CLIENT_ID') ?? ''
    ).trim();
    this.googleClientSecret = (
      this.configService.get<string>('GOOGLE_CLIENT_SECRET') ?? ''
    ).trim();
    this.googleCallbackUrl =
      (this.configService.get<string>('GOOGLE_CALLBACK_URL') ?? '').trim() ||
      'http://localhost:3001/api/auth/google/callback';
    this.hubAppUrl =
      (this.configService.get<string>('HUB_APP_URL') ?? '').trim() ||
      'http://localhost:3000';

    const mindmapAppUrl =
      (this.configService.get<string>('MINDMAP_APP_URL') ?? '').trim() ||
      'http://localhost:3002';
    const flowchartAppUrl =
      (this.configService.get<string>('FLOWCHART_APP_URL') ?? '').trim() ||
      'http://localhost:3003';
    const erstudioAppUrl =
      (this.configService.get<string>('ERSTUDIO_APP_URL') ?? '').trim() ||
      'http://localhost:3004';
    const corsOrigins = (
      this.configService.get<string>('CORS_ORIGIN') ??
      'http://localhost:3000,http://localhost:3002,http://localhost:3003,http://localhost:3004'
    )
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);

    this.allowedOrigins = Array.from(
      new Set([
        this.hubAppUrl,
        mindmapAppUrl,
        flowchartAppUrl,
        erstudioAppUrl,
        ...corsOrigins,
      ]),
    );

    const rawTtl = Number(this.configService.get<string>('SESSION_TTL_DAYS') ?? 7);
    this.sessionTtlDays = Number.isFinite(rawTtl) && rawTtl > 0 ? rawTtl : 7;

    // Configuração automática de cookies para PRD (HTTPS / cross-site / subdomínios)
    const isProd =
      (this.configService.get<string>('NODE_ENV') ?? '').toLowerCase() ===
        'production' || this.hubAppUrl.startsWith('https://');

    const rawDomain = (
      this.configService.get<string>('COOKIE_DOMAIN') ?? ''
    ).trim();
    this.cookieDomain = rawDomain || undefined;

    const rawSameSite = (
      this.configService.get<string>('COOKIE_SAME_SITE') ?? ''
    )
      .trim()
      .toLowerCase();
    if (
      rawSameSite === 'lax' ||
      rawSameSite === 'none' ||
      rawSameSite === 'strict'
    ) {
      this.cookieSameSite = rawSameSite;
    } else {
      // Sem domínio compartilhado em HTTPS/PRD -> 'none' para funcionar entre *.pages.dev e *.koyeb.app
      this.cookieSameSite = isProd && !this.cookieDomain ? 'none' : 'lax';
    }

    const rawSecure = (
      this.configService.get<string>('COOKIE_SECURE') ?? ''
    )
      .trim()
      .toLowerCase();
    if (rawSecure === 'true' || rawSecure === '1') {
      this.cookieSecure = true;
    } else if (rawSecure === 'false' || rawSecure === '0') {
      this.cookieSecure = false;
    } else {
      this.cookieSecure = this.cookieSameSite === 'none' || isProd;
    }
  }

  getCookieOptions(maxAge?: number, forOauthState = false): CookieOptions {
    // OAuth state precisa sobreviver ao redirecionamento de volta do Google -> 'lax' ou 'none'
    const sameSite = forOauthState
      ? this.cookieSameSite === 'strict'
        ? 'lax'
        : this.cookieSameSite
      : this.cookieSameSite;

    return {
      httpOnly: true,
      sameSite,
      secure: this.cookieSecure || sameSite === 'none',
      path: '/',
      ...(this.cookieDomain ? { domain: this.cookieDomain } : {}),
      ...(maxAge !== undefined ? { maxAge } : {}),
    };
  }

  getProviders(): AuthProvidersResponse {
    return {
      local: true,
      google: this.isGoogleConfigured(),
    };
  }

  isGoogleConfigured(): boolean {
    return Boolean(this.googleClientId && this.googleClientSecret);
  }

  getHubAppUrl(): string {
    return this.hubAppUrl;
  }

  getSessionMaxAgeMs(): number {
    return this.sessionTtlDays * 24 * 60 * 60 * 1000;
  }

  sanitizeRedirectUrl(candidate?: string | null): string {
    if (!candidate) return this.hubAppUrl;
    const trimmed = candidate.trim();
    if (trimmed.startsWith('/')) {
      return `${this.hubAppUrl.replace(/\/$/, '')}${trimmed}`;
    }

    try {
      const parsed = new URL(trimmed);
      const allowed = this.allowedOrigins.some((origin) => {
        try {
          return new URL(origin).origin === parsed.origin;
        } catch {
          return false;
        }
      });
      return allowed ? parsed.toString() : this.hubAppUrl;
    } catch {
      return this.hubAppUrl;
    }
  }

  async register(
    input: RegisterInput,
  ): Promise<{ user: AuthUser; token: string }> {
    const name = input.name?.trim();
    const email = input.email?.trim().toLowerCase();
    const password = input.password ?? '';

    if (!name || name.length < 2) {
      throw new BadRequestException('Informe seu nome (mínimo 2 caracteres).');
    }
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw new BadRequestException('Informe um e-mail válido.');
    }
    if (password.length < 6) {
      throw new BadRequestException(
        'A senha deve ter no mínimo 6 caracteres.',
      );
    }

    const existing = await this.db.queryOne<{ id: string }>(
      'SELECT id FROM users WHERE LOWER(email) = LOWER(?)',
      [email],
    );

    if (existing) {
      throw new ConflictException(
        'Já existe uma conta cadastrada com este e-mail.',
      );
    }

    const id = randomUUID();
    const now = new Date().toISOString();
    const passwordHash = hashPassword(password);

    await this.db.execute(
      `INSERT INTO users (id, name, email, password_hash, provider, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'local', ?, ?)`,
      [id, name, email, passwordHash, now, now],
    );

    const row = (await this.db.queryOne<UserRow>(
      'SELECT * FROM users WHERE id = ?',
      [id],
    ))!;

    const user = this.toAuthUser(row);
    const token = await this.createSession(user.id);
    return { user, token };
  }

  async login(input: LoginInput): Promise<{ user: AuthUser; token: string }> {
    const email = input.email?.trim().toLowerCase();
    const password = input.password ?? '';

    if (!email || !password) {
      throw new BadRequestException('Informe e-mail e senha.');
    }

    const row = await this.db.queryOne<UserRow>(
      'SELECT * FROM users WHERE LOWER(email) = LOWER(?)',
      [email],
    );

    if (!row) {
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }

    if (!row.password_hash) {
      throw new UnauthorizedException(
        'Esta conta foi criada com Google. Use o botão "Continuar com Google".',
      );
    }

    if (!verifyPassword(password, row.password_hash)) {
      throw new UnauthorizedException('E-mail ou senha inválidos.');
    }

    const user = this.toAuthUser(row);
    const token = await this.createSession(user.id);
    return { user, token };
  }

  async logout(token?: string | null): Promise<void> {
    if (!token) return;
    const tokenHash = this.hashToken(token);
    await this.db.execute('DELETE FROM sessions WHERE token_hash = ?', [
      tokenHash,
    ]);
  }

  async getUserBySessionToken(token?: string | null): Promise<AuthUser | null> {
    if (!token) return null;
    const tokenHash = this.hashToken(token);

    const row = await this.db.queryOne<UserRow & { expires_at: string }>(
      `SELECT u.*, s.expires_at
       FROM sessions s
       INNER JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ?`,
      [tokenHash],
    );

    if (!row) return null;

    if (new Date(row.expires_at).getTime() <= Date.now()) {
      await this.db.execute('DELETE FROM sessions WHERE token_hash = ?', [
        tokenHash,
      ]);
      return null;
    }

    return this.toAuthUser(row);
  }

  buildGoogleAuthorizationUrl(state: string): string {
    if (!this.isGoogleConfigured()) {
      throw new ServiceUnavailableException(
        'Autenticação com Google não configurada. Defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET em backend/.env.',
      );
    }

    const params = new URLSearchParams({
      client_id: this.googleClientId,
      redirect_uri: this.googleCallbackUrl,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'offline',
      prompt: 'select_account',
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async completeGoogleLogin(
    code: string,
  ): Promise<{ user: AuthUser; token: string }> {
    if (!this.isGoogleConfigured()) {
      throw new ServiceUnavailableException(
        'Autenticação com Google não configurada.',
      );
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: this.googleClientId,
        client_secret: this.googleClientSecret,
        redirect_uri: this.googleCallbackUrl,
        grant_type: 'authorization_code',
      }),
    });

    const tokenData = (await tokenRes.json()) as GoogleTokenResponse;
    if (!tokenRes.ok || !tokenData.access_token) {
      this.logger.error(
        `Falha ao trocar código OAuth do Google: ${tokenData.error_description ?? tokenData.error ?? tokenRes.status}`,
      );
      throw new UnauthorizedException(
        'Não foi possível validar o login com o Google.',
      );
    }

    const profileRes = await fetch(
      'https://www.googleapis.com/oauth2/v3/userinfo',
      {
        headers: {
          Authorization: `Bearer ${tokenData.access_token}`,
        },
      },
    );

    const profile = (await profileRes.json()) as GoogleUserInfo;
    if (!profileRes.ok || !profile.sub || !profile.email) {
      throw new UnauthorizedException(
        'Não foi possível obter os dados da conta Google.',
      );
    }

    const email = profile.email.trim().toLowerCase();
    const displayName = profile.name?.trim() || email.split('@')[0];
    const avatarUrl = profile.picture?.trim() || null;
    const now = new Date().toISOString();

    let userRow = await this.db.queryOne<UserRow>(
      'SELECT * FROM users WHERE google_id = ?',
      [profile.sub],
    );

    if (!userRow) {
      userRow = await this.db.queryOne<UserRow>(
        'SELECT * FROM users WHERE LOWER(email) = LOWER(?)',
        [email],
      );
    }

    let userId: string;
    if (userRow) {
      userId = userRow.id;
      const nextProvider: AuthProvider = userRow.password_hash
        ? 'both'
        : 'google';
      await this.db.execute(
        `UPDATE users
         SET google_id = ?, avatar_url = COALESCE(?, avatar_url), provider = ?, updated_at = ?
         WHERE id = ?`,
        [profile.sub, avatarUrl, nextProvider, now, userId],
      );
    } else {
      userId = randomUUID();
      await this.db.execute(
        `INSERT INTO users (id, name, email, google_id, avatar_url, provider, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, 'google', ?, ?)`,
        [userId, displayName, email, profile.sub, avatarUrl, now, now],
      );
    }

    const updatedRow = (await this.db.queryOne<UserRow>(
      'SELECT * FROM users WHERE id = ?',
      [userId],
    ))!;

    const user = this.toAuthUser(updatedRow);
    const token = await this.createSession(user.id);
    return { user, token };
  }

  extractCookie(req: Request, name: string): string | null {
    const cookieHeader = req.headers.cookie;
    if (!cookieHeader) return null;

    const cookies = cookieHeader.split(';');
    for (const part of cookies) {
      const idx = part.indexOf('=');
      if (idx === -1) continue;
      const key = part.slice(0, idx).trim();
      if (key === name) {
        return decodeURIComponent(part.slice(idx + 1).trim());
      }
    }
    return null;
  }

  extractSessionToken(req: Request): string | null {
    const cookieToken = this.extractCookie(req, SESSION_COOKIE_NAME);
    if (cookieToken) return cookieToken;

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7).trim() || null;
    }
    return null;
  }

  private async createSession(userId: string): Promise<string> {
    const token = randomBytes(32).toString('hex');
    const tokenHash = this.hashToken(token);
    const now = new Date();
    const expiresAt = new Date(
      now.getTime() + this.getSessionMaxAgeMs(),
    ).toISOString();

    await this.db.execute(
      `INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
       VALUES (?, ?, ?, ?)`,
      [tokenHash, userId, expiresAt, now.toISOString()],
    );

    return token;
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private toAuthUser(row: UserRow): AuthUser {
    return {
      id: row.id,
      name: row.name,
      email: row.email,
      initials: this.computeInitials(row.name),
      avatarUrl: row.avatar_url ?? null,
      provider: row.provider,
    };
  }

  private computeInitials(name: string): string {
    const cleaned = name.replace(/,/g, ' ').trim();
    const parts = cleaned.split(/\s+/).filter(Boolean);
    if (parts.length === 0) return 'US';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  }
}
