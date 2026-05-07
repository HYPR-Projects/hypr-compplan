/**
 * routes/admin/overview.js — endpoints simples pra dashboard.
 *
 * Versão minimalista: lê SÓ da view commplan_checklists.
 * Não toca em evidências, bônus, mentorias, cs_config — eles entram depois.
 *
 * Endpoints:
 *   GET /commplan/admin/overview/:q  → KPIs + ranking por CS
 *   GET /commplan/admin/campaigns/:q → lista detalhada de campanhas
 *
 * :q é o quarter no formato Q1-2026, Q2-2026 etc.
 */

import { Router } from 'express';
import { authRequired, adminRequired } from '../../middleware/auth.js';
import { query, tableRef } from '../../lib/bigquery.js';
import { parseQuarter } from '../../engine/quarter-resolver.js';

export const router = Router();
router.use(authRequired, adminRequired);

const TAX_RATE = 0.1653; // 16.53% — alíquota Report Center
const NET_FACTOR = 1 - TAX_RATE; // 0.8347

// ─── GET /admin/overview/:q ────────────────────────────────────────────
// Retorna KPIs agregados + ranking por CS.
router.get('/overview/:q', async (req, res) => {
  try {
    const quarter = req.params.q;
    const { startDate, endDate } = parseQuarter(quarter);

    // 1. KPIs gerais
    const [kpis] = await query(
      `SELECT
         COUNT(*) AS n_camp,
         COUNT(DISTINCT cs_email) AS n_cs,
         IFNULL(SUM(total_value), 0) AS bruto_total
       FROM ${tableRef('commplan_checklists')}
       WHERE start_date >= @s AND start_date <= @e`,
      { s: startDate, e: endDate }
    );

    const bruto = Number(kpis.bruto_total) || 0;
    const liquido = bruto * NET_FACTOR;

    // 2. Ranking por CS
    const byCs = await query(
      `SELECT
         cs_email,
         ANY_VALUE(cs_name) AS cs_name,
         COUNT(*) AS n_camp,
         IFNULL(SUM(total_value), 0) AS bruto
       FROM ${tableRef('commplan_checklists')}
       WHERE start_date >= @s AND start_date <= @e
         AND cs_email IS NOT NULL
       GROUP BY cs_email
       ORDER BY bruto DESC`,
      { s: startDate, e: endDate }
    );

    res.json({
      quarter,
      period: { start: startDate, end: endDate },
      kpis: {
        n_camp: kpis.n_camp || 0,
        n_cs: kpis.n_cs || 0,
        bruto_total: bruto,
        liquido_total: liquido,
        tax_rate: TAX_RATE,
      },
      by_cs: byCs.map(r => {
        const b = Number(r.bruto) || 0;
        return {
          cs_email: r.cs_email,
          cs_name: r.cs_name,
          n_camp: r.n_camp || 0,
          bruto: b,
          liquido: b * NET_FACTOR,
        };
      }),
    });
  } catch (err) {
    console.error('GET /admin/overview/:q error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /admin/campaigns/:q ───────────────────────────────────────────
// Lista detalhada de campanhas do quarter — alimenta a aba "Campanhas".
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
      period: { start: startDate, end: endDate },
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
