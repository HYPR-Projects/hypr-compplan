/**
 * routes/admin/abs-clients.js
 */
import { Router } from 'express';
import { authRequired, adminRequired } from '../../middleware/auth.js';
import { logAudit } from '../../lib/audit.js';
import {
  listAbsClients, addAbsClient, deactivateAbsClient,
} from '../../data/abs-clients.js';

export const router = Router();
router.use(authRequired, adminRequired);

router.get('/', async (req, res) => {
  try {
    const items = await listAbsClients();
    // Agrupa por client_group pra UI
    const grouped = {};
    for (const it of items) {
      const k = it.client_group || 'Outros';
      (grouped[k] = grouped[k] || []).push(it);
    }
    res.json({ count: items.length, items, grouped });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { advertiser_id, client_group, display_name, via_partner, notes } = req.body;
    if (!advertiser_id || !client_group || !display_name) {
      return res.status(400).json({
        error: 'advertiser_id, client_group e display_name obrigatórios',
      });
    }
    await addAbsClient({
      advertiserId: advertiser_id,
      clientGroup: client_group,
      displayName: display_name,
      viaPartner: via_partner,
      notes,
    });
    await logAudit({
      entityType: 'abs_client', entityId: advertiser_id, action: 'create',
      changedBy: req.user.email,
      after: { advertiser_id, client_group, display_name, via_partner },
    });
    res.status(201).json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete('/:advertiser_id', async (req, res) => {
  try {
    await deactivateAbsClient(req.params.advertiser_id);
    await logAudit({
      entityType: 'abs_client', entityId: req.params.advertiser_id, action: 'deactivate',
      changedBy: req.user.email,
    });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
