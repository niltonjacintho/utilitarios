'use client';

import React from 'react';
import { ArrowLeft, Database, LogOut } from 'lucide-react';
import { HUB_URL } from '@/lib/api';
import { AuthUser } from '@/types/erstudio';

interface TopBarProps {
  user: AuthUser;
  inEditor: boolean;
  saving?: boolean;
  dirty?: boolean;
  autoSave?: boolean;
  onToggleAutoSave?: (enabled: boolean) => void;
  onManualSave?: () => void;
  onGoHome: () => void;
  onLogout: () => void;
}

export function TopBar({
  user,
  inEditor,
  saving = false,
  dirty = false,
  autoSave = true,
  onToggleAutoSave,
  onManualSave,
  onGoHome,
  onLogout,
}: TopBarProps) {
  return (
    <header className="flex h-[54px] shrink-0 items-center justify-between bg-[#0F1D3D] px-5 text-white shadow-sm">
      <div className="flex items-center gap-4">
        <button
          type="button"
          onClick={onGoHome}
          className="flex items-center gap-2.5 text-left transition-opacity hover:opacity-90"
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/15 text-white">
            <Database className="h-4 w-4" />
          </span>
          <span className="flex flex-col">
            <span className="text-[15px] font-bold leading-tight text-white">
              ER Studio
            </span>
            <span className="text-[11px] leading-tight text-blue-200/80">
              Modelagem de DER
            </span>
          </span>
        </button>

        <a
          href={HUB_URL}
          className="inline-flex items-center gap-1 rounded-md border border-white/20 bg-white/5 px-2.5 py-1 text-[12px] font-medium text-blue-100 transition-colors hover:bg-white/15 hover:text-white"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Hub
        </a>
      </div>

      <div className="flex items-center gap-3.5">
        <div className="flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1">
          {user.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user.name}
              referrerPolicy="no-referrer"
              className="h-5 w-5 rounded-full object-cover"
            />
          ) : (
            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-[#2563EB] text-[10px] font-bold text-white">
              {user.initials}
            </span>
          )}
          <span className="text-[12.5px] font-medium text-white">
            {user.name}
          </span>
        </div>

        {inEditor && (
          <>
            <span className="text-[12.5px] text-blue-200">
              {saving ? 'Salvando...' : dirty ? 'Alterações pendentes' : 'Tudo salvo'}
            </span>

            {onToggleAutoSave && (
              <label className="hidden cursor-pointer items-center gap-1.5 text-[12.5px] text-blue-100 md:inline-flex">
                <input
                  type="checkbox"
                  checked={autoSave}
                  onChange={(e) => onToggleAutoSave(e.target.checked)}
                  className="h-3.5 w-3.5 rounded accent-[#2563EB]"
                />
                Salvar automaticamente
              </label>
            )}

            {!autoSave && dirty && onManualSave && (
              <button
                type="button"
                onClick={onManualSave}
                className="rounded-md bg-[#2563EB] px-2.5 py-1 text-[12px] font-semibold text-white hover:bg-[#1D4ED8]"
              >
                Salvar
              </button>
            )}
          </>
        )}

        <button
          type="button"
          onClick={onLogout}
          title="Sair"
          className="inline-flex items-center gap-1 rounded-md border border-white/20 bg-white/5 px-2.5 py-1 text-[12px] font-medium text-blue-100 hover:bg-white/15 hover:text-white"
        >
          <LogOut className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Sair</span>
        </button>
      </div>
    </header>
  );
}
