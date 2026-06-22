/**
 * routes/admin/export.js — exportação de auditoria pra CSV ou XLSX.
 *
 * Endpoints:
 *   GET /commplan/admin/export/audit/:q?format=csv|xlsx
 *     → exporta TODAS as campanhas do quarter (1 arquivo CSV de resumo + 1 de detalhe,
 *       ou 1 XLSX com 2 abas)
 *
 *   GET /commplan/admin/export/campaign/:token?format=csv|xlsx
 *     → exporta UMA campanha (1 linha resumo + N linhas de etapas)
 *
 * Estrutura:
 *   Aba "Resumo" (1 linha por campanha):
 *     Cliente, Campanha, Token, CS, Status, Início, Fim,
 *     Valor bruto, Líquido, Bônus total (R$), % do líquido,
 *     Setup status, Otim. earned, Evid. preenchidas
 *
 *   Aba "Detalhe por etapa" (1 linha por (campanha + item applicable)):
 *     Cliente, Campanha, Token, CS, Categoria, Etapa,
 *     % do líquido, Earned, Valor ganho (R$), Motivo (se não earned), Link evidência
 *
 * Pra CSV o backend retorna ZIP com 2 arquivos (resumo.csv + detalhe.csv).
 * Pra XLSX retorna 1 arquivo com 2 worksheets.
 *
 * Dependência: exceljs (precisa ser adicionado no package.json).
 */

import { Router } from 'express';
import { authRequired, adminRequired } from '../../middleware/auth.js';
import { query, tableRef } from '../../lib/bigquery.js';
import { parseQuarter } from '../../engine/quarter-resolver.js';
import { computeBonus } from '../../engine/compplan-engine.js';
import { COMPPLAN_CATALOG } from '../../engine/compplan-catalog.js';
import { resolveStudiesInfo } from '../../lib/bonus-calc.js';
import { isOverException } from '../../data/over-exceptions.js';

export const router = Router();
router.use(authRequired, adminRequired);

// ─── Helpers ─────────────────────────────────────────────────────────────

/**
 * Busca TODAS as campanhas elegíveis pra audit (do quarter) ou 1 específica.
 * Retorna array de campanhas com:
 *   - dados crus do checklist (client_name, campaign_name, total_value, etc)
 *   - manual_checks parseado
 *   - admin_overrides parseado
 *   - metrics (display + video)
 *   - breakdown (do computeBonus, com by_category)
 *   - studiesInfo
 *
 * NOTA: a query e o cálculo replicam a lógica de audit.js. Se mudar lá, mude aqui.
 */
