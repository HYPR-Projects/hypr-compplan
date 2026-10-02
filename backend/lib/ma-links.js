/**
 * lib/ma-links.js — peças Max Attention vinculadas a cada campanha no Report
 * Center (aba Max Attention). É a prova de que um formato Max Attention rodou
 * (versão 2026-Q4 do Compplan).
 *
 * Fonte: `report_ma_links` do Report Center (o admin/CS vincula a peça da HYPR
 * Platform à campanha). Somente leitura — o Compplan nunca escreve lá.
 */

import { query } from './bigquery.js';

const MA_LINKS_TABLE = process.env.RC_MA_LINKS_TABLE || 'site-hypr.prod_assets.report_ma_links';

/**
 * @param {string[]} tokens
 * @returns {Promise<Object<string, Array<{creative_id, name, template_slug}>>|null>}
 *   Mapa TOKEN (maiúsculo) → vínculos; token sem vínculo → []. null quando a
 *   consulta falha (a engine trata como "não foi possível consultar o RC").
 */
export async function fetchMaLinksByToken(tokens) {
  const toks = [...new Set((tokens || []).filter(Boolean).map(t => String(t).toUpperCase()))];
  const out = {};
  for (const t of toks) out[t] = [];
  if (toks.length === 0) return out;
  try {
    const rows = await query(
      `SELECT UPPER(short_token) AS short_token, creative_id, name, template_slug
       FROM \`${MA_LINKS_TABLE}\`
       WHERE UPPER(short_token) IN UNNEST(@toks)`,
      { toks }
    );
    for (const r of rows) (out[r.short_token] ||= []).push({
      creative_id: r.creative_id, name: r.name, template_slug: r.template_slug,
    });
    return out;
  } catch (e) {
    console.warn('fetchMaLinksByToken:', e.message);
    return null;
  }
}

/** Vínculos de um token a partir do mapa (null se a consulta falhou). */
export function maLinksFor(map, token) {
  if (!map) return null;
  return map[String(token || '').toUpperCase()] || [];
}
