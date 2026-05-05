/**
 * routes/admin/rules.js — CRUD de regras (Caminho B: edição segura).
 *
 * PUT só edita: bonus_pct, display_name, display_order, active, cap_max_pct
 * POST cria APENAS rules tipo 'manual_claim' (caminho seguro)
 */

import { Router } from 'express';
import { authRequired, adminRequired } from '../../middleware/auth.js';
import { logAudit } from '../../lib/audit.js';
import {
  getRulesByVersion, getRuleById, updateRuleSafe, createManualClaimRule,
} from '../../data/rules.js';
import { resolveVersion } from '../../lib/version-resolver.js';

export const router = Router();
router.use(authRequired, adminRequired);

/** GET /commplan/admin/rules?version=2026 */
router.get('/', async (req, res) => {
  try {
    const versionId = req.query.version || await resolveVersion(new Date().toISOString().slice(0, 10));
    const rows = await getRulesByVersion(versionId);
    res.json({ version_id: versionId, count: rows.length, items: rows });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/** GET /commplan/admin/rules/:id */
router.get('/:id', async (req, res) => {
  try {
    const rule = await getRuleById(req.params.id);
    if (!rule) return res.status(404).json({ error: 'regra não encontrada' });
    res.json(rule);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /commplan/admin/rules/:id — edição segura.
 * Body: subset de { display_name, bonus_pct, display_order, active, cap_max_pct }
 */
router.put('/:id', async (req, res) => {
  try {
    const before = await getRuleById(req.params.id);
    if (!before) return res.status(404).json({ error: 'regra não encontrada' });

    await updateRuleSafe(req.params.id, req.body || {});
    const after = await getRuleById(req.params.id);

    await logAudit({
      entityType: 'rule',
      entityId: req.params.id,
      action: 'update',
      changedBy: req.user.email,
      before,
      after,
    });

    res.json({ ok: true, item: after });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * POST /commplan/admin/rules — cria nova regra manual.
 * Body: { version_id, category, subcategory?, display_name, bonus_pct,
 *         display_order?, cap_group?, cap_max_pct?, exclusion_group?, description? }
 */
router.post('/', async (req, res) => {
  try {
    const { version_id, category, display_name, bonus_pct } = req.body;
    if (!version_id || !category || !display_name || bonus_pct == null) {
      return res.status(400).json({
        error: 'version_id, category, display_name e bonus_pct são obrigatórios',
      });
    }

    const id = await createManualClaimRule({
      versionId: version_id,
      category,
      subcategory: req.body.subcategory,
      displayName: display_name,
      bonusPct: bonus_pct,
      displayOrder: req.body.display_order,
      capGroup: req.body.cap_group,
      capMaxPct: req.body.cap_max_pct,
      exclusionGroup: req.body.exclusion_group,
      description: req.body.description,
    });

    const created = await getRuleById(id);

    await logAudit({
      entityType: 'rule',
      entityId: id,
      action: 'create',
      changedBy: req.user.email,
      before: null,
      after: created,
    });

    res.status(201).json({ ok: true, id, item: created });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
