'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { authApi } from '@/lib/auth';

type AuthMode = 'login' | 'register';

export function LoginView() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const redirectParam = searchParams.get('redirect');
  const queryError = searchParams.get('error');

  const [mode, setMode] = useState<AuthMode>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(queryError);
  const [googleEnabled, setGoogleEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    if (queryError) setError(queryError);
  }, [queryError]);

  useEffect(() => {
    let active = true;

    async function bootstrap() {
      try {
        const [meRes, providersRes] = await Promise.all([
          authApi.me().catch(() => ({ authenticated: false, user: null })),
          authApi.providers().catch(() => ({ local: true, google: false })),
        ]);
        if (!active) return;

        setGoogleEnabled(providersRes.google);

        if (meRes.authenticated && meRes.user) {
          if (redirectParam && /^https?:\/\//i.test(redirectParam)) {
            window.location.href = redirectParam;
          } else {
            router.replace(redirectParam || '/');
          }
        }
      } catch {
        // ignore
      }
    }

    void bootstrap();
    return () => {
      active = false;
    };
  }, [redirectParam, router]);

  const navigateAfterAuth = () => {
    if (redirectParam && /^https?:\/\//i.test(redirectParam)) {
      window.location.href = redirectParam;
      return;
    }
    router.replace(redirectParam || '/');
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (mode === 'login') {
        await authApi.login({ email, password });
      } else {
        await authApi.register({ name, email, password });
      }
      navigateAfterAuth();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Não foi possível concluir a autenticação.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = () => {
    setError(null);
    if (googleEnabled === false) {
      setError(
        'Autenticação com Google ainda não está configurada no backend. Defina GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET em backend/.env.',
      );
      return;
    }
    window.location.href = authApi.getGoogleAuthUrl(redirectParam);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#F5F7FA]">
      {/* Cabeçalho simples mantendo identidade visual do Hub */}
      <header className="w-full bg-[#003884] text-white shadow-[0_1px_4px_rgba(0,24,64,0.18)]">
        <div className="mx-auto flex h-[60px] w-full max-w-[1440px] items-center px-6 sm:px-8">
          <div className="flex items-center gap-3">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-white"
              aria-hidden="true"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={1.8}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
              >
                <rect x="4" y="4" width="6.5" height="6.5" rx="1.4" />
                <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.4" />
                <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.4" />
                <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.4" />
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="text-[15px] font-semibold leading-tight text-white">
                Protótipos
              </span>
              <span className="mt-0.5 text-[11.5px] leading-tight text-blue-100/80">
                Plataforma de modelagem e diagramas
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-[430px] overflow-hidden rounded-2xl border border-[#E4EAF2] bg-white shadow-[0_8px_30px_rgba(12,35,64,0.06)]">
          <div className="px-7 pt-7 pb-5">
            <h1 className="text-[22px] font-bold tracking-tight text-[#0C2340]">
              {mode === 'login' ? 'Acessar a plataforma' : 'Criar sua conta'}
            </h1>
            <p className="mt-1 text-[13.5px] text-[#64748B]">
              {mode === 'login'
                ? 'Entre para acessar suas soluções e mapas salvos.'
                : 'Cada usuário possui sua própria biblioteca de mapas e compartilhamentos.'}
            </p>

            {/* Seletor Entrar / Criar conta */}
            <div className="mt-5 grid grid-cols-2 rounded-lg bg-[#F1F5F9] p-1">
              <button
                type="button"
                onClick={() => {
                  setMode('login');
                  setError(null);
                }}
                className={[
                  'rounded-md py-1.5 text-[13.5px] font-semibold transition-all',
                  mode === 'login'
                    ? 'bg-white text-[#003884] shadow-sm'
                    : 'text-[#64748B] hover:text-[#0C2340]',
                ].join(' ')}
              >
                Entrar
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode('register');
                  setError(null);
                }}
                className={[
                  'rounded-md py-1.5 text-[13.5px] font-semibold transition-all',
                  mode === 'register'
                    ? 'bg-white text-[#003884] shadow-sm'
                    : 'text-[#64748B] hover:text-[#0C2340]',
                ].join(' ')}
              >
                Criar conta
              </button>
            </div>
          </div>

          <div className="px-7 pb-7">
            {/* Botão Google OAuth 2.0 */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              className="flex h-11 w-full items-center justify-center gap-2.5 rounded-xl border border-[#CBD5E1] bg-white px-4 text-[14px] font-medium text-[#0C2340] transition-colors hover:bg-[#F8FAFC]"
            >
              <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden="true">
                <path
                  fill="#4285F4"
                  d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.44a5.51 5.51 0 0 1-2.39 3.62v3h3.87c2.26-2.08 3.57-5.15 3.57-8.65z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.87-3c-1.07.72-2.44 1.15-4.06 1.15-3.12 0-5.77-2.11-6.72-4.95H1.28v3.1A12 12 0 0 0 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.29A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.38-2.29v-3.1H1.28A12 12 0 0 0 0 12c0 1.94.46 3.77 1.28 5.39l4-3.1z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.76c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.61l4 3.1c.95-2.84 3.6-4.95 6.72-4.95z"
                />
              </svg>
              <span>Continuar com Google</span>
            </button>

            <div className="my-5 flex items-center gap-3">
              <div className="h-px flex-1 bg-[#E4EAF2]" />
              <span className="text-[12px] font-medium uppercase tracking-wider text-[#94A3B8]">
                ou com e-mail
              </span>
              <div className="h-px flex-1 bg-[#E4EAF2]" />
            </div>

            {error && (
              <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] leading-snug text-red-700">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              {mode === 'register' && (
                <div>
                  <label
                    htmlFor="auth-name"
                    className="block text-[13px] font-medium text-[#334155]"
                  >
                    Nome completo
                  </label>
                  <input
                    id="auth-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Ex.: Maria Silva"
                    className="mt-1.5 h-10 w-full rounded-xl border border-[#CBD5E1] px-3.5 text-[14px] text-[#0C2340] outline-none transition-colors focus:border-[#003884]"
                  />
                </div>
              )}

              <div>
                <label
                  htmlFor="auth-email"
                  className="block text-[13px] font-medium text-[#334155]"
                >
                  E-mail
                </label>
                <input
                  id="auth-email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="voce@empresa.com"
                  className="mt-1.5 h-10 w-full rounded-xl border border-[#CBD5E1] px-3.5 text-[14px] text-[#0C2340] outline-none transition-colors focus:border-[#003884]"
                />
              </div>

              <div>
                <label
                  htmlFor="auth-password"
                  className="block text-[13px] font-medium text-[#334155]"
                >
                  Senha
                </label>
                <input
                  id="auth-password"
                  type="password"
                  required
                  minLength={6}
                  autoComplete={
                    mode === 'login' ? 'current-password' : 'new-password'
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Mínimo 6 caracteres"
                  className="mt-1.5 h-10 w-full rounded-xl border border-[#CBD5E1] px-3.5 text-[14px] text-[#0C2340] outline-none transition-colors focus:border-[#003884]"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="h-11 w-full rounded-xl bg-[#003884] text-[14px] font-semibold text-white transition-colors hover:bg-[#002D6B] disabled:opacity-60"
              >
                {submitting
                  ? mode === 'login'
                    ? 'Entrando...'
                    : 'Criando conta...'
                  : mode === 'login'
                    ? 'Entrar'
                    : 'Criar conta e entrar'}
              </button>
            </form>

            {mode === 'login' && (
              <p className="mt-4 text-center text-[12px] text-[#64748B]">
                Conta inicial de teste: <code>nilton@hub.local</code> /{' '}
                <code>123456</code>
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
