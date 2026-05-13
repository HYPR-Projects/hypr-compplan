/**
 * routes/admin/overview.js — endpoints simples pra dashboard.
 *
 * Versão minimalista: lê SÓ da view commplan_checklists + tabelas auxiliares.
 *
 * Endpoints:
 *   GET  /commplan/admin/overview/:q       → KPIs + ranking por CS
 *   GET  /commplan/admin/campaigns/:q      → lista atribuídas (com CS)
 *   GET  /commplan/admin/pending/:q        → lista pendentes (sem CS)
 *   GET  /commplan/admin/team              → lista CSs ativos (pra dropdown)
 *   POST /commplan/admin/pending/:token/assign → atribui um CS a uma legacy
 *
 * :q é o quarter (Q1-2026, Q2-2026 etc).
 */

import { Router } from 'express';
import { authRequired, adminRequired } from '../../middleware/auth.js';
import { query, tableRef, bq, DATASET } from '../../lib/bigquery.js';
import { parseQuarter } from '../../engine/quarter-resolver.js';
import { computeBonus } from '../../engine/compplan-engine.js';
import { getSalaryForCs } from '../../data/cs-config.js';

export const router = Router();
router.use(authRequired, adminRequired);

const TAX_RATE = 0.1653;
const NET_FACTOR = 1 - TAX_RATE; // 0.8347