async function fetchAuditCampaigns({ quarter, tokenFilter, includeUnfinished = true }) {
  let startDate, endDate, filterEnd, todayStr;

  if (quarter) {
    const qInfo = parseQuarter(quarter);
    if (!qInfo) throw new Error(`Quarter inválido: ${quarter}`);
    startDate = qInfo.startDate;
    endDate = qInfo.endDate;
    todayStr = new Date().toISOString().slice(0, 10);
    // Pra export, deixa o admin escolher se inclui em andamento (default sim)
    filterEnd = endDate;
  }

  // 1. Busca campanhas
  let campaigns;
  if (tokenFilter) {
    // 1 campanha específica (independe de quarter)
    campaigns = await query(
      `SELECT
         c.short_token, c.client_name, c.campaign_name, c.cs_email, c.cs_name,
         c.cp_name, c.agency, c.start_date, c.end_date, c.is_legacy,
         c.total_value, c.features, c.products, c.formats, c.audiences,
         c.studies_used, c.pracas_type,
         c.o2o_display_impressions, c.bonus_o2o_display_impressions,
         c.ooh_display_impressions, c.bonus_ooh_display_impressions,
         IFNULL(o.manual_checks, la.manual_checks)     AS manual_checks,
         IFNULL(o.admin_overrides, la.admin_overrides) AS admin_overrides,
         IFNULL(o.pre_campaign_assignee_email, la.pre_campaign_assignee_email) AS pre_assignee,
         IFNULL(o.study_assignee_email, la.study_assignee_email)               AS study_assignee,
         IFNULL(o.study_id_override, la.study_id_override)                     AS study_id_override
       FROM ${tableRef('commplan_checklists')} c
       LEFT JOIN ${tableRef('commplan_command_overrides')}  o  ON c.short_token = o.short_token
       LEFT JOIN ${tableRef('commplan_legacy_assignments')} la ON c.short_token = la.short_token
       WHERE c.short_token = @t`,
      { t: tokenFilter }
    );
  } else {
    campaigns = await query(
      `SELECT
         c.short_token, c.client_name, c.campaign_name, c.cs_email, c.cs_name,
         c.cp_name, c.agency, c.start_date, c.end_date, c.is_legacy,
         c.total_value, c.features, c.products, c.formats, c.audiences,
         c.studies_used, c.pracas_type,
         c.o2o_display_impressions, c.bonus_o2o_display_impressions,
         c.ooh_display_impressions, c.bonus_ooh_display_impressions,
         IFNULL(o.manual_checks, la.manual_checks)     AS manual_checks,
         IFNULL(o.admin_overrides, la.admin_overrides) AS admin_overrides,
         IFNULL(o.pre_campaign_assignee_email, la.pre_campaign_assignee_email) AS pre_assignee,
         IFNULL(o.study_assignee_email, la.study_assignee_email)               AS study_assignee,
         IFNULL(o.study_id_override, la.study_id_override)                     AS study_id_override
       FROM ${tableRef('commplan_checklists')} c
       LEFT JOIN ${tableRef('commplan_command_overrides')}  o  ON c.short_token = o.short_token
       LEFT JOIN ${tableRef('commplan_legacy_assignments')} la ON c.short_token = la.short_token
       WHERE c.cs_email IS NOT NULL
         AND c.start_date >= @s AND c.start_date <= @e`,
      { s: startDate, e: filterEnd }
    );
  }

  if (campaigns.length === 0) return [];

  const tokens = campaigns.map(c => c.short_token);

  // 2. Métricas (display + video)
  const metricsByToken = {};
  try {
    const [perfRows, contractedRows] = await Promise.all([
      query(
        `SELECT short_token,
           SUM(IF(LOWER(media_type) = 'display', impressions, 0))           AS display_imps,
           SUM(IF(LOWER(media_type) = 'display', viewable_impressions, 0))  AS display_viewable,
           SUM(IF(LOWER(media_type) = 'display', clicks, 0))                AS display_clicks,
           SUM(IF(LOWER(media_type) = 'display', total_cost, 0))            AS display_cost,
           SUM(IF(LOWER(media_type) = 'video',   video_starts, 0))            AS video_starts,
           SUM(IF(LOWER(media_type) = 'video',   video_view_100_complete, 0)) AS video_completions,
           SUM(IF(LOWER(media_type) = 'video',   total_cost, 0))              AS video_cost
         FROM \`site-hypr.prod_assets.unified_daily_performance_metrics\`
         WHERE short_token IN UNNEST(@toks)
           AND LOWER(IFNULL(line_name, '')) NOT LIKE '%survey%'
           AND LOWER(IFNULL(line_name, '')) NOT LIKE '%controle%'
           AND LOWER(IFNULL(line_name, '')) NOT LIKE '%exposto%'
         GROUP BY short_token`,
        { toks: tokens }, 'US'
      ),
      query(
        `SELECT short_token,
           IFNULL(o2o_display_impressions, 0) + IFNULL(bonus_o2o_display_impressions, 0)
           + IFNULL(ooh_display_impressions, 0) + IFNULL(bonus_ooh_display_impressions, 0)
           AS display_contracted
         FROM ${tableRef('commplan_checklists')}
         WHERE short_token IN UNNEST(@toks)`,
        { toks: tokens }
      ),
    ]);

    const contractedMap = {};
    for (const r of contractedRows) contractedMap[r.short_token] = Number(r.display_contracted) || 0;

    const clientByToken = {};
    for (const c of campaigns) clientByToken[c.short_token] = c.client_name;

    for (const r of perfRows) {
      const displayContracted = contractedMap[r.short_token] || 0;
      const displayImps = Number(r.display_imps) || 0;
      const displayViewable = Number(r.display_viewable) || 0;
      const displayClicks = Number(r.display_clicks) || 0;
      const displayCost = Number(r.display_cost) || 0;
      const videoStarts = Number(r.video_starts) || 0;
      const videoCompletions = Number(r.video_completions) || 0;
      const videoCost = Number(r.video_cost) || 0;
      const usesTotalImps = await isOverException(clientByToken[r.short_token]);
      const overNumerator = usesTotalImps ? displayImps : displayViewable;
      const totalValue = Number(campaigns.find(c => c.short_token === r.short_token)?.total_value) || 0;

      metricsByToken[r.short_token] = {
        ecpm: displayImps > 0 ? (displayCost / displayImps) * 1000 : 0,
        ctr: displayViewable > 0 ? displayClicks / displayViewable : 0,
        over_percent: displayContracted > 0 ? ((overNumerator / displayContracted) - 1) * 100 : 0,
        over_uses_total_imps: usesTotalImps,
        display_impressions: displayImps,
        display_viewable: displayViewable,
        display_clicks: displayClicks,
        display_cost: displayCost,
        display_contracted: displayContracted,
        video_starts: videoStarts,
        video_completions: videoCompletions,
        video_cost: videoCost,
        video_vtr_pct: videoStarts > 0 ? (videoCompletions / videoStarts) * 100 : 0,
        video_tech_cost_pct: totalValue > 0 ? (videoCost / totalValue) * 100 : 0,
      };
    }
  } catch (e) {
    console.warn('export fetchAuditCampaigns metrics:', e.message);
  }

  // 3. Studies
  const studiesByToken = {};
  await Promise.all(campaigns.map(async (c) => {
    try {
      studiesByToken[c.short_token] = await resolveStudiesInfo(c, c.study_assignee, c.study_id_override);
    } catch (_) {
      studiesByToken[c.short_token] = [];
    }
  }));

  // 4. Enriquece com breakdown calculado
  const enriched = campaigns.map(c => {
    let mc = {};
    let ao = {};
    try { mc = c.manual_checks ? JSON.parse(c.manual_checks) : {}; } catch (_) {}
    try { ao = c.admin_overrides ? JSON.parse(c.admin_overrides) : {}; } catch (_) {}

    const metrics = metricsByToken[c.short_token] || null;
    const studiesInfo = studiesByToken[c.short_token] || [];

    const breakdown = computeBonus(c, mc, metrics, ao, {
      preAssignee: c.pre_assignee || null,
      csOwner: c.cs_email,
      studiesInfo,
    });

    return {
      ...c,
      manual_checks_parsed: mc,
      admin_overrides_parsed: ao,
      metrics,
      breakdown,
      studiesInfo,
    };
  });

  return enriched;
}

