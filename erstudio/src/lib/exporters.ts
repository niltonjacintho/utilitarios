import {
  ErAiSummary,
  ErProjectRecord,
  ErRelation,
  ErSubModel,
  ErTable,
} from '@/types/erstudio';
import {
  formatColType,
  formatDateTime,
  formatDialectLabel,
  getTableCardSize,
} from './er-utils';

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'der-submodel'
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

export function getActiveSubModelData(project: ErProjectRecord): {
  subModel: ErSubModel;
  tables: ErTable[];
  relations: ErRelation[];
} {
  const subModel =
    project.subModels.find((s) => s.id === project.activeSubModelId) ??
    project.subModels[0] ?? {
      id: 'sub_default',
      name: 'Principal',
      tableIds: [],
      positions: {},
    };

  const idSet = new Set(subModel.tableIds);
  const tables = project.tables.filter((t) => idSet.has(t.id));
  const relations = project.relations.filter(
    (r) => idSet.has(r.fromTableId) && idSet.has(r.toTableId),
  );

  return { subModel, tables, relations };
}

export function buildSubModelSvg(
  project: ErProjectRecord,
  options?: { expanded?: boolean; interactive?: boolean; bg?: string },
): { svg: string; width: number; height: number } {
  const { subModel, tables, relations } = getActiveSubModelData(project);
  const expanded = Boolean(options?.expanded);
  const interactive = Boolean(options?.interactive);
  const bg = options?.bg ?? '#FFFFFF';

  const pad = 40;
  const fkColsByTable = new Map<string, Set<string>>();
  for (const r of relations) {
    const s = fkColsByTable.get(r.fromTableId) ?? new Set<string>();
    s.add(r.fromColumn.toLowerCase());
    fkColsByTable.set(r.fromTableId, s);
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = 0;
  let maxY = 0;

  const placed = tables.map((tbl, idx) => {
    const pos = subModel.positions[tbl.id] ?? {
      x: 60 + (idx % 3) * (expanded ? 470 : 330),
      y: 60 + Math.floor(idx / 3) * 280,
    };
    const size = getTableCardSize(tbl, expanded);
    minX = Math.min(minX, pos.x);
    minY = Math.min(minY, pos.y);
    maxX = Math.max(maxX, pos.x + size.width);
    maxY = Math.max(maxY, pos.y + size.height);
    return { tbl, x: pos.x, y: pos.y, width: size.width, height: size.height };
  });

  if (placed.length === 0) {
    const emptySvg = `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="240" viewBox="0 0 800 240"><rect width="100%" height="100%" fill="${bg}" /><text x="400" y="120" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="16" fill="#64748B">Nenhuma tabela selecionada neste SubModel</text></svg>`;
    return { svg: emptySvg, width: 800, height: 240 };
  }

  const offsetX = pad - minX;
  const offsetY = pad - minY;
  const width = Math.max(760, Math.round(maxX - minX + pad * 2));
  const height = Math.max(360, Math.round(maxY - minY + pad * 2));
  const placedMap = new Map(placed.map((p) => [p.tbl.id, p]));

  const edgesSvg = relations
    .map((rel) => {
      const from = placedMap.get(rel.fromTableId);
      const to = placedMap.get(rel.toTableId);
      if (!from || !to) return '';

      const fx = from.x + offsetX;
      const fy = from.y + offsetY;
      const tx = to.x + offsetX;
      const ty = to.y + offsetY;

      const fromRight = fx + from.width <= tx;
      const sx = fromRight ? fx + from.width : fx;
      const sy = fy + Math.min(from.height - 20, 62);
      const ex = fromRight ? tx : tx + to.width;
      const ey = ty + Math.min(to.height - 20, 62);
      const midX = Math.round((sx + ex) / 2);

      const d = `M ${sx} ${sy} L ${midX} ${sy} L ${midX} ${ey} L ${ex} ${ey}`;
      return `<path d="${d}" fill="none" stroke="#1E3A5F" stroke-width="1.6" ${rel.optional ? 'stroke-dasharray="5 4"' : ''} marker-end="url(#er-arrow)" />`;
    })
    .join('\n');

  const tablesSvg = placed
    .map((item) => {
      const x = item.x + offsetX;
      const y = item.y + offsetY;
      const fkSet = fkColsByTable.get(item.tbl.id) ?? new Set<string>();
      const rowH = 26;
      const headerH = 38;
      const subHeadH = expanded ? 22 : 0;

      const rowsSvg = item.tbl.columns
        .map((col, idx) => {
          const ry = y + headerH + subHeadH + idx * rowH;
          const isFk = fkSet.has(col.name.toLowerCase());
          const rowBg = col.primaryKey
            ? '#FEF7DC'
            : idx % 2 === 1
              ? '#F8FAFC'
              : '#FFFFFF';
          const badge = col.primaryKey
            ? isFk
              ? 'PK FK'
              : 'PK'
            : isFk
              ? 'FK'
              : '';
          const badgeColor = col.primaryKey ? '#B45309' : '#2563EB';
          const typeStr = formatColType(col);

          return `
            <rect x="${x + 1}" y="${ry}" width="${item.width - 2}" height="${rowH}" fill="${rowBg}" />
            ${badge ? `<text x="${x + 10}" y="${ry + 17}" font-family="Inter, Arial, sans-serif" font-size="9.5" font-weight="700" fill="${badgeColor}">${badge}</text>` : ''}
            <text x="${x + (badge ? 46 : 12)}" y="${ry + 17}" font-family="Inter, Arial, sans-serif" font-size="11.5" font-weight="${col.primaryKey ? '700' : '500'}" fill="#0F172A">${escapeXml(col.name.slice(0, expanded ? 22 : 20))}</text>
            <text x="${x + (expanded ? 205 : item.width - 12)}" y="${ry + 17}" text-anchor="${expanded ? 'start' : 'end'}" font-family="monospace" font-size="11" fill="#475569">${escapeXml(typeStr.slice(0, 16))}</text>
            ${
              expanded
                ? `<text x="${x + 300}" y="${ry + 17}" font-family="Inter, Arial, sans-serif" font-size="10.5" fill="#64748B">${col.nullable ? 'NULL' : 'NOT NULL'}</text>
                   <text x="${x + 362}" y="${ry + 17}" font-family="Inter, Arial, sans-serif" font-size="10.5" font-weight="700" fill="#0F766E">${col.identity ? 'ID' : ''}</text>`
                : ''
            }
          `;
        })
        .join('\n');

      const attrs = interactive
        ? `class="svg-table" data-table-id="${escapeXml(item.tbl.id)}" style="cursor:pointer;"`
        : '';

      return `<g ${attrs}>
        <rect x="${x}" y="${y}" width="${item.width}" height="${item.height}" rx="10" fill="#FFFFFF" stroke="#CBD5E1" stroke-width="1.4" />
        <path d="M ${x} ${y + 10} Q ${x} ${y} ${x + 10} ${y} L ${x + item.width - 10} ${y} Q ${x + item.width} ${y} ${x + item.width} ${y + 10} L ${x + item.width} ${y + headerH} L ${x} ${y + headerH} Z" fill="#0F1D3D" />
        <text x="${x + 12}" y="${y + 24}" font-family="Inter, Arial, sans-serif" font-size="12.5" font-weight="700" fill="#FFFFFF">${escapeXml(item.tbl.name)}</text>
        ${
          expanded
            ? `<rect x="${x + 1}" y="${y + headerH}" width="${item.width - 2}" height="${subHeadH}" fill="#F1F5F9" />
               <text x="${x + 12}" y="${y + headerH + 15}" font-family="Inter, Arial, sans-serif" font-size="9.5" font-weight="700" fill="#64748B">CAMPO</text>
               <text x="${x + 205}" y="${y + headerH + 15}" font-family="Inter, Arial, sans-serif" font-size="9.5" font-weight="700" fill="#64748B">TIPO</text>
               <text x="${x + 300}" y="${y + headerH + 15}" font-family="Inter, Arial, sans-serif" font-size="9.5" font-weight="700" fill="#64748B">NULO</text>
               <text x="${x + 362}" y="${y + headerH + 15}" font-family="Inter, Arial, sans-serif" font-size="9.5" font-weight="700" fill="#64748B">ID</text>`
            : ''
        }
        ${rowsSvg}
      </g>`;
    })
    .join('\n');

  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg id="er-svg" xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <defs>
    <marker id="er-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 1.5 L 10 5 L 0 8.5 z" fill="#1E3A5F" />
    </marker>
  </defs>
  <rect width="100%" height="100%" fill="${escapeXml(bg)}" />
  ${edgesSvg}
  ${tablesSvg}
</svg>`;

  return { svg, width, height };
}

export async function exportSubModelPng(
  project: ErProjectRecord,
  expanded: boolean,
): Promise<void> {
  const { subModel } = getActiveSubModelData(project);
  const { svg, width, height } = buildSubModelSvg(project, {
    expanded,
    bg: '#FFFFFF',
  });
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

    downloadBlob(pngBlob, `${slugify(project.name)}-${slugify(subModel.name)}.png`);
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function openPdfPreviewWindow(title: string): Window {
  const win = window.open('', '_blank', 'width=1180,height=840');
  if (!win) {
    throw new Error('Permita pop-ups no navegador para gerar o PDF.');
  }
  win.document.write(`<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8" /><title>${escapeXml(title)} — Preparando PDF...</title>
<style>body{margin:0;min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:Inter,Segoe UI,Arial,sans-serif;background:#F3F6FB;color:#0B2A5B}.spinner{width:38px;height:38px;border:3px solid #CBD5E1;border-top-color:#0B3B78;border-radius:999px;animation:spin .8s linear infinite;margin-bottom:14px}@keyframes spin{to{transform:rotate(360deg)}}</style>
</head><body><div class="spinner"></div><strong>Gerando relatório PDF do SubModel com resumo por IA...</strong><p style="color:#64748B;font-size:13px;">${escapeXml(title)}</p></body></html>`);
  win.document.close();
  return win;
}

export function exportSubModelPdf(
  project: ErProjectRecord,
  expanded: boolean,
  aiSummary?: ErAiSummary | null,
  existingWin?: Window | null,
): void {
  const win =
    existingWin && !existingWin.closed
      ? existingWin
      : window.open('', '_blank', 'width=1180,height=840');
  if (!win) throw new Error('Permita pop-ups no navegador para gerar o PDF.');
  const html = buildSubModelReportDocument(project, expanded, aiSummary, 'pdf');
  win.document.open();
  win.document.write(html);
  win.document.close();
}

export function exportSubModelHtml(
  project: ErProjectRecord,
  expanded: boolean,
  aiSummary?: ErAiSummary | null,
): void {
  const { subModel } = getActiveSubModelData(project);
  const html = buildSubModelReportDocument(project, expanded, aiSummary, 'html');
  downloadBlob(
    new Blob([html], { type: 'text/html;charset=utf-8' }),
    `${slugify(project.name)}-${slugify(subModel.name)}.html`,
  );
}

function buildSubModelReportDocument(
  project: ErProjectRecord,
  expanded: boolean,
  aiSummary: ErAiSummary | null | undefined,
  mode: 'html' | 'pdf',
): string {
  const isPdf = mode === 'pdf';
  const { subModel, tables, relations } = getActiveSubModelData(project);
  const { svg, width: svgWidth, height: svgHeight } = buildSubModelSvg(
    project,
    { expanded, interactive: !isPdf, bg: '#F8FAFC' },
  );

  const totalCols = tables.reduce((s, t) => s + t.columns.length, 0);
  const tableById = new Map(tables.map((t) => [t.id, t]));
  const fkColsByTable = new Map<string, Set<string>>();
  for (const r of relations) {
    const set = fkColsByTable.get(r.fromTableId) ?? new Set<string>();
    set.add(r.fromColumn.toLowerCase());
    fkColsByTable.set(r.fromTableId, set);
  }

  const summary: ErAiSummary = aiSummary ?? {
    overview: `O SubModel "${subModel.name}" do projeto "${project.name}" (${formatDialectLabel(project.dialect)}) contém ${tables.length} tabela(s), ${totalCols} coluna(s) e ${relations.length} relacionamento(s).`,
    highlights: tables
      .slice(0, 4)
      .map((t) => `${t.name}: ${t.columns.length} coluna(s).`),
    attentionPoints:
      project.pendingChanges.length > 0
        ? [`${project.pendingChanges.length} alteração(ões) DDL pendentes no script de atualização.`]
        : ['Modelo sincronizado sem alterações pendentes.'],
    generatedByAi: false,
  };

  const tableCardsHtml = tables
    .map((tbl) => {
      const fkSet = fkColsByTable.get(tbl.id) ?? new Set<string>();
      const searchText = [
        tbl.name,
        tbl.description ?? '',
        ...tbl.columns.map((c) => `${c.name} ${c.type}`),
      ]
        .join(' ')
        .toLowerCase();

      const rows = tbl.columns
        .map((col) => {
          const isFk = fkSet.has(col.name.toLowerCase());
          return `<tr class="${col.primaryKey ? 'pk-row' : ''}">
            <td>
              ${col.primaryKey ? '<span class="badge-pk">PK</span>' : ''}
              ${isFk ? '<span class="badge-fk">FK</span>' : ''}
              <strong>${escapeXml(col.name)}</strong>
            </td>
            <td class="mono">${escapeXml(formatColType(col))}</td>
            <td>${col.nullable ? 'Sim' : 'Não'}</td>
            <td>${col.identity ? 'Sim' : '—'}</td>
            <td class="mono">${escapeXml(col.defaultValue ?? '—')}</td>
          </tr>`;
        })
        .join('');

      return `
      <article id="tbl-card-${escapeXml(tbl.id)}" class="table-card" data-search="${escapeXml(searchText)}">
        <div class="table-card-header">
          <div>
            <h3>${escapeXml(tbl.name)}</h3>
            ${tbl.description ? `<p>${escapeXml(tbl.description)}</p>` : ''}
          </div>
          <span class="count-pill">${tbl.columns.length} coluna(s)</span>
        </div>
        <div class="table-wrap">
          <table>
            <thead>
              <tr><th>Campo</th><th>Tipo</th><th>Nulo</th><th>Identity</th><th>Default</th></tr>
            </thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </article>`;
    })
    .join('\n');

  const relationsRowsHtml =
    relations.length === 0
      ? `<div class="empty-box">Nenhum relacionamento entre as tabelas deste SubModel.</div>`
      : `<div class="table-wrap"><table>
          <thead><tr><th>Nome da FK</th><th>Tabela Filha (FK)</th><th>Tabela Pai (Ref.)</th><th>Cardinalidade</th><th>Opcional</th><th>ON DELETE</th></tr></thead>
          <tbody>${relations
            .map((r) => {
              const fromT = tableById.get(r.fromTableId)?.name ?? r.fromTableId;
              const toT = tableById.get(r.toTableId)?.name ?? r.toTableId;
              return `<tr>
                <td class="mono">${escapeXml(r.name)}</td>
                <td><strong>${escapeXml(fromT)}</strong>.${escapeXml(r.fromColumn)}</td>
                <td><strong>${escapeXml(toT)}</strong>.${escapeXml(r.toColumn)}</td>
                <td><span class="badge-fk">${r.cardinality}</span></td>
                <td>${r.optional ? 'Sim (NULL)' : 'Não (NOT NULL)'}</td>
                <td>${escapeXml(r.onDelete && r.onDelete !== 'NONE' ? r.onDelete : 'Padrão')}</td>
              </tr>`;
            })
            .join('')}</tbody>
        </table></div>`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeXml(project.name)} — SubModel ${escapeXml(subModel.name)}</title>
  <style>
    :root { --navy:#0F1D3D; --bg:#F3F6FB; --ink:#0F172A; --muted:#64748B; --border:#E2E8F0; }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body { margin:0; font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif; background:var(--bg); color:var(--ink); line-height:1.5; }
    .hero { background:linear-gradient(125deg,#091633 0%,#0F2C63 55%,#145A9E 100%); color:#FFF; padding:26px 24px 30px; }
    .hero-inner { max-width:1280px; margin:0 auto; }
    .chip { display:inline-flex; background:rgba(255,255,255,.14); border:1px solid rgba(255,255,255,.22); border-radius:999px; padding:4px 12px; font-size:12px; font-weight:600; margin-bottom:10px; }
    .hero h1 { margin:0; font-size:28px; font-weight:800; }
    .hero-sub { margin:6px 0 0; font-size:13.5px; color:rgba(226,238,255,.88); }
    .kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; margin-top:18px; }
    .kpi { background:rgba(255,255,255,.11); border:1px solid rgba(255,255,255,.18); border-radius:14px; padding:12px 16px; }
    .kpi-label { font-size:11px; text-transform:uppercase; letter-spacing:.05em; color:rgba(226,238,255,.8); }
    .kpi-val { font-size:21px; font-weight:800; margin-top:2px; }
    main { max-width:1280px; margin:24px auto 56px; padding:0 20px; display:flex; flex-direction:column; gap:22px; }
    .card { background:#FFF; border:1px solid var(--border); border-radius:18px; box-shadow:0 4px 18px rgba(15,23,42,.04); overflow:hidden; }
    .card-head { display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:10px; padding:16px 22px; border-bottom:1px solid var(--border); background:#FAFBFD; }
    .card-head h2 { margin:0; font-size:16.5px; font-weight:700; color:var(--navy); }
    .card-body { padding:18px 22px; }
    .ai-card { position:relative; border-color:#C7D7FE; background:linear-gradient(135deg,#FFF 0%,#F5F8FF 60%,#F0FDFB 100%); }
    .ai-card::before { content:""; position:absolute; inset:0 auto 0 0; width:5px; background:linear-gradient(180deg,#2563EB,#0EA5E9,#0F766E); }
    .ai-badge { padding:4px 11px; border-radius:999px; font-size:12px; font-weight:600; background:${summary.generatedByAi ? '#E0E7FF' : '#E2E8F0'}; color:${summary.generatedByAi ? '#3730A3' : '#475569'}; }
    .ai-cols { display:grid; grid-template-columns:repeat(auto-fit,minmax(280px,1fr)); gap:14px; margin-top:14px; }
    .ai-box { border-radius:12px; padding:13px 16px; border:1px solid transparent; }
    .ai-box.hi { background:#F0FDFA; border-color:#CCFBF1; }
    .ai-box.att { background:#FFFBEB; border-color:#FDE68A; }
    .ai-box h3 { margin:0 0 6px; font-size:12.5px; text-transform:uppercase; letter-spacing:.04em; }
    .ai-box.hi h3 { color:#0F766E; } .ai-box.att h3 { color:#B45309; }
    .ai-box ul { margin:0; padding-left:18px; font-size:13.5px; color:#334155; }
    .tool-btn { height:32px; padding:0 11px; border-radius:8px; border:1px solid #CBD5E1; background:#FFF; color:#1E293B; font-size:12.5px; font-weight:600; cursor:pointer; }
    .tool-btn:hover { background:#EFF6FF; border-color:#2563EB; color:#1D4ED8; }
    .viewport { position:relative; height:540px; min-height:280px; max-height:85vh; overflow:hidden; background:#F8FAFC; background-image:radial-gradient(rgba(100,116,139,.25) 1px,transparent 1px); background-size:20px 20px; cursor:grab; user-select:none; }
    .stage { position:absolute; left:0; top:0; transform-origin:0 0; }
    .resize-handle { height:16px; background:#F1F5F9; border-top:1px solid var(--border); cursor:ns-resize; display:flex; align-items:center; justify-content:center; }
    .resize-bar { width:44px; height:4px; border-radius:999px; background:#94A3B8; }
    .search-input { width:100%; height:38px; padding:0 14px; border-radius:10px; border:1px solid #CBD5E1; font-size:13.5px; margin-bottom:16px; outline:none; }
    .tables-stack { display:flex; flex-direction:column; gap:16px; }
    .table-card { border:1px solid var(--border); border-radius:14px; overflow:hidden; background:#FFF; }
    .table-card.highlight-pulse { box-shadow:0 0 0 3px rgba(37,99,235,.35); border-color:#2563EB; }
    .table-card-header { display:flex; justify-content:space-between; align-items:center; gap:10px; padding:12px 16px; background:#0F1D3D; color:#FFF; }
    .table-card-header h3 { margin:0; font-size:14.5px; }
    .table-card-header p { margin:2px 0 0; font-size:12px; color:rgba(226,238,255,.8); }
    .count-pill { background:rgba(255,255,255,.16); padding:3px 10px; border-radius:999px; font-size:11.5px; font-weight:600; }
    .table-wrap { overflow-x:auto; }
    table { width:100%; border-collapse:collapse; font-size:13px; text-align:left; }
    th { background:#F8FAFC; color:#475569; font-size:11.5px; text-transform:uppercase; padding:9px 14px; border-bottom:1px solid var(--border); }
    td { padding:8px 14px; border-bottom:1px solid #EEF2F6; color:#1E293B; }
    tr.pk-row td { background:#FEF9E7; }
    .mono { font-family:ui-monospace,SFMono-Regular,Menlo,monospace; font-size:12px; }
    .badge-pk { display:inline-block; background:#FEF3C7; color:#92400E; font-size:10px; font-weight:700; padding:1px 6px; border-radius:4px; margin-right:4px; }
    .badge-fk { display:inline-block; background:#DBEAFE; color:#1D4ED8; font-size:10px; font-weight:700; padding:1px 6px; border-radius:4px; margin-right:4px; }
    .empty-box { text-align:center; padding:24px; color:var(--muted); background:#F8FAFC; border:1px dashed #CBD5E1; border-radius:12px; }
    .hidden { display:none !important; }
    .pdf-bar { position:sticky; top:0; z-index:30; display:flex; justify-content:space-between; align-items:center; padding:10px 24px; background:#091633; color:#FFF; }
    .pdf-map { padding:14px; background:#F8FAFC; }
    .pdf-map svg { width:100%; height:auto; max-height:660px; display:block; margin:0 auto; }
    @page { size: A4 landscape; margin: 10mm; }
    @media print {
      * { -webkit-print-color-adjust:exact !important; print-color-adjust:exact !important; }
      body { background:#FFF !important; }
      .no-print { display:none !important; }
      .hero { border-radius:12px; padding:18px 20px; margin-bottom:14px; }
      main { max-width:100%; margin:0; padding:0; gap:14px; }
      .card { box-shadow:none; border-radius:12px; }
      .ai-card, .table-card, .pdf-map { break-inside:avoid; page-break-inside:avoid; }
    }
  </style>
</head>
<body>
  ${
    isPdf
      ? `<div class="pdf-bar no-print">
          <span style="font-size:13px;">Relatório PDF do SubModel "${escapeXml(subModel.name)}" (A4 Paisagem)</span>
          <div style="display:flex;gap:8px;">
            <button class="tool-btn" style="background:#2563EB;color:#FFF;border:none;" onclick="window.print()">Salvar / Imprimir PDF</button>
            <button class="tool-btn" onclick="window.close()">Fechar</button>
          </div>
        </div>`
      : ''
  }
  <header class="hero">
    <div class="hero-inner">
      <div class="chip">✦ ER Studio • Relatório do SubModel</div>
      <h1>${escapeXml(project.name)} — ${escapeXml(subModel.name)}</h1>
      <p class="hero-sub">Banco: <strong>${escapeXml(formatDialectLabel(project.dialect))}</strong> • Proprietário: <strong>${escapeXml(project.owner)}</strong> • Exportado em ${escapeXml(formatDateTime(new Date().toISOString()))}</p>
      <div class="kpis">
        <div class="kpi"><div class="kpi-label">SubModel Ativo</div><div class="kpi-val" style="font-size:17px;">${escapeXml(subModel.name)}</div></div>
        <div class="kpi"><div class="kpi-label">Tabelas</div><div class="kpi-val">${tables.length}</div></div>
        <div class="kpi"><div class="kpi-label">Colunas</div><div class="kpi-val">${totalCols}</div></div>
        <div class="kpi"><div class="kpi-label">Relacionamentos</div><div class="kpi-val">${relations.length}</div></div>
      </div>
    </div>
  </header>

  <main>
    <section class="card ai-card">
      <div class="card-head">
        <h2>✦ Resumo Executivo do SubModel</h2>
        <span class="ai-badge">${summary.generatedByAi ? `Gerado por IA • ${escapeXml(summary.model || 'Gemini')}` : 'Resumo automático'}</span>
      </div>
      <div class="card-body">
        <p style="margin:0;font-size:15px;color:#1E293B;">${escapeXml(summary.overview)}</p>
        <div class="ai-cols">
          ${summary.highlights.length > 0 ? `<div class="ai-box hi"><h3>Destaques</h3><ul>${summary.highlights.map((h) => `<li>${escapeXml(h)}</li>`).join('')}</ul></div>` : ''}
          ${summary.attentionPoints.length > 0 ? `<div class="ai-box att"><h3>Pontos de atenção</h3><ul>${summary.attentionPoints.map((a) => `<li>${escapeXml(a)}</li>`).join('')}</ul></div>` : ''}
        </div>
      </div>
    </section>

    <section class="card">
      <div class="card-head">
        <h2>Diagrama DER — ${escapeXml(subModel.name)}</h2>
        ${
          !isPdf
            ? `<div style="display:flex;gap:6px;align-items:center;">
                <button class="tool-btn" id="z-out">−</button>
                <span id="z-val" style="min-width:46px;text-align:center;font-size:12.5px;font-weight:700;">100%</span>
                <button class="tool-btn" id="z-in">+</button>
                <button class="tool-btn" id="z-fit">Ajustar</button>
              </div>`
            : ''
        }
      </div>
      ${
        isPdf
          ? `<div class="pdf-map">${svg}</div>`
          : `<div id="vp" class="viewport"><div id="st" class="stage">${svg}</div></div><div id="rh" class="resize-handle"><span class="resize-bar"></span></div>`
      }
    </section>

    <section class="card">
      <div class="card-head"><h2>Dicionário de Tabelas (${tables.length})</h2></div>
      <div class="card-body">
        ${!isPdf ? `<input id="tbl-search" class="search-input" type="search" placeholder="Filtrar tabelas ou colunas..." />` : ''}
        <div class="tables-stack">${tableCardsHtml || '<div class="empty-box">Nenhuma tabela neste SubModel.</div>'}</div>
      </div>
    </section>

    <section class="card">
      <div class="card-head"><h2>Relacionamentos (${relations.length})</h2></div>
      <div class="card-body">${relationsRowsHtml}</div>
    </section>
  </main>

  ${
    isPdf
      ? `<script>window.onload=function(){setTimeout(function(){window.print();},250);};</script>`
      : `<script>
    (function(){
      const vp=document.getElementById('vp'),st=document.getElementById('st'),zv=document.getElementById('z-val'),rh=document.getElementById('rh');
      const sw=${svgWidth},sh=${svgHeight};
      let z=1,px=16,py=16;
      function draw(){st.style.transform='translate('+px+'px,'+py+'px) scale('+z+')';zv.textContent=Math.round(z*100)+'%';}
      function fit(){z=Math.max(.35,Math.min(1.3,Number(Math.min(1,(vp.clientWidth-28)/sw,(vp.clientHeight-28)/sh).toFixed(2))));px=Math.max(12,Math.round((vp.clientWidth-sw*z)/2));py=Math.max(12,Math.round((vp.clientHeight-sh*z)/2));draw();}
      document.getElementById('z-in').onclick=()=>{z=Math.min(2,Number((z+.15).toFixed(2)));draw();};
      document.getElementById('z-out').onclick=()=>{z=Math.max(.3,Number((z-.15).toFixed(2)));draw();};
      document.getElementById('z-fit').onclick=fit;
      let drag=false,sx=0,sy=0,ox=0,oy=0;
      vp.onmousedown=(e)=>{if(e.target.closest('.svg-table'))return;drag=true;sx=e.clientX;sy=e.clientY;ox=px;oy=py;};
      window.addEventListener('mousemove',(e)=>{if(!drag)return;px=ox+(e.clientX-sx);py=oy+(e.clientY-sy);draw();});
      window.addEventListener('mouseup',()=>{drag=false;});
      let rs=false,ry=0,rh0=0;
      rh.onmousedown=(e)=>{rs=true;ry=e.clientY;rh0=vp.clientHeight;};
      window.addEventListener('mousemove',(e)=>{if(!rs)return;vp.style.height=Math.round(Math.max(280,Math.min(window.innerHeight*.85,rh0+(e.clientY-ry))))+'px';});
      window.addEventListener('mouseup',()=>{rs=false;});
      document.querySelectorAll('.svg-table').forEach((el)=>el.addEventListener('click',()=>{
        const card=document.getElementById('tbl-card-'+el.getAttribute('data-table-id'));
        if(!card)return;card.scrollIntoView({behavior:'smooth',block:'center'});card.classList.add('highlight-pulse');setTimeout(()=>card.classList.remove('highlight-pulse'),1800);
      }));
      const ts=document.getElementById('tbl-search');
      if(ts){ts.addEventListener('input',()=>{const q=ts.value.trim().toLowerCase();document.querySelectorAll('.table-card').forEach((c)=>{c.classList.toggle('hidden',Boolean(q&&!(c.dataset.search||'').includes(q)));});});}
      fit();
    })();
  </script>`
  }
</body>
</html>`;
}
