/**
 * routes/admin/campaign-overrides.js
 *
 * Permite ao admin forçar earned/not_earned de items específicos
 * ou validade do setup, independente do que o sistema calculou.
 *
 * Body: { admin_overrides: {...JSON...}, reason?, force_setup?: 'auto'|'valid'|'invalid' }
 *
 * O JSON admin_overrides tem o formato:
 *   {
 *     "<item_id>": { "earned": bool, "reason": "...", "by": "...", "at": "..." },
 *     "__setup_force": "auto" | "valid" | "invalid",
 *     "__setup_force_meta": { "reason": "...", "by": "...", "at": "..." }
 *   }
 */

import { Router } from 'express';
import { authRequired, adminRequired } from '../../middleware/auth.js';
import { query, tableRef } from '../../lib/bigquery.js';
import { logAudit } from '../../lib/audit.js';

export const router = Router();
router.use(authRequired, adminRequired);

/** PUT /admin/campaign/:token/override
 *  Body: { item_id?, earned?, force_setup?, reason? }
 *  Modos:
 *    - item override: { item_id: "am_loom", earned: true, reason: "..." }
 *    - clear item: { item_id: "am_loom", earned: null }
 *    - setup force: { force_setup: "valid" | "invalid" | "auto", reason: "..." }
 */
router.put('/campaign/:token/override', async (req, res) => {
  try {
    const { token } = req.params;
    const { item_id, earned, force_setup, reason } = req.body || {};
    const adminEmail = req.user.email;
    const now = new Date().toISOString();

    // Busca campanha + override atual
    const [campaign] = await query(
      `SELECT short_token, is_legacy, client_name FROM ${tableRef('commplan_checklists')}
       WHERE short_token = @t LIMIT 1`,
      { t: token }
    );
    if (!campaign) return res.status(404).json({ error: 'campanha não encontrada' });

    const table = campaign.is_legacy ? 'commplan_legacy_assignments' : 'commplan_command_overrides';
    const [row] = await query(
      `SELECT admin_overrides FROM ${tableRef(table)} WHERE short_token = @t LIMIT 1`,
      { t: token }
    );
    const current = row?.admin_overrides ? JSON.parse(row.admin_overrides) : {};
    const before = JSON.parse(JSON.stringify(current));

    // Aplica mudança
    if (item_id) {
      if (earned === null) {
        delete current[item_id];
      } else if (typeof earned === 'boolean') {
        current[item_id] = {
          earned,
          reason: reason || null,
          by: adminEmail,
          at: now,
        };
      } else {
        return res.status(400).json({ error: 'earned deve ser true, false ou null' });
      }
    } else if (force_setup) {
      if (!['auto', 'valid', 'invalid'].includes(force_setup)) {
        return res.status(400).json({ error: 'force_setup deve ser auto/valid/invalid' });
      }
      if (force_setup === 'auto') {
        delete current.__setup_force;
        delete current.__setup_force_meta;
      } else {
        current.__setup_force = force_setup;
        current.__setup_force_meta = {
          reason: reason || null,
          by: adminEmail,
          at: now,
        };
      }
    } else {
      return res.status(400).json({ error: 'item_id ou force_setup obrigatório' });
    }

    const overridesJson = JSON.stringify(current);

    // Persiste — usa MERGE pra criar a row se não existir (override sem CS atribuído)
    if (campaign.is_legacy) {
      await query(
        `UPDATE ${tableRef(table)}
         SET admin_overrides = @ov, admin_overrides_by = @by, admin_overrides_at = CURRENT_TIMESTAMP()
         WHERE short_token = @t`,
        { ov: overridesJson, by: adminEmail, t: token }
      );
    } else {
      await query(
        `MERGE ${tableRef(table)} T
         USING (SELECT @t AS short_token) S
         ON T.short_token = S.short_token
         WHEN MATCHED THEN UPDATE SET
           admin_overrides = @ov,
           admin_overrides_by = @by,
           admin_overrides_at = CURRENT_TIMESTAMP(),
           updated_at = CURRENT_TIMESTAMP()
         WHEN NOT MATCHED THEN INSERT
           (short_token, admin_overrides, admin_overrides_by, admin_overrides_at,
            created_at, updated_at, updated_by)
         VALUES
           (@t, @ov, @by, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP(), @by)`,
        { t: token, ov: overridesJson, by: adminEmail }
      );
    }

    await logAudit({
      entityType: 'admin_override',
      entityId: token,
      action: 'update',
      changedBy: adminEmail,
      before,
      after: current,
    });

    res.json({ ok: true, admin_overrides: current });
  } catch (err) {
    console.error('PUT /admin/campaign/:token/override error:', err);
    res.status(500).json({ error: err.message });
  }
});

/** GET /admin/review-requests
 *  Lista campanhas em que o CS pediu análise (manual_checks.__review_requested === true).
 */
router.get('/review-requests', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 50, 200);
    // Olha em ambas as tabelas
    const overrideRows = await query(
      `SELECT
         c.short_token, c.client_name, c.campaign_name, c.cs_email, c.cs_name,
         c.start_date, c.end_date, FALSE AS is_legacy,
         o.manual_checks, o.updated_at, o.updated_by
       FROM ${tableRef('commplan_checklists')} c
       INNER JOIN ${tableRef('commplan_command_overrides')} o ON c.short_token = o.short_token
       WHERE JSON_VALUE(o.manual_checks, '$.__review_requested') = 'true'
       ORDER BY o.updated_at DESC
       LIMIT @lim`,
      { lim: limit }
    );
    const legacyRows = await query(
      `SELECT
         c.short_token, c.client_name, c.campaign_name, c.cs_email, c.cs_name,
         c.start_date, c.end_date, TRUE AS is_legacy,
         la.manual_checks, la.updated_at, la.updated_by
       FROM ${tableRef('commplan_checklists')} c
       INNER JOIN ${tableRef('commplan_legacy_assignments')} la ON c.short_token = la.short_token
       WHERE JSON_VALUE(la.manual_checks, '$.__review_requested') = 'true'
       ORDER BY la.updated_at DESC
       LIMIT @lim`,
      { lim: limit }
    );

    const all = [...overrideRows, ...legacyRows].map(r => {
      let notes = '';
      try {
        const mc = r.manual_checks ? JSON.parse(r.manual_checks) : {};
        notes = mc.__review_notes || '';
      } catch (_) {}
      return {
        short_token: r.short_token,
        client_name: r.client_name,
        campaign_name: r.campaign_name,
        cs_email: r.cs_email,
        cs_name: r.cs_name,
        start_date: r.start_date?.value || r.start_date,
        end_date: r.end_date?.value || r.end_date,
        is_legacy: !!r.is_legacy,
        requested_by: r.updated_by,
        requested_at: r.updated_at?.value || r.updated_at,
        notes,
      };
    });

    res.json({ count: all.length, items: all });
  } catch (err) {
    console.error('GET /admin/review-requests error:', err);
    res.status(500).json({ error: err.message });
  }
});
