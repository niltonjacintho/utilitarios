'use client';

import React from 'react';
import { ArrowLeft, LogOut } from 'lucide-react';
import { HUB_URL } from '@/lib/api';
import { AuthUser } from '@/types/flowchart';

interface TopBarProps {
  user: AuthUser;
  backgroundColor: string;
  onChangeBackground: (color: string) => void;
  onResetBackground: () => void;
  onGoHome: () => void;
  onLogout: () => void;
}

export function TopBar({
  user,
  backgroundColor,
  onChangeBackground,
  onResetBackground,
  onGoHome,
  onLogout,
}: TopBarProps) {
  return (
    <header className="flex h-[52px] shrink-0 items-center justify-between bg-[#0B3B78] px-5 text-white shadow-sm">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onGoHome}
          className="flex items-baseline gap-1.5 text-left transition-opacity hover:opacity-90"
        >
          <span className="text-[16px] font-bold tracking-tight text-white">
            Modelador de Fluxogramas
          </span>
          <span className="text-[13px] font-normal text-blue-100/80">
            protótipo
          </span>
        </button>

        <a
          href={HUB_URL}
          className="inline-flex items-center gap-1 rounded-md border border-white/20 bg-white/5 px-2.5 py-1 text-[12px] font-medium text-blue-100 transition-colors hover:bg-white/15 hover:text-white"
          title="Voltar ao Hub de soluções"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Hub
        </a>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 text-[12.5px] text-blue-100">
          <span>Fundo</span>
          <label
            className="relative flex h-6 w-8 cursor-pointer items-center justify-center overflow-hidden rounded border border-white/40 shadow-inner"
            style={{ backgroundColor }}
            title="Cor de fundo do canvas"
          >
            <input
              type="color"
              value={backgroundColor}
              onChange={(e) => onChangeBackground(e.target.value)}
              className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
              aria-label="Cor de fundo"
            />
          </label>
          <button
            type="button"
            onClick={onResetBackground}
            className="rounded border border-white/25 bg-white/5 px-2.5 py-1 text-[12px] font-medium text-white transition-colors hover:bg-white/15"
          >
            Restaurar
          </button>
        </div>

        <span className="h-4 w-px bg-white/20" aria-hidden="true" />

        <div className="flex items-center gap-2">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.name}
              referrerPolicy="no-referrer"
              className="h-7 w-7 rounded-full border border-white/30 object-cover"
            />
          ) : (
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#1976D2] text-[11px] font-semibold text-white">
              {user.initials}
            </span>
          )}
          <span className="hidden text-[12.5px] font-medium text-white/95 sm:inline">
            {user.name} ({user.email})
          </span>
        </div>

        <button
          type="button"
          onClick={onLogout}
          title="Sair da conta"
          className="inline-flex items-center gap-1 rounded border border-white/25 bg-white/5 px-2 py-1 text-[12px] font-medium text-blue-100 transition-colors hover:bg-white/15 hover:text-white"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span className="hidden md:inline">Sair</span>
        </button>
      </div>
    </header>
  );
}
