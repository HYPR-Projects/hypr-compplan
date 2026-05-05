/**
 * routes/admin/quarter.js — fluxo de fechamento de quarter.
 *
 * POST   /commplan/admin/quarter/:q/compute     Recalcula tudo (todos CSs)
 * GET    /commplan/admin/quarter/:q             Lista snapshots do quarter
 * PUT    /commplan/admin/quarter/:q/:cs/approve  Aprova (congela)
 * PUT    /commplan/admin/quarter/:q/:cs/mark-paid Marca como pago
 *
 * O cálculo:
 *   1. Pra cada CS com campanhas no quarter:
 *      a. lista campanhas (end_date dentro do quarter)
 *      b. avalia cada uma (engine.evaluateCampaign)
 *      c. salva snapshot em commplan_campaign_calc
 *   2. Pra cada CS, agrega em commplan_quarter_summary
 */

import { Router } from 'express';
import { authRequired, adminRequired } from '../../middleware/auth.js';
import { logAudit } from '../../lib/audit.js';
import { parseQuarter } from '../../engine/quarter-resolver.js';
import { evaluateCampaign } from '../../engine/index.js';
import { listCssWithCampaignsInRange, listChecklistsForCs } from '../../data/checklists.js';
import {
  upsertCampaignCalc, recomputeQuarterSummary,
  listQuarterSummaries, getQuarterSummary,
  approveQuarter, markQuarterPaid,
} from '../../data/snapshots.js';
import { getSalaryForCs } from '../../data/cs-config.js';
import { resolveVersion } from '../../lib/version-resolver.js';

export const router = Router();
router.use(authRequired, adminRequired);

/** GET /commplan/admin/quarter/:q — lista todos os summaries do quarter. */
router.get('/:q', async (req, res) => {
  try {
    const quarter = req.params.q;
    parseQuarter(quarter);
    const summaries = await listQuarterSummaries({ quarter });
    res.json({ quarter, count: summaries.length, items: summaries });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /commplan/admin/quarter/:q/compute
 *
 * Recalcula tudo. Pode ser disparado várias vezes — quem está em status
 * 'approved' ou 'paid' não é sobrescrito (snapshot imutável).
 *
 * Retorna resumo: quantos CSs processados, quantas campanhas avaliadas,
 * quantos quarters skipados (já aprovados).
 */
router.post('/:q/compute', async (req, res) => {
  try {
    const quarter = req.params.q;
    const { startDate, endDate } = parseQuarter(quarter);
    const versionId = await resolveVersion(endDate);

    const cssEmails = await listCssWithCampaignsInRange({ startDate, endDate });
    const summary = {
      quarter, version_id: versionId,
      css_processed: 0, campaigns_evaluated: 0,
      campaigns_failed: 0, quarters_skipped: 0,
      errors: [],
    };

    for (const csEmail of cssEmails) {
      const checklists = await listChecklistsForCs({ csEmail, startDate, endDate });

      for (const c of checklists) {
        try {
          const evaluation = await evaluateCampaign({
            shortToken: c.short_token,
            csEmail,
          });
          await upsertCampaignCalc(evaluation);
          summary.campaigns_evaluated++;
        } catch (err) {
          console.error(`[compute] erro em ${c.short_token}:`, err.message);
          summary.campaigns_failed++;
          summary.errors.push({ short_token: c.short_token, error: err.message });
        }
      }

      // Agrega snapshot do CS
      const salary = await getSalaryForCs({ csEmail, asOfDate: endDate });
      const salaryMonthly = Number(salary?.fixed_salary_brl || 0);
      const result = await recomputeQuarterSummary({
        csEmail, quarter, versionId, salaryMonthlyBrl: salaryMonthly,
      });
      if (result.skipped) summary.quarters_skipped++;
      summary.css_processed++;
    }

    await logAudit({
      entityType: 'quarter',
      entityId: quarter,
      action: 'compute',
      changedBy: req.user.email,
      after: summary,
    });

    res.json({ ok: true, summary });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** PUT /commplan/admin/quarter/:q/:cs/approve */
router.put('/:q/:cs/approve', async (req, res) => {
  try {
    const { q: quarter, cs: csEmail } = req.params;
    const before = await getQuarterSummary({ csEmail, quarter });
    if (!before) return res.status(404).json({ error: 'snapshot não encontrado — rode /compute primeiro' });
    if (before.evidences_pending_count > 0) {
      return res.status(400).json({
        error: `há ${before.evidences_pending_count} evidências pendentes — revise antes de aprovar`,
      });
    }

    await approveQuarter({ csEmail, quarter, approvedBy: req.user.email });
    const after = await getQuarterSummary({ csEmail, quarter });

    await logAudit({
      entityType: 'quarter_summary',
      entityId: `${csEmail}:${quarter}`,
      action: 'approve',
      changedBy: req.user.email,
      before, after,
    });

    res.json({ ok: true, item: after });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/** PUT /commplan/admin/quarter/:q/:cs/mark-paid */
router.put('/:q/:cs/mark-paid', async (req, res) => {
  try {
    const { q: quarter, cs: csEmail } = req.params;
    const before = await getQuarterSummary({ csEmail, quarter });
    if (!before) return res.status(404).json({ error: 'snapshot não encontrado' });

    await markQuarterPaid({ csEmail, quarter, paidBy: req.user.email });
    const after = await getQuarterSummary({ csEmail, quarter });

    await logAudit({
      entityType: 'quarter_summary',
      entityId: `${csEmail}:${quarter}`,
      action: 'mark_paid',
      changedBy: req.user.email,
      before, after,
    });

    res.json({ ok: true, item: after });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
