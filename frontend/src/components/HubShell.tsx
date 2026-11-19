'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthUser, HubConfigResponse } from '@/types/hub';
import { authApi } from '@/lib/auth';
import { FALLBACK_HUB_CONFIG, fetchHubConfig } from '@/lib/api';
import { HubHeader } from './HubHeader';
import { HubWorkspace } from './HubWorkspace';

interface HubShellProps {
  initialConfig?: HubConfigResponse;
}

export function HubShell({ initialConfig }: HubShellProps) {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [config, setConfig] = useState<HubConfigResponse>(
    initialConfig ?? FALLBACK_HUB_CONFIG,
  );

  useEffect(() => {
    let active = true;

    async function bootstrapHub() {
      try {
        const [authRes, hubRes] = await Promise.all([
          authApi.me(),
          fetchHubConfig(),
        ]);
        if (!active) return;

        if (!authRes.authenticated || !authRes.user) {
          router.replace('/login');
          return;
        }

        setConfig(hubRes.data);
        setUser(authRes.user);
      } catch {
        if (active) {
          router.replace('/login');
        }
      } finally {
        if (active) {
          setCheckingAuth(false);
        }
      }
    }

    void bootstrapHub();
    return () => {
      active = false;
    };
  }, [router]);

  const handleLogout = async () => {
    try {
      await authApi.logout();
    } finally {
      router.replace('/login');
    }
  };

  if (checkingAuth || !user) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#F5F7FA] text-[#5A6B7C]">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#003884] border-t-transparent" />
        <p className="mt-3 text-[14px]">Verificando sessão...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-[#F5F7FA]">
      <HubHeader
        brand={config.brand}
        user={{
          displayName: user.name,
          initials: user.initials,
          email: user.email,
          avatarUrl: user.avatarUrl,
        }}
        onLogout={() => void handleLogout()}
      />
      <HubWorkspace
        heading={config.heading}
        subheading={config.subheading}
        solutions={config.solutions}
      />
    </div>
  );
}
