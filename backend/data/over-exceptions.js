/**
 * data/over-exceptions.js — gestão da tabela commplan_over_exceptions.
 *
 * Esses clientes calculam OVER usando impressões TOTAIS em vez de viewable.
 * Nada mais muda (eCPM, CTR e limites continuam iguais).
 *
 * NÃO confundir com:
 *   - commplan_abs_clients (lista por advertiser_id, regra diferente)
 *   - O toggle "Com ABS / Sem ABS" da campanha (escolha manual de limites)
 */

import { query, tableRef, TTLCache } from '../lib/bigquery.js';

const cache = new TTLCache(10 * 60_000); // 10min
const CACHE_KEY = 'over_exceptions_set';

async function loadSet() {
  const cached = cache.get(CACHE_KEY);
  if (cached !== null) return cached;

  const rows = await query(
    `SELECT LOWER(client_name) AS n FROM ${tableRef('commplan_over_exceptions')}`
  );
  const set = new Set(rows.map(r => r.n));
  cache.set(CACHE_KEY, set);
  return set;
}

/** Verifica se o `client_name` (do checklist) está na lista de exceções de OVER. */
export async function isOverException(clientName) {
  if (!clientName) return false;
  const set = await loadSet();
  return set.has(clientName.trim().toLowerCase());
}

/** Lista pra UI admin. */
export async function listOverExceptions() {
  const rows = await query(
    `SELECT client_name, notes, added_by, added_at
     FROM ${tableRef('commplan_over_exceptions')}
     ORDER BY LOWER(client_name)`
  );
  return rows.map(r => ({
    client_name: r.client_name,
    notes: r.notes,
    added_by: r.added_by,
    added_at: r.added_at?.value || r.added_at,
  }));
}

/** Adiciona cliente. Lança erro se já existe (case-insensitive). */
export async function addOverException({ clientName, notes, addedBy }) {
  const name = String(clientName || '').trim();
  if (!name) throw new Error('client_name vazio');

  const [existing] = await query(
    `SELECT client_name FROM ${tableRef('commplan_over_exceptions')}
     WHERE LOWER(client_name) = LOWER(@n) LIMIT 1`,
    { n: name }
  );
  if (existing) throw new Error(`cliente "${existing.client_name}" já está na lista`);

  await query(
    `INSERT INTO ${tableRef('commplan_over_exceptions')} (client_name, notes, added_by, added_at)
     VALUES (@n, @notes, @by, CURRENT_TIMESTAMP())`,
    { n: name, notes: notes || '', by: addedBy || 'unknown' }
  );

  cache.invalidate(CACHE_KEY);
  return { client_name: name, notes: notes || '' };
}

/** Remove cliente da lista. */
export async function removeOverException(clientName) {
  const name = String(clientName || '').trim();
  if (!name) throw new Error('client_name vazio');

  const [existing] = await query(
    `SELECT client_name, notes FROM ${tableRef('commplan_over_exceptions')}
     WHERE LOWER(client_name) = LOWER(@n) LIMIT 1`,
    { n: name }
  );
  if (!existing) return null;

  await query(
    `DELETE FROM ${tableRef('commplan_over_exceptions')}
     WHERE LOWER(client_name) = LOWER(@n)`,
    { n: name }
  );

  cache.invalidate(CACHE_KEY);
  return existing;
}
