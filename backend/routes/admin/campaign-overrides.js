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
import { sendEmail } from '../../lib/email.js';

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
      let decision = null;
      let decisionAt = null;
      let decisionBy = null;
      let decisionComment = null;
      let decisionSeenAt = null;
      try {
        const mc = r.manual_checks ? JSON.parse(r.manual_checks) : {};
        notes = mc.__review_notes || '';
        decision = mc.__review_decision || null;
        decisionAt = mc.__review_decision_at || null;
        decisionBy = mc.__review_decision_by || null;
        decisionComment = mc.__review_decision_comment || null;
        decisionSeenAt = mc.__review_decision_seen_at || null;
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
        // Status do pedido (substituiu o "handled"/tick)
        decision,                  // 'approved' | 'rejected' | null
        decision_at: decisionAt,
        decision_by: decisionBy,
        decision_comment: decisionComment,
        decision_seen_at: decisionSeenAt,
      };
    });

    res.json({ count: all.length, items: all });
  } catch (err) {
    console.error('GET /admin/review-requests error:', err);
    res.status(500).json({ error: err.message });
  }
});

/** PUT /admin/review-requests/:token/decision
 *  Body: { decision: 'approved' | 'rejected' | null, comment: string }
 *
 *  Substitui o antigo /handled. Admin marca um pedido de análise como
 *  APROVADO ou RECUSADO com comentário obrigatório. Notifica CS dono
 *  por email e dispara badge no painel CS.
 *
 *  - decision=null  → desfaz a decisão (limpa todos os campos __review_decision_*)
 *  - decision=approved/rejected + comment → grava decisão, dispara email
 *
 *  IMPORTANTE: NÃO mexe em __review_requested. O pedido continua existindo;
 *  só agrega a decisão do admin sobre ele. "Aprovado" é só etiqueta —
 *  override real do bônus continua manual via /admin/campaign/:token/override.
 */
router.put('/review-requests/:token/decision', async (req, res) => {
  try {
    const { token } = req.params;
    const decision = req.body?.decision; // 'approved' | 'rejected' | null
    const comment = (req.body?.comment || '').trim();
    const adminEmail = (req.user?.email || 'system').toLowerCase();

    // Valida entrada
    if (decision !== null && decision !== 'approved' && decision !== 'rejected') {
      return res.status(400).json({ error: 'decision precisa ser "approved", "rejected" ou null' });
    }
    if (decision !== null && comment.length < 5) {
      return res.status(400).json({ error: 'comentário precisa ter pelo menos 5 caracteres' });
    }

    // Descobre tabela (override ou legacy) e info da campanha pra usar no email
    const [meta] = await query(
      `SELECT is_legacy, cs_email, client_name, campaign_name
       FROM ${tableRef('commplan_checklists')}
       WHERE short_token = @t LIMIT 1`,
      { t: token }
    );
    if (!meta) {
      return res.status(404).json({ error: 'campanha não encontrada' });
    }

    const tableName = meta.is_legacy ? 'commplan_legacy_assignments' : 'commplan_command_overrides';

    // Lê o manual_checks atual
    const [existing] = await query(
      `SELECT manual_checks FROM ${tableRef(tableName)}
       WHERE short_token = @t LIMIT 1`,
      { t: token }
    );
    if (!existing) {
      return res.status(404).json({ error: 'pedido de análise não encontrado pra essa campanha' });
    }

    let mc = {};
    try { mc = existing.manual_checks ? JSON.parse(existing.manual_checks) : {}; } catch (_) {}

    // Aplica a decisão
    if (decision === null) {
      // Limpa decisão
      delete mc.__review_decision;
      delete mc.__review_decision_at;
      delete mc.__review_decision_by;
      delete mc.__review_decision_comment;
      delete mc.__review_decision_seen_at;
      delete mc.__review_decision_seen_by;
    } else {
      mc.__review_decision = decision;
      mc.__review_decision_at = new Date().toISOString();
      mc.__review_decision_by = adminEmail;
      mc.__review_decision_comment = comment;
      // Reseta o "visto" — toda nova decisão precisa ser vista de novo
      delete mc.__review_decision_seen_at;
      delete mc.__review_decision_seen_by;
    }

    // Persiste — parameterized query
    const mcJson = JSON.stringify(mc);
    await query(
      `UPDATE ${tableRef(tableName)}
       SET manual_checks = @mc,
           updated_at = CURRENT_TIMESTAMP(),
           updated_by = @by
       WHERE short_token = @t`,
      { t: token, by: adminEmail, mc: mcJson }
    );

    // Notifica CS por email (se aplicável)
    if (decision !== null && meta.cs_email) {
      try {
        const decisionLabel = decision === 'approved' ? 'APROVADO' : 'RECUSADO';
        const decisionColor = decision === 'approved' ? '#16a34a' : '#f43f5e';
        const subject = `[Compplan] Análise ${decisionLabel}: ${meta.client_name || token}`;
        const html = `
          <h2 style="color: ${decisionColor};">Análise ${decisionLabel}</h2>
          <p><strong>Campanha:</strong> ${meta.campaign_name || ''} (${token})</p>
          <p><strong>Cliente:</strong> ${meta.client_name || '—'}</p>
          <p><strong>Analisado por:</strong> ${adminEmail}</p>
          <p><strong>Comentário do admin:</strong></p>
          <blockquote style="border-left: 3px solid ${decisionColor}; padding-left: 12px; color: #555; font-style: italic;">
            ${comment.replace(/</g, '&lt;').replace(/\n/g, '<br>')}
          </blockquote>
          <p><a href="https://hypr-compplan.vercel.app/cs/campanha/${token}" style="display: inline-block; padding: 8px 16px; background: ${decisionColor}; color: white; text-decoration: none; border-radius: 6px;">
            Abrir campanha →
          </a></p>
        `;
        await sendEmail({
          to: meta.cs_email,
          subject,
          html,
          text: `Análise ${decisionLabel} por ${adminEmail}: ${comment}`,
        });
      } catch (e) {
        console.warn('Falha ao notificar CS por email:', e.message);
        // Não bloqueia a resposta — decisão já foi salva
      }
    }

    await logAudit({
      entityType: 'review_request',
      entityId: token,
      action: decision === null ? 'clear_decision' : `decision_${decision}`,
      changedBy: adminEmail,
      after: { decision, comment, at: mc.__review_decision_at || null },
    });

    res.json({
      ok: true,
      short_token: token,
      decision,
      decision_at: mc.__review_decision_at || null,
      decision_by: mc.__review_decision_by || null,
      decision_comment: mc.__review_decision_comment || null,
    });
  } catch (err) {
    console.error('PUT /admin/review-requests/:token/decision error:', err);
    res.status(500).json({ error: err.message });
  }
});
