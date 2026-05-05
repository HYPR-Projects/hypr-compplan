/**
 * data/abs-clients.js — gestão da tabela commplan_abs_clients.
 *
 * Carrega a lista inteira em memória (são poucos registros, ~25), faz lookup
 * por advertiser_id em O(1).
 */

import crypto from 'crypto';
import { query, tableRef, escSql, TTLCache } from '../lib/bigquery.js';

const cache = new TTLCache(10 * 60_000); // 10min
const CACHE_KEY = 'abs_clients_set';

async function loadSet() {
  const cached = cache.get(CACHE_KEY);
  if (cached !== null) return cached;

  const rows = await query(
    `SELECT advertiser_id FROM ${tableRef('commplan_abs_clients')} WHERE active = TRUE`
  );
  const set = new Set(rows.map(r => String(r.advertiser_id)));
  cache.set(CACHE_KEY, set);
  return set;
}

export async function isAdvertiserABS(advertiserId) {
  if (!advertiserId) return false;
  const set = await loadSet();
  return set.has(String(advertiserId));
}

export async function listAbsClients() {
  return query(`
    SELECT *
    FROM ${tableRef('commplan_abs_clients')}
    WHERE active = TRUE
    ORDER BY client_group, display_name
  `);
}

export async function addAbsClient({ advertiserId, clientGroup, displayName, viaPartner, notes }) {
  const now = new Date().toISOString();
  const sql = `
    INSERT INTO ${tableRef('commplan_abs_clients')}
      (advertiser_id, client_group, display_name, via_partner, active, notes, created_at, updated_at)
    VALUES (
      ${escSql.str(advertiserId)},
      ${escSql.str(clientGroup)},
      ${escSql.str(displayName)},
      ${escSql.str(viaPartner)},
      TRUE,
      ${escSql.str(notes)},
      ${escSql.ts(now)},
      ${escSql.ts(now)}
    )
  `;
  await query(sql);
  cache.invalidate(CACHE_KEY);
}

export async function deactivateAbsClient(advertiserId) {
  const sql = `
    UPDATE ${tableRef('commplan_abs_clients')}
    SET active = FALSE, updated_at = CURRENT_TIMESTAMP()
    WHERE advertiser_id = @a
  `;
  await query(sql, { a: advertiserId });
  cache.invalidate(CACHE_KEY);
}
