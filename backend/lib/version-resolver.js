/**
 * lib/version-resolver.js — descobre qual versão do Compplan estava ativa
 * em uma data específica. Versionamento anual conforme combinado.
 */

import { query, tableRef, TTLCache } from './bigquery.js';

const cache = new TTLCache(10 * 60_000); // 10min — versões mudam raramente
const CACHE_KEY = 'all_versions';

async function loadAllVersions() {
  const cached = cache.get(CACHE_KEY);
  if (cached) return cached;

  const rows = await query(`
    SELECT id, effective_from, effective_to, active
    FROM ${tableRef('commplan_versions')}
    ORDER BY effective_from DESC
  `);
  cache.set(CACHE_KEY, rows);
  return rows;
}

/**
 * Retorna o id da versão ativa em uma data (ex: '2026-09-15' → '2026').
 * Lança se não houver versão cobrindo essa data.
 */
export async function resolveVersion(date) {
  const versions = await loadAllVersions();
  const target = typeof date === 'string' ? date : date.toISOString().slice(0, 10);

  for (const v of versions) {
    const from = v.effective_from?.value || v.effective_from; // BQ retorna {value: 'YYYY-MM-DD'}
    const to   = v.effective_to?.value   || v.effective_to;
    if (target >= from && target <= to) return v.id;
  }
  throw new Error(`Nenhuma versão do Compplan cobre a data ${target}. Cadastre uma versão no admin.`);
}

export function invalidateVersionCache() {
  cache.invalidate(CACHE_KEY);
}