/**
 * Monta as 2 estruturas de dados pra export (resumo + detalhe).
 * Retorna { summaryRows, detailRows } onde cada row é um array de strings/números.
 *
 * NOTA: A engine retorna em `by_category.items[]` SÓ items que são aplicáveis pra
 * a campanha (já filtra OOH/Display/Video conforme formatos). Não existe campo
 * `item.applicable` — TODO item presente JÁ É aplicável. Não filtrar por isso.
 */
function buildExportRows(campaigns) {
  // ─── ABA RESUMO ──────────────────────────────────────────────────
  const summaryHeader = [
    'Cliente', 'Campanha', 'Token', 'CS',
    'Status', 'Início', 'Fim',
    'Valor bruto', 'Líquido', 'Bônus total (R$)', '% do líquido',
    'Setup', 'Over %',
    'Otim. earned', 'Otim. aplicáveis',
    'Evid. preenchidas', 'Evid. necessárias',
  ];

  const summaryRows = [];
  const todayStr = new Date().toISOString().slice(0, 10);

  // ─── ABA DETALHE ─────────────────────────────────────────────────
  // Estrutura: 1 linha por (campanha + item), agrupado por categoria, ordem do catálogo.
  // Mostra TODOS os items aplicáveis (não filtra por earned).
  const detailHeader = [
    'Token', 'Cliente', 'Campanha', 'CS',
    'Categoria', 'Etapa',
    '% da etapa', 'Valor possível (R$)',
    'Earned', 'Valor ganho (R$)',
    'Subtotal categoria (R$)',
    'Motivo (se não earned)', 'Link evidência',
  ];
  const detailRows = [];

  for (const c of campaigns) {
    const startDate = (typeof c.start_date === 'string' ? c.start_date : c.start_date?.value) || '';
    const endDate = (typeof c.end_date === 'string' ? c.end_date : c.end_date?.value) || '';

    // Status: Em andamento / Finalizada / Revisada
    let status;
    if (endDate && endDate < todayStr) {
      const reviewed = c.is_legacy
        ? !!c.manual_checks_parsed.__reviewed_by
        : false;
      status = reviewed ? 'Revisada' : 'Finalizada';
    } else {
      status = 'Em andamento';
    }

    const totalValue = Number(c.total_value) || 0;
    const liquido = c.breakdown.liquido || 0;
    const bonusTotal = c.breakdown.total_brl || 0;
    const pctLiquido = c.breakdown.total_pct || 0;

    // Setup status
    const setupVal = c.breakdown.setup_validation || {};
    const setupStatus = setupVal.invalidated ? 'Anulado'
      : setupVal.pending ? 'Pendente'
      : 'Válido';
    const overPct = c.metrics?.over_percent || 0;

    // Otimização — conta TODOS items presentes (já são aplicáveis)
    const optCat = c.breakdown.by_category?.optimization;
    let optEarned = 0, optTotal = 0;
    if (optCat?.items) {
      for (const it of optCat.items) {
        optTotal += 1;
        if (it.earned) optEarned += 1;
      }
    }

    // Evidências necessárias e preenchidas
    const evidenceMap = c.manual_checks_parsed.__evidence || {};
    let evFilled = 0, evTotal = 0;
    for (const [catKey, cat] of Object.entries(COMPPLAN_CATALOG)) {
      const catBreakdown = c.breakdown.by_category?.[catKey];
      if (!catBreakdown?.items) continue;
      if (cat.shared_evidence) {
        const anyEarned = catBreakdown.items.some(i => i.earned);
        if (anyEarned) {
          evTotal += 1;
          if (evidenceMap[cat.shared_evidence.key]) evFilled += 1;
        }
      }
      for (const it of catBreakdown.items) {
        if (!it.earned || !it.needs_evidence) continue;
        evTotal += 1;
        if (evidenceMap[it.id]) evFilled += 1;
      }
    }

    summaryRows.push([
      c.client_name || '',
      c.campaign_name || '',
      c.short_token || '',
      c.cs_name || c.cs_email || '',
      status,
      startDate,
      endDate,
      totalValue,
      liquido,
      bonusTotal,
      pctLiquido,                // escala 0-1
      setupStatus,
      overPct / 100,             // escala 0-1
      optEarned,
      optTotal,
      evFilled,
      evTotal,
    ]);

    // ─── DETALHE: 1 linha por item aplicável de cada categoria ─────────
    for (const [catKey, cat] of Object.entries(COMPPLAN_CATALOG)) {
      const catBreakdown = c.breakdown.by_category?.[catKey];
      if (!catBreakdown?.items || catBreakdown.items.length === 0) continue;

      const catLabel = cat.label || catKey;
      const subtotalBrl = catBreakdown.subtotal_brl || 0;

      for (const item of catBreakdown.items) {
        const itemPct = item.pct || 0;
        const earnedFlag = item.earned ? 'Sim' : 'Não';
        const valorPossivel = liquido * itemPct;
        const valorGanho = item.earned ? valorPossivel : 0;

        // Motivo (quando não earned): tenta extrair info útil
        let motivo = '';
        if (!item.earned) {
          if (item.invalidated) motivo = 'Setup anulado por OVER';
          else if (item.pre_assigned_to_other) motivo = 'Pré-Campanha atribuída a outro CS';
          else if (item.study_goes_to_other) motivo = 'Bônus de estudo vai pro autor';
          else if (item.admin_overridden) motivo = `Admin forçou: ${item.admin_override?.value === false ? 'Não' : 'Sim'}`;
          else motivo = 'Não marcado';
        }

        // Link de evidência
        const evidenceLink = evidenceMap[item.id]
          || (cat.shared_evidence && evidenceMap[cat.shared_evidence.key])
          || '';

        detailRows.push([
          c.short_token || '',
          c.client_name || '',
          c.campaign_name || '',
          c.cs_name || c.cs_email || '',
          catLabel,
          item.label || item.id,
          itemPct,                // escala 0-1 (formatado como %)
          valorPossivel,          // R$ que daria se earnar
          earnedFlag,
          valorGanho,             // R$ efetivo (0 se não earned)
          subtotalBrl,            // R$ acumulado dessa categoria pra essa campanha
          motivo,
          evidenceLink,
        ]);
      }
    }
  }

  return {
    summaryHeader, summaryRows,
    detailHeader, detailRows,
  };
}

