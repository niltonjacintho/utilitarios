'use client';

import React, { useEffect, useState } from 'react';
import { Check, Copy, Plus, Sparkles, Trash2, Upload, X } from 'lucide-react';
import { FlowchartShare } from '@/types/flowchart';
import { AiProcessingState } from './AiProcessingOverlay';

function ModalShell({
  title,
  onClose,
  maxWidth = 'max-w-[600px]',
  children,
  footer,
}: {
  title: string;
  onClose: () => void;
  maxWidth?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-[1px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full ${maxWidth} overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-2xl`}
      >
        <div className="flex items-center justify-between border-b border-[#E2E8F0] px-6 py-4">
          <h2 className="text-[17px] font-semibold text-[#0F172A]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-[#64748B] hover:bg-[#F1F5F9] hover:text-[#0F172A]"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="px-6 py-5">{children}</div>
        {footer && (
          <div className="flex items-center justify-end gap-2 border-t border-[#E2E8F0] bg-[#FAFBFD] px-6 py-3.5">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

/* ==================== Modal IA (texto corrido -> fluxos) ==================== */
interface AiFlowchartModalProps {
  mode: 'new' | 'replace';
  initialTitle?: string;
  loading: boolean;
  error: string | null;
  onSubmit: (title: string, text: string) => void;
  onClose: () => void;
}

export function AiFlowchartModal({
  mode,
  initialTitle = '',
  loading,
  error,
  onSubmit,
  onClose,
}: AiFlowchartModalProps) {
  const [title, setTitle] = useState(initialTitle);
  const [text, setText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onSubmit(title.trim(), text.trim());
  };

  return (
    <ModalShell
      title="IA — Criar fluxograma a partir de texto"
      onClose={loading ? () => {} : onClose}
      maxWidth="max-w-[660px]"
      footer={
        <>
          <button
            type="button"
            disabled={loading}
            onClick={onClose}
            className="rounded-lg border border-[#CBD5E1] bg-white px-4 py-2 text-[13.5px] font-medium text-[#334155] hover:bg-[#F8FAFC] disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="ai-flowchart-form"
            disabled={loading || !text.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B2A5B] px-4 py-2 text-[13.5px] font-semibold text-white hover:bg-[#0B3B78] disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            {loading ? 'Criando fluxo...' : 'Gerar fluxo com IA'}
          </button>
        </>
      }
    >
      <form id="ai-flowchart-form" onSubmit={handleSubmit} className="space-y-4">
        {mode === 'new' && (
          <div>
            <label className="block text-[13px] font-medium text-[#334155]">
              Título (opcional)
            </label>
            <input
              type="text"
              disabled={loading}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Deixe em branco para a IA sugerir automaticamente"
              className="mt-1.5 h-10 w-full rounded-lg border border-[#CBD5E1] px-3.5 text-[14px] text-[#0F172A] outline-none focus:border-[#0B3B78]"
            />
          </div>
        )}

        <div>
          <label className="block text-[13px] font-medium text-[#334155]">
            Descreva o processo em texto corrido
          </label>
          <p className="mt-0.5 text-[12px] text-[#64748B]">
            A IA identifica automaticamente áreas/raias, etapas, decisões (Sim/Não), responsáveis e conexões.
          </p>
          <textarea
            rows={7}
            disabled={loading}
            value={text}
            onChange={(e) => setText(e.target.value)}
            autoFocus
            placeholder="Ex.: Quando o cliente abre um chamado no Portal, o atendimento realiza a triagem inicial. Se o problema for técnico, encaminha para a Engenharia que analisa nos logs e aplica a correção; senão, o próprio atendimento responde ao cliente. Após a correção, o cliente valida se foi resolvido: se sim, encerra o chamado; se não, reabre para a Engenharia."
            className="mt-2 w-full rounded-lg border border-[#CBD5E1] p-3.5 text-[14px] leading-relaxed text-[#0F172A] outline-none focus:border-[#0B3B78]"
          />
        </div>

        {loading && (
          <AiProcessingState
            compact
            title="Construindo fluxograma com Gemini..."
            steps={[
              'Lendo e interpretando seu texto corrido...',
              'Identificando raias, etapas e decisões Sim/Não...',
              'Conectando fluxos e calculando o layout...',
            ]}
          />
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-2.5 text-[13px] text-red-700">
            {error}
          </div>
        )}
      </form>
    </ModalShell>
  );
}

/* ==================== Modal Novo Fluxograma ==================== */
export function NewFlowchartModal({
  loading,
  onCreate,
  onClose,
}: {
  loading: boolean;
  onCreate: (name: string, description: string) => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  return (
    <ModalShell
      title="Novo fluxograma"
      onClose={onClose}
      maxWidth="max-w-[480px]"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#CBD5E1] bg-white px-4 py-2 text-[13.5px] font-medium text-[#334155]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="new-fc-form"
            disabled={loading || !name.trim()}
            className="rounded-lg bg-[#0B2A5B] px-4 py-2 text-[13.5px] font-semibold text-white hover:bg-[#0B3B78] disabled:opacity-50"
          >
            {loading ? 'Criando...' : 'Criar'}
          </button>
        </>
      }
    >
      <form
        id="new-fc-form"
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim()) return;
          onCreate(name.trim(), description.trim());
        }}
        className="space-y-4"
      >
        <div>
          <label className="block text-[13px] font-medium text-[#334155]">
            Nome do fluxograma
          </label>
          <input
            type="text"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Aprovação de Pagamentos"
            className="mt-1.5 h-10 w-full rounded-lg border border-[#CBD5E1] px-3.5 text-[14px] text-[#0F172A] outline-none focus:border-[#0B3B78]"
          />
        </div>
        <div>
          <label className="block text-[13px] font-medium text-[#334155]">
            Descrição (opcional)
          </label>
          <textarea
            rows={3}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Descreva brevemente o objetivo do processo..."
            className="mt-1.5 w-full rounded-lg border border-[#CBD5E1] px-3.5 py-2 text-[14px] text-[#0F172A] outline-none focus:border-[#0B3B78]"
          />
        </div>
      </form>
    </ModalShell>
  );
}

/* ==================== Modal Compartilhar ==================== */
export function ShareModal({
  chartId,
  shares,
  onAddShare,
  onRemoveShare,
  onClose,
}: {
  chartId: string;
  shares: FlowchartShare[];
  onAddShare: (target: string, permission: 'view' | 'edit') => void;
  onRemoveShare: (id: string) => void;
  onClose: () => void;
}) {
  const [target, setTarget] = useState('');
  const [permission, setPermission] = useState<'view' | 'edit'>('edit');
  const [copied, setCopied] = useState(false);

  const shareUrl = `${window.location.origin}/?id=${encodeURIComponent(chartId)}`;

  return (
    <ModalShell
      title="Compartilhar fluxograma"
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-[#CBD5E1] bg-white px-4 py-2 text-[13.5px] font-medium text-[#334155]"
        >
          Fechar
        </button>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-[12px] font-semibold uppercase tracking-wide text-[#64748B]">
            Link direto
          </label>
          <div className="mt-1.5 flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={shareUrl}
              className="h-9 flex-1 rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] px-3 text-[13px] text-[#334155]"
            />
            <button
              type="button"
              onClick={async () => {
                await navigator.clipboard.writeText(shareUrl).catch(() => {});
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              }}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-3 text-[13px] font-medium text-[#0F172A]"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-emerald-600" /> Copiado
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" /> Copiar
                </>
              )}
            </button>
          </div>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!target.trim()) return;
            onAddShare(target.trim(), permission);
            setTarget('');
          }}
          className="flex flex-wrap items-center gap-2"
        >
          <input
            type="email"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="E-mail do usuário"
            className="h-10 min-w-[200px] flex-1 rounded-lg border border-[#CBD5E1] px-3.5 text-[14px] text-[#0F172A] outline-none focus:border-[#0B3B78]"
          />
          <select
            value={permission}
            onChange={(e) => setPermission(e.target.value as 'view' | 'edit')}
            className="h-10 rounded-lg border border-[#CBD5E1] bg-white px-3 text-[13.5px]"
          >
            <option value="edit">Pode editar</option>
            <option value="view">Somente leitura</option>
          </select>
          <button
            type="submit"
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#0B2A5B] px-4 text-[13.5px] font-semibold text-white"
          >
            <Plus className="h-4 w-4" /> Adicionar
          </button>
        </form>

        {shares.length === 0 ? (
          <p className="text-[13.5px] text-[#64748B]">
            Nenhuma pessoa adicionada ainda.
          </p>
        ) : (
          <ul className="max-h-[200px] divide-y divide-[#EEF2F6] overflow-y-auto rounded-lg border border-[#E2E8F0]">
            {shares.map((s) => (
              <li
                key={s.id}
                className="flex items-center justify-between px-3.5 py-2.5 text-[13.5px]"
              >
                <div>
                  <span className="font-medium text-[#0F172A]">{s.target}</span>
                  <span className="ml-2 rounded-full bg-[#EEF2F7] px-2 py-0.5 text-[11px] text-[#475569]">
                    {s.permission === 'edit' ? 'Editor' : 'Leitor'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveShare(s.id)}
                  className="rounded p-1 text-[#94A3B8] hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </ModalShell>
  );
}

/* ==================== Modal Importar JSON ==================== */
export function ImportJsonModal({
  onImport,
  onClose,
}: {
  onImport: (rawJson: string) => void;
  onClose: () => void;
}) {
  const [raw, setRaw] = useState('');
  const [error, setError] = useState<string | null>(null);

  return (
    <ModalShell
      title="Importar fluxograma (JSON)"
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#CBD5E1] bg-white px-4 py-2 text-[13.5px] font-medium text-[#334155]"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => {
              try {
                JSON.parse(raw);
                setError(null);
                onImport(raw);
              } catch {
                setError('JSON inválido. Verifique o conteúdo colado.');
              }
            }}
            disabled={!raw.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B2A5B] px-4 py-2 text-[13.5px] font-semibold text-white disabled:opacity-50"
          >
            <Upload className="h-4 w-4" /> Aplicar importação
          </button>
        </>
      }
    >
      <p className="mb-2 text-[13px] text-[#64748B]">
        Cole o JSON exportado pelo Modelador de Fluxogramas:
      </p>
      <textarea
        rows={10}
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder='{"lanes": [...], "nodes": [...], "edges": [...]}'
        className="w-full rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] p-3 font-mono text-[12.5px] text-[#0F172A] outline-none focus:border-[#0B3B78]"
      />
      {error && (
        <div className="mt-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[12.5px] text-red-700">
          {error}
        </div>
      )}
    </ModalShell>
  );
}
