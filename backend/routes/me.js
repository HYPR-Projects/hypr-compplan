/**
 * routes/me.js — endpoints do portal CS com cálculo de bônus.
 *
 * Endpoints:
 *   GET  /commplan/me/dashboard/:q          → KPIs (incluindo bônus total) + campanhas
 *   GET  /commplan/me/campaign/:token       → detalhe + breakdown de bônus
 *   PUT  /commplan/me/campaign/:token       → salva manual checks e recalcula
 *   GET  /commplan/me/history               → quarters anteriores
 *   GET  /commplan/me/features-catalog      → features tier1/2/3
 *   GET  /commplan/me/studies-catalog       → estudos do catalog
 */

import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { query, tableRef } from '../lib/bigquery.js';
import { getSalaryForCs } from '../data/cs-config.js';
import { isOverException } from '../data/over-exceptions.js';
import { sendEmail } from '../lib/email.js';
import { parseQuarter } from '../engine/quarter-resolver.js';
import { computeBonus } from '../engine/compplan-engine.js';
import { FEATURE_TIERS } from '../engine/compplan-catalog.js';

export const router = Router();
router.use(authRequired);

const TAX_RATE = 0.1653;
const NET_FACTOR = 1 - TAX_RATE;

// ── GET /me/features-catalog ───────────────────────────────────────────
router.get('/features-catalog', (req, res) => {
  res.json({
    catalog: {
      tier1: [...FEATURE_TIERS.tier1],
      tier2: [...FEATURE_TIERS.tier2],
      tier3: [...FEATURE_TIERS.tier3],
    },
  });
});

// ── GET /me/studies-catalog ────────────────────────────────────────────
router.get('/studies-catalog', async (req, res) => {
  try {
    const items = await query(
      `SELECT id, display_name, status
       FROM ${tableRef('commplan_studies_catalog')}
       WHERE active = TRUE
       ORDER BY display_name`
    );
    res.json({ items });
  } catch (err) {
    console.error('GET /me/studies-catalog error:', err);
    res.json({ items: [] });
  }
});

