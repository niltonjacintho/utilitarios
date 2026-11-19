import {
  MindMapAiSummary,
  MindMapComment,
  MindMapExecutor,
  MindMapNode,
  MindMapRecord,
} from '../types/mindmap';
import { computeMindMapLayout, getNodePalette } from './layout';
import { formatDateTime, treeToMarkdown } from './tree';

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'mindmap'
  );
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = '';

  for (const word of words) {
    if (!current) {
      current = word;
    } else if ((current + ' ' + word).length <= maxChars) {
      current += ' ' + word;
    } else {
      lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [''];
}

function computeInitials(name: string): string {
  const cleaned = name.replace(/,/g, ' ').trim();
  const parts = cleaned.split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'US';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function buildMindMapSvg(
  map: MindMapRecord,
  options?: { interactive?: boolean },
): {
  svg: string;
  width: number;
  height: number;
} {
  const layout = computeMindMapLayout(map.root);
  const bg = map.backgroundColor || '#F8FAFC';
  const interactive = Boolean(options?.interactive);

  const edgesSvg = layout.edges
    .map(
      (edge) =>
        `<path d="${edge.path}" fill="none" stroke="${edge.stroke}" stroke-width="2" stroke-linecap="round" />`,
    )
    .join('\n');

  const nodesSvg = layout.nodes
    .map((item) => {
      const palette = getNodePalette(item.depth);
      const maxChars =
        item.depth === 0
          ? 15
          : Math.max(14, Math.floor((item.width - 28) / 7.5));
      const lines = wrapText(item.node.text, maxChars);
      const lineHeight = item.depth === 0 ? 20 : 18;
      const startY =
        item.y + item.height / 2 - ((lines.length - 1) * lineHeight) / 2 + 5;
      const textX = item.depth === 0 ? item.x + item.width / 2 : item.x + 16;
      const textAnchor = item.depth === 0 ? 'middle' : 'start';
      const fontWeight = item.depth === 0 ? '700' : '500';
      const fontSize = item.depth === 0 ? 15 : 13.5;

      const textSpans = lines
        .map(
          (line, idx) =>
            `<text x="${textX}" y="${startY + idx * lineHeight}" text-anchor="${textAnchor}" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="${fontSize}" font-weight="${fontWeight}" fill="${palette.text}">${escapeXml(line)}</text>`,
        )
        .join('');

      const hasNotes = Boolean(item.node.notes?.trim());
      const commentsCount = item.node.comments?.length ?? 0;

      const badges: string[] = [];
      let badgeX = item.x + 8;
      if (hasNotes) {
        badges.push(
          `<g transform="translate(${badgeX}, ${item.y - 10})"><circle cx="9" cy="9" r="9" fill="#ffffff" stroke="#0f766e" stroke-width="1.3" /><text x="9" y="12.5" text-anchor="middle" font-size="10" font-family="Inter, Arial, sans-serif" fill="#0f766e">N</text></g>`,
        );
        badgeX += 22;
      }
      if (commentsCount > 0) {
        badges.push(
          `<g transform="translate(${badgeX}, ${item.y - 10})"><circle cx="9" cy="9" r="9" fill="#ffffff" stroke="#2563eb" stroke-width="1.3" /><text x="9" y="12.5" text-anchor="middle" font-size="9.5" font-weight="700" font-family="Inter, Arial, sans-serif" fill="#2563eb">${commentsCount}</text></g>`,
        );
      }

      const doneMark = item.node.completed
        ? `<circle cx="${item.x + item.width - 12}" cy="${item.y + 12}" r="7" fill="#10b981" /><text x="${item.x + item.width - 12}" y="${item.y + 15.5}" text-anchor="middle" font-size="10" font-weight="700" fill="#ffffff">✓</text>`
        : '';

      const groupAttrs = interactive
        ? `class="svg-node" data-node-id="${escapeXml(item.id)}" style="cursor:pointer;"`
        : '';

      return `
        <g ${groupAttrs}>
          <rect x="${item.x}" y="${item.y}" width="${item.width}" height="${item.height}" rx="12" fill="${palette.bg}" stroke="${palette.border}" stroke-width="1.8" />
          ${textSpans}
          ${badges.join('')}
          ${doneMark}
        </g>`;
    })
    .join('\n');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg id="mindmap-svg" xmlns="http://www.w3.org/2000/svg" width="${layout.width}" height="${layout.height}" viewBox="0 0 ${layout.width} ${layout.height}">
  <rect width="100%" height="100%" fill="${escapeXml(bg)}" />
  ${edgesSvg}
  ${nodesSvg}
</svg>`;

  return { svg, width: layout.width, height: layout.height };
}

export async function exportAsPng(map: MindMapRecord): Promise<void> {
  const { svg, width, height } = buildMindMapSvg(map);
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(svgBlob);

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = url;
    });

    const scale = 2;
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Contexto 2D indisponível para exportar PNG.');
    }

    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error('Falha ao gerar imagem PNG.'));
      }, 'image/png');
    });

    downloadBlob(pngBlob, `${slugify(map.name)}.png`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function openPdfPreviewWindow(mapName: string): Window {
  const win = window.open('', '_blank', 'width=1120,height=820');
  if (!win) {
    throw new Error(
      'Permita pop-ups no navegador para gerar o documento PDF.',
    );
  }

  win.document.write(`<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <title>${escapeXml(mapName)} — Preparando PDF...</title>
  <style>
    body {
      margin: 0;
      min-height: 100vh;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      background: #F3F6FB;
      color: #0B2A5B;
    }
    .spinner {
      width: 38px;
      height: 38px;
      border: 3px solid #CBD5E1;
      border-top-color: #0B3B78;
      border-radius: 999px;
      animation: spin 0.8s linear infinite;
      margin-bottom: 16px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    p { margin: 4px 0; font-size: 14px; color: #475569; }
    strong { font-size: 16px; color: #0B2A5B; }
  </style>
</head>
<body>
  <div class="spinner"></div>
  <strong>Gerando relatório PDF com resumo por IA...</strong>
  <p>${escapeXml(mapName)}</p>
</body>
</html>`);
  win.document.close();
  return win;
}

export function exportAsPdf(
  map: MindMapRecord,
  aiSummary?: MindMapAiSummary | null,
  existingWin?: Window | null,
): void {
  const win =
    existingWin && !existingWin.closed
      ? existingWin
      : window.open('', '_blank', 'width=1120,height=820');

  if (!win) {
    throw new Error(
      'Permita pop-ups no navegador para gerar o documento PDF.',
    );
  }

  const pdfHtml = buildRichReportDocument(map, aiSummary, 'pdf');
  win.document.open();
  win.document.write(pdfHtml);
  win.document.close();
}

interface FlattenedNode {
  id: string;
  depth: number;
  path: string[];
  node: MindMapNode;
}

interface FlattenedComment {
  nodeId: string;
  nodeTitle: string;
  nodeDepth: number;
  nodePath: string;
  comment: MindMapComment;
}

export function exportAsHtml(
  map: MindMapRecord,
  aiSummary?: MindMapAiSummary | null,
): void {
  const html = buildRichReportDocument(map, aiSummary, 'html');
  downloadBlob(
    new Blob([html], { type: 'text/html;charset=utf-8' }),
    `${slugify(map.name)}.html`,
  );
}

function buildRichReportDocument(
  map: MindMapRecord,
  aiSummary: MindMapAiSummary | null | undefined,
  mode: 'html' | 'pdf',
): string {
  const isPdf = mode === 'pdf';
  const { svg, width: svgWidth, height: svgHeight } = buildMindMapSvg(map, {
    interactive: !isPdf,
  });
  const executorById = new Map(map.executors.map((e) => [e.id, e.name]));

  const flatNodes: FlattenedNode[] = [];
  const flatComments: FlattenedComment[] = [];

  function flatten(node: MindMapNode, depth: number, trail: string[]): void {
    const path = [...trail, node.text];
    flatNodes.push({ id: node.id, depth, path, node });

    for (const comment of node.comments ?? []) {
      flatComments.push({
        nodeId: node.id,
        nodeTitle: node.text,
        nodeDepth: depth,
        nodePath: path.join(' › '),
        comment,
      });
    }

    for (const child of node.children) {
      flatten(child, depth + 1, path);
    }
  }

  flatten(map.root, 0, []);

  const totalNotes = flatNodes.filter((f) => Boolean(f.node.notes?.trim())).length;
  const totalComments = flatComments.length;
  const progressPct =
    map.itemCount > 0 ? Math.round((map.completedCount / map.itemCount) * 100) : 0;

  const summary: MindMapAiSummary = aiSummary ?? {
    overview: `O mapa "${map.name}" contém ${map.itemCount} itens distribuídos em ${map.root.children.length} frente(s) principal(is), com ${map.completedCount} tarefa(s) concluída(s), ${totalNotes} nota(s) e ${totalComments} comentário(s).`,
    highlights: map.root.children
      .slice(0, 4)
      .map((c) => `Frente principal: ${c.text}`),
    attentionPoints:
      flatComments.length > 0
        ? flatComments
            .slice(0, 3)
            .map((fc) => `${fc.nodeTitle}: "${fc.comment.text}"`)
        : [`${Math.max(0, map.itemCount - map.completedCount)} item(ns) em aberto.`],
    generatedByAi: false,
  };

  const levelColor = (depth: number) => {
    if (depth === 0) return { accent: '#0B2A5B', soft: '#E8EEF8', text: '#0B2A5B', label: 'Raiz' };
    if (depth === 1) return { accent: '#0F766E', soft: '#E3F5F3', text: '#0F766E', label: 'Nível 1' };
    if (depth === 2) return { accent: '#C78A1B', soft: '#FEF4E2', text: '#9A650B', label: 'Nível 2' };
    return { accent: '#2563EB', soft: '#EBF3FE', text: '#1D4ED8', label: `Nível ${depth}` };
  };

  const nodeCardsHtml = flatNodes
    .map((item) => {
      const colors = levelColor(item.depth);
      const execName = item.node.executorId
        ? executorById.get(item.node.executorId) ?? null
        : null;
      const hasNotes = Boolean(item.node.notes?.trim());
      const cCount = item.node.comments?.length ?? 0;
      const searchText = [
        item.node.text,
        item.path.join(' '),
        item.node.notes ?? '',
        execName ?? '',
      ]
        .join(' ')
        .toLowerCase();

      return `
      <article
        id="node-card-${escapeXml(item.id)}"
        class="node-card"
        data-node-id="${escapeXml(item.id)}"
        data-completed="${item.node.completed ? '1' : '0'}"
        data-has-notes="${hasNotes ? '1' : '0'}"
        data-has-comments="${cCount > 0 ? '1' : '0'}"
        data-search="${escapeXml(searchText)}"
        style="--node-accent:${colors.accent};--node-soft:${colors.soft};--node-text:${colors.text};"
      >
        <div class="node-card-head">
          <div>
            <div class="node-breadcrumb">${escapeXml(item.path.join(' › '))}</div>
            <h3 class="node-title">${escapeXml(item.node.text)}</h3>
          </div>
          <span class="pill level-pill">${colors.label}</span>
        </div>

        <div class="node-meta-row">
          <span class="pill ${item.node.completed ? 'status-done' : 'status-open'}">
            ${item.node.completed ? '✓ Concluída' : '○ Em aberto'}
          </span>
          ${
            execName
              ? `<span class="pill exec-pill">👤 ${escapeXml(execName)}</span>`
              : ''
          }
          ${
            item.node.dueDate
              ? `<span class="pill date-pill">📅 Prazo: ${escapeXml(item.node.dueDate)}</span>`
              : ''
          }
          ${
            cCount > 0
              ? `<a href="#comments-section" class="pill comment-link" data-filter-node="${escapeXml(item.id)}">💬 ${cCount} comentário${cCount > 1 ? 's' : ''}</a>`
              : ''
          }
        </div>

        ${
          hasNotes
            ? `<div class="node-notes"><div class="node-notes-label">Notas</div><p>${escapeXml(item.node.notes!.trim()).replace(/\n/g, '<br />')}</p></div>`
            : ''
        }
      </article>`;
    })
    .join('\n');

  const commentCardsHtml =
    flatComments.length === 0
      ? `<div class="empty-box">Nenhum comentário registrado neste mapa.</div>`
      : flatComments
          .map((item) => {
            const colors = levelColor(item.nodeDepth);
            const initials = computeInitials(item.comment.author);
            const searchText = [
              item.comment.author,
              item.comment.text,
              item.nodeTitle,
              item.nodePath,
            ]
              .join(' ')
              .toLowerCase();

            return `
            <article
              class="comment-card"
              data-comment-node="${escapeXml(item.nodeId)}"
              data-search="${escapeXml(searchText)}"
            >
              <div class="comment-avatar" style="background:${colors.accent};">${escapeXml(initials)}</div>
              <div class="comment-body">
                <div class="comment-header">
                  <div>
                    <strong class="comment-author">${escapeXml(item.comment.author)}</strong>
                    <span class="comment-date">${escapeXml(formatDateTime(item.comment.createdAt))}</span>
                  </div>
                  <a
                    href="#node-card-${escapeXml(item.nodeId)}"
                    class="comment-node-tag"
                    data-jump-node="${escapeXml(item.nodeId)}"
                    style="background:${colors.soft};color:${colors.text};border-color:${colors.accent}33;"
                  >
                    ${escapeXml(item.nodeTitle)}
                  </a>
                </div>
                <div class="comment-path">${escapeXml(item.nodePath)}</div>
                <p class="comment-text">${escapeXml(item.comment.text).replace(/\n/g, '<br />')}</p>
              </div>
            </article>`;
          })
          .join('\n');

  const html = `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeXml(map.name)} — Relatório MindMap</title>
  <style>
    :root {
      --navy: #0B2A5B;
      --royal: #0F4C9C;
      --teal: #0F766E;
      --amber: #C78A1B;
      --indigo: #4F46E5;
      --bg: #F3F6FB;
      --surface: #FFFFFF;
      --ink: #0F172A;
      --muted: #64748B;
      --border: #E2E8F0;
      --canvas-bg: ${escapeXml(map.backgroundColor || '#F8FAFC')};
    }

    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body {
      margin: 0;
      font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      background: var(--bg);
      color: var(--ink);
      line-height: 1.5;
    }

    /* Hero Header */
    .hero {
      background: linear-gradient(125deg, #092047 0%, #0B3B78 52%, #0E6BA8 100%);
      color: #FFFFFF;
      padding: 28px 24px 32px;
      box-shadow: 0 8px 28px rgba(9, 32, 71, 0.18);
    }
    .hero-inner {
      max-width: 1240px;
      margin: 0 auto;
    }
    .hero-top {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: flex-start;
      gap: 16px;
    }
    .brand-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background: rgba(255, 255, 255, 0.14);
      border: 1px solid rgba(255, 255, 255, 0.22);
      border-radius: 999px;
      padding: 4px 12px;
      font-size: 12px;
      font-weight: 600;
      letter-spacing: 0.02em;
      margin-bottom: 10px;
    }
    .hero h1 {
      margin: 0;
      font-size: clamp(22px, 3vw, 30px);
      font-weight: 800;
      letter-spacing: -0.02em;
    }
    .hero-sub {
      margin: 6px 0 0;
      font-size: 13.5px;
      color: rgba(226, 238, 255, 0.88);
    }
    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 12px;
      margin-top: 20px;
    }
    .kpi {
      background: rgba(255, 255, 255, 0.11);
      border: 1px solid rgba(255, 255, 255, 0.18);
      backdrop-filter: blur(6px);
      border-radius: 14px;
      padding: 12px 16px;
    }
    .kpi-label { font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.05em; color: rgba(226, 238, 255, 0.8); }
    .kpi-value { font-size: 22px; font-weight: 800; margin-top: 2px; }
    .progress-bar {
      margin-top: 8px;
      height: 6px;
      background: rgba(255, 255, 255, 0.2);
      border-radius: 999px;
      overflow: hidden;
    }
    .progress-fill {
      height: 100%;
      width: ${progressPct}%;
      background: linear-gradient(90deg, #34D399, #2DD4BF);
      border-radius: 999px;
    }

    /* Main Layout */
    main {
      max-width: 1240px;
      margin: 24px auto 56px;
      padding: 0 20px;
      display: flex;
      flex-direction: column;
      gap: 24px;
    }

    .section-card {
      background: var(--surface);
      border: 1px solid var(--border);
      border-radius: 18px;
      box-shadow: 0 4px 18px rgba(15, 23, 42, 0.04);
      overflow: hidden;
    }
    .section-header {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 18px 22px;
      border-bottom: 1px solid var(--border);
      background: linear-gradient(180deg, #FFFFFF 0%, #FAFBFD 100%);
    }
    .section-title {
      margin: 0;
      font-size: 17px;
      font-weight: 700;
      color: var(--navy);
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .section-body {
      padding: 20px 22px;
    }

    /* AI Summary Card */
    .ai-card {
      position: relative;
      border: 1px solid #C7D7FE;
      background: linear-gradient(135deg, #FFFFFF 0%, #F5F8FF 60%, #F0FDFB 100%);
    }
    .ai-card::before {
      content: "";
      position: absolute;
      inset: 0 auto 0 0;
      width: 5px;
      background: linear-gradient(180deg, #2563EB, #0EA5E9, #0F766E);
    }
    .ai-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 11px;
      border-radius: 999px;
      font-size: 12px;
      font-weight: 600;
      background: ${summary.generatedByAi ? '#E0E7FF' : '#E2E8F0'};
      color: ${summary.generatedByAi ? '#3730A3' : '#475569'};
    }
    .ai-overview {
      margin: 0;
      font-size: 15px;
      color: #1E293B;
      line-height: 1.65;
    }
    .ai-columns {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 16px;
      margin-top: 16px;
    }
    .ai-subbox {
      border-radius: 14px;
      padding: 14px 16px;
      border: 1px solid transparent;
    }
    .ai-subbox.highlights {
      background: #F0FDFA;
      border-color: #CCFBF1;
    }
    .ai-subbox.attention {
      background: #FFFBEB;
      border-color: #FDE68A;
    }
    .ai-subbox h3 {
      margin: 0 0 8px;
      font-size: 13px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }
    .ai-subbox.highlights h3 { color: #0F766E; }
    .ai-subbox.attention h3 { color: #B45309; }
    .ai-subbox ul {
      margin: 0;
      padding-left: 18px;
      font-size: 13.5px;
      color: #334155;
    }
    .ai-subbox li { margin: 5px 0; }

    /* Resizable Interactive Map */
    .map-toolbar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px;
    }
    .tool-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      height: 32px;
      padding: 0 11px;
      border-radius: 8px;
      border: 1px solid #CBD5E1;
      background: #FFFFFF;
      color: #1E293B;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .tool-btn:hover { background: #EFF6FF; border-color: #2563EB; color: #1D4ED8; }
    .zoom-readout {
      min-width: 48px;
      text-align: center;
      font-size: 12.5px;
      font-weight: 700;
      color: var(--navy);
    }
    .map-viewport {
      position: relative;
      height: 520px;
      min-height: 280px;
      max-height: 85vh;
      overflow: hidden;
      background-color: var(--canvas-bg);
      background-image: radial-gradient(rgba(100, 116, 139, 0.28) 1px, transparent 1px);
      background-size: 20px 20px;
      cursor: grab;
      user-select: none;
    }
    .map-viewport.dragging { cursor: grabbing; }
    .map-stage {
      position: absolute;
      left: 0;
      top: 0;
      transform-origin: 0 0;
    }
    .map-stage .svg-node rect {
      transition: filter 0.15s ease, stroke-width 0.15s ease;
    }
    .map-stage .svg-node:hover rect {
      filter: drop-shadow(0 4px 10px rgba(11, 42, 91, 0.18));
      stroke-width: 2.6;
    }
    .map-hint {
      position: absolute;
      left: 14px;
      bottom: 12px;
      background: rgba(15, 23, 42, 0.72);
      color: #FFFFFF;
      padding: 5px 11px;
      border-radius: 999px;
      font-size: 11.5px;
      pointer-events: none;
    }
    .resize-handle {
      height: 16px;
      background: #F1F5F9;
      border-top: 1px solid var(--border);
      cursor: ns-resize;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 4px;
      color: #64748B;
      font-size: 11px;
      font-weight: 600;
      user-select: none;
    }
    .resize-handle:hover { background: #E2E8F0; color: var(--navy); }
    .resize-bar {
      width: 44px;
      height: 4px;
      border-radius: 999px;
      background: #94A3B8;
    }

    /* Filters & Controls */
    .filter-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 10px;
      margin-bottom: 18px;
    }
    .search-input {
      flex: 1;
      min-width: 220px;
      height: 38px;
      padding: 0 14px;
      border-radius: 10px;
      border: 1px solid #CBD5E1;
      font-size: 13.5px;
      color: var(--ink);
      outline: none;
      transition: border-color 0.15s ease;
    }
    .search-input:focus { border-color: #2563EB; }
    .filter-pills {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
    }
    .filter-pill {
      height: 34px;
      padding: 0 13px;
      border-radius: 999px;
      border: 1px solid #CBD5E1;
      background: #FFFFFF;
      color: #475569;
      font-size: 12.5px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .filter-pill.active, .filter-pill:hover {
      background: var(--navy);
      border-color: var(--navy);
      color: #FFFFFF;
    }

    /* Node Detail Cards */
    .nodes-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
      gap: 14px;
    }
    .node-card {
      position: relative;
      background: #FFFFFF;
      border: 1px solid var(--border);
      border-left: 4px solid var(--node-accent);
      border-radius: 14px;
      padding: 15px 16px;
      transition: transform 0.15s ease, box-shadow 0.2s ease, border-color 0.2s ease;
    }
    .node-card:hover {
      transform: translateY(-1px);
      box-shadow: 0 8px 20px rgba(15, 23, 42, 0.07);
    }
    .node-card.highlight-pulse {
      box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.35), 0 10px 24px rgba(15, 23, 42, 0.1);
      border-color: #2563EB;
    }
    .node-card-head {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      gap: 10px;
    }
    .node-breadcrumb {
      font-size: 11.5px;
      color: var(--muted);
      margin-bottom: 3px;
    }
    .node-title {
      margin: 0;
      font-size: 15px;
      font-weight: 700;
      color: var(--ink);
    }
    .node-meta-row {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 10px;
    }
    .pill {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      padding: 3px 9px;
      border-radius: 999px;
      font-size: 11.5px;
      font-weight: 600;
      text-decoration: none;
    }
    .level-pill {
      background: var(--node-soft);
      color: var(--node-text);
      white-space: nowrap;
    }
    .status-done { background: #DCFCE7; color: #166534; }
    .status-open { background: #F1F5F9; color: #475569; }
    .exec-pill { background: #EDE9FE; color: #5B21B6; }
    .date-pill { background: #FEF3C7; color: #92400E; }
    .comment-link { background: #DBEAFE; color: #1D4ED8; cursor: pointer; }
    .comment-link:hover { background: #BFDBFE; }
    .node-notes {
      margin-top: 12px;
      background: #F8FAFC;
      border: 1px solid #E2E8F0;
      border-radius: 10px;
      padding: 10px 12px;
    }
    .node-notes-label {
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.04em;
      color: var(--muted);
      margin-bottom: 4px;
    }
    .node-notes p {
      margin: 0;
      font-size: 13px;
      color: #334155;
    }

    /* Comments Section */
    .comments-list {
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .comment-card {
      display: flex;
      gap: 14px;
      padding: 14px 16px;
      border-radius: 14px;
      border: 1px solid var(--border);
      background: #FAFBFD;
      transition: background 0.15s ease, border-color 0.15s ease;
    }
    .comment-card:hover { background: #FFFFFF; border-color: #CBD5E1; }
    .comment-avatar {
      width: 38px;
      height: 38px;
      border-radius: 999px;
      color: #FFFFFF;
      font-size: 13px;
      font-weight: 700;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }
    .comment-body { flex: 1; min-width: 0; }
    .comment-header {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 8px;
    }
    .comment-author { font-size: 14px; color: var(--ink); }
    .comment-date { font-size: 12px; color: var(--muted); margin-left: 8px; }
    .comment-node-tag {
      display: inline-flex;
      align-items: center;
      padding: 3px 10px;
      border-radius: 999px;
      border: 1px solid transparent;
      font-size: 12px;
      font-weight: 600;
      text-decoration: none;
    }
    .comment-path {
      font-size: 11.5px;
      color: var(--muted);
      margin-top: 2px;
    }
    .comment-text {
      margin: 8px 0 0;
      font-size: 13.5px;
      color: #1E293B;
    }
    .empty-box {
      text-align: center;
      padding: 28px;
      border-radius: 12px;
      background: #F8FAFC;
      border: 1px dashed #CBD5E1;
      color: var(--muted);
      font-size: 14px;
    }
    .hidden { display: none !important; }

    /* Estilos dedicados para PDF / Impressão */
    .pdf-action-bar {
      position: sticky;
      top: 0;
      z-index: 30;
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding: 10px 24px;
      background: #092047;
      color: #FFFFFF;
      border-bottom: 1px solid rgba(255, 255, 255, 0.15);
    }
    .pdf-action-bar span { font-size: 13px; color: rgba(226, 238, 255, 0.9); }
    .pdf-action-buttons { display: flex; gap: 8px; }
    .pdf-btn-primary {
      height: 34px;
      padding: 0 14px;
      border-radius: 8px;
      border: none;
      background: #2563EB;
      color: #FFFFFF;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    .pdf-btn-primary:hover { background: #1D4ED8; }
    .pdf-btn-secondary {
      height: 34px;
      padding: 0 14px;
      border-radius: 8px;
      border: 1px solid rgba(255, 255, 255, 0.28);
      background: rgba(255, 255, 255, 0.08);
      color: #FFFFFF;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
    }
    .pdf-map-wrap {
      padding: 16px;
      background-color: var(--canvas-bg);
      background-image: radial-gradient(rgba(100, 116, 139, 0.22) 1px, transparent 1px);
      background-size: 18px 18px;
      text-align: center;
    }
    .pdf-map-wrap svg {
      width: 100%;
      height: auto;
      max-height: 760px;
      display: block;
      margin: 0 auto;
    }

    @page {
      size: A4;
      margin: 10mm;
    }

    @media print {
      * {
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      body {
        background: #FFFFFF !important;
      }
      .no-print {
        display: none !important;
      }
      .hero {
        border-radius: 14px;
        padding: 20px 22px;
        box-shadow: none;
        margin-bottom: 14px;
      }
      main {
        max-width: 100%;
        margin: 0;
        padding: 0;
        gap: 14px;
      }
      .section-card {
        box-shadow: none;
        border-radius: 12px;
        break-inside: auto;
      }
      .ai-card,
      .node-card,
      .comment-card,
      .kpi,
      .pdf-map-wrap {
        break-inside: avoid;
        page-break-inside: avoid;
      }
      .section-header {
        break-after: avoid;
        page-break-after: avoid;
        padding: 12px 16px;
      }
      .section-body {
        padding: 14px 16px;
      }
      .nodes-grid {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 10px;
      }
    }

    @media (max-width: 640px) {
      .nodes-grid { grid-template-columns: 1fr; }
      .section-header, .section-body { padding: 16px; }
    }
  </style>
</head>
<body>
  ${
    isPdf
      ? `<div class="pdf-action-bar no-print">
          <span>Pré-visualização do relatório PDF • Ative "Gráficos de segundo plano" se o navegador solicitar para manter todas as cores.</span>
          <div class="pdf-action-buttons">
            <button type="button" class="pdf-btn-primary" onclick="window.print()">Salvar / Imprimir PDF</button>
            <button type="button" class="pdf-btn-secondary" onclick="window.close()">Fechar</button>
          </div>
        </div>`
      : ''
  }
  <header class="hero">
    <div class="hero-inner">
      <div class="hero-top">
        <div>
          <div class="brand-chip">✦ MindMap • ${isPdf ? 'Relatório Executivo PDF' : 'Relatório Interativo'}</div>
          <h1>${escapeXml(map.name)}</h1>
          <p class="hero-sub">
            Proprietário: <strong>${escapeXml(map.owner)}</strong> • Atualizado em ${escapeXml(formatDateTime(map.updatedAt))} • Exportado em ${escapeXml(formatDateTime(new Date().toISOString()))}
          </p>
        </div>
      </div>

      <div class="kpi-grid">
        <div class="kpi">
          <div class="kpi-label">Total de Itens</div>
          <div class="kpi-value">${map.itemCount}</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Concluídos</div>
          <div class="kpi-value">${map.completedCount} <span style="font-size:13px;font-weight:600;opacity:0.85;">(${progressPct}%)</span></div>
          <div class="progress-bar"><div class="progress-fill"></div></div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Notas Detalhadas</div>
          <div class="kpi-value">${totalNotes}</div>
        </div>
        <div class="kpi">
          <div class="kpi-label">Comentários</div>
          <div class="kpi-value">${totalComments}</div>
        </div>
      </div>
    </div>
  </header>

  <main>
    <!-- 1. Resumo Executivo por IA -->
    <section class="section-card ai-card" aria-labelledby="ai-summary-title">
      <div class="section-header">
        <h2 id="ai-summary-title" class="section-title">✦ Resumo Executivo</h2>
        <span class="ai-badge">
          ${
            summary.generatedByAi
              ? `Gerado por IA • ${escapeXml(summary.model || 'Gemini')}`
              : 'Resumo automático do mapa'
          }
        </span>
      </div>
      <div class="section-body">
        <p class="ai-overview">${escapeXml(summary.overview)}</p>

        <div class="ai-columns">
          ${
            summary.highlights.length > 0
              ? `<div class="ai-subbox highlights">
                  <h3>Principais destaques</h3>
                  <ul>${summary.highlights.map((h) => `<li>${escapeXml(h)}</li>`).join('')}</ul>
                </div>`
              : ''
          }
          ${
            summary.attentionPoints.length > 0
              ? `<div class="ai-subbox attention">
                  <h3>Pontos de atenção</h3>
                  <ul>${summary.attentionPoints.map((a) => `<li>${escapeXml(a)}</li>`).join('')}</ul>
                </div>`
              : ''
          }
        </div>
      </div>
    </section>

    <!-- 2. Mapa Mental -->
    <section class="section-card" aria-labelledby="map-section-title">
      <div class="section-header">
        <h2 id="map-section-title" class="section-title">Mapa Mental</h2>
        ${
          !isPdf
            ? `<div class="map-toolbar">
                <button type="button" class="tool-btn" id="btn-zoom-out" title="Diminuir zoom">−</button>
                <span class="zoom-readout" id="zoom-readout">100%</span>
                <button type="button" class="tool-btn" id="btn-zoom-in" title="Aumentar zoom">+</button>
                <button type="button" class="tool-btn" id="btn-fit">Ajustar à tela</button>
                <button type="button" class="tool-btn" id="btn-reset">100%</button>
              </div>`
            : ''
        }
      </div>

      ${
        isPdf
          ? `<div class="pdf-map-wrap">${svg}</div>`
          : `<div id="map-viewport" class="map-viewport">
              <div id="map-stage" class="map-stage">
                ${svg}
              </div>
              <div class="map-hint">Arraste para mover • Ctrl + Scroll para zoom • Clique em um nó para ver detalhes</div>
            </div>
            <div id="resize-handle" class="resize-handle" title="Arraste para redimensionar a altura do mapa">
              <span class="resize-bar"></span>
            </div>`
      }
    </section>

    <!-- 3. Detalhes dos Nós -->
    <section id="nodes-section" class="section-card" aria-labelledby="nodes-section-title">
      <div class="section-header">
        <h2 id="nodes-section-title" class="section-title">Detalhes dos Nós (${flatNodes.length})</h2>
      </div>
      <div class="section-body">
        ${
          !isPdf
            ? `<div class="filter-bar">
                <input id="node-search" class="search-input" type="search" placeholder="Filtrar nós por título, nota ou executor..." />
                <div class="filter-pills">
                  <button type="button" class="filter-pill active" data-filter="all">Todos</button>
                  <button type="button" class="filter-pill" data-filter="open">Em aberto</button>
                  <button type="button" class="filter-pill" data-filter="done">Concluídos</button>
                  <button type="button" class="filter-pill" data-filter="notes">Com notas</button>
                  <button type="button" class="filter-pill" data-filter="comments">Com comentários</button>
                </div>
              </div>`
            : ''
        }

        <div id="nodes-grid" class="nodes-grid">
          ${nodeCardsHtml}
        </div>
        ${!isPdf ? `<div id="nodes-empty" class="empty-box hidden">Nenhum nó encontrado com os filtros selecionados.</div>` : ''}
      </div>
    </section>

    <!-- 4. Comentários -->
    <section id="comments-section" class="section-card" aria-labelledby="comments-section-title">
      <div class="section-header">
        <h2 id="comments-section-title" class="section-title">Comentários (${totalComments})</h2>
        ${!isPdf ? `<button type="button" id="btn-clear-comment-filter" class="tool-btn hidden">Mostrar todos os comentários</button>` : ''}
      </div>
      <div class="section-body">
        ${
          !isPdf && totalComments > 0
            ? `<div class="filter-bar">
                <input id="comment-search" class="search-input" type="search" placeholder="Buscar comentários por autor, item ou conteúdo..." />
              </div>`
            : ''
        }
        <div id="comments-list" class="comments-list">
          ${commentCardsHtml}
        </div>
        ${!isPdf ? `<div id="comments-empty" class="empty-box hidden">Nenhum comentário corresponde ao filtro.</div>` : ''}
      </div>
    </section>
  </main>

  ${
    isPdf
      ? `<script>window.onload = function () { setTimeout(function () { window.print(); }, 250); };</script>`
      : `<script>
    (function () {
      const viewport = document.getElementById('map-viewport');
      const stage = document.getElementById('map-stage');
      const zoomReadout = document.getElementById('zoom-readout');
      const resizeHandle = document.getElementById('resize-handle');
      const svgWidth = ${svgWidth};
      const svgHeight = ${svgHeight};

      let zoom = 1;
      let panX = 16;
      let panY = 16;

      function renderTransform() {
        stage.style.transform = 'translate(' + panX + 'px, ' + panY + 'px) scale(' + zoom + ')';
        zoomReadout.textContent = Math.round(zoom * 100) + '%';
      }

      function fitToViewport() {
        const vw = Math.max(240, viewport.clientWidth - 28);
        const vh = Math.max(200, viewport.clientHeight - 28);
        const ratio = Math.min(1, vw / svgWidth, vh / svgHeight);
        zoom = Math.max(0.35, Math.min(1.5, Number(ratio.toFixed(2))));
        panX = Math.max(12, Math.round((viewport.clientWidth - svgWidth * zoom) / 2));
        panY = Math.max(12, Math.round((viewport.clientHeight - svgHeight * zoom) / 2));
        renderTransform();
      }

      document.getElementById('btn-zoom-in').addEventListener('click', () => {
        zoom = Math.min(2.2, Number((zoom + 0.15).toFixed(2)));
        renderTransform();
      });
      document.getElementById('btn-zoom-out').addEventListener('click', () => {
        zoom = Math.max(0.3, Number((zoom - 0.15).toFixed(2)));
        renderTransform();
      });
      document.getElementById('btn-fit').addEventListener('click', fitToViewport);
      document.getElementById('btn-reset').addEventListener('click', () => {
        zoom = 1;
        panX = 20;
        panY = 20;
        renderTransform();
      });

      // Pan no viewport
      let dragging = false;
      let startX = 0, startY = 0, origPanX = 0, origPanY = 0;
      viewport.addEventListener('mousedown', (e) => {
        if (e.target.closest('.svg-node')) return;
        dragging = true;
        viewport.classList.add('dragging');
        startX = e.clientX;
        startY = e.clientY;
        origPanX = panX;
        origPanY = panY;
      });
      window.addEventListener('mousemove', (e) => {
        if (!dragging) return;
        panX = origPanX + (e.clientX - startX);
        panY = origPanY + (e.clientY - startY);
        renderTransform();
      });
      window.addEventListener('mouseup', () => {
        dragging = false;
        viewport.classList.remove('dragging');
      });
      viewport.addEventListener('wheel', (e) => {
        if (!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.1 : -0.1;
        zoom = Math.min(2.2, Math.max(0.3, Number((zoom + delta).toFixed(2))));
        renderTransform();
      }, { passive: false });

      // Redimensionar altura do mapa arrastando a barra inferior
      let resizing = false;
      let resizeStartY = 0;
      let resizeStartH = 0;
      resizeHandle.addEventListener('mousedown', (e) => {
        resizing = true;
        resizeStartY = e.clientY;
        resizeStartH = viewport.clientHeight;
        document.body.style.cursor = 'ns-resize';
      });
      window.addEventListener('mousemove', (e) => {
        if (!resizing) return;
        const nextH = Math.max(280, Math.min(window.innerHeight * 0.85, resizeStartH + (e.clientY - resizeStartY)));
        viewport.style.height = Math.round(nextH) + 'px';
      });
      window.addEventListener('mouseup', () => {
        if (!resizing) return;
        resizing = false;
        document.body.style.cursor = '';
      });

      // Destacar card ao clicar no nó do SVG ou no link de comentário
      function focusNodeCard(nodeId) {
        const card = document.getElementById('node-card-' + nodeId);
        if (!card) return;
        card.classList.remove('hidden');
        card.scrollIntoView({ behavior: 'smooth', block: 'center' });
        card.classList.add('highlight-pulse');
        setTimeout(() => card.classList.remove('highlight-pulse'), 1800);
      }

      document.querySelectorAll('.svg-node').forEach((el) => {
        el.addEventListener('click', () => {
          const id = el.getAttribute('data-node-id');
          if (id) focusNodeCard(id);
        });
      });

      document.querySelectorAll('[data-jump-node]').forEach((el) => {
        el.addEventListener('click', (e) => {
          e.preventDefault();
          const id = el.getAttribute('data-jump-node');
          if (id) focusNodeCard(id);
        });
      });

      // Filtros de Nós
      const nodeSearch = document.getElementById('node-search');
      const nodeCards = Array.from(document.querySelectorAll('.node-card'));
      const nodesEmpty = document.getElementById('nodes-empty');
      let activeNodeFilter = 'all';

      function applyNodeFilters() {
        const q = (nodeSearch?.value || '').trim().toLowerCase();
        let visible = 0;
        nodeCards.forEach((card) => {
          const matchSearch = !q || (card.dataset.search || '').includes(q);
          let matchFilter = true;
          if (activeNodeFilter === 'done') matchFilter = card.dataset.completed === '1';
          else if (activeNodeFilter === 'open') matchFilter = card.dataset.completed === '0';
          else if (activeNodeFilter === 'notes') matchFilter = card.dataset.hasNotes === '1';
          else if (activeNodeFilter === 'comments') matchFilter = card.dataset.hasComments === '1';

          const show = matchSearch && matchFilter;
          card.classList.toggle('hidden', !show);
          if (show) visible += 1;
        });
        nodesEmpty.classList.toggle('hidden', visible > 0);
      }

      if (nodeSearch) nodeSearch.addEventListener('input', applyNodeFilters);
      document.querySelectorAll('.filter-pill').forEach((btn) => {
        btn.addEventListener('click', () => {
          document.querySelectorAll('.filter-pill').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          activeNodeFilter = btn.getAttribute('data-filter') || 'all';
          applyNodeFilters();
        });
      });

      // Filtros de Comentários
      const commentSearch = document.getElementById('comment-search');
      const commentCards = Array.from(document.querySelectorAll('.comment-card'));
      const commentsEmpty = document.getElementById('comments-empty');
      const clearCommentFilterBtn = document.getElementById('btn-clear-comment-filter');
      let filterCommentNodeId = null;

      function applyCommentFilters() {
        if (commentCards.length === 0) return;
        const q = (commentSearch?.value || '').trim().toLowerCase();
        let visible = 0;
        commentCards.forEach((card) => {
          const matchNode = !filterCommentNodeId || card.dataset.commentNode === filterCommentNodeId;
          const matchSearch = !q || (card.dataset.search || '').includes(q);
          const show = matchNode && matchSearch;
          card.classList.toggle('hidden', !show);
          if (show) visible += 1;
        });
        commentsEmpty.classList.toggle('hidden', visible > 0);
        clearCommentFilterBtn.classList.toggle('hidden', !filterCommentNodeId);
      }

      if (commentSearch) commentSearch.addEventListener('input', applyCommentFilters);
      if (clearCommentFilterBtn) {
        clearCommentFilterBtn.addEventListener('click', () => {
          filterCommentNodeId = null;
          applyCommentFilters();
        });
      }

      document.querySelectorAll('[data-filter-node]').forEach((el) => {
        el.addEventListener('click', () => {
          filterCommentNodeId = el.getAttribute('data-filter-node');
          applyCommentFilters();
        });
      });

      fitToViewport();
      window.addEventListener('resize', () => {
        if (zoom < 1) fitToViewport();
      });
    })();
  </script>`
  }
</body>
</html>`;

  return html;
}

export function exportAsCsv(map: MindMapRecord): void {
  const executorById = new Map<string, string>(
    map.executors.map((e: MindMapExecutor) => [e.id, e.name]),
  );

  const rows: string[][] = [
    [
      'Nivel',
      'Caminho',
      'Item',
      'Concluido',
      'Executor',
      'Prazo',
      'Notas',
      'Comentarios',
    ],
  ];

  function walk(node: MindMapNode, depth: number, trail: string[]): void {
    const path = [...trail, node.text];
    const execName = node.executorId
      ? (executorById.get(node.executorId) ?? '')
      : '';
    const commentsText = (node.comments ?? [])
      .map((c) => `${c.author}: ${c.text}`)
      .join(' | ');

    rows.push([
      String(depth),
      path.join(' > '),
      node.text,
      node.completed ? 'Sim' : 'Não',
      execName,
      node.dueDate ?? '',
      node.notes ?? '',
      commentsText,
    ]);

    for (const child of node.children) {
      walk(child, depth + 1, path);
    }
  }

  walk(map.root, 0, []);

  const csvContent =
    '\uFEFF' +
    rows
      .map((row) =>
        row
          .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
          .join(';'),
      )
      .join('\r\n');

  downloadBlob(
    new Blob([csvContent], { type: 'text/csv;charset=utf-8' }),
    `${slugify(map.name)}.csv`,
  );
}

export function exportAsMarkdown(map: MindMapRecord): void {
  const md = treeToMarkdown(map.root);
  downloadBlob(
    new Blob([md], { type: 'text/markdown;charset=utf-8' }),
    `${slugify(map.name)}.md`,
  );
}
