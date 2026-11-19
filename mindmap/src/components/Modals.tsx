import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Plus,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react';
import { MindMapExecutor, MindMapShare } from '../types/mindmap';
import { AiProcessingState } from './AiProcessingOverlay';

interface ModalShellProps {
  title: string;
  onClose: () => void;
  maxWidthClass?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}

function ModalShell({
  title,
  onClose,
  maxWidthClass = 'max-w-[560px]',
  children,
  footer,
}: ModalShellProps) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-[1px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className={`w-full ${maxWidthClass} overflow-hidden rounded-xl border border-[#E2E8F0] bg-white shadow-2xl`}
      >
        <div className="flex items-center justify-between border-b border-[#E2E8F0] px-6 py-4">
          <h2 className="text-[17px] font-semibold text-[#0F172A]">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-[#64748B] transition-colors hover:bg-[#F1F5F9] hover:text-[#0F172A]"
            aria-label="Fechar"
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

/* ==================== Modal Executores ==================== */
interface ExecutorsModalProps {
  executors: MindMapExecutor[];
  onAdd: (name: string) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}

export function ExecutorsModal({
  executors,
  onAdd,
  onRemove,
  onClose,
}: ExecutorsModalProps) {
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    onAdd(trimmed);
    setName('');
  };

  return (
    <ModalShell
      title="Executores"
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-[#CBD5E1] bg-white px-4 py-2 text-[13.5px] font-medium text-[#334155] hover:bg-[#F8FAFC]"
        >
          Fechar
        </button>
      }
    >
      <form onSubmit={handleSubmit} className="flex items-center gap-2.5">
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Novo executor"
          autoFocus
          className="h-10 flex-1 rounded-lg border border-[#CBD5E1] px-3.5 text-[14px] text-[#0F172A] outline-none placeholder:text-[#94A3B8] focus:border-[#0B3B78]"
        />
        <button
          type="submit"
          className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#0B2A5B] px-4 text-[13.5px] font-semibold text-white transition-colors hover:bg-[#0B3B78]"
        >
          <Plus className="h-4 w-4" />
          Adicionar
        </button>
      </form>

      <div className="mt-4">
        {executors.length === 0 ? (
          <p className="py-2 text-[14px] text-[#64748B]">
            Nenhum executor cadastrado.
          </p>
        ) : (
          <ul className="max-h-[240px] divide-y divide-[#EEF2F6] overflow-y-auto rounded-lg border border-[#E2E8F0]">
            {executors.map((exec) => (
              <li
                key={exec.id}
                className="flex items-center justify-between px-3.5 py-2.5 text-[14px]"
              >
                <span className="font-medium text-[#0F172A]">{exec.name}</span>
                <button
                  type="button"
                  onClick={() => onRemove(exec.id)}
                  className="rounded p-1 text-[#94A3B8] hover:bg-red-50 hover:text-red-600"
                  title="Remover executor"
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

/* ==================== Modal Compartilhar ==================== */
interface ShareModalProps {
  mapId: string;
  shares: MindMapShare[];
  onAddShare: (target: string, permission: 'view' | 'edit') => void;
  onRemoveShare: (id: string) => void;
  onClose: () => void;
}

export function ShareModal({
  mapId,
  shares,
  onAddShare,
  onRemoveShare,
  onClose,
}: ShareModalProps) {
  const [target, setTarget] = useState('');
  const [permission, setPermission] = useState<'view' | 'edit'>('edit');
  const [copied, setCopied] = useState(false);

  const shareUrl = `${window.location.origin}/?map=${encodeURIComponent(mapId)}`;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = target.trim();
    if (!trimmed) return;
    onAddShare(trimmed, permission);
    setTarget('');
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  return (
    <ModalShell
      title="Compartilhar mapa"
      onClose={onClose}
      footer={
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-[#CBD5E1] bg-white px-4 py-2 text-[13.5px] font-medium text-[#334155] hover:bg-[#F8FAFC]"
        >
          Fechar
        </button>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="block text-[12px] font-semibold uppercase tracking-wide text-[#64748B]">
            Link direto do mapa
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
              onClick={handleCopy}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-3 text-[13px] font-medium text-[#0F172A] hover:bg-[#F8FAFC]"
            >
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-emerald-600" />
                  Copiado
                </>
              ) : (
                <>
                  <Copy className="h-4 w-4" />
                  Copiar
                </>
              )}
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder="Nome ou e-mail da pessoa"
            className="h-10 min-w-[200px] flex-1 rounded-lg border border-[#CBD5E1] px-3.5 text-[14px] text-[#0F172A] outline-none focus:border-[#0B3B78]"
          />
          <select
            value={permission}
            onChange={(e) => setPermission(e.target.value as 'view' | 'edit')}
            className="h-10 rounded-lg border border-[#CBD5E1] bg-white px-3 text-[13.5px] text-[#0F172A]"
          >
            <option value="edit">Pode editar</option>
            <option value="view">Somente leitura</option>
          </select>
          <button
            type="submit"
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-[#0B2A5B] px-4 text-[13.5px] font-semibold text-white hover:bg-[#0B3B78]"
          >
            <Plus className="h-4 w-4" />
            Adicionar
          </button>
        </form>

        {shares.length === 0 ? (
          <p className="text-[13.5px] text-[#64748B]">
            Nenhuma pessoa adicionada ainda.
          </p>
        ) : (
          <ul className="max-h-[200px] divide-y divide-[#EEF2F6] overflow-y-auto rounded-lg border border-[#E2E8F0]">
            {shares.map((share) => (
              <li
                key={share.id}
                className="flex items-center justify-between px-3.5 py-2.5 text-[13.5px]"
              >
                <div>
                  <span className="font-medium text-[#0F172A]">
                    {share.target}
                  </span>
                  <span className="ml-2 rounded-full bg-[#EEF2F7] px-2 py-0.5 text-[11px] text-[#475569]">
                    {share.permission === 'edit' ? 'Editor' : 'Leitor'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => onRemoveShare(share.id)}
                  className="rounded p-1 text-[#94A3B8] hover:bg-red-50 hover:text-red-600"
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

/* ==================== Modal Markdown ==================== */
interface MarkdownModalProps {
  initialMarkdown: string;
  onApply: (markdown: string) => void;
  onDownload: () => void;
  onClose: () => void;
}

export function MarkdownModal({
  initialMarkdown,
  onApply,
  onDownload,
  onClose,
}: MarkdownModalProps) {
  const [content, setContent] = useState(initialMarkdown);

  return (
    <ModalShell
      title="Markdown do mapa"
      onClose={onClose}
      maxWidthClass="max-w-[680px]"
      footer={
        <>
          <button
            type="button"
            onClick={onDownload}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-3.5 py-2 text-[13.5px] font-medium text-[#334155] hover:bg-[#F8FAFC]"
          >
            <Download className="h-4 w-4" />
            Baixar .md
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#CBD5E1] bg-white px-4 py-2 text-[13.5px] font-medium text-[#334155] hover:bg-[#F8FAFC]"
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={() => onApply(content)}
            className="rounded-lg bg-[#0B2A5B] px-4 py-2 text-[13.5px] font-semibold text-white hover:bg-[#0B3B78]"
          >
            Aplicar ao mapa
          </button>
        </>
      }
    >
      <p className="mb-2.5 text-[13px] text-[#64748B]">
        Edite a hierarquia usando <code># Título</code> e listas com 2 espaços por nível.
      </p>
      <textarea
        rows={14}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        className="w-full rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] p-3.5 font-mono text-[13px] leading-relaxed text-[#0F172A] outline-none focus:border-[#0B3B78] focus:bg-white"
      />
    </ModalShell>
  );
}

/* ==================== Modal Novo Mapa ==================== */
interface NewMapModalProps {
  loading: boolean;
  onCreate: (name: string) => void;
  onClose: () => void;
}

export function NewMapModal({ loading, onCreate, onClose }: NewMapModalProps) {
  const [name, setName] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    onCreate(name.trim());
  };

  return (
    <ModalShell
      title="Novo mapa mental"
      onClose={onClose}
      maxWidthClass="max-w-[460px]"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#CBD5E1] bg-white px-4 py-2 text-[13.5px] font-medium text-[#334155] hover:bg-[#F8FAFC]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="new-map-form"
            disabled={loading || !name.trim()}
            className="rounded-lg bg-[#0B2A5B] px-4 py-2 text-[13.5px] font-semibold text-white hover:bg-[#0B3B78] disabled:opacity-50"
          >
            {loading ? 'Criando...' : 'Criar mapa'}
          </button>
        </>
      }
    >
      <form id="new-map-form" onSubmit={handleSubmit}>
        <label className="block text-[13px] font-medium text-[#334155]">
          Nome do mapa
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ex.: Planejamento Q4 2026"
          autoFocus
          className="mt-1.5 h-10 w-full rounded-lg border border-[#CBD5E1] px-3.5 text-[14px] text-[#0F172A] outline-none focus:border-[#0B3B78]"
        />
      </form>
    </ModalShell>
  );
}

/* ==================== Modal Gerar com IA ==================== */
interface GenerateAiModalProps {
  loading: boolean;
  error: string | null;
  onGenerate: (title: string, text: string) => void;
  onClose: () => void;
}

export function GenerateAiModal({
  loading,
  error,
  onGenerate,
  onClose,
}: GenerateAiModalProps) {
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    onGenerate(title.trim(), text.trim());
  };

  return (
    <ModalShell
      title="Gerar mapa mental com IA (Gemini)"
      onClose={onClose}
      maxWidthClass="max-w-[620px]"
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-[#CBD5E1] bg-white px-4 py-2 text-[13.5px] font-medium text-[#334155] hover:bg-[#F8FAFC]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            form="ai-generate-form"
            disabled={loading || !text.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#0B2A5B] px-4 py-2 text-[13.5px] font-semibold text-white hover:bg-[#0B3B78] disabled:opacity-50"
          >
            <Sparkles className="h-4 w-4" />
            {loading ? 'Gerando estrutura...' : 'Gerar mapa'}
          </button>
        </>
      }
    >
      <form id="ai-generate-form" onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-[13px] font-medium text-[#334155]">
            Título (opcional)
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Deixe em branco para a IA sugerir automaticamente"
            className="mt-1.5 h-10 w-full rounded-lg border border-[#CBD5E1] px-3.5 text-[14px] text-[#0F172A] outline-none focus:border-[#0B3B78]"
          />
        </div>

        <div>
          <label className="block text-[13px] font-medium text-[#334155]">
            Descreva suas ideias, pauta ou processo em texto livre
          </label>
          <textarea
            rows={7}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Cole anotações de reunião, requisitos de um projeto ou tópicos soltos para o Gemini traduzir em um mapa mental..."
            autoFocus
            className="mt-1.5 w-full rounded-lg border border-[#CBD5E1] p-3.5 text-[14px] leading-relaxed text-[#0F172A] outline-none focus:border-[#0B3B78]"
          />
        </div>

        {loading && (
          <AiProcessingState
            compact
            title="Gerando mapa mental com Gemini..."
            steps={[
              'Analisando o texto informado...',
              'Identificando temas centrais e sub-ramos...',
              'Montando estrutura hierárquica no SQLite...',
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

/* ==================== Modal Explicar com IA ==================== */
interface ExplainAiModalProps {
  loading: boolean;
  explanation: string | null;
  model: string | null;
  error: string | null;
  onRetry: () => void;
  onClose: () => void;
}

export function ExplainAiModal({
  loading,
  explanation,
  model,
  error,
  onRetry,
  onClose,
}: ExplainAiModalProps) {
  return (
    <ModalShell
      title="Explicação do mapa com IA"
      onClose={onClose}
      maxWidthClass="max-w-[660px]"
      footer={
        <>
          {!loading && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 rounded-lg border border-[#CBD5E1] bg-white px-3.5 py-2 text-[13.5px] font-medium text-[#334155] hover:bg-[#F8FAFC]"
            >
              <Sparkles className="h-4 w-4" />
              Regerar
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-[#0B2A5B] px-4 py-2 text-[13.5px] font-semibold text-white hover:bg-[#0B3B78]"
          >
            Fechar
          </button>
        </>
      }
    >
      {loading ? (
        <AiProcessingState
          title="Analisando o mapa com Gemini..."
          steps={[
            'Lendo estrutura, nós, notas e comentários...',
            'Identificando frentes principais e pendências...',
            'Redigindo explicação executiva...',
            'Concluindo análise...',
          ]}
        />
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-[13.5px] text-red-700">
          {error}
        </div>
      ) : (
        <div>
          <div className="max-h-[420px] overflow-y-auto whitespace-pre-wrap rounded-lg border border-[#E2E8F0] bg-[#F8FAFC] p-4 text-[14px] leading-relaxed text-[#1E293B]">
            {explanation}
          </div>
          {model && (
            <p className="mt-2.5 text-right text-[11.5px] text-[#64748B]">
              Gerado via Gemini ({model})
            </p>
          )}
        </div>
      )}
    </ModalShell>
  );
}
