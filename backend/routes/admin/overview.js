/**
 * routes/admin/overview.js — agrega dados pro Admin Visão Geral.
 *
 * GET /commplan/admin/overview/:q
 *
 * Retorna em uma única chamada:
 *   - kpis: investimento total, bonus total, qtd campanhas, evidências pendentes
 *   - by_cs: resumo por CS (campanhas, salário, bônus, status)
 *   - growth: últimos 6 meses (campanhas + investimento agregado)
 *   - top_studies: top 10 estudos mais usados no quarter
 *   - audiences_per_month: contagem de campanhas por mês
 *
 * O frontend usa um único fetch pra renderizar a tela toda.
 */

import { Router } from 'express';
import { authRequired, adminRequired } from '../../middleware/auth.js';
import { query, tableRef, sourceTableRef } from '../../lib/bigquery.js';
import { parseQuarter } from '../../engine/quarter-resolver.js';

export const router = Router();
router.use(authRequired, adminRequired);

router.get('/:q', async (req, res) => {
  try {
    const quarter = req.params.q;
    const { startDate, endDate } = parseQuarter(quarter);

    // ── 1. KPIs do quarter ─────────────────────────────────────────────
    const [kpisRow] = await query(
      `SELECT
         COUNT(*) AS n_camp,
         SUM(total_value) AS invest_total,
         COUNT(DISTINCT cs_email) AS n_cs
       FROM ${tableRef('commplan_checklists')}
       WHERE start_date >= @s AND start_date <= @e`,
      { s: startDate, e: endDate }
    );

    // ── 2. Bônus total e evidências pendentes ──────────────────────────
    const [bonusRow] = await query(
      `SELECT
         IFNULL(SUM(bonus_gross_brl), 0) AS bonus_gross_brl,
         IFNULL(SUM(bonus_net_brl), 0)   AS bonus_net_brl
       FROM ${tableRef('commplan_quarter_summary')}
       WHERE quarter = @q`,
      { q: quarter }
    );

    const [pendingRow] = await query(
      `SELECT COUNT(*) AS n_pending
       FROM ${tableRef('commplan_evidences')}
       WHERE status = 'pending_review'`
    );

    // ── 3. Resumo por CS ───────────────────────────────────────────────
    // Junta team (compplan_team), summary, e contagem de campanhas
    const byCs = await query(
      `WITH camp_counts AS (
         SELECT cs_email, COUNT(*) AS n_camp
         FROM ${tableRef('commplan_checklists')}
         WHERE start_date >= @s AND start_date <= @e
         GROUP BY cs_email
       ),
       pending_evi AS (
         SELECT cs_email, COUNT(*) AS n_pending
         FROM ${tableRef('commplan_evidences')}
         WHERE status = 'pending_review'
         GROUP BY cs_email
       ),
       last_salary AS (
         SELECT cs_email, ANY_VALUE(fixed_salary_brl) AS salary
         FROM ${tableRef('commplan_cs_config')}
         WHERE effective_from <= @e
           AND (effective_until IS NULL OR effective_until > @e)
         GROUP BY cs_email
       )
       SELECT
         tm.email                                 AS cs_email,
         tm.name                                  AS cs_name,
         IFNULL(ls.salary, 0)                     AS fixed_salary_brl,
         IFNULL(cc.n_camp, 0)                     AS n_camp,
         IFNULL(qs.bonus_gross_brl, 0)            AS bonus_brl,
         qs.status                                AS status,
         IFNULL(pe.n_pending, 0)                  AS n_pending_evi
       FROM ${tableRef('compplan_team')} AS tm
       LEFT JOIN ${tableRef('commplan_quarter_summary')} AS qs
         ON LOWER(qs.cs_email) = LOWER(tm.email) AND qs.quarter = @q
       LEFT JOIN camp_counts cc        ON LOWER(cc.cs_email) = LOWER(tm.email)
       LEFT JOIN pending_evi  pe       ON LOWER(pe.cs_email) = LOWER(tm.email)
       LEFT JOIN last_salary  ls       ON LOWER(ls.cs_email) = LOWER(tm.email)
       WHERE tm.role = 'cs' AND tm.active = TRUE
       ORDER BY n_camp DESC, tm.name`,
      { q: quarter, s: startDate, e: endDate }
    );

    // ── 4. Growth últimos 6 meses ──────────────────────────────────────
    const growth = await query(
      `SELECT
         FORMAT_DATE('%Y-%m', start_date) AS month,
         COUNT(*) AS n_camp,
         SUM(total_value) AS invest_total
       FROM ${tableRef('commplan_checklists')}
       WHERE start_date >= DATE_SUB(@e, INTERVAL 6 MONTH)
         AND start_date <= @e
       GROUP BY month
       ORDER BY month`,
      { e: endDate }
    );

    // ── 5. Top studies do quarter ──────────────────────────────────────
    const topStudies = await query(
      `SELECT s AS study_id, COUNT(*) AS uses
       FROM ${tableRef('commplan_checklists')}, UNNEST(studies_used) AS s
       WHERE start_date >= @s AND start_date <= @e
       GROUP BY study_id
       ORDER BY uses DESC
       LIMIT 10`,
      { s: startDate, e: endDate }
    );

    // ── 6. Audiences (= total de campanhas com audiences declaradas) por mês ──
    const audiencesPerMonth = await query(
      `SELECT
         FORMAT_DATE('%Y-%m', start_date) AS month,
         COUNT(*) AS n_camp_with_audiences
       FROM ${tableRef('commplan_checklists')}
       WHERE start_date >= DATE_SUB(@e, INTERVAL 6 MONTH)
         AND start_date <= @e
         AND audiences IS NOT NULL
       GROUP BY month
       ORDER BY month`,
      { e: endDate }
    );

    res.json({
      quarter,
      kpis: {
        n_camp: kpisRow.n_camp || 0,
        invest_total: Number(kpisRow.invest_total) || 0,
        n_cs: kpisRow.n_cs || 0,
        total_bonus_brl: Number(bonusRow.bonus_gross_brl) || 0,
        net_bonus_brl: Number(bonusRow.bonus_net_brl) || 0,
        n_pending_evi: pendingRow.n_pending || 0,
      },
      by_cs: byCs.map(r => ({
        cs_email: r.cs_email,
        cs_name: r.cs_name,
        fixed_salary_brl: Number(r.fixed_salary_brl) || 0,
        n_camp: r.n_camp || 0,
        bonus_brl: Number(r.bonus_brl) || 0,
        status: r.status || 'no_data',
        n_pending_evi: r.n_pending_evi || 0,
      })),
      growth: growth.map(r => ({
        month: r.month,
        n_camp: r.n_camp || 0,
        invest_total: Number(r.invest_total) || 0,
      })),
      top_studies: topStudies.map(r => ({ study_id: r.study_id, uses: r.uses })),
      audiences_per_month: audiencesPerMonth.map(r => ({
        month: r.month,
        n: r.n_camp_with_audiences || 0,
      })),
    });
  } catch (err) {
    console.error('GET /admin/overview/:q error:', err);
    res.status(500).json({ error: err.message });
  }
});