// ─── CSV writer ──────────────────────────────────────────────────────────

/**
 * Escapa um valor pra CSV. Lida com vírgulas, aspas e newlines.
 */
function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Gera CSV (UTF-8 BOM no início pra Excel reconhecer acentos).
 * Datas e %s são serializadas como strings legíveis (não como decimal puro).
 */
function rowsToCsv(header, rows, pctIndices = [], dateIndices = []) {
  const lines = [header.map(csvEscape).join(',')];
  for (const row of rows) {
    const formatted = row.map((val, idx) => {
      if (pctIndices.includes(idx) && typeof val === 'number') {
        return `${(val * 100).toFixed(2)}%`;
      }
      return val;
    });
    lines.push(formatted.map(csvEscape).join(','));
  }
  return '\uFEFF' + lines.join('\n');  // BOM + LF
}

// ─── XLSX writer ─────────────────────────────────────────────────────────

/**
 * Gera buffer XLSX com 2 abas (Resumo + Detalhe).
 * Usa exceljs com formatos numéricos pra moeda e %.
 */
async function buildXlsxBuffer({ summaryHeader, summaryRows, detailHeader, detailRows }) {
  // Import dinâmico (exceljs é pesado, carrega só quando precisa)
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  wb.creator = 'HYPR Commplan';
  wb.created = new Date();

  // ─── Aba Resumo ────────────────────────────────────────────────
  const ws1 = wb.addWorksheet('Resumo');
  ws1.addRow(summaryHeader);
  ws1.getRow(1).font = { bold: true };
  ws1.getRow(1).fill = {
    type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F4F8' },
  };
  for (const r of summaryRows) ws1.addRow(r);

  // Formatos das colunas (1-indexed no exceljs)
  // Header: Cliente(1) Campanha(2) Token(3) CS(4) Status(5) Início(6) Fim(7)
  //         Valor bruto(8) Líquido(9) Bônus total(10) % do líquido(11)
  //         Setup(12) Over %(13) Otim. earned(14) Otim. apl(15) Evid pre(16) Evid nec(17)
  ws1.getColumn(8).numFmt = '"R$" #,##0.00';
  ws1.getColumn(9).numFmt = '"R$" #,##0.00';
  ws1.getColumn(10).numFmt = '"R$" #,##0.00';
  ws1.getColumn(11).numFmt = '0.00%';
  ws1.getColumn(13).numFmt = '0.00%';

  // Larguras (estimadas)
  ws1.columns.forEach((col, idx) => {
    col.width = [22, 30, 8, 26, 12, 11, 11, 14, 14, 14, 12, 10, 9, 12, 14, 14, 14][idx] || 12;
  });

  // ─── Aba Detalhe ───────────────────────────────────────────────
  const ws2 = wb.addWorksheet('Detalhe por etapa');
  ws2.addRow(detailHeader);
  ws2.getRow(1).font = { bold: true };
  ws2.getRow(1).fill = {
    type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE6F4F8' },
  };
  for (const r of detailRows) ws2.addRow(r);

  // Header: Token(1) Cliente(2) Campanha(3) CS(4) Categoria(5) Etapa(6)
  //         % da etapa(7) Valor possível(8) Earned(9) Valor ganho(10)
  //         Subtotal categoria(11) Motivo(12) Link(13)
  ws2.getColumn(7).numFmt = '0.00%';
  ws2.getColumn(8).numFmt = '"R$" #,##0.00';
  ws2.getColumn(10).numFmt = '"R$" #,##0.00';
  ws2.getColumn(11).numFmt = '"R$" #,##0.00';
  ws2.columns.forEach((col, idx) => {
    col.width = [8, 22, 30, 26, 18, 40, 10, 14, 8, 14, 16, 30, 40][idx] || 14;
  });

  return await wb.xlsx.writeBuffer();
}

