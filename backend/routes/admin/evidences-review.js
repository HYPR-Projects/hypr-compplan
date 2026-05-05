/**
 * routes/admin/evidences-review.js — admin aprova/rejeita claims dos CSs.
 */
import { Router } from 'express';
import { authRequired, adminRequired } from '../../middleware/auth.js';
import { logAudit } from '../../lib/audit.js';
import {
  listPendingEvidences, getEvidenceById,
  approveEvidence, rejectEvidence,
} from '../../data/evidences.js';

export const router = Router();
router.use(authRequired, adminRequired);

/** GET /commplan/admin/evidences/pending */
router.get('/pending', async (req, res) => {
  try {
    const items = await listPendingEvidences();
    res.json({ count: items.length, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/:id/approve', async (req, res) => {
  try {
    const before = await getEvidenceById(req.params.id);
    if (!before) return res.status(404).json({ error: 'evidência não encontrada' });
    if (before.status !== 'claimed') {
      return res.status(400).json({ error: `evidência já está em status "${before.status}"` });
    }

    await approveEvidence({
      id: req.params.id,
      reviewedBy: req.user.email,
      reviewNotes: req.body?.review_notes,
    });
    const after = await getEvidenceById(req.params.id);

    await logAudit({
      entityType: 'evidence', entityId: req.params.id, action: 'approve',
      changedBy: req.user.email,
      before, after,
    });

    res.json({ ok: true, item: after });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id/reject', async (req, res) => {
  try {
    const before = await getEvidenceById(req.params.id);
    if (!before) return res.status(404).json({ error: 'evidência não encontrada' });
    if (before.status !== 'claimed') {
      return res.status(400).json({ error: `evidência já está em status "${before.status}"` });
    }
    if (!req.body?.review_notes) {
      return res.status(400).json({ error: 'review_notes obrigatório ao rejeitar' });
    }

    await rejectEvidence({
      id: req.params.id,
      reviewedBy: req.user.email,
      reviewNotes: req.body.review_notes,
    });
    const after = await getEvidenceById(req.params.id);

    await logAudit({
      entityType: 'evidence', entityId: req.params.id, action: 'reject',
      changedBy: req.user.email,
      before, after,
    });

    res.json({ ok: true, item: after });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