// ─────────────────────────────────────────────────────────────────────
// Helper: busca métricas de performance pra calcular Otimizações.
// Agrega TODAS as linhas da campanha em campaign_results, filtra display
// pro cálculo de over.
// ─────────────────────────────────────────────────────────────────────
async function fetchPerformanceMetrics(shortToken, clientName = null) {
  try {
    // 1. Busca métricas brutas da campanha em prod_assets.unified_daily_performance_metrics (US).
    //
    // total_cost = custo REAL de plataforma (vs effective_total_cost de campaign_results,
    // que é o cobrado do cliente). Usar total_cost dá o eCPM real.
    //
    // Excluímos lines com 'survey', 'controle' ou 'exposto' no nome — não fazem parte
    // do cálculo de mídia/performance.
    const [perfRow] = await query(
      `SELECT
         short_token,
         -- Display (relevante pras regras de Otimização)
         SUM(IF(LOWER(media_type) = 'display', impressions, 0))           AS display_impressions,
         SUM(IF(LOWER(media_type) = 'display', viewable_impressions, 0))  AS display_viewable,
         SUM(IF(LOWER(media_type) = 'display', clicks, 0))                AS display_clicks,
         SUM(IF(LOWER(media_type) = 'display', total_cost, 0))            AS display_cost,
         -- Totais (display + video) pra contexto
         SUM(impressions)            AS total_impressions,
         SUM(viewable_impressions)   AS total_viewable,
         SUM(clicks)                 AS total_clicks,
         SUM(total_cost)             AS total_cost
       FROM \`site-hypr.prod_assets.unified_daily_performance_metrics\`
       WHERE short_token = @t
         AND LOWER(IFNULL(line_name, '')) NOT LIKE '%survey%'
         AND LOWER(IFNULL(line_name, '')) NOT LIKE '%controle%'
         AND LOWER(IFNULL(line_name, '')) NOT LIKE '%exposto%'
       GROUP BY short_token`,
      { t: shortToken },
      'US'
    );

    if (!perfRow) return null;

    // 2. Busca contratado de display da view commplan_checklists (us-central1).
    // A view já une Command (checklists) e Legacy (checklist_info_snapshot) e expõe
    // as 4 colunas separadas: contracted + bonus de O2O e OOH.
    const [contractedRow] = await query(
      `SELECT
         IFNULL(o2o_display_impressions, 0)
       + IFNULL(bonus_o2o_display_impressions, 0)
       + IFNULL(ooh_display_impressions, 0)
       + IFNULL(bonus_ooh_display_impressions, 0) AS display_contracted
       FROM ${tableRef('commplan_checklists')}
       WHERE short_token = @t
       LIMIT 1`,
      { t: shortToken }
    );

    const displayContracted  = Number(contractedRow?.display_contracted) || 0;
    const displayImpressions = Number(perfRow.display_impressions) || 0;
    const displayViewable    = Number(perfRow.display_viewable) || 0;
    const displayClicks      = Number(perfRow.display_clicks) || 0;
    const displayCost        = Number(perfRow.display_cost) || 0;

    // Exceções de OVER (Pepsico, Amazon, ...) usam impressões TOTAIS no numerador.
    // Só o OVER muda. eCPM, CTR e todos os limites continuam idênticos pra esses clientes.
    const usesTotalImps = await isOverException(clientName);
    const overNumerator = usesTotalImps ? displayImpressions : displayViewable;

    return {
      // Métricas que entram nas regras (todas baseadas em DISPLAY)
      ecpm: displayImpressions > 0 ? (displayCost / displayImpressions) * 1000 : 0,
      ctr: displayViewable > 0 ? displayClicks / displayViewable : 0,
      over_percent: displayContracted > 0 ? ((overNumerator / displayContracted) - 1) * 100 : 0,
      over_uses_total_imps: usesTotalImps,

      // Detalhes pra UI
      display_impressions: displayImpressions,
      display_viewable: displayViewable,
      display_clicks: displayClicks,
      display_cost: displayCost,
      display_contracted: displayContracted,

      // Totais (display + video) — só pra contexto
      total_impressions: Number(perfRow.total_impressions) || 0,
      total_viewable: Number(perfRow.total_viewable) || 0,
      total_clicks: Number(perfRow.total_clicks) || 0,
      total_cost: Number(perfRow.total_cost) || 0,

      creative_fee_estimate: null,
    };
  } catch (err) {
    console.warn(`fetchPerformanceMetrics(${shortToken}): ${err.message}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Helper: resolve qual CS estamos vendo.
// - Se o user é admin E passou ?as=email, retorna esse email (impersonação).
// - Senão, retorna o email do user logado.
// Permite admin ver/editar campanhas de qualquer CS.
// ─────────────────────────────────────────────────────────────────────
function resolveTargetCs(req) {
  const myEmail = (req.user?.email || '').toLowerCase();
  const isAdmin = req.user?.role === 'admin';
  const asParam = (req.query?.as || '').toLowerCase().trim();

  if (isAdmin && asParam) {
    return { csEmail: asParam, impersonating: true, byEmail: myEmail };
  }
  return { csEmail: myEmail, impersonating: false, byEmail: myEmail };
}

// ─────────────────────────────────────────────────────────────────────
// Helper: pega manual_checks salvos (de overrides ou legacy_assignments)
// ─────────────────────────────────────────────────────────────────────
async function fetchManualChecks(shortToken, isLegacy) {
  try {
    const table = isLegacy ? 'commplan_legacy_assignments' : 'commplan_command_overrides';
    const [row] = await query(
      `SELECT manual_checks, admin_overrides, admin_overrides_by, admin_overrides_at
       FROM ${tableRef(table)}
       WHERE short_token = @t LIMIT 1`,
      { t: shortToken }
    );
    const manualChecks = row?.manual_checks ? JSON.parse(row.manual_checks) : {};
    const adminOverrides = row?.admin_overrides ? JSON.parse(row.admin_overrides) : {};
    return {
      manualChecks,
      adminOverrides,
      adminOverridesBy: row?.admin_overrides_by || null,
      adminOverridesAt: row?.admin_overrides_at?.value || row?.admin_overrides_at || null,
    };
  } catch (err) {
    console.warn(`fetchManualChecks(${shortToken}): ${err.message}`);
    return { manualChecks: {}, adminOverrides: {}, adminOverridesBy: null, adminOverridesAt: null };
  }
}

// ── GET /me/dashboard/:q ───────────────────────────────────────────────
router.get('/dashboard/:q', async (req, res) => {
  try {
    const { csEmail, impersonating, byEmail } = resolveTargetCs(req);
    if (!csEmail) return res.status(401).json({ error: 'sem email no token' });

    const quarter = req.params.q;
    const { startDate, endDate } = parseQuarter(quarter);

    // Pega campanhas + flag de reviewed do overrides/assignments
    const campaigns = await query(
      `SELECT
         c.short_token, c.client_name, c.campaign_name, c.cp_name, c.agency,
         c.start_date, c.end_date, c.is_legacy, c.features, c.products,
         c.formats, c.audiences, c.studies_used, c.pracas_type,
         IFNULL(c.total_value, 0) AS total_value,
         CASE
           WHEN c.is_legacy = TRUE THEN
             CASE WHEN la.updated_at IS NOT NULL AND la.updated_at > la.attributed_at THEN TRUE ELSE FALSE END
           ELSE IFNULL(o.reviewed, FALSE)
         END AS reviewed
       FROM ${tableRef('commplan_checklists')} c
       LEFT JOIN ${tableRef('commplan_command_overrides')} o ON c.short_token = o.short_token
       LEFT JOIN ${tableRef('commplan_legacy_assignments')} la ON c.short_token = la.short_token
       WHERE LOWER(c.cs_email) = @cs
         AND c.start_date >= @s AND c.start_date <= @e
       ORDER BY reviewed ASC, c.start_date DESC`,
      { cs: csEmail, s: startDate, e: endDate }
    );

    // Pra cada campanha, busca manual_checks + admin_overrides + métricas em batch
    const tokens = campaigns.map(c => c.short_token);
    let manualChecksByToken = {};
    let adminOverridesByToken = {};
    let metricsByToken = {};

    if (tokens.length > 0) {
      // Batch 1: manual_checks + admin_overrides de overrides + assignments
      try {
        const [overrideRows, legacyRows] = await Promise.all([
          query(
            `SELECT short_token, manual_checks, admin_overrides
             FROM ${tableRef('commplan_command_overrides')}
             WHERE short_token IN UNNEST(@toks)`,
            { toks: tokens }
          ),
          query(
            `SELECT short_token, manual_checks, admin_overrides
             FROM ${tableRef('commplan_legacy_assignments')}
             WHERE short_token IN UNNEST(@toks)`,
            { toks: tokens }
          ),
        ]);
        for (const r of [...overrideRows, ...legacyRows]) {
          if (r.manual_checks) {
            try { manualChecksByToken[r.short_token] = JSON.parse(r.manual_checks); }
            catch (_) { /* ignore */ }
          }
          if (r.admin_overrides) {
            try { adminOverridesByToken[r.short_token] = JSON.parse(r.admin_overrides); }
            catch (_) { /* ignore */ }
          }
        }
      } catch (e) {
        console.warn('batch manual_checks:', e.message);
      }

      // Batch 2: métricas (precisa do contratado também, faz JOIN)
      try {
        const perfRows = await query(
          `WITH agg AS (
             SELECT
               short_token,
               SUM(IF(LOWER(media_type) = 'display', impressions, 0))           AS display_imps,
               SUM(IF(LOWER(media_type) = 'display', viewable_impressions, 0))  AS display_viewable,
               SUM(IF(LOWER(media_type) = 'display', clicks, 0))                AS display_clicks,
               SUM(IF(LOWER(media_type) = 'display', total_cost, 0))            AS display_cost
             FROM \`site-hypr.prod_assets.unified_daily_performance_metrics\`
             WHERE short_token IN UNNEST(@toks)
               AND LOWER(IFNULL(line_name, '')) NOT LIKE '%survey%'
               AND LOWER(IFNULL(line_name, '')) NOT LIKE '%controle%'
               AND LOWER(IFNULL(line_name, '')) NOT LIKE '%exposto%'
             GROUP BY short_token
           )
           SELECT * FROM agg`,
          { toks: tokens },
          'US'
        );

        const contractedRows = await query(
          `SELECT short_token,
             IFNULL(o2o_display_impressions, 0)
           + IFNULL(bonus_o2o_display_impressions, 0)
           + IFNULL(ooh_display_impressions, 0)
           + IFNULL(bonus_ooh_display_impressions, 0) AS display_contracted
           FROM ${tableRef('commplan_checklists')}
           WHERE short_token IN UNNEST(@toks)`,
          { toks: tokens }
        );

        const contractedMap = {};
        for (const r of contractedRows) contractedMap[r.short_token] = Number(r.display_contracted) || 0;

        // Mapa de client_name por token pra checar ABS
        const clientByToken = {};
        for (const c of campaigns) clientByToken[c.short_token] = c.client_name;

        for (const r of perfRows) {
          const displayContracted = contractedMap[r.short_token] || 0;
          const displayImps = Number(r.display_imps) || 0;
          const displayViewable = Number(r.display_viewable) || 0;
          const displayClicks = Number(r.display_clicks) || 0;
          const displayCost = Number(r.display_cost) || 0;

          // Exceções de OVER: usa impressões totais no numerador (só OVER muda)
          const usesTotalImps = await isOverException(clientByToken[r.short_token]);
          const overNumerator = usesTotalImps ? displayImps : displayViewable;

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
            creative_fee_estimate: null,
          };
        }
      } catch (e) {
        console.warn('batch metrics:', e.message);
      }
    }

    // Agora calcula bônus de cada campanha com TODOS os dados
    let totalBonusBrl = 0;
    const items = campaigns.map(c => {
      const mc = manualChecksByToken[c.short_token] || {};
      const ao = adminOverridesByToken[c.short_token] || {};
      const metrics = metricsByToken[c.short_token] || null;
      const breakdown = computeBonus(c, mc, metrics, ao);
      totalBonusBrl += breakdown.total_brl;
      return {
        short_token: c.short_token,
        client_name: c.client_name,
        campaign_name: c.campaign_name,
        cp_name: c.cp_name,
        agency: c.agency,
        start_date: c.start_date?.value || c.start_date,
        end_date: c.end_date?.value || c.end_date,
        is_legacy: !!c.is_legacy,
        reviewed: !!c.reviewed,
        review_requested: !!mc.__review_requested,
        bruto: Number(c.total_value) || 0,
        liquido: (Number(c.total_value) || 0) * NET_FACTOR,
        bonus_brl: breakdown.total_brl,
        bonus_pct: breakdown.total_pct,
      };
    });

    const nReviewed = items.filter(i => i.reviewed).length;
    const bruto = items.reduce((s, i) => s + i.bruto, 0);

    // Busca salário vigente do CS
    let monthlySalary = 0;
    try {
      const salaryRow = await getSalaryForCs({ csEmail });
      monthlySalary = Number(salaryRow?.fixed_salary_brl) || 0;
    } catch (e) {
      console.warn(`getSalaryForCs(${csEmail}): ${e.message}`);
    }

    // Piso do quarter = 2 × salário mensal
    // (PDF: piso é 2 meses de fixo, não 3, pois 1 mês conta como antecipação)
    const floorQuarter = monthlySalary * 2;
    const bonusLiquido = Math.max(0, totalBonusBrl - floorQuarter);
    const hitFloor = totalBonusBrl >= floorQuarter;
    const bonusMensal = bonusLiquido / 3;

    // Se admin está impersonando, busca o nome do CS pra exibir no banner
    let csName = null;
    if (impersonating) {
      try {
        const [tm] = await query(
          `SELECT name FROM ${tableRef('compplan_team')} WHERE LOWER(email) = @e LIMIT 1`,
          { e: csEmail }
        );
        csName = tm?.name || null;
      } catch (_) { /* silent */ }
    }

    res.json({
      quarter,
      cs_email: csEmail,
      cs_name: csName,
      impersonating,
      viewer_email: byEmail,
      kpis: {
        n_camp: items.length,
        n_reviewed: nReviewed,
        n_pending: items.length - nReviewed,
        bruto_total: bruto,
        liquido_total: bruto * NET_FACTOR,
        bonus_total: totalBonusBrl,
        // Novos campos: piso + cálculo final
        monthly_salary: monthlySalary,
        floor_quarter: floorQuarter,
        bonus_liquido: bonusLiquido,
        bonus_mensal: bonusMensal,
        hit_floor: hitFloor,
        tax_rate: TAX_RATE,
      },
      items,
    });
  } catch (err) {
    console.error('GET /me/dashboard error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /me/campaign/:token ────────────────────────────────────────────
router.get('/campaign/:token', async (req, res) => {
  try {
    const { csEmail, impersonating } = resolveTargetCs(req);
    const isAdmin = req.user?.role === 'admin';
    const { token } = req.params;

    const [campaign] = await query(
      `SELECT
         c.*,
         o.reviewed AS o_reviewed, o.reviewed_at AS o_reviewed_at,
         o.notes AS o_notes,
         o.updated_by AS o_updated_by, o.updated_at AS o_updated_at,
         la.updated_at AS la_updated_at, la.attributed_at AS la_attributed_at,
         la.notes AS la_notes,
         la.updated_by AS la_updated_by
       FROM ${tableRef('commplan_checklists')} c
       LEFT JOIN ${tableRef('commplan_command_overrides')} o ON c.short_token = o.short_token
       LEFT JOIN ${tableRef('commplan_legacy_assignments')} la ON c.short_token = la.short_token
       WHERE c.short_token = @t LIMIT 1`,
      { t: token }
    );

    if (!campaign) {
      return res.status(404).json({ error: `Campanha ${token} não encontrada` });
    }

    if (!isAdmin && (campaign.cs_email || '').toLowerCase() !== csEmail) {
      return res.status(403).json({ error: 'Sem permissão pra ver essa campanha' });
    }

    const isLegacy = !!campaign.is_legacy;

    // Pega manual_checks e métricas em paralelo
    const [mcData, metrics] = await Promise.all([
      fetchManualChecks(campaign.short_token, isLegacy),
      fetchPerformanceMetrics(campaign.short_token, campaign.client_name),
    ]);
    const { manualChecks, adminOverrides, adminOverridesBy, adminOverridesAt } = mcData;

    // Calcula breakdown completo (com admin overrides aplicados)
    const breakdown = computeBonus(campaign, manualChecks, metrics, adminOverrides);

    // Status reviewed
    let reviewed = false;
    let reviewedAt = null;
    if (isLegacy) {
      reviewed = !!(campaign.la_updated_at && campaign.la_attributed_at && campaign.la_updated_at > campaign.la_attributed_at);
      reviewedAt = campaign.la_updated_at?.value || campaign.la_updated_at;
    } else {
      reviewed = !!campaign.o_reviewed;
      reviewedAt = campaign.o_reviewed_at?.value || campaign.o_reviewed_at;
    }

    res.json({
      short_token: campaign.short_token,
      is_legacy: isLegacy,
      reviewed,
      reviewed_at: reviewedAt,
      last_edit_by: isLegacy ? campaign.la_updated_by : campaign.o_updated_by,
      last_edit_at: isLegacy ? (campaign.la_updated_at?.value || campaign.la_updated_at) : (campaign.o_updated_at?.value || campaign.o_updated_at),

      // Read-only
      client_name: campaign.client_name,
      campaign_name: campaign.campaign_name,
      cp_name: campaign.cp_name,
      agency: campaign.agency,
      industry: campaign.industry,
      // is_abs efetivo: prioriza override do CS, depois fallback pro checklist
      is_abs: Object.prototype.hasOwnProperty.call(manualChecks, '__is_abs')
        ? !!manualChecks.__is_abs
        : !!campaign.is_abs,
      is_abs_overridden: Object.prototype.hasOwnProperty.call(manualChecks, '__is_abs'),
      is_abs_default: !!campaign.is_abs,
      cs_email: campaign.cs_email,
      cs_name: campaign.cs_name,
      start_date: campaign.start_date?.value || campaign.start_date,
      end_date: campaign.end_date?.value || campaign.end_date,
      bruto: breakdown.bruto,
      liquido: breakdown.liquido,
      tax_rate: TAX_RATE,
      formats: campaign.formats || [],
      products: campaign.products || [],
      features: campaign.features || [],
      audiences: campaign.audiences,
      studies_used: campaign.studies_used || [],
      pracas_type: campaign.pracas_type,
      notes: isLegacy ? campaign.la_notes : campaign.o_notes,

      // Manual checks atuais
      manual_checks: manualChecks,

      // Admin overrides + CS review request
      admin_overrides: adminOverrides,
      admin_overrides_by: adminOverridesBy,
      admin_overrides_at: adminOverridesAt,
      review_requested: !!manualChecks.__review_requested,
      review_request_notes: manualChecks.__review_notes || '',

      // Métricas pra Otimizações (se houver)
      metrics: metrics ? {
        ecpm: Number(metrics.ecpm) || 0,
        ctr: Number(metrics.ctr) || 0,
        over_percent: Number(metrics.over_percent) || 0,
      } : null,

      // Breakdown completo
      breakdown,
    });
  } catch (err) {
    console.error('GET /me/campaign error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /me/campaign/:token ────────────────────────────────────────────
// Body: { manual_checks: { itemId: bool }, notes?, reviewed? }
router.put('/campaign/:token', async (req, res) => {
  try {
    const { csEmail, byEmail } = resolveTargetCs(req);
    const isAdmin = req.user?.role === 'admin';
    const { token } = req.params;
    const body = req.body || {};

    const [campaign] = await query(
      `SELECT short_token, cs_email, is_legacy
       FROM ${tableRef('commplan_checklists')}
       WHERE short_token = @t LIMIT 1`,
      { t: token }
    );

    if (!campaign) return res.status(404).json({ error: `Campanha ${token} não encontrada` });
    if (!isAdmin && (campaign.cs_email || '').toLowerCase() !== csEmail) {
      return res.status(403).json({ error: 'Sem permissão pra editar' });
    }

    const manualChecks = body.manual_checks && typeof body.manual_checks === 'object'
      ? body.manual_checks
      : {};
    const manualChecksJson = JSON.stringify(manualChecks);
    const notes = body.notes || '';
    const reviewed = body.reviewed !== false;

    // Antes de salvar, busca estado anterior pra detectar mudança no review_requested
    let wasReviewRequested = false;
    try {
      const prev = await fetchManualChecks(campaign.short_token, !!campaign.is_legacy);
      wasReviewRequested = !!prev.manualChecks?.__review_requested;
    } catch (_) { /* silent */ }

    const isNowReviewRequested = !!manualChecks.__review_requested;
    const reviewRequestedChanged = !wasReviewRequested && isNowReviewRequested;

    if (campaign.is_legacy) {
      // Legacy: salva em commplan_legacy_assignments (campo manual_checks JSON)
      await query(
        `UPDATE ${tableRef('commplan_legacy_assignments')}
         SET manual_checks = @mc,
             notes = @notes,
             updated_by = @byEmail,
             updated_at = CURRENT_TIMESTAMP()
         WHERE short_token = @token`,
        { mc: manualChecksJson, notes, byEmail, token }
      );
    } else {
      // Command novo: MERGE em commplan_command_overrides
      await query(
        `MERGE ${tableRef('commplan_command_overrides')} T
         USING (SELECT @token AS short_token) S
         ON T.short_token = S.short_token
         WHEN MATCHED THEN UPDATE SET
           manual_checks = @mc,
           notes = @notes,
           reviewed = @reviewed,
           reviewed_at = CURRENT_TIMESTAMP(),
           updated_at = CURRENT_TIMESTAMP(),
           updated_by = @byEmail
         WHEN NOT MATCHED THEN INSERT
           (short_token, cs_email, manual_checks, notes, reviewed, reviewed_at,
            created_at, updated_at, updated_by)
         VALUES
           (@token, @csEmail, @mc, @notes, @reviewed, CURRENT_TIMESTAMP(),
            CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP(), @byEmail)`,
        { token, csEmail, byEmail, mc: manualChecksJson, notes, reviewed }
      );
    }

    // Se CS solicitou análise (transição de false→true), notifica admins por email
    if (reviewRequestedChanged) {
      try {
        const adminEmails = await query(
          `SELECT email FROM ${tableRef('compplan_team')}
           WHERE role = 'admin' AND active = TRUE`
        );
        const reviewNotes = manualChecks.__review_notes || '(sem detalhes)';
        const subject = `[Commplan] CS pediu análise: ${campaign.client_name || token}`;
        const html = `
          <h2>Pedido de análise — ${campaign.client_name || token}</h2>
          <p><strong>Campanha:</strong> ${campaign.campaign_name || ''} (${token})</p>
          <p><strong>CS:</strong> ${byEmail}</p>
          <p><strong>Observação:</strong></p>
          <blockquote style="border-left: 3px solid #0891b2; padding-left: 12px; color: #555;">
            ${reviewNotes.replace(/</g, '&lt;').replace(/\n/g, '<br>')}
          </blockquote>
          <p><a href="https://hypr-compplan.vercel.app/admin/cs/${encodeURIComponent(byEmail)}/campanha/${token}">
            Abrir campanha →
          </a></p>
        `;
        for (const a of adminEmails) {
          await sendEmail({
            to: a.email,
            subject,
            html,
            text: `${byEmail} pediu análise da campanha ${token}: ${reviewNotes}`,
          });
        }
      } catch (e) {
        console.warn('Falha ao notificar admins por email:', e.message);
      }
    }

    // Re-calcula e retorna breakdown atualizado
    const [updated] = await query(
      `SELECT c.*
       FROM ${tableRef('commplan_checklists')} c
       WHERE c.short_token = @t LIMIT 1`,
      { t: token }
    );
    const metrics = await fetchPerformanceMetrics(token, updated?.client_name);
    // Re-busca admin_overrides (não muda pelo PUT do CS, mas garante consistência)
    const post = await fetchManualChecks(token, !!campaign.is_legacy);
    const breakdown = computeBonus(updated, manualChecks, metrics, post.adminOverrides || {});

    res.json({ ok: true, reviewed, breakdown });
  } catch (err) {
    console.error('PUT /me/campaign error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /me/history ────────────────────────────────────────────────────
router.get('/history', async (req, res) => {
  try {
    const csEmail = (req.user?.email || '').toLowerCase();
    if (!csEmail) return res.status(401).json({ error: 'sem email' });

    const items = await query(
      `SELECT
         CONCAT('Q', CAST(EXTRACT(QUARTER FROM start_date) AS STRING), '-',
                CAST(EXTRACT(YEAR FROM start_date) AS STRING))  AS quarter,
         EXTRACT(YEAR FROM start_date) AS year,
         EXTRACT(QUARTER FROM start_date) AS qnum,
         COUNT(*) AS n_camp,
         IFNULL(SUM(total_value), 0) AS bruto
       FROM ${tableRef('commplan_checklists')}
       WHERE LOWER(cs_email) = @cs
       GROUP BY year, qnum, quarter
       ORDER BY year DESC, qnum DESC`,
      { cs: csEmail }
    );

    res.json({
      items: items.map(r => {
        const b = Number(r.bruto) || 0;
        return {
          quarter: r.quarter, year: r.year, qnum: r.qnum,
          n_camp: r.n_camp || 0,
          bruto: b,
          liquido: b * NET_FACTOR,
        };
      }),
    });
  } catch (err) {
    console.error('GET /me/history error:', err);
    res.status(500).json({ error: err.message });
  }
});
