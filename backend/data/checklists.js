/**
 * data/checklists.js — leitura da VIEW unificada commplan_checklists.
 *
 * A VIEW une 2 fontes (definida em sql/04-legacy-assignments.sql):
 *   1. hypr_sales_center.checklists   (pós-Command, dados completos)
 *   2. prod_assets.checklist_info     (pré-Command, enriquecido com
 *      commplan_legacy_assignments — admin atribui campos manuais)
 *
 * Filtro fixo: start_date >= 2026-04-01 (cutoff Compplan v2026).
 *
 * Cada row tem `is_legacy` (bool) e `source` (string) pra UI:
 *   - Se is_legacy=true, alguns campos podem ser NULL (admin não preencheu)
 *   - O engine de cálculo trata NULL gracefully (regra é pulada)
 *
 * Cache TTL curto (60s) — checklists raramente mudam.
 */

import { query, tableRef, TTLCache } from '../lib/bigquery.js';

const cache = new TTLCache(60_000);

/**
 * Busca o checklist mais recente pra um short_token.
 *
 * Retorna null se a campanha não está na view (ou seja: ou é < cutoff,
 * ou é legada e ainda não foi atribuída por admin).
 */
export async function getChecklistByShortToken(shortToken) {
  const cacheKey = `checklist:${shortToken}`;
  const cached = cache.get(cacheKey);
  if (cached !== null) return cached;

  const sql = `
    SELECT * FROM ${tableRef('commplan_checklists')}
    WHERE short_token = @t
    LIMIT 1
  `;
  const rows = await query(sql, { t: shortToken });
  const result = rows[0] || null;
  cache.set(cacheKey, result);
  return result;
}

/**
 * Lista checklists de um CS num intervalo de datas (pra cálculo de quarter).
 */
export async function listChecklistsForCs({ csEmail, startDate, endDate }) {
  const sql = `
    SELECT *
    FROM ${tableRef('commplan_checklists')}
    WHERE LOWER(cs_email) = LOWER(@cs)
      AND end_date >= @start
      AND end_date <= @end
    ORDER BY end_date DESC, created_at DESC
  `;
  return query(sql, { cs: csEmail, start: startDate, end: endDate });
}

/** Lista todos os CSs com pelo menos 1 campanha no quarter. */
export async function listCssWithCampaignsInRange({ startDate, endDate }) {
  const sql = `
    SELECT DISTINCT LOWER(cs_email) AS cs_email
    FROM ${tableRef('commplan_checklists')}
    WHERE cs_email IS NOT NULL
      AND end_date >= @start
      AND end_date <= @end
    ORDER BY cs_email
  `;
  const rows = await query(sql, { start: startDate, end: endDate });
  return rows.map(r => r.cs_email);
}

export function invalidateChecklistCache(shortToken) {
  cache.invalidate(`checklist:${shortToken}`);
}
