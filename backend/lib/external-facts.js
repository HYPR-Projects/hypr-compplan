/**
 * lib/external-facts.js — dados de outras plataformas usados pela versão
 * 2026-Q4 do Compplan. Somente leitura; o Compplan nunca escreve lá.
 *
 *   - Peças Max Attention vinculadas (Report Center, aba Max Attention):
 *     prova de que um formato Tap To rodou.
 *   - Loom da campanha (Report Center): Account Management → Loom.
 *   - Link de compartilhamento do relatório (Report Center): → Relatórios.
 *
 * Cada fonte falha sozinha: se uma consulta der erro, aquele dado vem null
 * (a engine trata como "não foi possível consultar") e as outras seguem.
 */

import { query } from './bigquery.js';

const MA_LINKS_TABLE = process.env.RC_MA_LINKS_TABLE || 'site-hypr.prod_assets.report_ma_links';
const LOOMS_TABLE = process.env.RC_LOOMS_TABLE || 'site-hypr.prod_assets.campaign_looms';
const SHARES_TABLE = process.env.RC_SHARES_TABLE || 'site-hypr.prod_assets.campaign_share_ids';

async function safe(label, fn) {
  try { return await fn(); } catch (e) { console.warn(`external-facts ${label}:`, e.message); return null; }
}

/**
 * @param {string[]} tokens
 * @returns {Promise<Object<string, {maLinks: Array|null, loom_url: string|null, share_id: string|null}>>}
 *   Mapa TOKEN (maiúsculo) → fatos.
 */
export async function fetchFactsByToken(tokens) {
  const toks = [...new Set((tokens || []).filter(Boolean).map(t => String(t).toUpperCase()))];
  const out = {};
  if (toks.length === 0) return out;

  const [maRows, loomRows, shareRows] = await Promise.all([
    safe('ma_links', () => query(
      `SELECT UPPER(short_token) AS short_token, creative_id, name, template_slug
       FROM \`${MA_LINKS_TABLE}\` WHERE UPPER(short_token) IN UNNEST(@toks)`, { toks })),
    safe('looms', () => query(
      `SELECT UPPER(short_token) AS short_token, ANY_VALUE(loom_url) AS loom_url
       FROM \`${LOOMS_TABLE}\`
       WHERE UPPER(short_token) IN UNNEST(@toks) AND IFNULL(TRIM(loom_url), '') != ''
       GROUP BY 1`, { toks })),
    safe('shares', () => query(
      `SELECT UPPER(short_token) AS short_token, ANY_VALUE(share_id) AS share_id
       FROM \`${SHARES_TABLE}\` WHERE UPPER(short_token) IN UNNEST(@toks) GROUP BY 1`, { toks })),
  ]);

  for (const t of toks) {
    out[t] = { maLinks: maRows ? [] : null, loom_url: null, share_id: null };
  }
  for (const r of maRows || []) out[r.short_token]?.maLinks?.push({
    creative_id: r.creative_id, name: r.name, template_slug: r.template_slug,
  });
  for (const r of loomRows || []) if (out[r.short_token]) out[r.short_token].loom_url = r.loom_url;
  for (const r of shareRows || []) if (out[r.short_token]) out[r.short_token].share_id = r.share_id;
  return out;
}

/** Fatos de um token a partir do mapa. */
export function factsFor(map, token) {
  return (map && map[String(token || '').toUpperCase()]) || { maLinks: null, loom_url: null, share_id: null };
}
