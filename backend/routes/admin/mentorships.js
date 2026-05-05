/**
 * routes/admin/mentorships.js
 */
import { Router } from 'express';
import { authRequired, adminRequired } from '../../middleware/auth.js';
import { logAudit } from '../../lib/audit.js';
import {
  listAllMentorships, createMentorship, endMentorship,
} from '../../data/mentorships.js';

export const router = Router();
router.use(authRequired, adminRequired);

router.get('/', async (req, res) => {
  try {
    const items = await listAllMentorships();
    res.json({ count: items.length, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { mentor_email, mentee_email, effective_from, notes } = req.body;
    if (!mentor_email || !mentee_email || !effective_from) {
      return res.status(400).json({ error: 'mentor_email, mentee_email e effective_from obrigatórios' });
    }
    const id = await createMentorship({
      mentorEmail: mentor_email,
      menteeEmail: mentee_email,
      effectiveFrom: effective_from,
      notes,
    });
    await logAudit({
      entityType: 'mentorship', entityId: id, action: 'create',
      changedBy: req.user.email,
      after: { mentor_email, mentee_email, effective_from, notes },
    });
    res.status(201).json({ ok: true, id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    await endMentorship({ id: req.params.id, effectiveTo: today });
    await logAudit({
      entityType: 'mentorship', entityId: req.params.id, action: 'deactivate',
      changedBy: req.user.email,
      after: { ended_at: today },
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
