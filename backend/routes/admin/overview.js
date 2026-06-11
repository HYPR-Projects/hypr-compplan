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
import { computeCsBonus, computeCsScore } from '../../lib/bonus-calc.js';
import { getSalaryForCs } from '../../data/cs-config.js';
import { getFloorOverride } from '../../data/floor-overrides.js';

export const router = Router();
router.use(authRequired);
// adminRequired vai ser aplicado endpoint a endpoint

const TAX_RATE = 0.1653;
const NET_FACTOR = 1 - TAX_RATE; // 0.8347

// ─── GET /admin/overview/:q ────────────────────────────────────────────
/**
 * Handler do overview (KPIs + ranking por CS).
 * Exportado pra ser reutilizado em rota não-admin (CS também tem acesso).
 */
export async function overviewHandler(req, res) {
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

    // Quarter pra buscar override (já vem em formato "Q1-2026" no req.params.q)

    const byCs = await Promise.all(byCsRaw.map(async (csRow) => {
      // Salário vigente
      let monthlySalary = 0;
      try {
        const sal = await getSalaryForCs({ csEmail: csRow.cs_email });
        monthlySalary = Number(sal?.fixed_salary_brl) || 0;
      } catch (_) { /* silent */ }

      // Floor override
      let monthsWaived = 0;
      let floorOverride = null;
      try {
        floorOverride = await getFloorOverride({ csEmail: csRow.cs_email, quarter });
        monthsWaived = floorOverride?.months_off || 0;
      } catch (_) { /* silent */ }
      const floorMonths = Math.max(0, 2 - monthsWaived);
      const fixoQuarter = monthlySalary * floorMonths;

      // ⚙️  Bônus bruto: usa MESMA função que /me/dashboard (computeCsBonus).
      // Antes era um cálculo inline simplificado que ignorava adminOverrides,
      // preAssignee e studiesInfo — causando divergência entre painel e overview.
      let totalBonus = 0;
      let scoreInfo = { score_pct: null, n_campaigns: 0 };
      try {
        const result = await computeCsBonus({
          csEmail: csRow.cs_email,
          startDate, endDate,
        });
        totalBonus = result.total_brl;
        // Score: média das % nas campanhas FINALIZADAS + REVISADAS
        scoreInfo = computeCsScore(result.by_campaign || []);
      } catch (e) {
        console.warn(`computeCsBonus(${csRow.cs_email}):`, e.message);
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
        floor_months_off: monthsWaived,
        floor_override_note: floorOverride?.note || null,
        bonus_liquido: bonusLiquido,
        hit_floor: hitFloor,
        // Score: média % nas campanhas finalizadas+revisadas (null se sem dados)
        score_pct: scoreInfo.score_pct,
        score_n_campaigns: scoreInfo.n_campaigns,
      };
    }));

    // Score médio do time: média simples dos scores dos CSs que têm score
    const csWithScore = byCs.filter(c => c.score_pct !== null);
    const teamScore = csWithScore.length > 0
      ? csWithScore.reduce((acc, c) => acc + c.score_pct, 0) / csWithScore.length
      : null;

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
        // Score médio do time (null se ninguém tem score)
        team_score_pct: teamScore,
        team_score_n_cs: csWithScore.length,
      },
      by_cs: byCs,
    });
  } catch (err) {
    console.error('GET /admin/overview/:q error:', err);
    res.status(500).json({ error: err.message });
  }
}

// Registra a rota usando o handler exportado
router.get('/overview/:q', overviewHandler);

