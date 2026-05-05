/**
 * routes/admin/legacy-assignments.js — gestão de campanhas legadas.
 *
 * Endpoints:
 *   GET    /commplan/admin/legacy/pending         → lista campanhas legadas sem atribuição
 *   GET    /commplan/admin/legacy/all             → lista TODAS atribuições já feitas
 *   POST   /commplan/admin/legacy/assign          → cria/atualiza UMA atribuição
 *   POST   /commplan/admin/legacy/assign-batch    → cria/atualiza múltiplas (UX em lote)
 *   DELETE /commplan/admin/legacy/:shortToken     → remove atribuição (volta pra pendente)
 *
 * Permissões: adminRequired (vide middleware).
 */

import express from 'express';
import { adminRequired } from '../../middleware/auth.js';
import { query, tableRef, escSql, PROJECT_ID, DATASET } from '../../lib/bigquery.js';
import { logAudit } from '../../lib/audit.js';

export const router = express.Router();
router.use(adminRequired);

// ─── GET /pending — campanhas legadas sem atribuição ─────────────────────
//
// Retorna campos suficientes pra admin decidir qual CS deve cuidar:
//   short_token, client_name, campaign_name, cp_name, datas, valores
//
// Frontend ordena por start_date DESC. Performance OK pra ~100 linhas.
router.get('/pending', async (req, res, next) => {
  try {
    const rows = await query(`
      SELECT * FROM ${tableRef('commplan_pending_legacy')}
    `);
    res.json({ pending: rows, total: rows.length });
  } catch (err) { next(err); }
});

// ─── GET /all — atribuições já feitas (auditoria + permite editar) ───────
router.get('/all', async (req, res, next) => {
  try {
    const rows = await query(`
      SELECT
        la.short_token,
        la.cs_email,
        la.features_manual,
        la.products_manual,
        la.audiences_count,
        la.had_cs_meeting,
        la.studies_used,
        la.source_attribution,
        la.attributed_by,
        la.attributed_at,
        la.updated_by,
        la.updated_at,
        la.notes,
        -- Dados da campanha (junta com checklist_info pra mostrar contexto)
        ci.client_name,
        ci.campaign_name,
        ci.salesman AS cp_name,
        ci.start_date,
        ci.end_date,
        ci.total_value
      FROM ${tableRef('commplan_legacy_assignments')} la
      LEFT JOIN \`${PROJECT_ID}.prod_assets.checklist_info\` ci
        ON la.short_token = ci.short_token
      ORDER BY la.attributed_at DESC
    `);
    res.json({ assignments: rows, total: rows.length });
  } catch (err) { next(err); }
});

// ─── POST /assign — cria/atualiza UMA atribuição ─────────────────────────
//
// Body:
//   short_token        STRING (obrigatório)
//   cs_email           STRING (obrigatório)
//   features_manual    ARRAY<STRING> (opcional)
//   products_manual    ARRAY<STRING> (opcional)
//   audiences_count    INT64 (opcional)
//   had_cs_meeting     BOOL (opcional)
//   studies_used       ARRAY<STRING> (opcional)
//   notes              STRING (opcional)
//
// Idempotente: se short_token já tem atribuição, faz UPDATE.
router.post('/assign', async (req, res, next) => {
  try {
    const {
      short_token, cs_email,
      features_manual = null, products_manual = null,
      audiences_count = null, had_cs_meeting = null, studies_used = null,
      notes = null,
    } = req.body;

    if (!short_token) return res.status(400).json({ error: 'short_token obrigatório' });
    if (!cs_email)    return res.status(400).json({ error: 'cs_email obrigatório' });

    const adminEmail = req.user.email;
    await upsertAssignment({
      short_token,
      cs_email: cs_email.toLowerCase().trim(),
      features_manual,
      products_manual,
      audiences_count,
      had_cs_meeting,
      studies_used,
      notes,
      adminEmail,
    });

    await logAudit({
      changedBy: adminEmail,
      action: 'legacy_assign',
      entityType: 'legacy_assignment',
      entityId: short_token,
      after: { cs_email, features_manual, products_manual, audiences_count, had_cs_meeting, studies_used },
    });

    res.json({ ok: true, short_token });
  } catch (err) { next(err); }
});

