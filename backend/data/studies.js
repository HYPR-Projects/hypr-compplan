/**
 * data/studies.js — gerencia commplan_studies_catalog.
 *
 * Catálogo de estudos sazonais/temáticos disponíveis pra uso em campanhas.
 * Cada estudo tem um autor (CS responsável) que recebe o bônus quando o
 * estudo é marcado como usado em alguma campanha.
 *
 * Espelha a planilha:
 *   Estudo | CS Responsável | Data Comemoração | Previsão | Status | Link
 */

import crypto from 'crypto';
import { query, tableRef, escSql, TTLCache } from '../lib/bigquery.js';

const cache = new TTLCache(5 * 60_000); // 5min

/** Lookup direto por id, usado no evaluator. */
export async function getStudyById(id, versionId) {
  const cacheKey = `study:${versionId}:${id}`;
  const cached = cache.get(cacheKey);
  if (cached !== null) return cached;

  const sql = `
    SELECT *
    FROM ${tableRef('commplan_studies_catalog')}
    WHERE id = @id AND version_id = @v AND active = TRUE
    LIMIT 1
  `;
  const rows = await query(sql, { id, v: versionId });
  const result = rows[0] || null;
  cache.set(cacheKey, result);
  return result;
}

/**
 * Lookup por display_name (case-insensitive).
 * Usado quando o Command grava o nome do estudo (Copa do Mundo) em vez do id.
 * Retorna { id, display_name, author_email, ... } ou null.
 */
export async function findStudyByName(displayName, versionId) {
  if (!displayName) return null;
  const cacheKey = `study_by_name:${versionId}:${displayName.toLowerCase()}`;
  const cached = cache.get(cacheKey);
  if (cached !== null) return cached;

  const sql = `
    SELECT *
    FROM ${tableRef('commplan_studies_catalog')}
    WHERE LOWER(display_name) = LOWER(@n) AND version_id = @v AND active = TRUE
    LIMIT 1
  `;
  const rows = await query(sql, { n: displayName, v: versionId });
  const result = rows[0] || null;
  cache.set(cacheKey, result);
  return result;
}

/** Lista todos os estudos de uma versão. Admin usa pra UI. */
export async function listStudies(versionId) {
  const sql = `
    SELECT *
    FROM ${tableRef('commplan_studies_catalog')}
    WHERE version_id = @v
    ORDER BY celebration_date NULLS LAST, display_name
  `;
  return query(sql, { v: versionId });
}

/**
 * Lista estudos disponíveis pro CP escolher no checklist do Command.
 * Critério: status='feito' (já entregue), version ativa.
 *
 * Esse endpoint pode ser exposto sem auth admin pra integração com Command.
 */
export async function listAvailableStudies(versionId) {
  const sql = `
    SELECT id, display_name, author_email, celebration_date, link_url
    FROM ${tableRef('commplan_studies_catalog')}
    WHERE version_id = @v AND active = TRUE AND status = 'feito'
    ORDER BY celebration_date NULLS LAST, display_name
  `;
  return query(sql, { v: versionId });
}

export async function createStudy({ versionId, displayName, authorEmail, celebrationDate,
                                     deliveryEstimate, status, linkUrl, notes }) {
  // ID = slug do display_name + version
  const slug = displayName.toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const id = `${slug}_${versionId}`;
  const now = new Date().toISOString();

  const sql = `
    INSERT INTO ${tableRef('commplan_studies_catalog')}
      (id, version_id, display_name, author_email, celebration_date,
       delivery_estimate, status, link_url, active, notes, created_at, updated_at)
    VALUES (
      ${escSql.str(id)},
      ${escSql.str(versionId)},
      ${escSql.str(displayName)},
      ${escSql.str(authorEmail.toLowerCase())},
      ${escSql.date(celebrationDate)},
      ${escSql.str(deliveryEstimate)},
      ${escSql.str(status || 'planejado')},
      ${escSql.str(linkUrl)},
      TRUE,
      ${escSql.str(notes)},
      ${escSql.ts(now)},
      ${escSql.ts(now)}
    )
  `;
  await query(sql);
  cache.clear();
  return id;
}

/** Update editável: author_email, status, link_url, celebration_date, delivery_estimate, display_name */
const SAFE_EDITABLE = ['display_name', 'author_email', 'celebration_date',
                       'delivery_estimate', 'status', 'link_url', 'active', 'notes'];

export async function updateStudy(id, patch) {
  const sets = [];
  const params = { id };
  for (const f of SAFE_EDITABLE) {
    if (f in patch) {
      sets.push(`${f} = @${f}`);
      params[f] = f === 'author_email' && patch[f] ? patch[f].toLowerCase() : patch[f];
    }
  }
  if (sets.length === 0) return;
  sets.push(`updated_at = CURRENT_TIMESTAMP()`);

  await query(
    `UPDATE ${tableRef('commplan_studies_catalog')} SET ${sets.join(', ')} WHERE id = @id`,
    params
  );
  cache.clear();
}

export async function getStudyByIdAdmin(id) {
  const rows = await query(
    `SELECT * FROM ${tableRef('commplan_studies_catalog')} WHERE id = @id LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}

export function invalidateStudiesCache() { cache.clear(); }