// ─── ZIP writer (pra CSV — gera 2 arquivos zipados) ──────────────────────

/**
 * Gera buffer ZIP simples (sem compressão). 2 arquivos: resumo.csv + detalhe.csv.
 * Usa apenas API nativa do Node (Buffer) — sem dependências.
 * Formato ZIP "stored" (sem compressão) é simples o suficiente pra implementar inline.
 */
function buildZip(files) {
  // files = [{ name: 'resumo.csv', content: Buffer or string }, ...]
  const buffers = files.map(f => ({
    name: f.name,
    data: Buffer.isBuffer(f.content) ? f.content : Buffer.from(f.content, 'utf8'),
  }));

  const localHeaders = [];
  const centralDirEntries = [];
  let offset = 0;

  const crcTable = (() => {
    const table = [];
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) {
        c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      }
      table[n] = c >>> 0;
    }
    return table;
  })();

  function crc32(buf) {
    let crc = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ crcTable[(crc ^ buf[i]) & 0xFF];
    }
    return (crc ^ 0xFFFFFFFF) >>> 0;
  }

  for (const f of buffers) {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const crc = crc32(f.data);
    const size = f.data.length;

    // Local file header (30 bytes + name)
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);   // signature
    local.writeUInt16LE(20, 4);            // version needed
    local.writeUInt16LE(0, 6);             // flags
    local.writeUInt16LE(0, 8);             // method (0 = stored)
    local.writeUInt16LE(0, 10);            // mod time
    local.writeUInt16LE(0, 12);            // mod date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(size, 18);         // compressed size
    local.writeUInt32LE(size, 22);         // uncompressed size
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);            // extra field len

    localHeaders.push(Buffer.concat([local, nameBuf, f.data]));

    // Central directory entry (46 bytes + name)
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);          // version made by
    central.writeUInt16LE(20, 6);          // version needed
    central.writeUInt16LE(0, 8);           // flags
    central.writeUInt16LE(0, 10);          // method
    central.writeUInt16LE(0, 12);          // mod time
    central.writeUInt16LE(0, 14);          // mod date
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(size, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt16LE(0, 30);          // extra len
    central.writeUInt16LE(0, 32);          // comment len
    central.writeUInt16LE(0, 34);          // disk no
    central.writeUInt16LE(0, 36);          // internal attrs
    central.writeUInt32LE(0, 38);          // external attrs
    central.writeUInt32LE(offset, 42);     // local header offset

    centralDirEntries.push(Buffer.concat([central, nameBuf]));
    offset += localHeaders[localHeaders.length - 1].length;
  }

  const centralDir = Buffer.concat(centralDirEntries);
  const centralStart = offset;

  const endRecord = Buffer.alloc(22);
  endRecord.writeUInt32LE(0x06054b50, 0);
  endRecord.writeUInt16LE(0, 4);           // disk
  endRecord.writeUInt16LE(0, 6);           // disk w/ central dir
  endRecord.writeUInt16LE(buffers.length, 8);
  endRecord.writeUInt16LE(buffers.length, 10);
  endRecord.writeUInt32LE(centralDir.length, 12);
  endRecord.writeUInt32LE(centralStart, 16);
  endRecord.writeUInt16LE(0, 20);          // comment len

  return Buffer.concat([...localHeaders, centralDir, endRecord]);
}

