'use client';

import React from 'react';
import { HubBrand, HubUser } from '@/types/hub';

interface HubHeaderProps {
  brand: HubBrand;
  user: HubUser;
  onLogout?: () => void;
}

export function HubHeader({ brand, user, onLogout }: HubHeaderProps) {
  return (
    <header className="w-full bg-[#003884] text-white shadow-[0_1px_4px_rgba(0,24,64,0.18)]">
      <div className="mx-auto flex h-[60px] w-full max-w-[1440px] items-center justify-between px-6 sm:px-8">
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
              {brand.title}
            </span>
            <span className="mt-0.5 text-[11.5px] leading-tight text-blue-100/80">
              {brand.subtitle}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2.5">
            {user.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt={user.displayName}
                referrerPolicy="no-referrer"
                className="h-8 w-8 rounded-full border border-white/30 object-cover"
              />
            ) : (
              <div
                className="flex h-8 w-8 items-center justify-center rounded-full bg-[#1976D2] text-[12px] font-semibold tracking-wide text-white shadow-inner"
                aria-hidden="true"
              >
                {user.initials}
              </div>
            )}
            <div className="hidden flex-col sm:flex">
              <span className="text-[13.5px] font-medium leading-tight text-white/95">
                {user.displayName}
              </span>
              {user.email && (
                <span className="text-[11px] leading-tight text-blue-100/75">
                  {user.email}
                </span>
              )}
            </div>
          </div>

          {onLogout && (
            <>
              <span className="h-5 w-px bg-white/20" aria-hidden="true" />
              <button
                type="button"
                onClick={onLogout}
                className="rounded-md border border-white/25 bg-white/5 px-2.5 py-1.5 text-[12.5px] font-medium text-white transition-colors hover:bg-white/15"
              >
                Sair
              </button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
