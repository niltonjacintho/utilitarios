'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AuthUser, HubConfigResponse } from '@/types/hub';
import { authApi } from '@/lib/auth';
import { HubHeader } from './HubHeader';
import { HubWorkspace } from './HubWorkspace';

interface HubShellProps {
  config: HubConfigResponse;
}

export function HubShell({ config }: HubShellProps) {
  const router = useRouter();
  const [checkingAuth, setCheckingAuth] = useState(true);
  const [user, setUser] = useState<AuthUser | null>(null);

  useEffect(() => {
    let active = true;

    async function verifySession() {
      try {
        const res = await authApi.me();
        if (!active) return;

        if (!res.authenticated || !res.user) {
          router.replace('/login');
          return;
        }

        setUser(res.user);
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

    void verifySession();
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
