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

    // 3. Ranking por CS
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
        liquido_total: bruto * NET_FACTOR,
        tax_rate: TAX_RATE,
        n_pending: pending.n_pending || 0,
        pending_bruto: pendingBruto,
        pending_liquido: pendingBruto * NET_FACTOR,
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
// Lista CSs ativos (pra alimentar dropdown de atribuição).
router.get('/team', async (req, res) => {
  try {
    const items = await query(
      `SELECT email, name
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

    // Valida que a campanha existe e está pendente
    const [pending] = await query(
      `SELECT short_token FROM ${tableRef('commplan_pending_legacy')}
       WHERE short_token = @t LIMIT 1`,
      { t: token }
    );
    if (!pending) {
      return res.status(404).json({ error: `Campanha "${token}" não está pendente (já atribuída ou inexistente)` });
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
