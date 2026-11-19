'use client';

import React, { useState } from 'react';
import { HubSolution } from '@/types/hub';
import { SolutionIcon } from './SolutionIcon';

interface HubWorkspaceProps {
  heading: string;
  subheading: string;
  solutions: HubSolution[];
}

export function HubWorkspace({
  heading,
  subheading,
  solutions,
}: HubWorkspaceProps) {
  const [activeId, setActiveId] = useState<string | null>(null);

  const activeSolution =
    solutions.find((solution) => solution.id === activeId) ?? null;

  return (
    <main className="mx-auto w-full max-w-[980px] flex-1 px-6 pt-14 pb-16 sm:pt-20">
      <section aria-labelledby="hub-heading">
        <div>
          <h1
            id="hub-heading"
            className="text-[28px] font-bold tracking-[-0.02em] text-[#0C2340] sm:text-[31px]"
          >
            {heading}
          </h1>
          <p className="mt-1.5 text-[14.5px] text-[#64748B]">{subheading}</p>
        </div>

        {/* Grade de 4 soluções */}
        <div
          className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-4"
          onMouseLeave={() => setActiveId(null)}
        >
          {solutions.map((solution) => {
            const isActive = activeId === solution.id;

            return (
              <button
                key={solution.id}
                type="button"
                onMouseEnter={() => setActiveId(solution.id)}
                onFocus={() => setActiveId(solution.id)}
                onBlur={() =>
                  setActiveId((current) =>
                    current === solution.id ? null : current,
                  )
                }
                onClick={(event) => {
                  if (solution.url) {
                    window.location.href = solution.url;
                    return;
                  }
                  event.preventDefault();
                }}
                aria-describedby={
                  isActive ? `solution-detail-${solution.id}` : undefined
                }
                className={[
                  'group flex min-h-[214px] flex-col justify-between rounded-2xl bg-white p-6 text-left outline-none transition-all duration-200',
                  isActive
                    ? 'border border-[#2675D9] shadow-[0_6px_22px_-6px_rgba(0,102,204,0.16)] -translate-y-[1px]'
                    : 'border border-[#E4EAF2] shadow-[0_1px_2px_rgba(12,35,64,0.03)] hover:border-[#2675D9]',
                ].join(' ')}
              >
                <div>
                  <div
                    className={[
                      'mb-5 flex h-11 w-11 items-center justify-center rounded-xl transition-colors duration-200',
                      isActive
                        ? 'bg-[#E5F0FD] text-[#0060C7]'
                        : 'bg-[#EEF5FD] text-[#0066CC]',
                    ].join(' ')}
                  >
                    <SolutionIcon name={solution.icon} />
                  </div>

                  <h2 className="text-[17px] font-bold tracking-[-0.01em] text-[#0C2340]">
                    {solution.name}
                  </h2>

                  <p className="mt-2 text-[13.5px] leading-[1.45] text-[#5A6B7C]">
                    {solution.shortDescription}
                  </p>
                </div>

                <div className="mt-6 inline-flex items-center gap-1.5 text-[13.5px] font-medium text-[#0066CC]">
                  <span>{solution.actionLabel}</span>
                  <svg
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={1.7}
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5"
                    aria-hidden="true"
                  >
                    <path d="M3.5 8h9" />
                    <path d="M9 4.5 12.5 8 9 11.5" />
                  </svg>
                </div>
              </button>
            );
          })}
        </div>

        {/* Painel de detalhe exibido no hover (modelo da imagem 1) */}
        <div className="mt-5 min-h-[104px]" aria-live="polite">
          <div
            id={
              activeSolution
                ? `solution-detail-${activeSolution.id}`
                : undefined
            }
            className={[
              'relative overflow-hidden rounded-xl border border-[#E4EAF2] bg-white px-6 py-4 shadow-[0_2px_10px_rgba(12,35,64,0.04)] transition-all duration-200',
              activeSolution
                ? 'translate-y-0 opacity-100'
                : 'pointer-events-none translate-y-1 opacity-0',
            ].join(' ')}
          >
            <span
              className="absolute inset-y-0 left-0 w-[3.5px] bg-[#1976D2]"
              aria-hidden="true"
            />
            {activeSolution ? (
              <>
                <h3 className="text-[14.5px] font-bold text-[#0C2340]">
                  {activeSolution.name}
                </h3>
                <p className="mt-1 text-[13.5px] leading-[1.55] text-[#5A6B7C]">
                  {activeSolution.detailedDescription}
                </p>
              </>
            ) : (
              <div className="invisible" aria-hidden="true">
                <h3 className="text-[14.5px] font-bold">Placeholder</h3>
                <p className="mt-1 text-[13.5px] leading-[1.55]">
                  Placeholder description to reserve vertical space without layout shift.
                </p>
              </div>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