// ─── GET /admin/campaigns/:q ───────────────────────────────────────────
router.get('/campaigns/:q', adminRequired, async (req, res) => {
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
router.get('/pending/:q', adminRequired, async (req, res) => {
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
router.post('/pending/:token/assign', adminRequired, async (req, res) => {
  try {
    const { token } = req.params;
    const { cs_email } = req.body || {};

    if (!cs_email || typeof cs_email !== 'string' || !cs_email.trim()) {
      return res.status(400).json({ error: 'cs_email é obrigatório e não pode ser vazio' });
    }

    const csEmail = cs_email.toLowerCase().trim();
    // Validação extra: formato básico de email (evita lixo tipo "isaac" sem domínio)
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(csEmail)) {
      return res.status(400).json({ error: `cs_email inválido: "${csEmail}"` });
    }
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

// ─── GET /admin/cs/:email/floor-override/:q ────────────────────────────
// Lê override de piso atual (months_off + note).
router.get('/cs/:email/floor-override/:q', adminRequired, async (req, res) => {
  try {
    const { setFloorOverride: _, getFloorOverride: _g } = await import('../../data/floor-overrides.js');
    const { email, q } = req.params;
    const { getFloorOverride } = await import('../../data/floor-overrides.js');
    const fo = await getFloorOverride({ csEmail: email, quarter: q });
    res.json(fo || { months_off: 0, note: null });
  } catch (err) {
    console.error('GET floor-override:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── POST /admin/cs/:email/floor-override/:q ───────────────────────────
// Set/update override de piso.
// Body: { months_off: 0|1|2, note?: string }
router.post('/cs/:email/floor-override/:q', adminRequired, async (req, res) => {
  try {
    const { setFloorOverride } = await import('../../data/floor-overrides.js');
    const { email, q } = req.params;
    const { months_off, note } = req.body || {};
    const m = Number(months_off);
    if (![0, 1, 2].includes(m)) {
      return res.status(400).json({ error: 'months_off deve ser 0, 1 ou 2' });
    }
    const adminEmail = req.auth?.email || 'unknown';
    await setFloorOverride({ csEmail: email, quarter: q, monthsOff: m, note, byEmail: adminEmail });
    res.json({ ok: true, months_off: m });
  } catch (err) {
    console.error('POST floor-override:', err);
    res.status(500).json({ error: err.message });
  }
});

// ─── GET /admin/diag/campaign/:token ───────────────────────────────────
// Endpoint de diagnóstico: mostra o estado de uma campanha em TODAS as
// fontes (sales_center.checklists, legacy_assignments, command_overrides,
// checklist_info_snapshot, view final commplan_checklists). Usado quando
// uma campanha aparenta estar em "limbo" (sumiu de pendentes E sem CS).
router.get('/diag/campaign/:token', adminRequired, async (req, res) => {
  try {
    const { token } = req.params;
    const result = { short_token: token };

    // 1. sales_center.checklists (fonte do Command novo)
    try {
      const [r1] = await query(
        `SELECT short_token, client, cs_email, cs_name, start_date, end_date,
                CAST(investment AS FLOAT64) AS total_value
         FROM \`site-hypr.hypr_sales_center.checklists\`
         WHERE short_token = @t LIMIT 1`,
        { t: token }
      );
      result.sales_center = r1 || null;
    } catch (e) { result.sales_center_error = e.message; }

    // 2. commplan_legacy_assignments
    try {
      const [r2] = await query(
        `SELECT short_token, cs_email, attributed_by, attributed_at, updated_at, updated_by, notes
         FROM ${tableRef('commplan_legacy_assignments')}
         WHERE short_token = @t LIMIT 1`,
        { t: token }
      );
      result.legacy_assignment = r2 || null;
    } catch (e) { result.legacy_assignment_error = e.message; }

    // 3. commplan_command_overrides
    try {
      const [r3] = await query(
        `SELECT short_token, cs_email, reviewed, reviewed_at, updated_at, updated_by
         FROM ${tableRef('commplan_command_overrides')}
         WHERE short_token = @t LIMIT 1`,
        { t: token }
      );
      result.command_override = r3 || null;
    } catch (e) { result.command_override_error = e.message; }

    // 4. checklist_info_snapshot
    try {
      const [r4] = await query(
        `SELECT short_token, client_name, salesman AS cp_name, start_date, end_date, total_value
         FROM ${tableRef('checklist_info_snapshot')}
         WHERE short_token = @t LIMIT 1`,
        { t: token }
      );
      result.checklist_info_snapshot = r4 || null;
    } catch (e) { result.checklist_info_snapshot_error = e.message; }

    // 5. View final commplan_checklists (o que o sistema realmente "vê")
    try {
      const [r5] = await query(
        `SELECT short_token, source, client_name, cs_email, cs_name, start_date, end_date, total_value, is_legacy
         FROM ${tableRef('commplan_checklists')}
         WHERE short_token = @t LIMIT 1`,
        { t: token }
      );
      result.view_commplan_checklists = r5 || null;
    } catch (e) { result.view_commplan_checklists_error = e.message; }

    // 6. View commplan_pending_legacy
    try {
      const [r6] = await query(
        `SELECT short_token, client_name, campaign_name, start_date
         FROM ${tableRef('commplan_pending_legacy')}
         WHERE short_token = @t LIMIT 1`,
        { t: token }
      );
      result.pending_legacy = r6 || null;
    } catch (e) { result.pending_legacy_error = e.message; }

    // Diagnóstico interpretativo
    const inSalesCenter = !!result.sales_center;
    const inLegacyAssign = !!result.legacy_assignment;
    const inSnapshot = !!result.checklist_info_snapshot;
    const inView = !!result.view_commplan_checklists;
    const inPending = !!result.pending_legacy;
    const csEmailFinal = result.view_commplan_checklists?.cs_email || null;

    let diagnosis = null;
    if (!inView && !inPending) {
      diagnosis = 'NOT_FOUND: campanha não existe em nenhuma fonte';
    } else if (inView && csEmailFinal) {
      diagnosis = `OK: campanha aparece com cs_email=${csEmailFinal} (source=${result.view_commplan_checklists.source})`;
    } else if (inView && !csEmailFinal && inSalesCenter && !result.sales_center.cs_email) {
      diagnosis = 'LIMBO: campanha está em sales_center.checklists mas SEM cs_email preenchido no Command. O CP precisa atribuir o CS no Command, ou admin pode atribuir manualmente aqui (criando legacy_assignment temporário).';
    } else if (inPending) {
      diagnosis = 'PENDENTE: aparece em commplan_pending_legacy aguardando atribuição admin';
    } else if (inView && !csEmailFinal) {
      diagnosis = 'LIMBO: aparece em commplan_checklists mas cs_email é NULL — investigar';
    }
    result.diagnosis = diagnosis;
    result.flags = { inSalesCenter, inLegacyAssign, inSnapshot, inView, inPending, csEmailFinal };

    res.json(result);
  } catch (err) {
    console.error('GET /admin/diag/campaign/:token error:', err);
    res.status(500).json({ error: err.message });
  }
});
