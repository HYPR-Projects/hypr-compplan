/**
 * routes/me.js — endpoints onde o CS vê o próprio bônus.
 *
 * Permissões:
 *   - CS só pode ver dados onde cs_email = req.user.email
 *   - Admin pode passar ?cs_email=... pra ver de outro
 */

import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { parseQuarter, currentQuarter } from '../engine/quarter-resolver.js';
import { evaluateCampaign } from '../engine/index.js';
import { listChecklistsForCs } from '../data/checklists.js';
import { getQuarterSummary, getCampaignCalcsByQuarter } from '../data/snapshots.js';
import { getSalaryForCs } from '../data/cs-config.js';
import { resolveVersion } from '../lib/version-resolver.js';

export const router = Router();

router.use(authRequired);

/** Retorna o cs_email "alvo" da request — próprio se CS, ou query param se admin. */
function resolveTargetCs(req) {
  const target = (req.query.cs_email || req.user.email).toLowerCase();
  if (req.user.role !== 'admin' && target !== req.user.email) {
    return null; // CS não pode ver outro
  }
  return target;
}

/**
 * GET /commplan/me/quarter/:q
 * Resumo do quarter pro CS atual (ou outro, se admin).
 *
 * Se já existe snapshot, retorna ele. Senão, calcula on-the-fly (read-mostly).
 */
router.get('/quarter/:q', async (req, res) => {
  try {
    const cs = resolveTargetCs(req);
    if (!cs) return res.status(403).json({ error: 'sem permissão' });

    const quarter = req.params.q;
    parseQuarter(quarter); // valida formato

    const summary = await getQuarterSummary({ csEmail: cs, quarter });
    const calcs = await getCampaignCalcsByQuarter({ csEmail: cs, quarter });

    res.json({
      quarter,
      cs_email: cs,
      summary, // pode ser null se ainda não calculado
      campaigns: calcs,
    });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /commplan/me/campaigns/:q
 * Lista campanhas do CS no quarter, com avaliação on-the-fly de cada uma.
 *
 * Útil pro CS ver o estado atual antes de o admin fechar o quarter.
 */
router.get('/campaigns/:q', async (req, res) => {
  try {
    const cs = resolveTargetCs(req);
    if (!cs) return res.status(403).json({ error: 'sem permissão' });

    const quarter = req.params.q;
    const { startDate, endDate } = parseQuarter(quarter);

    const checklists = await listChecklistsForCs({
      csEmail: cs, startDate, endDate,
    });

    // Avalia cada campanha em paralelo (modesto: tipicamente <30 campanhas/CS/quarter)
    const evaluations = await Promise.all(
      checklists.map(c =>
        evaluateCampaign({ shortToken: c.short_token, csEmail: cs })
          .catch(err => ({ error: err.message, short_token: c.short_token }))
      )
    );

    res.json({ quarter, cs_email: cs, count: evaluations.length, campaigns: evaluations });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * GET /commplan/me/history
 * Lista quarters anteriores onde o CS tem snapshots.
 */
router.get('/history', async (req, res) => {
  try {
    const cs = resolveTargetCs(req);
    if (!cs) return res.status(403).json({ error: 'sem permissão' });

    const { query } = await import('../lib/bigquery.js');
    const { tableRef } = await import('../lib/bigquery.js');
    const rows = await query(`
      SELECT quarter, status, bonus_gross_brl, bonus_net_brl, campaigns_count,
             approved_at, paid_at
      FROM ${tableRef('commplan_quarter_summary')}
      WHERE LOWER(cs_email) = LOWER(@c)
      ORDER BY quarter DESC
    `, { c: cs });

    res.json({ cs_email: cs, history: rows });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
