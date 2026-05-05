/**
 * routes/admin/cs-config.js — gestão de salários dos CSs.
 *
 * Caminho UX: ver lista → clicar [🔄 Atualizar] → modal de novo salário
 * Toda mudança vai pro audit log.
 */

import { Router } from 'express';
import { authRequired, adminRequired } from '../../middleware/auth.js';
import { logAudit } from '../../lib/audit.js';
import {
  listAllCurrentSalaries, getSalaryHistory, getSalaryForCs, setSalary,
} from '../../data/cs-config.js';

export const router = Router();
router.use(authRequired, adminRequired);

/** GET /commplan/admin/cs-config — lista CSs com salário vigente. */
router.get('/', async (req, res) => {
  try {
    const rows = await listAllCurrentSalaries();
    res.json({ count: rows.length, items: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /commplan/admin/cs-config/:email/history — histórico do CS. */
router.get('/:email/history', async (req, res) => {
  try {
    const rows = await getSalaryHistory(req.params.email);
    res.json({ cs_email: req.params.email, history: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /commplan/admin/cs-config — define/atualiza salário (close-and-insert).
 * Body: { cs_email, fixed_salary_brl, effective_from, notes? }
 */
router.post('/', async (req, res) => {
  try {
    const { cs_email, fixed_salary_brl, effective_from, notes } = req.body;
    if (!cs_email || fixed_salary_brl == null || !effective_from) {
      return res.status(400).json({
        error: 'cs_email, fixed_salary_brl e effective_from são obrigatórios',
      });
    }

    const before = await getSalaryForCs({ csEmail: cs_email, asOfDate: effective_from });

    await setSalary({
      csEmail: cs_email,
      fixedSalaryBrl: fixed_salary_brl,
      effectiveFrom: effective_from,
      notes,
      updatedBy: req.user.email,
    });

    const after = await getSalaryForCs({ csEmail: cs_email, asOfDate: effective_from });

    await logAudit({
      entityType: 'cs_config',
      entityId: cs_email,
      action: before ? 'update' : 'create',
      changedBy: req.user.email,
      before,
      after,
      notes,
    });

    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
