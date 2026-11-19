import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import {
  AuthService,
  OAUTH_STATE_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from './auth.service';
import { LoginInput, RegisterInput } from './auth.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Get('providers')
  getProviders() {
    return this.authService.getProviders();
  }

  @Get('me')
  me(@Req() req: Request) {
    const token = this.authService.extractSessionToken(req);
    const user = this.authService.getUserBySessionToken(token);
    return {
      authenticated: Boolean(user),
      user,
    };
  }

  @Post('register')
  register(
    @Body() body: RegisterInput,
    @Res({ passthrough: true }) res: Response,
  ) {
    const { user, token } = this.authService.register(body);
    this.setSessionCookie(res, token);
    return { user };
  }

  @Post('login')
  @HttpCode(200)
  login(@Body() body: LoginInput, @Res({ passthrough: true }) res: Response) {
    const { user, token } = this.authService.login(body);
    this.setSessionCookie(res, token);
    return { user };
  }

  @Post('logout')
  @HttpCode(200)
  logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = this.authService.extractSessionToken(req);
    this.authService.logout(token);
    res.clearCookie(SESSION_COOKIE_NAME, { path: '/' });
    return { loggedOut: true };
  }

  @Get('google')
  googleStart(
    @Query('redirect') redirect: string | undefined,
    @Res() res: Response,
  ) {
    const targetUrl = this.authService.sanitizeRedirectUrl(redirect);

    if (!this.authService.isGoogleConfigured()) {
      const loginUrl = new URL('/login', this.authService.getHubAppUrl());
      loginUrl.searchParams.set(
        'error',
        'Autenticação com Google não configurada. Defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET em backend/.env.',
      );
      if (redirect) loginUrl.searchParams.set('redirect', targetUrl);
      return res.redirect(loginUrl.toString());
    }

    const state = randomBytes(24).toString('hex');
    const statePayload = JSON.stringify({ state, redirect: targetUrl });

    res.cookie(OAUTH_STATE_COOKIE_NAME, statePayload, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: 10 * 60 * 1000,
    });

    const authUrl = this.authService.buildGoogleAuthorizationUrl(state);
    return res.redirect(authUrl);
  }

  @Get('google/callback')
  async googleCallback(
    @Query('code') code: string | undefined,
    @Query('state') state: string | undefined,
    @Query('error') oauthError: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const rawStateCookie = this.authService.extractCookie(
      req,
      OAUTH_STATE_COOKIE_NAME,
    );
    res.clearCookie(OAUTH_STATE_COOKIE_NAME, { path: '/' });

    let expectedState: string | null = null;
    let redirectTo = this.authService.getHubAppUrl();

    if (rawStateCookie) {
      try {
        const parsed = JSON.parse(rawStateCookie) as {
          state?: string;
          redirect?: string;
        };
        expectedState = parsed.state ?? null;
        redirectTo = this.authService.sanitizeRedirectUrl(parsed.redirect);
      } catch {
        expectedState = null;
      }
    }

    const redirectWithError = (message: string) => {
      const loginUrl = new URL('/login', this.authService.getHubAppUrl());
      loginUrl.searchParams.set('error', message);
      return res.redirect(loginUrl.toString());
    };

    if (oauthError) {
      return redirectWithError('Login com Google cancelado pelo usuário.');
    }

    if (!code || !state || !expectedState || state !== expectedState) {
      return redirectWithError(
        'Estado de autenticação Google inválido ou expirado. Tente novamente.',
      );
    }

    try {
      const { token } = await this.authService.completeGoogleLogin(code);
      this.setSessionCookie(res, token);
      return res.redirect(redirectTo);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Erro ao concluir autenticação com Google.';
      return redirectWithError(message);
    }
  }

  private setSessionCookie(res: Response, token: string): void {
    res.cookie(SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: 'lax',
      path: '/',
      maxAge: this.authService.getSessionMaxAgeMs(),
    });
  }
}