// ─── Routes ──────────────────────────────────────────────────────────────

/**
 * GET /admin/export/audit/:q?format=csv|xlsx
 */
router.get('/audit/:q', async (req, res) => {
  try {
    const quarter = req.params.q;
    const format = (req.query.format || 'xlsx').toLowerCase();
    if (!['csv', 'xlsx'].includes(format)) {
      return res.status(400).json({ error: 'format inválido (csv ou xlsx)' });
    }

    const campaigns = await fetchAuditCampaigns({ quarter });
    const rows = buildExportRows(campaigns);

    const baseName = `audit_${quarter}_${new Date().toISOString().slice(0, 10)}`;

    if (format === 'xlsx') {
      const buf = await buildXlsxBuffer(rows);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}.xlsx"`);
      return res.send(buf);
    }

    // CSV: gera 2 arquivos e zipa
    // Indices de colunas % na aba Resumo: 10 (% do líquido), 12 (Over %)
    // Indices de colunas % na aba Detalhe: 6 (% do líquido)
    const csvSummary = rowsToCsv(rows.summaryHeader, rows.summaryRows, [10, 12]);
    const csvDetail = rowsToCsv(rows.detailHeader, rows.detailRows, [6]);

    const zipBuf = buildZip([
      { name: 'resumo.csv', content: csvSummary },
      { name: 'detalhe.csv', content: csvDetail },
    ]);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}.zip"`);
    return res.send(zipBuf);
  } catch (err) {
    console.error('GET /admin/export/audit/:q error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /admin/export/campaign/:token?format=csv|xlsx
 */
router.get('/campaign/:token', async (req, res) => {
  try {
    const token = req.params.token;
    const format = (req.query.format || 'xlsx').toLowerCase();
    if (!['csv', 'xlsx'].includes(format)) {
      return res.status(400).json({ error: 'format inválido (csv ou xlsx)' });
    }

    const campaigns = await fetchAuditCampaigns({ tokenFilter: token });
    if (campaigns.length === 0) {
      return res.status(404).json({ error: 'campanha não encontrada' });
    }

    const rows = buildExportRows(campaigns);
    const baseName = `audit_campanha_${token}_${new Date().toISOString().slice(0, 10)}`;

    if (format === 'xlsx') {
      const buf = await buildXlsxBuffer(rows);
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename="${baseName}.xlsx"`);
      return res.send(buf);
    }

    const csvSummary = rowsToCsv(rows.summaryHeader, rows.summaryRows, [10, 12]);
    const csvDetail = rowsToCsv(rows.detailHeader, rows.detailRows, [6]);

    const zipBuf = buildZip([
      { name: 'resumo.csv', content: csvSummary },
      { name: 'detalhe.csv', content: csvDetail },
    ]);

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${baseName}.zip"`);
    return res.send(zipBuf);
  } catch (err) {
    console.error('GET /admin/export/campaign/:token error:', err);
    res.status(500).json({ error: err.message });
  }
});
