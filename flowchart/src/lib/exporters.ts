import {
  FlowchartAiSummary,
  FlowchartNode,
  FlowchartRecord,
} from '@/types/flowchart';
import {
  computeLaneBounds,
  computeOrthogonalEdgePath,
  formatDateTime,
  formatStatusLabel,
  getNodeMeta,
  LANE_HEADER_WIDTH,
} from './flowchart-utils';

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'fluxograma'
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
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.trim().split(/\s+/);
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    if (!current) current = w;
    else if ((current + ' ' + w).length <= maxChars) current += ' ' + w;
    else {
      lines.push(current);
      current = w;
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

function renderSvgNodeShape(node: FlowchartNode): string {
  const meta = getNodeMeta(node.type);
  const { x, y, width: w, height: h } = node;
  const cx = x + w / 2;
  const cy = y + h / 2;

  switch (node.type) {
    case 'start':
    case 'end':
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${Math.round(h / 2)}" fill="${meta.fill}" stroke="${meta.stroke}" stroke-width="1.8" />`;
    case 'decision':
      return `<polygon points="${cx},${y} ${x + w},${cy} ${cx},${y + h} ${x},${cy}" fill="${meta.fill}" stroke="${meta.stroke}" stroke-width="1.8" />`;
    case 'io':
      return `<polygon points="${x + 18},${y} ${x + w},${y} ${x + w - 18},${y + h} ${x},${y + h}" fill="${meta.fill}" stroke="${meta.stroke}" stroke-width="1.8" />`;
    case 'subprocess':
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="${meta.fill}" stroke="${meta.stroke}" stroke-width="1.8" />
        <line x1="${x + 12}" y1="${y}" x2="${x + 12}" y2="${y + h}" stroke="${meta.stroke}" stroke-width="1.4" />
        <line x1="${x + w - 12}" y1="${y}" x2="${x + w - 12}" y2="${y + h}" stroke="${meta.stroke}" stroke-width="1.4" />`;
    case 'database':
      return `<path d="M ${x} ${y + 10} C ${x} ${y + 2}, ${x + w} ${y + 2}, ${x + w} ${y + 10} L ${x + w} ${y + h - 10} C ${x + w} ${y + h + 2}, ${x} ${y + h + 2}, ${x} ${y + h - 10} Z" fill="${meta.fill}" stroke="${meta.stroke}" stroke-width="1.8" />
        <ellipse cx="${cx}" cy="${y + 10}" rx="${w / 2}" ry="7" fill="${meta.fill}" stroke="${meta.stroke}" stroke-width="1.6" />`;
    case 'document':
      return `<path d="M ${x} ${y + 6} Q ${x} ${y} ${x + 6} ${y} L ${x + w - 6} ${y} Q ${x + w} ${y} ${x + w} ${y + 6} L ${x + w} ${y + h - 10} Q ${x + w * 0.75} ${y + h - 20} ${cx} ${y + h - 8} Q ${x + w * 0.25} ${y + h + 4} ${x} ${y + h - 8} Z" fill="${meta.fill}" stroke="${meta.stroke}" stroke-width="1.8" />`;
    case 'manual':
      return `<polygon points="${x},${y} ${x + w},${y} ${x + w - 16},${y + h} ${x + 16},${y + h}" fill="${meta.fill}" stroke="${meta.stroke}" stroke-width="1.8" />`;
    case 'delay':
      return `<path d="M ${x} ${y} L ${x + w - h / 2} ${y} A ${h / 2} ${h / 2} 0 0 1 ${x + w - h / 2} ${y + h} L ${x} ${y + h} Z" fill="${meta.fill}" stroke="${meta.stroke}" stroke-width="1.8" />`;
    case 'connector':
      return `<circle cx="${cx}" cy="${cy}" r="${Math.min(w, h) / 2}" fill="${meta.fill}" stroke="${meta.stroke}" stroke-width="1.8" />`;
    case 'note':
      return `<path d="M ${x} ${y} L ${x + w - 16} ${y} L ${x + w} ${y + 16} L ${x + w} ${y + h} L ${x} ${y + h} Z" fill="${meta.fill}" stroke="${meta.stroke}" stroke-width="1.6" />
        <path d="M ${x + w - 16} ${y} L ${x + w - 16} ${y + 16} L ${x + w} ${y + 16}" fill="none" stroke="${meta.stroke}" stroke-width="1.3" />`;
    default:
      return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${meta.fill}" stroke="${meta.stroke}" stroke-width="1.8" />`;
  }
}

export function buildFlowchartSvg(
  chart: FlowchartRecord,
  options?: { interactive?: boolean },
): { svg: string; width: number; height: number } {
  const bounds = computeLaneBounds(chart.lanes);
  const maxNodeX = chart.nodes.reduce(
    (max, n) => Math.max(max, n.x + n.width + 80),
    960,
  );
  const totalLaneH = bounds.reduce((sum, b) => sum + b.lane.height, 0);
  const maxNodeY = chart.nodes.reduce(
    (max, n) => Math.max(max, n.y + n.height + 56),
    totalLaneH,
  );

  const pad = 28;
  const contentW = Math.max(980, maxNodeX);
  const contentH = Math.max(420, totalLaneH, maxNodeY);
  const width = contentW + pad * 2;
  const height = contentH + pad * 2;
  const bg = chart.backgroundColor || '#F8FAFC';
  const interactive = Boolean(options?.interactive);

  const lanesSvg = bounds
    .map(({ lane, top }) => {
      const y = pad + top;
      return `
      <g>
        <rect x="${pad}" y="${y}" width="${contentW}" height="${lane.height}" fill="#FFFFFF" fill-opacity="0.72" stroke="#CBD5E1" stroke-width="1.2" />
        <rect x="${pad}" y="${y}" width="${LANE_HEADER_WIDTH}" height="${lane.height}" fill="#EDF1F7" stroke="#CBD5E1" stroke-width="1.2" />
        <text x="${pad + LANE_HEADER_WIDTH / 2}" y="${y + lane.height / 2}" text-anchor="middle" dominant-baseline="middle" transform="rotate(-90 ${pad + LANE_HEADER_WIDTH / 2} ${y + lane.height / 2})" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="12.5" font-weight="600" fill="#334155">${escapeXml(lane.name)}</text>
      </g>`;
    })
    .join('\n');

  const nodeMap = new Map(chart.nodes.map((n) => [n.id, n]));

  const edgesSvg = chart.edges
    .map((edge) => {
      const src = nodeMap.get(edge.sourceId);
      const tgt = nodeMap.get(edge.targetId);
      if (!src || !tgt) return '';
      const shiftedSrc = { ...src, x: src.x + pad, y: src.y + pad };
      const shiftedTgt = { ...tgt, x: tgt.x + pad, y: tgt.y + pad };
      const { path, labelX, labelY } = computeOrthogonalEdgePath(
        shiftedSrc,
        shiftedTgt,
      );
      const labelHtml = edge.label?.trim()
        ? `<rect x="${labelX - Math.max(20, edge.label.length * 4 + 10)}" y="${labelY - 11}" width="${Math.max(40, edge.label.length * 8 + 20)}" height="22" rx="6" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1" />
           <text x="${labelX}" y="${labelY + 4}" text-anchor="middle" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="11.5" font-weight="600" fill="#334155">${escapeXml(edge.label)}</text>`
        : '';

      return `<g>
        <path d="${path}" fill="none" stroke="#1E293B" stroke-width="1.6" marker-end="url(#fc-arrow)" />
        ${labelHtml}
      </g>`;
    })
    .join('\n');

  const nodesSvg = chart.nodes
    .map((rawNode) => {
      const node = { ...rawNode, x: rawNode.x + pad, y: rawNode.y + pad };
      const meta = getNodeMeta(node.type);
      const maxChars = node.type === 'decision' ? 14 : Math.max(12, Math.floor((node.width - 24) / 7.5));
      const lines = wrapText(node.title, maxChars);
      const lineH = 16;
      const startY =
        node.y + node.height / 2 - ((lines.length - 1) * lineH) / 2 + 4.5;
      const cx = node.x + node.width / 2;

      const textSvg = lines
        .map(
          (line, idx) =>
            `<text x="${cx}" y="${startY + idx * lineH}" text-anchor="middle" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="12.5" font-weight="600" fill="${meta.textColor}">${escapeXml(line)}</text>`,
        )
        .join('');

      const ownerSvg = node.owner?.trim()
        ? `<text x="${cx}" y="${node.y + node.height + 15}" text-anchor="middle" font-family="Inter, Segoe UI, Arial, sans-serif" font-size="11" fill="#64748B">${escapeXml(node.owner)}</text>`
        : '';

      const attrs = interactive
        ? `class="svg-node" data-node-id="${escapeXml(node.id)}" style="cursor:pointer;"`
        : '';

      return `<g ${attrs}>
        ${renderSvgNodeShape(node)}
        ${textSvg}
        ${ownerSvg}
      </g>`;
    })
    .join('\n');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg id="flowchart-svg" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <marker id="fc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#1E293B" />
    </marker>
  </defs>
  <rect width="100%" height="100%" fill="${escapeXml(bg)}" />
  ${lanesSvg}
  ${edgesSvg}
  ${nodesSvg}
</svg>`;

  return { svg, width, height };
}

export async function exportFlowchartPng(chart: FlowchartRecord): Promise<void> {
  const { svg, width, height } = buildFlowchartSvg(chart);
  const blob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);

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
    if (!ctx) throw new Error('Contexto 2D indisponível.');
    ctx.scale(scale, scale);
    ctx.drawImage(img, 0, 0);

    const pngBlob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => {
        if (b) resolve(b);
        else reject(new Error('Falha ao gerar PNG.'));
      }, 'image/png');
    });

    downloadBlob(pngBlob, `${slugify(chart.name)}.png`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function openPdfPreviewWindow(name: string): Window {
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
  <title>${escapeXml(name)} — Preparando PDF...</title>
  <style>
    body { margin: 0; min-height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; font-family: Inter, Segoe UI, Arial, sans-serif; background: #F3F6FB; color: #0B2A5B; }
    .spinner { width: 38px; height: 38px; border: 3px solid #CBD5E1; border-top-color: #0B3B78; border-radius: 999px; animation: spin 0.8s linear infinite; margin-bottom: 16px; }
    @keyframes spin { to { transform: rotate(360deg); } }
    strong { font-size: 16px; }
    p { font-size: 13.5px; color: #475569; margin-top: 4px; }
  </style>
</head>
<body>
  <div class="spinner"></div>
  <strong>Gerando relatório PDF do fluxograma com resumo por IA...</strong>
  <p>${escapeXml(name)}</p>
</body>
</html>`);
  win.document.close();
  return win;
}

