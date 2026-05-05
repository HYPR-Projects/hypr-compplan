/**
 * data/rules.js — leitura e escrita de commplan_rules.
 *
 * Cache de 5min porque admin pode editar — invalidação manual após
 * cada PUT/POST/DELETE.
 */

import crypto from 'crypto';
import { query, tableRef, escSql, TTLCache } from '../lib/bigquery.js';

const cache = new TTLCache(5 * 60_000);

export async function getRulesByVersion(versionId) {
  const cacheKey = `rules:${versionId}`;
  const cached = cache.get(cacheKey);
  if (cached !== null) return cached;

  const sql = `
    SELECT *
    FROM ${tableRef('commplan_rules')}
    WHERE version_id = @v AND active = TRUE
    ORDER BY display_order, id
  `;
  const rows = await query(sql, { v: versionId });
  cache.set(cacheKey, rows);
  return rows;
}

export async function getRuleById(id) {
  const rows = await query(
    `SELECT * FROM ${tableRef('commplan_rules')} WHERE id = @id LIMIT 1`,
    { id }
  );
  return rows[0] || null;
}

/**
 * Caminho B (edição segura): apenas estes campos são editáveis pelo admin.
 * Mudanças estruturais (condition_kind, payload) exigem nova versão.
 */
const SAFE_EDITABLE_FIELDS = ['display_name', 'bonus_pct', 'display_order', 'active', 'cap_max_pct'];

export async function updateRuleSafe(id, patch) {
  const sets = [];
  const params = { id };
  for (const f of SAFE_EDITABLE_FIELDS) {
    if (f in patch) {
      sets.push(`${f} = @${f}`);
      params[f] = patch[f];
    }
  }
  if (sets.length === 0) return;
  sets.push(`updated_at = CURRENT_TIMESTAMP()`);

  await query(
    `UPDATE ${tableRef('commplan_rules')} SET ${sets.join(', ')} WHERE id = @id`,
    params
  );
  cache.clear();
}

/**
 * Cria regra nova — APENAS tipo 'manual_claim'. Outros tipos ficam pra dev.
 */
export async function createManualClaimRule({ versionId, category, subcategory, displayName,
                                               bonusPct, displayOrder, capGroup, capMaxPct,
                                               exclusionGroup, description }) {
  const id = `${category}_${crypto.randomUUID().slice(0, 8)}_${versionId}`;
  const now = new Date().toISOString();

  const payload = { description: description || displayName };

  const sql = `
    INSERT INTO ${tableRef('commplan_rules')}
      (id, version_id, category, subcategory, display_name, display_order,
       bonus_pct, evaluation_mode, condition_kind, condition_payload,
       cap_group, cap_max_pct, exclusion_group,
       active, created_at, updated_at)
    VALUES (
      ${escSql.str(id)}, ${escSql.str(versionId)}, ${escSql.str(category)},
      ${escSql.str(subcategory)}, ${escSql.str(displayName)}, ${escSql.num(displayOrder)},
      ${escSql.num(bonusPct)}, ${escSql.str('manual')}, ${escSql.str('manual_claim')},
      ${escSql.json(payload)},
      ${escSql.str(capGroup)}, ${escSql.num(capMaxPct)}, ${escSql.str(exclusionGroup)},
      TRUE, ${escSql.ts(now)}, ${escSql.ts(now)}
    )
  `;
  await query(sql);
  cache.clear();
  return id;
}

export function invalidateRulesCache() { cache.clear(); }
