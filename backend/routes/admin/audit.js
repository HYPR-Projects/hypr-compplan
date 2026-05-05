/**
 * routes/admin/audit.js — read-only do audit log.
 */
import { Router } from 'express';
import { authRequired, adminRequired } from '../../middleware/auth.js';
import { listAudit } from '../../lib/audit.js';

export const router = Router();
router.use(authRequired, adminRequired);

router.get('/', async (req, res) => {
  try {
    const items = await listAudit({
      entityType: req.query.entity_type,
      entityId: req.query.entity_id,
      changedBy: req.query.changed_by,
      since: req.query.since,
      until: req.query.until,
      limit: req.query.limit,
    });
    res.json({ count: items.length, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