export function exportFlowchartPdf(
  chart: FlowchartRecord,
  aiSummary?: FlowchartAiSummary | null,
  existingWin?: Window | null,
): void {
  const win =
    existingWin && !existingWin.closed
      ? existingWin
      : window.open('', '_blank', 'width=1120,height=820');

  if (!win) {
    throw new Error('Permita pop-ups no navegador para gerar o PDF.');
  }

  const html = buildRichFlowchartDocument(chart, aiSummary, 'pdf');
  win.document.open();
  win.document.write(html);
  win.document.close();
}

export function exportFlowchartHtml(
  chart: FlowchartRecord,
  aiSummary?: FlowchartAiSummary | null,
): void {
  const html = buildRichFlowchartDocument(chart, aiSummary, 'html');
  downloadBlob(
    new Blob([html], { type: 'text/html;charset=utf-8' }),
    `${slugify(chart.name)}.html`,
  );
}

function buildRichFlowchartDocument(
  chart: FlowchartRecord,
  aiSummary: FlowchartAiSummary | null | undefined,
  mode: 'html' | 'pdf',
): string {
  const isPdf = mode === 'pdf';
  const { svg, width: svgWidth, height: svgHeight } = buildFlowchartSvg(chart, {
    interactive: !isPdf,
  });

  const laneMap = new Map(chart.lanes.map((l) => [l.id, l.name]));
  const nodeMap = new Map(chart.nodes.map((n) => [n.id, n]));
  const totalComments = chart.comments.length;

  const summary: FlowchartAiSummary = aiSummary ?? {
    overview: `O fluxograma "${chart.name}" reúne ${chart.nodes.length} elementos e ${chart.edges.length} conexões distribuídos em ${chart.lanes.length} raia(s), com ${totalComments} comentário(s) registrados.`,
    highlights: chart.lanes
      .slice(0, 4)
      .map((l) => `Raia "${l.name}": ${chart.nodes.filter((n) => n.laneId === l.id).length} elemento(s).`),
    attentionPoints:
      chart.comments.length > 0
        ? chart.comments.slice(0, 3).map((c) => `${c.author}: "${c.text}"`)
        : ['Revise os caminhos de decisão e responsáveis antes de publicar.'],
    generatedByAi: false,
  };

  const nodeCardsHtml = chart.nodes
    .map((node) => {
      const meta = getNodeMeta(node.type);
      const laneName = laneMap.get(node.laneId) ?? 'Geral';
      const incoming = chart.edges.filter((e) => e.targetId === node.id);
      const outgoing = chart.edges.filter((e) => e.sourceId === node.id);
      const cCount = chart.comments.filter((c) => c.nodeId === node.id).length;
      const searchText = [
        node.title,
        meta.label,
        laneName,
        node.owner ?? '',
        node.description ?? '',
      ]
        .join(' ')
        .toLowerCase();

      return `
      <article
        id="node-card-${escapeXml(node.id)}"
        class="node-card"
        data-node-id="${escapeXml(node.id)}"
        data-type="${escapeXml(node.type)}"
        data-search="${escapeXml(searchText)}"
        style="--node-accent:${meta.stroke};--node-soft:${meta.fill};--node-text:${meta.textColor};"
      >
        <div class="node-card-head">
          <div>
            <div class="node-breadcrumb">Raia: ${escapeXml(laneName)}</div>
            <h3 class="node-title">${escapeXml(node.title)}</h3>
          </div>
          <span class="pill level-pill">${escapeXml(meta.label)}</span>
        </div>

        <div class="node-meta-row">
          ${node.owner ? `<span class="pill exec-pill">👤 ${escapeXml(node.owner)}</span>` : ''}
          ${node.trigger ? `<span class="pill date-pill">⚡ ${escapeXml(node.trigger)}</span>` : ''}
          ${
            outgoing.length > 0
              ? `<span class="pill status-open">→ ${outgoing
                  .map((e) => {
                    const t = nodeMap.get(e.targetId)?.title ?? e.targetId;
                    return e.label ? `[${e.label}] ${t}` : t;
                  })
                  .join(' • ')}</span>`
              : incoming.length > 0
                ? `<span class="pill status-done">Terminal do fluxo</span>`
                : ''
          }
          ${
            cCount > 0 && !isPdf
              ? `<a href="#comments-section" class="pill comment-link" data-filter-node="${escapeXml(node.id)}">💬 ${cCount} comentário${cCount > 1 ? 's' : ''}</a>`
              : ''
          }
        </div>

        ${
          node.description?.trim()
            ? `<div class="node-notes"><div class="node-notes-label">Descrição</div><p>${escapeXml(node.description.trim()).replace(/\n/g, '<br />')}</p></div>`
            : ''
        }
      </article>`;
    })
    .join('\n');

  const commentCardsHtml =
    chart.comments.length === 0
      ? `<div class="empty-box">Nenhum comentário registrado neste fluxograma.</div>`
      : chart.comments
          .map((comment) => {
            const linkedNode = comment.nodeId ? nodeMap.get(comment.nodeId) : null;
            const meta = linkedNode ? getNodeMeta(linkedNode.type) : null;
            const accent = meta?.stroke ?? '#0B3B78';
            const initials = computeInitials(comment.author);
            const searchText = [
              comment.author,
              comment.text,
              linkedNode?.title ?? 'Geral',
            ]
              .join(' ')
              .toLowerCase();

            return `
            <article
              class="comment-card"
              data-comment-node="${escapeXml(comment.nodeId ?? '')}"
              data-search="${escapeXml(searchText)}"
            >
              <div class="comment-avatar" style="background:${accent};">${escapeXml(initials)}</div>
              <div class="comment-body">
                <div class="comment-header">
                  <div>
                    <strong class="comment-author">${escapeXml(comment.author)}</strong>
                    <span class="comment-date">${escapeXml(formatDateTime(comment.createdAt))}</span>
                  </div>
                  ${
                    linkedNode
                      ? `<a href="#node-card-${escapeXml(linkedNode.id)}" class="comment-node-tag" data-jump-node="${escapeXml(linkedNode.id)}" style="background:${meta?.fill};color:${meta?.textColor};border-color:${accent}44;">${escapeXml(linkedNode.title)}</a>`
                      : `<span class="comment-node-tag" style="background:#EFF6FF;color:#0B3B78;">Geral do processo</span>`
                  }
                </div>
                <p class="comment-text">${escapeXml(comment.text).replace(/\n/g, '<br />')}</p>
              </div>
            </article>`;
          })
          .join('\n');

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeXml(chart.name)} — Relatório de Fluxograma</title>
  <style>
    :root {
      --navy: #0B2A5B;
      --bg: #F3F6FB;
      --surface: #FFFFFF;
      --ink: #0F172A;
      --muted: #64748B;
      --border: #E2E8F0;
      --canvas-bg: ${escapeXml(chart.backgroundColor || '#F8FAFC')};
    }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body { margin: 0; font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; background: var(--bg); color: var(--ink); line-height: 1.5; }
    .hero { background: linear-gradient(125deg, #092047 0%, #0B3B78 52%, #0E6BA8 100%); color: #FFFFFF; padding: 28px 24px 32px; box-shadow: 0 8px 28px rgba(9, 32, 71, 0.18); }
    .hero-inner { max-width: 1240px; margin: 0 auto; }
    .brand-chip { display: inline-flex; align-items: center; gap: 6px; background: rgba(255,255,255,0.14); border: 1px solid rgba(255,255,255,0.22); border-radius: 999px; padding: 4px 12px; font-size: 12px; font-weight: 600; margin-bottom: 10px; }
    .hero h1 { margin: 0; font-size: clamp(22px, 3vw, 30px); font-weight: 800; letter-spacing: -0.02em; }
    .hero-sub { margin: 6px 0 0; font-size: 13.5px; color: rgba(226,238,255,0.88); }
    .kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; margin-top: 20px; }
    .kpi { background: rgba(255,255,255,0.11); border: 1px solid rgba(255,255,255,0.18); border-radius: 14px; padding: 12px 16px; }
    .kpi-label { font-size: 11.5px; text-transform: uppercase; letter-spacing: 0.05em; color: rgba(226,238,255,0.8); }
    .kpi-value { font-size: 22px; font-weight: 800; margin-top: 2px; }
    main { max-width: 1240px; margin: 24px auto 56px; padding: 0 20px; display: flex; flex-direction: column; gap: 24px; }
    .section-card { background: var(--surface); border: 1px solid var(--border); border-radius: 18px; box-shadow: 0 4px 18px rgba(15,23,42,0.04); overflow: hidden; }
    .section-header { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 12px; padding: 18px 22px; border-bottom: 1px solid var(--border); background: linear-gradient(180deg, #FFFFFF 0%, #FAFBFD 100%); }
    .section-title { margin: 0; font-size: 17px; font-weight: 700; color: var(--navy); }
    .section-body { padding: 20px 22px; }
    .ai-card { position: relative; border: 1px solid #C7D7FE; background: linear-gradient(135deg, #FFFFFF 0%, #F5F8FF 60%, #F0FDFB 100%); }
    .ai-card::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 5px; background: linear-gradient(180deg, #2563EB, #0EA5E9, #0F766E); }
    .ai-badge { display: inline-flex; align-items: center; padding: 4px 11px; border-radius: 999px; font-size: 12px; font-weight: 600; background: ${summary.generatedByAi ? '#E0E7FF' : '#E2E8F0'}; color: ${summary.generatedByAi ? '#3730A3' : '#475569'}; }
    .ai-overview { margin: 0; font-size: 15px; color: #1E293B; line-height: 1.65; }
    .ai-columns { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-top: 16px; }
    .ai-subbox { border-radius: 14px; padding: 14px 16px; border: 1px solid transparent; }
    .ai-subbox.highlights { background: #F0FDFA; border-color: #CCFBF1; }
    .ai-subbox.attention { background: #FFFBEB; border-color: #FDE68A; }
    .ai-subbox h3 { margin: 0 0 8px; font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; }
    .ai-subbox.highlights h3 { color: #0F766E; }
    .ai-subbox.attention h3 { color: #B45309; }
    .ai-subbox ul { margin: 0; padding-left: 18px; font-size: 13.5px; color: #334155; }
    .ai-subbox li { margin: 5px 0; }
    .map-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
    .tool-btn { display: inline-flex; align-items: center; justify-content: center; height: 32px; padding: 0 11px; border-radius: 8px; border: 1px solid #CBD5E1; background: #FFFFFF; color: #1E293B; font-size: 12.5px; font-weight: 600; cursor: pointer; }
    .tool-btn:hover { background: #EFF6FF; border-color: #2563EB; color: #1D4ED8; }
    .zoom-readout { min-width: 48px; text-align: center; font-size: 12.5px; font-weight: 700; color: var(--navy); }
    .map-viewport { position: relative; height: 520px; min-height: 280px; max-height: 85vh; overflow: hidden; background-color: var(--canvas-bg); background-image: radial-gradient(rgba(100,116,139,0.26) 1px, transparent 1px); background-size: 20px 20px; cursor: grab; user-select: none; }
    .map-viewport.dragging { cursor: grabbing; }
    .map-stage { position: absolute; left: 0; top: 0; transform-origin: 0 0; }
    .map-hint { position: absolute; left: 14px; bottom: 12px; background: rgba(15,23,42,0.72); color: #FFFFFF; padding: 5px 11px; border-radius: 999px; font-size: 11.5px; pointer-events: none; }
    .resize-handle { height: 16px; background: #F1F5F9; border-top: 1px solid var(--border); cursor: ns-resize; display: flex; align-items: center; justify-content: center; }
    .resize-bar { width: 44px; height: 4px; border-radius: 999px; background: #94A3B8; }
    .filter-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-bottom: 18px; }
    .search-input { flex: 1; min-width: 220px; height: 38px; padding: 0 14px; border-radius: 10px; border: 1px solid #CBD5E1; font-size: 13.5px; color: var(--ink); outline: none; }
    .nodes-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px; }
    .node-card { background: #FFFFFF; border: 1px solid var(--border); border-left: 4px solid var(--node-accent); border-radius: 14px; padding: 15px 16px; transition: box-shadow 0.2s ease, border-color 0.2s ease; }
    .node-card.highlight-pulse { box-shadow: 0 0 0 3px rgba(37,99,235,0.35); border-color: #2563EB; }
    .node-card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
    .node-breadcrumb { font-size: 11.5px; color: var(--muted); margin-bottom: 3px; }
    .node-title { margin: 0; font-size: 15px; font-weight: 700; color: var(--ink); }
    .node-meta-row { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
    .pill { display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px; border-radius: 999px; font-size: 11.5px; font-weight: 600; text-decoration: none; }
    .level-pill { background: var(--node-soft); color: var(--node-text); border: 1px solid rgba(15,23,42,0.08); white-space: nowrap; }
    .status-done { background: #DCFCE7; color: #166534; }
    .status-open { background: #F1F5F9; color: #334155; }
    .exec-pill { background: #EDE9FE; color: #5B21B6; }
    .date-pill { background: #FEF3C7; color: #92400E; }
    .comment-link { background: #DBEAFE; color: #1D4ED8; }
    .node-notes { margin-top: 12px; background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 10px 12px; }
    .node-notes-label { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); margin-bottom: 4px; }
    .node-notes p { margin: 0; font-size: 13px; color: #334155; }
    .comments-list { display: flex; flex-direction: column; gap: 12px; }
    .comment-card { display: flex; gap: 14px; padding: 14px 16px; border-radius: 14px; border: 1px solid var(--border); background: #FAFBFD; }
    .comment-avatar { width: 38px; height: 38px; border-radius: 999px; color: #FFFFFF; font-size: 13px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .comment-body { flex: 1; min-width: 0; }
    .comment-header { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 8px; }
    .comment-author { font-size: 14px; color: var(--ink); }
    .comment-date { font-size: 12px; color: var(--muted); margin-left: 8px; }
    .comment-node-tag { display: inline-flex; padding: 3px 10px; border-radius: 999px; border: 1px solid transparent; font-size: 12px; font-weight: 600; text-decoration: none; }
    .comment-text { margin: 8px 0 0; font-size: 13.5px; color: #1E293B; }
    .empty-box { text-align: center; padding: 28px; border-radius: 12px; background: #F8FAFC; border: 1px dashed #CBD5E1; color: var(--muted); font-size: 14px; }
    .hidden { display: none !important; }
    .pdf-action-bar { position: sticky; top: 0; z-index: 30; display: flex; justify-content: space-between; align-items: center; gap: 12px; padding: 10px 24px; background: #092047; color: #FFFFFF; border-bottom: 1px solid rgba(255,255,255,0.15); }
    .pdf-action-bar span { font-size: 13px; color: rgba(226,238,255,0.9); }
    .pdf-action-buttons { display: flex; gap: 8px; }
    .pdf-btn-primary { height: 34px; padding: 0 14px; border-radius: 8px; border: none; background: #2563EB; color: #FFFFFF; font-size: 13px; font-weight: 600; cursor: pointer; }
    .pdf-btn-secondary { height: 34px; padding: 0 14px; border-radius: 8px; border: 1px solid rgba(255,255,255,0.28); background: rgba(255,255,255,0.08); color: #FFFFFF; font-size: 13px; font-weight: 600; cursor: pointer; }
    .pdf-map-wrap { padding: 16px; background-color: var(--canvas-bg); background-image: radial-gradient(rgba(100,116,139,0.22) 1px, transparent 1px); background-size: 18px 18px; }
    .pdf-map-wrap svg { width: 100%; height: auto; max-height: 760px; display: block; margin: 0 auto; }
    @page { size: A4; margin: 10mm; }
    @media print {
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      body { background: #FFFFFF !important; }
      .no-print { display: none !important; }
      .hero { border-radius: 14px; padding: 20px 22px; box-shadow: none; margin-bottom: 14px; }
      main { max-width: 100%; margin: 0; padding: 0; gap: 14px; }
      .section-card { box-shadow: none; border-radius: 12px; }
      .ai-card, .node-card, .comment-card, .kpi, .pdf-map-wrap { break-inside: avoid; page-break-inside: avoid; }
      .section-header { break-after: avoid; page-break-after: avoid; padding: 12px 16px; }
      .section-body { padding: 14px 16px; }
      .nodes-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; }
    }
  </style>
</head>
<body>
  ${
    isPdf
      ? `<div class="pdf-action-bar no-print">
          <span>Pré-visualização do relatório PDF • Ative "Gráficos de segundo plano" para manter todas as cores.</span>
          <div class="pdf-action-buttons">
            <button type="button" class="pdf-btn-primary" onclick="window.print()">Salvar / Imprimir PDF</button>
            <button type="button" class="pdf-btn-secondary" onclick="window.close()">Fechar</button>
          </div>
        </div>`
      : ''
  }
  <header class="hero">
    <div class="hero-inner">
      <div class="brand-chip">✦ Modelador de Fluxogramas • ${isPdf ? 'Relatório Executivo PDF' : 'Relatório Interativo'}</div>
      <h1>${escapeXml(chart.name)}</h1>
      <p class="hero-sub">
        Estado: <strong>${escapeXml(formatStatusLabel(chart.status))}</strong> • Proprietário: <strong>${escapeXml(chart.owner)}</strong> • Atualizado em ${escapeXml(formatDateTime(chart.updatedAt))}
      </p>
      <div class="kpi-grid">
        <div class="kpi"><div class="kpi-label">Elementos</div><div class="kpi-value">${chart.nodes.length}</div></div>
        <div class="kpi"><div class="kpi-label">Conexões</div><div class="kpi-value">${chart.edges.length}</div></div>
        <div class="kpi"><div class="kpi-label">Raias</div><div class="kpi-value">${chart.lanes.length}</div></div>
        <div class="kpi"><div class="kpi-label">Comentários</div><div class="kpi-value">${totalComments}</div></div>
      </div>
    </div>
  </header>

  <main>
    <section class="section-card ai-card">
      <div class="section-header">
        <h2 class="section-title">✦ Resumo Executivo</h2>
        <span class="ai-badge">${summary.generatedByAi ? `Gerado por IA • ${escapeXml(summary.model || 'Gemini')}` : 'Resumo automático do processo'}</span>
      </div>
      <div class="section-body">
        <p class="ai-overview">${escapeXml(summary.overview)}</p>
        <div class="ai-columns">
          ${summary.highlights.length > 0 ? `<div class="ai-subbox highlights"><h3>Principais destaques</h3><ul>${summary.highlights.map((h) => `<li>${escapeXml(h)}</li>`).join('')}</ul></div>` : ''}
          ${summary.attentionPoints.length > 0 ? `<div class="ai-subbox attention"><h3>Pontos de atenção</h3><ul>${summary.attentionPoints.map((a) => `<li>${escapeXml(a)}</li>`).join('')}</ul></div>` : ''}
        </div>
      </div>
    </section>

    <section class="section-card">
      <div class="section-header">
        <h2 class="section-title">Fluxograma</h2>
        ${
          !isPdf
            ? `<div class="map-toolbar">
                <button type="button" class="tool-btn" id="btn-zoom-out">−</button>
                <span class="zoom-readout" id="zoom-readout">100%</span>
                <button type="button" class="tool-btn" id="btn-zoom-in">+</button>
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
              <div id="map-stage" class="map-stage">${svg}</div>
              <div class="map-hint">Arraste para mover • Ctrl + Scroll para zoom • Clique em um elemento para ver detalhes</div>
            </div>
            <div id="resize-handle" class="resize-handle" title="Arraste para redimensionar a altura"><span class="resize-bar"></span></div>`
      }
    </section>

    <section id="nodes-section" class="section-card">
      <div class="section-header"><h2 class="section-title">Detalhes dos Elementos (${chart.nodes.length})</h2></div>
      <div class="section-body">
        ${!isPdf ? `<div class="filter-bar"><input id="node-search" class="search-input" type="search" placeholder="Filtrar elementos por título, tipo, raia ou owner..." /></div>` : ''}
        <div class="nodes-grid">${nodeCardsHtml}</div>
        ${!isPdf ? `<div id="nodes-empty" class="empty-box hidden">Nenhum elemento encontrado.</div>` : ''}
      </div>
    </section>

    <section id="comments-section" class="section-card">
      <div class="section-header">
        <h2 class="section-title">Comentários (${totalComments})</h2>
        ${!isPdf ? `<button type="button" id="btn-clear-comment-filter" class="tool-btn hidden">Mostrar todos</button>` : ''}
      </div>
      <div class="section-body">
        <div class="comments-list">${commentCardsHtml}</div>
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
      let zoom = 1, panX = 16, panY = 16;

      function render() {
        stage.style.transform = 'translate(' + panX + 'px, ' + panY + 'px) scale(' + zoom + ')';
        zoomReadout.textContent = Math.round(zoom * 100) + '%';
      }
      function fit() {
        const vw = Math.max(240, viewport.clientWidth - 28);
        const vh = Math.max(200, viewport.clientHeight - 28);
        zoom = Math.max(0.35, Math.min(1.4, Number(Math.min(1, vw / svgWidth, vh / svgHeight).toFixed(2))));
        panX = Math.max(12, Math.round((viewport.clientWidth - svgWidth * zoom) / 2));
        panY = Math.max(12, Math.round((viewport.clientHeight - svgHeight * zoom) / 2));
        render();
      }
      document.getElementById('btn-zoom-in').addEventListener('click', () => { zoom = Math.min(2.2, Number((zoom + 0.15).toFixed(2))); render(); });
      document.getElementById('btn-zoom-out').addEventListener('click', () => { zoom = Math.max(0.3, Number((zoom - 0.15).toFixed(2))); render(); });
      document.getElementById('btn-fit').addEventListener('click', fit);
      document.getElementById('btn-reset').addEventListener('click', () => { zoom = 1; panX = 20; panY = 20; render(); });

      let dragging = false, sx = 0, sy = 0, ox = 0, oy = 0;
      viewport.addEventListener('mousedown', (e) => { if (e.target.closest('.svg-node')) return; dragging = true; viewport.classList.add('dragging'); sx = e.clientX; sy = e.clientY; ox = panX; oy = panY; });
      window.addEventListener('mousemove', (e) => { if (!dragging) return; panX = ox + (e.clientX - sx); panY = oy + (e.clientY - sy); render(); });
      window.addEventListener('mouseup', () => { dragging = false; viewport.classList.remove('dragging'); });
      viewport.addEventListener('wheel', (e) => { if (!e.ctrlKey && !e.metaKey) return; e.preventDefault(); zoom = Math.min(2.2, Math.max(0.3, Number((zoom + (e.deltaY < 0 ? 0.1 : -0.1)).toFixed(2)))); render(); }, { passive: false });

      let resizing = false, rsy = 0, rsh = 0;
      resizeHandle.addEventListener('mousedown', (e) => { resizing = true; rsy = e.clientY; rsh = viewport.clientHeight; document.body.style.cursor = 'ns-resize'; });
      window.addEventListener('mousemove', (e) => { if (!resizing) return; viewport.style.height = Math.round(Math.max(280, Math.min(window.innerHeight * 0.85, rsh + (e.clientY - rsy)))) + 'px'; });
      window.addEventListener('mouseup', () => { if (!resizing) return; resizing = false; document.body.style.cursor = ''; });

      function focusCard(id) {
        const el = document.getElementById('node-card-' + id);
        if (!el) return;
        el.classList.remove('hidden');
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('highlight-pulse');
        setTimeout(() => el.classList.remove('highlight-pulse'), 1800);
      }
      document.querySelectorAll('.svg-node').forEach((n) => n.addEventListener('click', () => focusCard(n.getAttribute('data-node-id'))));
      document.querySelectorAll('[data-jump-node]').forEach((n) => n.addEventListener('click', (e) => { e.preventDefault(); focusCard(n.getAttribute('data-jump-node')); }));

      const nodeSearch = document.getElementById('node-search');
      const nodeCards = Array.from(document.querySelectorAll('.node-card'));
      const nodesEmpty = document.getElementById('nodes-empty');
      if (nodeSearch) {
        nodeSearch.addEventListener('input', () => {
          const q = nodeSearch.value.trim().toLowerCase();
          let vis = 0;
          nodeCards.forEach((c) => { const ok = !q || (c.dataset.search || '').includes(q); c.classList.toggle('hidden', !ok); if (ok) vis++; });
          nodesEmpty.classList.toggle('hidden', vis > 0);
        });
      }

      const commentCards = Array.from(document.querySelectorAll('.comment-card'));
      const clearBtn = document.getElementById('btn-clear-comment-filter');
      document.querySelectorAll('[data-filter-node]').forEach((a) => a.addEventListener('click', () => {
        const nid = a.getAttribute('data-filter-node');
        commentCards.forEach((c) => c.classList.toggle('hidden', c.dataset.commentNode !== nid));
        clearBtn.classList.remove('hidden');
      }));
      if (clearBtn) clearBtn.addEventListener('click', () => {
        commentCards.forEach((c) => c.classList.remove('hidden'));
        clearBtn.classList.add('hidden');
      });

      fit();
    })();
  </script>`
  }
</body>
</html>`;
}

export function exportFlowchartJson(chart: FlowchartRecord): void {
  const payload = {
    name: chart.name,
    description: chart.description,
    tags: chart.tags,
    status: chart.status,
    backgroundColor: chart.backgroundColor,
    lanes: chart.lanes,
    nodes: chart.nodes,
    edges: chart.edges,
    comments: chart.comments,
  };
  downloadBlob(
    new Blob([JSON.stringify(payload, null, 2)], {
      type: 'application/json;charset=utf-8',
    }),
    `${slugify(chart.name)}.json`,
  );
}

export function exportFlowchartCsv(chart: FlowchartRecord): void {
  const laneMap = new Map(chart.lanes.map((l) => [l.id, l.name]));
  const nodeMap = new Map(chart.nodes.map((n) => [n.id, n.title]));
  const rows: string[][] = [
    ['Tipo', 'Titulo', 'Raia', 'Owner', 'Descricao', 'Saidas'],
  ];

  for (const n of chart.nodes) {
    const outs = chart.edges
      .filter((e) => e.sourceId === n.id)
      .map((e) => {
        const target = nodeMap.get(e.targetId) ?? e.targetId;
        return e.label ? `[${e.label}] ${target}` : target;
      })
      .join(' | ');
    rows.push([
      getNodeMeta(n.type).label,
      n.title,
      laneMap.get(n.laneId) ?? '',
      n.owner ?? '',
      n.description ?? '',
      outs,
    ]);
  }

  const csv =
    '\uFEFF' +
    rows
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';'))
      .join('\r\n');

  downloadBlob(
    new Blob([csv], { type: 'text/csv;charset=utf-8' }),
    `${slugify(chart.name)}.csv`,
  );
}

export function exportFlowchartMarkdown(chart: FlowchartRecord): void {
  const laneMap = new Map(chart.lanes.map((l) => [l.id, l.name]));
  const nodeMap = new Map(chart.nodes.map((n) => [n.id, n.title]));
  const lines = [
    `# ${chart.name}`,
    '',
    chart.description ? `> ${chart.description}\n` : '',
    '## Elementos',
    '',
    ...chart.nodes.map(
      (n) =>
        `- **${n.title}** (${getNodeMeta(n.type).label} · Raia: ${laneMap.get(n.laneId) ?? 'Geral'}${n.owner ? ` · Owner: ${n.owner}` : ''})${n.description ? ` — ${n.description}` : ''}`,
    ),
    '',
    '## Fluxo / Conexões',
    '',
    ...chart.edges.map(
      (e) =>
        `- ${nodeMap.get(e.sourceId) ?? e.sourceId} → ${nodeMap.get(e.targetId) ?? e.targetId}${e.label ? ` (**${e.label}**)` : ''}`,
    ),
  ];

  downloadBlob(
    new Blob([lines.filter((l) => l !== undefined).join('\n') + '\n'], {
      type: 'text/markdown;charset=utf-8',
    }),
    `${slugify(chart.name)}.md`,
  );
}