// ─── POST /assign-batch — atribuições em lote (UX rápida) ────────────────
//
// Body: { assignments: [{short_token, cs_email, ...}, ...] }
//
// Cada item mesma estrutura de /assign. Retorna { ok, results: [{short_token, ok, error?}] }.
// Aplica em paralelo até 10 ao mesmo tempo (limita pressão no BQ).
router.post('/assign-batch', async (req, res, next) => {
  try {
    const { assignments } = req.body;
    if (!Array.isArray(assignments) || assignments.length === 0) {
      return res.status(400).json({ error: 'assignments deve ser array não-vazio' });
    }

    const adminEmail = req.user.email;
    const results = [];

    // Limita concurrency a 10 pra não sobrecarregar BQ
    const CHUNK = 10;
    for (let i = 0; i < assignments.length; i += CHUNK) {
      const slice = assignments.slice(i, i + CHUNK);
      const settled = await Promise.allSettled(
        slice.map(a => upsertAssignment({
          short_token: a.short_token,
          cs_email: (a.cs_email || '').toLowerCase().trim(),
          features_manual: a.features_manual ?? null,
          products_manual: a.products_manual ?? null,
          audiences_count: a.audiences_count ?? null,
          had_cs_meeting: a.had_cs_meeting ?? null,
          studies_used: a.studies_used ?? null,
          notes: a.notes ?? null,
          adminEmail,
        }))
      );

      settled.forEach((r, idx) => {
        const a = slice[idx];
        if (r.status === 'fulfilled') {
          results.push({ short_token: a.short_token, ok: true });
        } else {
          results.push({ short_token: a.short_token, ok: false, error: r.reason?.message });
        }
      });
    }

    // Audit única do batch
    await logAudit({
      changedBy: adminEmail,
      action: 'legacy_assign_batch',
      entityType: 'legacy_assignment',
      entityId: `batch:${assignments.length}`,
      after: { count: assignments.length, ok: results.filter(r => r.ok).length },
    });

    res.json({
      ok: true,
      total: assignments.length,
      succeeded: results.filter(r => r.ok).length,
      failed: results.filter(r => !r.ok).length,
      results,
    });
  } catch (err) { next(err); }
});

// ─── DELETE /:shortToken — remove atribuição ─────────────────────────────
router.delete('/:shortToken', async (req, res, next) => {
  try {
    const { shortToken } = req.params;
    const adminEmail = req.user.email;

    // Pega o estado anterior pro audit
    const [existing] = await query(
      `SELECT * FROM ${tableRef('commplan_legacy_assignments')} WHERE short_token = @t LIMIT 1`,
      { t: shortToken }
    );
    if (!existing) return res.status(404).json({ error: 'atribuição não encontrada' });

    await query(
      `DELETE FROM ${tableRef('commplan_legacy_assignments')} WHERE short_token = @t`,
      { t: shortToken }
    );

    await logAudit({
      changedBy: adminEmail,
      action: 'legacy_unassign',
      entityType: 'legacy_assignment',
      entityId: shortToken,
      before: existing,
    });

    res.json({ ok: true });
  } catch (err) { next(err); }
});

// ─── upsert helper ───────────────────────────────────────────────────────
async function upsertAssignment({
  short_token, cs_email,
  features_manual, products_manual,
  audiences_count, had_cs_meeting, studies_used,
  notes, adminEmail,
}) {
  const [existing] = await query(
    `SELECT short_token FROM ${tableRef('commplan_legacy_assignments')}
     WHERE short_token = @t LIMIT 1`,
    { t: short_token }
  );

  // Helpers pra arrays/null em SQL inline
  const arr = v => v == null ? 'NULL'
    : `[${(v || []).map(s => escSql.str(s)).join(', ')}]`;
  const intOrNull = v => v == null ? 'NULL' : String(parseInt(v));
  const boolOrNull = v => v == null ? 'NULL' : (v ? 'TRUE' : 'FALSE');
  const strOrNull = v => v == null ? 'NULL' : escSql.str(v);

  if (existing) {
    // UPDATE
    const sql = `
      UPDATE ${tableRef('commplan_legacy_assignments')}
      SET cs_email           = ${escSql.str(cs_email)},
          features_manual    = ${arr(features_manual)},
          products_manual    = ${arr(products_manual)},
          audiences_count    = ${intOrNull(audiences_count)},
          had_cs_meeting     = ${boolOrNull(had_cs_meeting)},
          studies_used       = ${arr(studies_used)},
          notes              = ${strOrNull(notes)},
          updated_by         = ${escSql.str(adminEmail)},
          updated_at         = CURRENT_TIMESTAMP()
      WHERE short_token = ${escSql.str(short_token)}
    `;
    await query(sql);
    return { updated: true };
  }

  // INSERT
  const sql = `
    INSERT INTO ${tableRef('commplan_legacy_assignments')}
      (short_token, cs_email,
       features_manual, products_manual, audiences_count, had_cs_meeting, studies_used,
       source_attribution, attributed_by, attributed_at, notes)
    VALUES (
      ${escSql.str(short_token)},
      ${escSql.str(cs_email)},
      ${arr(features_manual)},
      ${arr(products_manual)},
      ${intOrNull(audiences_count)},
      ${boolOrNull(had_cs_meeting)},
      ${arr(studies_used)},
      ${escSql.str('manual')},
      ${escSql.str(adminEmail)},
      CURRENT_TIMESTAMP(),
      ${strOrNull(notes)}
    )
  `;
  await query(sql);
  return { created: true };
}
