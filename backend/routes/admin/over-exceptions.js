/**
 * routes/admin/over-exceptions.js — gestão das exceções de OVER.
 *
 * Endpoints:
 *   GET    /commplan/admin/over-exceptions          → lista
 *   POST   /commplan/admin/over-exceptions          → adiciona { client_name, notes? }
 *   DELETE /commplan/admin/over-exceptions/:name    → remove (case-insensitive)
 */

import { Router } from 'express';
import { authRequired, adminRequired } from '../../middleware/auth.js';
import { logAudit } from '../../lib/audit.js';
import {
  listOverExceptions, addOverException, removeOverException,
} from '../../data/over-exceptions.js';

export const router = Router();
router.use(authRequired, adminRequired);

router.get('/', async (req, res) => {
  try {
    const items = await listOverExceptions();
    res.json({ count: items.length, items });
  } catch (err) {
    console.error('GET /admin/over-exceptions:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { client_name, notes } = req.body || {};
    const item = await addOverException({
      clientName: client_name,
      notes,
      addedBy: req.user.email,
    });

    await logAudit({
      entityType: 'over_exception',
      entityId: item.client_name.toLowerCase(),
      action: 'create',
      changedBy: req.user.email,
      before: null,
      after: item,
    });

    res.status(201).json({ ok: true, item });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:name', async (req, res) => {
  try {
    const name = decodeURIComponent(req.params.name);
    const removed = await removeOverException(name);
    if (!removed) return res.status(404).json({ error: 'cliente não encontrado' });

    await logAudit({
      entityType: 'over_exception',
      entityId: name.toLowerCase(),
      action: 'delete',
      changedBy: req.user.email,
      before: removed,
      after: null,
    });

    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