// ─── GET /admin/overview/:q ────────────────────────────────────────────
router.get('/overview/:q', async (req, res) => {
  try {
    const quarter = req.params.q;
    const { startDate, endDate } = parseQuarter(quarter);

    // 1. KPIs gerais (atribuídas)
    const [kpis] = await query(
      `SELECT
         COUNT(*) AS n_camp,
         COUNT(DISTINCT cs_email) AS n_cs,
         IFNULL(SUM(total_value), 0) AS bruto_total
       FROM ${tableRef('commplan_checklists')}
       WHERE start_date >= @s AND start_date <= @e`,
      { s: startDate, e: endDate }
    );

    // 2. Pendentes (sem CS)
    const [pending] = await query(
      `SELECT
         COUNT(*) AS n_pending,
         IFNULL(SUM(total_value), 0) AS pending_bruto
       FROM ${tableRef('commplan_pending_legacy')}
       WHERE start_date >= @s AND start_date <= @e`,
      { s: startDate, e: endDate }
    );

    const bruto = Number(kpis.bruto_total) || 0;
    const pendingBruto = Number(pending.pending_bruto) || 0;

    // 3. Ranking por CS — agora com bonus calculado
    const byCsRaw = await query(
      `SELECT
         c.cs_email,
         ANY_VALUE(c.cs_name) AS cs_name,
         ANY_VALUE(tm.photo_url) AS photo_url,
         COUNT(*) AS n_camp,
         COUNTIF(IFNULL(o.reviewed, FALSE) = TRUE OR (la.updated_at IS NOT NULL AND la.updated_at > la.attributed_at)) AS n_reviewed,
         IFNULL(SUM(c.total_value), 0) AS bruto
       FROM ${tableRef('commplan_checklists')} c
       LEFT JOIN ${tableRef('commplan_command_overrides')} o ON c.short_token = o.short_token
       LEFT JOIN ${tableRef('commplan_legacy_assignments')} la ON c.short_token = la.short_token
       LEFT JOIN ${tableRef('compplan_team')} tm ON LOWER(tm.email) = LOWER(c.cs_email)
       WHERE c.start_date >= @s AND c.start_date <= @e
         AND c.cs_email IS NOT NULL
       GROUP BY c.cs_email
       ORDER BY bruto DESC`,
      { s: startDate, e: endDate }
    );

    // Pra cada CS, calcula bônus total das campanhas (com manual_checks + métricas)
    let totalBonusBrutoAll = 0;
    let totalFixoAll = 0;
    let totalLiquidoAll = 0;

    const byCs = await Promise.all(byCsRaw.map(async (csRow) => {
      // Salário vigente
      let monthlySalary = 0;
      try {
        const sal = await getSalaryForCs({ csEmail: csRow.cs_email });
        monthlySalary = Number(sal?.fixed_salary_brl) || 0;
      } catch (_) { /* silent */ }
      const fixoQuarter = monthlySalary * 2;

      // Campanhas desse CS (precisa pra calcular bônus)
      const campaigns = await query(
        `SELECT
           c.short_token, c.is_legacy, c.total_value, c.features, c.products,
           c.formats, c.audiences, c.studies_used, c.pracas_type,
           o.manual_checks AS o_mc, la.manual_checks AS la_mc
         FROM ${tableRef('commplan_checklists')} c
         LEFT JOIN ${tableRef('commplan_command_overrides')} o ON c.short_token = o.short_token
         LEFT JOIN ${tableRef('commplan_legacy_assignments')} la ON c.short_token = la.short_token
         WHERE c.start_date >= @s AND c.start_date <= @e
           AND LOWER(c.cs_email) = @cs`,
        { s: startDate, e: endDate, cs: csRow.cs_email.toLowerCase() }
      );

      // Métricas em batch
      const tokens = campaigns.map(c => c.short_token);
      let metricsByToken = {};
      if (tokens.length > 0) {
        try {
          const [perfRows, contractedRows] = await Promise.all([
            query(
              `SELECT short_token,
                 SUM(IF(LOWER(media_type) = 'display', impressions, 0))           AS display_imps,
                 SUM(IF(LOWER(media_type) = 'display', viewable_impressions, 0))  AS display_viewable,
                 SUM(IF(LOWER(media_type) = 'display', clicks, 0))                AS display_clicks,
                 SUM(IF(LOWER(media_type) = 'display', total_cost, 0))            AS display_cost
               FROM \`site-hypr.prod_assets.unified_daily_performance_metrics\`
               WHERE short_token IN UNNEST(@toks)
                 AND LOWER(IFNULL(line_name, '')) NOT LIKE '%survey%'
                 AND LOWER(IFNULL(line_name, '')) NOT LIKE '%controle%'
                 AND LOWER(IFNULL(line_name, '')) NOT LIKE '%exposto%'
               GROUP BY short_token`,
              { toks: tokens },
              'US'
            ),
            query(
              `SELECT short_token,
                 IFNULL(o2o_display_impressions, 0)
               + IFNULL(bonus_o2o_display_impressions, 0)
               + IFNULL(ooh_display_impressions, 0)
               + IFNULL(bonus_ooh_display_impressions, 0) AS display_contracted
               FROM ${tableRef('commplan_checklists')}
               WHERE short_token IN UNNEST(@toks)`,
              { toks: tokens }
            ),
          ]);
          const contractedMap = {};
          for (const r of contractedRows) contractedMap[r.short_token] = Number(r.display_contracted) || 0;
          for (const r of perfRows) {
            const dc = contractedMap[r.short_token] || 0;
            const di = Number(r.display_imps) || 0;
            const dv = Number(r.display_viewable) || 0;
            const dk = Number(r.display_clicks) || 0;
            const cc = Number(r.display_cost) || 0;
            metricsByToken[r.short_token] = {
              ecpm: di > 0 ? (cc / di) * 1000 : 0,
              ctr: dv > 0 ? dk / dv : 0,
              over_percent: dc > 0 ? ((dv / dc) - 1) * 100 : 0,
            };
          }
        } catch (_) { /* silent */ }
      }

      let totalBonus = 0;
      for (const c of campaigns) {
        let mc = {};
        const mcStr = c.is_legacy ? c.la_mc : c.o_mc;
        if (mcStr) { try { mc = JSON.parse(mcStr); } catch (_) {} }
        const breakdown = computeBonus(c, mc, metricsByToken[c.short_token] || null);
        totalBonus += breakdown.total_brl;
      }

      const bonusLiquido = Math.max(0, totalBonus - fixoQuarter);
      const hitFloor = totalBonus >= fixoQuarter && fixoQuarter > 0;

      const b = Number(csRow.bruto) || 0;
      totalBonusBrutoAll += totalBonus;
      totalFixoAll += fixoQuarter;
      totalLiquidoAll += bonusLiquido;

      return {
        cs_email: csRow.cs_email,
        cs_name: csRow.cs_name,
        photo_url: csRow.photo_url || null,
        n_camp: csRow.n_camp || 0,
        n_reviewed: csRow.n_reviewed || 0,
        bruto: b,
        liquido: b * NET_FACTOR,
        bonus_bruto: totalBonus,
        monthly_salary: monthlySalary,
        fixo_quarter: fixoQuarter,
        bonus_liquido: bonusLiquido,
        hit_floor: hitFloor,
      };
    }));

    res.json({
      quarter,
      period: { start: startDate, end: endDate },
      kpis: {
        n_camp: kpis.n_camp || 0,
        n_cs: kpis.n_cs || 0,
        bruto_total: bruto,
        liquido_total: bruto * NET_FACTOR,
        tax_rate: TAX_RATE,
        n_pending: pending.n_pending || 0,
        pending_bruto: pendingBruto,
        pending_liquido: pendingBruto * NET_FACTOR,
        bonus_bruto_total: totalBonusBrutoAll,
        fixo_total: totalFixoAll,
        bonus_liquido_total: totalLiquidoAll,
      },
      by_cs: byCs,
    });
  } catch (err) {
    console.error('GET /admin/overview/:q error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /admin/campaigns/:q ───────────────────────────────────────────
router.get('/campaigns/:q', async (req, res) => {
  try {
    const quarter = req.params.q;
    const { startDate, endDate } = parseQuarter(quarter);

    const items = await query(
      `SELECT
         short_token,
         client_name,
         campaign_name,
         cs_email,
         cs_name,
         cp_name,
         agency,
         start_date,
         end_date,
         is_legacy,
         IFNULL(total_value, 0) AS bruto
       FROM ${tableRef('commplan_checklists')}
       WHERE start_date >= @s AND start_date <= @e
       ORDER BY start_date DESC, total_value DESC`,
      { s: startDate, e: endDate }
    );

    res.json({
      quarter,
      total: items.length,
      items: items.map(r => {
        const b = Number(r.bruto) || 0;
        return {
          short_token: r.short_token,
          client_name: r.client_name,
          campaign_name: r.campaign_name,
          cs_email: r.cs_email,
          cs_name: r.cs_name,
          cp_name: r.cp_name,
          agency: r.agency,
          start_date: r.start_date?.value || r.start_date,
          end_date: r.end_date?.value || r.end_date,
          is_legacy: !!r.is_legacy,
          bruto: b,
          liquido: b * NET_FACTOR,
        };
      }),
    });
  } catch (err) {
    console.error('GET /admin/campaigns/:q error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /admin/pending/:q ─────────────────────────────────────────────
// Lista campanhas legadas SEM CS atribuído.
router.get('/pending/:q', async (req, res) => {
  try {
    const quarter = req.params.q;
    const { startDate, endDate } = parseQuarter(quarter);

    const items = await query(
      `SELECT
         short_token,
         client_name,
         campaign_name,
         cp_name,
         agency,
         start_date,
         end_date,
         IFNULL(total_value, 0) AS bruto
       FROM ${tableRef('commplan_pending_legacy')}
       WHERE start_date >= @s AND start_date <= @e
       ORDER BY start_date DESC, total_value DESC`,
      { s: startDate, e: endDate }
    );

    res.json({
      quarter,
      total: items.length,
      items: items.map(r => {
        const b = Number(r.bruto) || 0;
        return {
          short_token: r.short_token,
          client_name: r.client_name,
          campaign_name: r.campaign_name,
          cp_name: r.cp_name,
          agency: r.agency,
          start_date: r.start_date?.value || r.start_date,
          end_date: r.end_date?.value || r.end_date,
          bruto: b,
          liquido: b * NET_FACTOR,
        };
      }),
    });
  } catch (err) {
    console.error('GET /admin/pending/:q error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /admin/team ───────────────────────────────────────────────────
// Lista CSs ativos (pra alimentar dropdown de atribuição + avatares).
router.get('/team', async (req, res) => {
  try {
    const items = await query(
      `SELECT email, name, photo_url
       FROM ${tableRef('compplan_team')}
       WHERE role = 'cs' AND active = TRUE
       ORDER BY name`
    );
    res.json({ items });
  } catch (err) {
    console.error('GET /admin/team error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /admin/pending/:token/assign ─────────────────────────────────
// Atribui um CS a uma campanha legada. Insere em commplan_legacy_assignments.
// Body: { cs_email: string }
router.post('/pending/:token/assign', async (req, res) => {
  try {
    const { token } = req.params;
    const { cs_email } = req.body || {};

    if (!cs_email || typeof cs_email !== 'string') {
      return res.status(400).json({ error: 'cs_email é obrigatório' });
    }

    const csEmail = cs_email.toLowerCase().trim();
    const adminEmail = (req.user?.email || 'system').toLowerCase();

    // Valida que o CS existe e é ativo
    const [cs] = await query(
      `SELECT email FROM ${tableRef('compplan_team')}
       WHERE LOWER(email) = @e AND role = 'cs' AND active = TRUE
       LIMIT 1`,
      { e: csEmail }
    );
    if (!cs) {
      return res.status(400).json({ error: `CS "${csEmail}" não encontrado ou inativo` });
    }

    // Valida que a campanha existe em checklist_info_snapshot.
    // (Não usa commplan_pending_legacy porque essa view exclui campanhas que
    //  já entraram no Command — mas o admin pode querer atribuir mesmo assim,
    //  pra forçar a contagem caso a sincronia ainda esteja pendente.)
    const [exists] = await query(
      `SELECT short_token FROM ${tableRef('checklist_info_snapshot')}
       WHERE short_token = @t LIMIT 1`,
      { t: token }
    );
    if (!exists) {
      return res.status(404).json({
        error: `Campanha "${token}" não existe em checklist_info_snapshot. Talvez precise rodar refresh-snapshot.`
      });
    }

    // Verifica se já tem atribuição (evita duplicar)
    const [already] = await query(
      `SELECT short_token FROM ${tableRef('commplan_legacy_assignments')}
       WHERE short_token = @t LIMIT 1`,
      { t: token }
    );
    if (already) {
      return res.status(409).json({
        error: `Campanha "${token}" já tem CS atribuído. Pra trocar, remova a atribuição primeiro.`
      });
    }

    // Insere atribuição
    const tableName = 'commplan_legacy_assignments';
    const now = new Date().toISOString();

    await bq.dataset(DATASET).table(tableName).insert([{
      short_token: token,
      cs_email: csEmail,
      features_manual: [],
      products_manual: [],
      audiences_count: 0,
      had_cs_meeting: false,
      studies_used: [],
      source_attribution: 'manual_admin',
      attributed_by: adminEmail,
      attributed_at: now,
    }]);

    res.json({ ok: true, short_token: token, cs_email: csEmail, attributed_by: adminEmail });
  } catch (err) {
    console.error('POST /admin/pending/:token/assign error:', err);
    res.status(500).json({ error: err.message });
  }
});
