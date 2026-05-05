/**
 * data/mentorships.js — gestão de commplan_mentorships.
 */

import crypto from 'crypto';
import { query, tableRef, escSql } from '../lib/bigquery.js';

/**
 * Acha mentoria ativa pra um mentee numa data específica.
 * Retorna o registro ou null.
 */
export async function findActiveMentorship({ menteeEmail, asOfDate }) {
  const date = typeof asOfDate === 'string' ? asOfDate : asOfDate.toISOString().slice(0, 10);
  const sql = `
    SELECT *
    FROM ${tableRef('commplan_mentorships')}
    WHERE LOWER(mentee_email) = LOWER(@m)
      AND effective_from <= @d
      AND (effective_to IS NULL OR effective_to >= @d)
    ORDER BY effective_from DESC
    LIMIT 1
  `;
  const rows = await query(sql, { m: menteeEmail, d: date });
  return rows[0] || null;
}

export async function listAllMentorships() {
  return query(
    `SELECT * FROM ${tableRef('commplan_mentorships')}
     WHERE effective_to IS NULL OR effective_to >= CURRENT_DATE()
     ORDER BY mentor_email, mentee_email`
  );
}

export async function createMentorship({ mentorEmail, menteeEmail, effectiveFrom, notes }) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const sql = `
    INSERT INTO ${tableRef('commplan_mentorships')}
      (id, mentor_email, mentee_email, effective_from, effective_to, notes, created_at)
    VALUES (
      ${escSql.str(id)},
      ${escSql.str(mentorEmail.toLowerCase())},
      ${escSql.str(menteeEmail.toLowerCase())},
      ${escSql.date(effectiveFrom)},
      NULL,
      ${escSql.str(notes)},
      ${escSql.ts(now)}
    )
  `;
  await query(sql);
  return id;
}

/** Encerra mentoria (sem deletar — mantém histórico). */
export async function endMentorship({ id, effectiveTo }) {
  const sql = `
    UPDATE ${tableRef('commplan_mentorships')}
    SET effective_to = @to
    WHERE id = @id
  `;
  await query(sql, { id, to: effectiveTo });
}
