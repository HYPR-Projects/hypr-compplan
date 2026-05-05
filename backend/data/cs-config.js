/**
 * data/cs-config.js — gestão de commplan_cs_config.
 *
 * Padrão close-and-insert: nunca fazemos UPDATE no salário. Mudança de
 * salário fecha a row vigente (effective_to=novo from - 1 dia) e insere
 * row nova com effective_to=null.
 *
 * Auditoria perfeita: histórico imutável, cálculo retroativo continua
 * pegando o salário correto via effective_from/to.
 */

import crypto from 'crypto';
import { query, tableRef, escSql } from '../lib/bigquery.js';

/**
 * Salário vigente em uma data específica (default: hoje).
 */
export async function getSalaryForCs({ csEmail, asOfDate = null }) {
  const date = asOfDate || new Date().toISOString().slice(0, 10);
  const sql = `
    SELECT *
    FROM ${tableRef('commplan_cs_config')}
    WHERE LOWER(cs_email) = LOWER(@cs)
      AND effective_from <= @d
      AND (effective_to IS NULL OR effective_to >= @d)
    ORDER BY effective_from DESC
    LIMIT 1
  `;
  const rows = await query(sql, { cs: csEmail, d: date });
  return rows[0] || null;
}

/** Lista todos os CSs com salário vigente atualmente. */
export async function listAllCurrentSalaries() {
  const today = new Date().toISOString().slice(0, 10);
  const sql = `
    SELECT *
    FROM ${tableRef('commplan_cs_config')}
    WHERE effective_from <= @d
      AND (effective_to IS NULL OR effective_to >= @d)
    ORDER BY cs_email
  `;
  return query(sql, { d: today });
}

/** Histórico completo do CS (todos os períodos). */
export async function getSalaryHistory(csEmail) {
  return query(
    `SELECT * FROM ${tableRef('commplan_cs_config')}
     WHERE LOWER(cs_email) = LOWER(@cs)
     ORDER BY effective_from DESC`,
    { cs: csEmail }
  );
}

/**
 * Define novo salário pra um CS. Faz close-and-insert:
 * 1. Fecha a row vigente (se houver) com effective_to = novoFrom - 1 dia
 * 2. Insere nova row com effective_to = null
 *
 * `effectiveFrom` = data de início do novo salário (string YYYY-MM-DD).
 */
export async function setSalary({ csEmail, fixedSalaryBrl, effectiveFrom, notes, updatedBy }) {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  // Fecha a row vigente, se houver
  const closeSql = `
    UPDATE ${tableRef('commplan_cs_config')}
    SET effective_to = DATE_SUB(@from, INTERVAL 1 DAY),
        updated_at = CURRENT_TIMESTAMP()
    WHERE LOWER(cs_email) = LOWER(@cs)
      AND effective_to IS NULL
      AND effective_from < @from
  `;
  await query(closeSql, { cs: csEmail, from: effectiveFrom });

  // Insere nova
  const insertSql = `
    INSERT INTO ${tableRef('commplan_cs_config')}
      (cs_email, fixed_salary_brl, effective_from, effective_to,
       notes, updated_by, created_at, updated_at)
    VALUES (
      ${escSql.str(csEmail.toLowerCase())},
      ${escSql.num(fixedSalaryBrl)},
      ${escSql.date(effectiveFrom)},
      NULL,
      ${escSql.str(notes)},
      ${escSql.str(updatedBy)},
      ${escSql.ts(now)},
      ${escSql.ts(now)}
    )
  `;
  await query(insertSql);
  return id;
}
