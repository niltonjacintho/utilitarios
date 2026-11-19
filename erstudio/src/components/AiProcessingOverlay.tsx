'use client';

import React, { useEffect, useState } from 'react';
import { Loader2, Sparkles } from 'lucide-react';

const DEFAULT_STEPS = [
  'Analisando o modelo atual de tabelas e relacionamentos...',
  'Traduzindo sua solicitação em operações DDL com Gemini...',
  'Validando chaves primárias, estrangeiras e tipos...',
  'Preparando plano de revisão e script SQL...',
];

export function AiProcessingState({
  title,
  steps = DEFAULT_STEPS,
  compact = false,
}: {
  title: string;
  steps?: string[];
  compact?: boolean;
}) {
  const [elapsedSec, setElapsedSec] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);

  useEffect(() => {
    setElapsedSec(0);
    setStepIndex(0);
    const sTimer = setInterval(() => setElapsedSec((p) => p + 1), 1000);
    const stTimer = setInterval(
      () => setStepIndex((p) => (p + 1 < steps.length ? p + 1 : p)),
      3000,
    );
    return () => {
      clearInterval(sTimer);
      clearInterval(stTimer);
    };
  }, [title, steps.length]);

  return (
    <div
      role="status"
      aria-live="polite"
      className={[
        'flex flex-col items-center justify-center rounded-xl border border-[#BFDBFE] bg-gradient-to-br from-[#F8FBFF] via-[#EFF6FF] to-[#F0FDFA] text-center',
        compact ? 'px-4 py-4' : 'px-6 py-8',
      ].join(' ')}
    >
      <div className="relative flex h-12 w-12 items-center justify-center rounded-full bg-[#0F1D3D]/10 text-[#0F1D3D]">
        <Loader2 className="h-7 w-7 animate-spin" />
        <Sparkles className="absolute -right-1 -top-1 h-4 w-4 text-[#0F766E]" />
      </div>
      <h3 className="mt-3 text-[15px] font-semibold text-[#0F1D3D]">{title}</h3>
      <p className="mt-1 text-[13px] text-[#475569]">{steps[stepIndex]}</p>
      <div className="mt-4 h-1.5 w-full max-w-[260px] overflow-hidden rounded-full bg-[#DBEAFE]">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#0F1D3D] via-[#2563EB] to-[#0F766E] transition-all duration-700"
          style={{ width: `${Math.min(92, 18 + elapsedSec * 5)}%` }}
        />
      </div>
      <span className="mt-2 text-[11.5px] font-medium text-[#64748B]">
        Processando com IA • {elapsedSec}s
      </span>
    </div>
  );
}

export function AiProcessingOverlay({
  title,
  steps,
}: {
  title: string;
  steps?: string[];
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-[1.5px]">
      <div className="w-full max-w-[430px] rounded-2xl border border-[#E2E8F0] bg-white p-5 shadow-2xl">
        <AiProcessingState title={title} steps={steps} />
      </div>
    </div>
  );
}
