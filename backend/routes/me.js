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
async function fetchPerformanceMetrics(shortToken) {
  try {
    const [row] = await query(
      `WITH agg AS (
         SELECT
           short_token,
           SUM(impressions)                                                AS total_impressions,
           SUM(viewable_impressions)                                       AS total_viewable,
           SUM(clicks)                                                     AS total_clicks,
           SUM(effective_total_cost)                                       AS total_cost,
           SUM(IF(LOWER(media_type) = 'display', viewable_impressions, 0)) AS display_viewable
         FROM \`site-hypr.prod_prod_hypr_reporthub.campaign_results\`
         WHERE short_token = @t
         GROUP BY short_token
       ),
       contracted AS (
         SELECT
           short_token,
           IFNULL(o2o_display_impressions, 0) + IFNULL(ooh_display_impressions, 0) AS display_contracted
         FROM ${tableRef('commplan_checklists')}
         WHERE short_token = @t
       )
       SELECT
         IFNULL(SAFE_DIVIDE(a.total_cost, a.total_impressions) * 1000, 0)  AS ecpm,
         IFNULL(SAFE_DIVIDE(a.total_clicks, a.total_viewable), 0)          AS ctr,
         IFNULL((SAFE_DIVIDE(a.display_viewable, c.display_contracted) - 1) * 100, 0) AS over_percent,
         a.total_impressions,
         a.total_viewable,
         a.total_clicks,
         a.total_cost,
         a.display_viewable,
         c.display_contracted
       FROM agg a
       LEFT JOIN contracted c USING (short_token)`,
      { t: shortToken }
    );
    return row || null;
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
    if (isLegacy) {
      const [row] = await query(
        `SELECT manual_checks
         FROM ${tableRef('commplan_legacy_assignments')}
         WHERE short_token = @t LIMIT 1`,
        { t: shortToken }
      );
      return row?.manual_checks ? JSON.parse(row.manual_checks) : {};
    } else {
      const [row] = await query(
        `SELECT manual_checks
         FROM ${tableRef('commplan_command_overrides')}
         WHERE short_token = @t LIMIT 1`,
        { t: shortToken }
      );
      return row?.manual_checks ? JSON.parse(row.manual_checks) : {};
    }
  } catch (err) {
    console.warn(`fetchManualChecks(${shortToken}): ${err.message}`);
    return {};
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

    // Pra cada campanha, calcula bônus (sem métricas/manual aqui pra performance)
    let totalBonusBrl = 0;
    const items = campaigns.map(c => {
      const breakdown = computeBonus(c, {}, null);
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
        bruto: Number(c.total_value) || 0,
        liquido: (Number(c.total_value) || 0) * NET_FACTOR,
        bonus_brl: breakdown.total_brl,
        bonus_pct: breakdown.total_pct,
      };
    });

    const nReviewed = items.filter(i => i.reviewed).length;
    const bruto = items.reduce((s, i) => s + i.bruto, 0);

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
    const [manualChecks, metrics] = await Promise.all([
      fetchManualChecks(campaign.short_token, isLegacy),
      fetchPerformanceMetrics(campaign.short_token),
    ]);

    // Calcula breakdown completo
    const breakdown = computeBonus(campaign, manualChecks, metrics);

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
      is_abs: !!campaign.is_abs,
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
    const notes = body.notes || null;
    const reviewed = body.reviewed !== false;

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

    // Re-calcula e retorna breakdown atualizado
    const [updated] = await query(
      `SELECT c.*
       FROM ${tableRef('commplan_checklists')} c
       WHERE c.short_token = @t LIMIT 1`,
      { t: token }
    );
    const metrics = await fetchPerformanceMetrics(token);
    const breakdown = computeBonus(updated, manualChecks, metrics);

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
