/**
 * data/evidences.js — CRUD de commplan_evidences.
 *
 * UMA linha = UM claim do CS pra UMA regra em UMA campanha. Estados:
 *   'claimed'  → CS submeteu, aguarda revisão admin
 *   'approved' → admin aprovou
 *   'rejected' → admin rejeitou
 */

import crypto from 'crypto';
import { query, tableRef, sourceTableRef, escSql } from '../lib/bigquery.js';

export async function getEvidencesByCampaign(shortToken, csEmail) {
  const sql = `
    SELECT *
    FROM ${tableRef('commplan_evidences')}
    WHERE short_token = @t AND LOWER(cs_email) = LOWER(@c)
    ORDER BY claimed_at DESC
  `;
  return query(sql, { t: shortToken, c: csEmail });
}

export async function getEvidenceById(id) {
  const rows = await query(
    `SELECT * FROM ${tableRef('commplan_evidences')} WHERE id = @id LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}

export async function listPendingEvidences() {
  return query(
    `SELECT * FROM ${tableRef('commplan_evidences')}
     WHERE status = 'claimed'
     ORDER BY claimed_at ASC`
  );
}

/**
 * CS submete claim. Falha (UNIQUE lógico) se já existe claim do mesmo CS
 * pra mesma regra na mesma campanha — caller deve checar antes ou tratar.
 */
export async function createEvidence({ shortToken, csEmail, ruleId, evidencePayload }) {
  // Checa duplicata
  const existing = await query(
    `SELECT id, status FROM ${tableRef('commplan_evidences')}
     WHERE short_token = @t AND rule_id = @r AND LOWER(cs_email) = LOWER(@c)
     LIMIT 1`,
    { t: shortToken, r: ruleId, c: csEmail }
  );
  if (existing.length > 0) {
    throw new Error(`Já existe evidência para esta regra (status=${existing[0].status})`);
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const sql = `
    INSERT INTO ${tableRef('commplan_evidences')}
      (id, short_token, cs_email, rule_id, status,
       evidence_payload, claimed_at, created_at, updated_at)
    VALUES (
      ${escSql.str(id)},
      ${escSql.str(shortToken)},
      ${escSql.str(csEmail.toLowerCase())},
      ${escSql.str(ruleId)},
      'claimed',
      ${escSql.json(evidencePayload || {})},
      ${escSql.ts(now)},
      ${escSql.ts(now)},
      ${escSql.ts(now)}
    )
  `;
  await query(sql);
  return id;
}

/**
 * CS pode editar/deletar enquanto o QUARTER da campanha ainda não foi pago.
 *
 * Implementação: dada uma evidência, descobrir o quarter da campanha (via
 * checklist.end_date) e checar se o snapshot daquele quarter está com
 * status='paid'. Se sim, congela. Caso contrário, permite edição mesmo
 * que o claim já tenha sido aprovado/rejeitado pelo admin (a edição
 * volta o status pra 'claimed' pra forçar nova revisão).
 */
async function isQuarterPaid(shortToken, csEmail) {
  const checklistRows = await query(
    `SELECT end_date FROM ${sourceTableRef('checklists')}
     WHERE short_token = @t ORDER BY created_at DESC LIMIT 1`,
    { t: shortToken }
  );
  if (checklistRows.length === 0) return false;

  const endDate = checklistRows[0].end_date?.value || checklistRows[0].end_date;
  if (!endDate) return false;

  // Mapeia data → quarter (mesma lógica do quarter-resolver, inline pra evitar import circular)
  const d = new Date(endDate);
  const q = `Q${Math.floor(d.getUTCMonth() / 3) + 1}-${d.getUTCFullYear()}`;

  const summary = await query(
    `SELECT status FROM ${tableRef('commplan_quarter_summary')}
     WHERE LOWER(cs_email) = LOWER(@c) AND quarter = @q
     ORDER BY created_at DESC LIMIT 1`,
    { c: csEmail, q }
  );
  return summary[0]?.status === 'paid';
}

export async function updateEvidence({ id, evidencePayload }) {
  const evid = await getEvidenceById(id);
  if (!evid) throw new Error('Evidência não encontrada');

  if (await isQuarterPaid(evid.short_token, evid.cs_email)) {
    throw new Error('Quarter já pago — esta evidência está congelada');
  }

  // Se já foi revisada, edição reabre o claim (volta pra 'claimed' + limpa review)
  // Isso força o admin a revisar de novo, evitando que CS "engane" mudando
  // o conteúdo após aprovação.
  const reopenSql = evid.status !== 'claimed' ? `
    , status = 'claimed',
      reviewed_by = NULL,
      reviewed_at = NULL,
      review_notes = NULL
  ` : '';

  const sql = `
    UPDATE ${tableRef('commplan_evidences')}
    SET evidence_payload = ${escSql.json(evidencePayload || {})}
        ${reopenSql},
        updated_at = CURRENT_TIMESTAMP()
    WHERE id = @id
  `;
  await query(sql, { id });
  return { reopened: evid.status !== 'claimed' };
}

export async function deleteEvidence(id) {
  const evid = await getEvidenceById(id);
  if (!evid) return;
  if (await isQuarterPaid(evid.short_token, evid.cs_email)) {
    throw new Error('Quarter já pago — esta evidência está congelada');
  }
  await query(`DELETE FROM ${tableRef('commplan_evidences')} WHERE id = @id`, { id });
}

export async function approveEvidence({ id, reviewedBy, reviewNotes }) {
  const sql = `
    UPDATE ${tableRef('commplan_evidences')}
    SET status = 'approved',
        reviewed_by = ${escSql.str(reviewedBy)},
        reviewed_at = CURRENT_TIMESTAMP(),
        review_notes = ${escSql.str(reviewNotes)},
        updated_at = CURRENT_TIMESTAMP()
    WHERE id = @id
  `;
  await query(sql, { id });
}

export async function rejectEvidence({ id, reviewedBy, reviewNotes }) {
  const sql = `
    UPDATE ${tableRef('commplan_evidences')}
    SET status = 'rejected',
        reviewed_by = ${escSql.str(reviewedBy)},
        reviewed_at = CURRENT_TIMESTAMP(),
        review_notes = ${escSql.str(reviewNotes)},
        updated_at = CURRENT_TIMESTAMP()
    WHERE id = @id
  `;
  await query(sql, { id });
}
