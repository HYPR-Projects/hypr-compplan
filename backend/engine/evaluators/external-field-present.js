/**
 * engine/evaluators/external-field-present.js — checa campo em sistema externo.
 *
 * Hoje só usado pra Loom: lê do Report Center (campaign_results.loom_url
 * gravado quando o CS faz upload de Loom no report).
 *
 * Payload:
 *   { source: 'report_center', table: 'campaign_results', field: 'loom_url',
 *     evidence_url_template: 'https://report-center.../report/{short_token}' }
 */

import { query } from '../../lib/bigquery.js';

const REPORT_HUB_TABLE = '`site-hypr.prod_prod_hypr_reporthub.campaign_results`';

export async function evaluate({ rule, ctx }) {
  const payload = typeof rule.condition_payload === 'string'
    ? JSON.parse(rule.condition_payload)
    : rule.condition_payload || {};

  if (payload.source !== 'report_center') {
    return {
      rule_id: rule.id, raw_pct: 0, effective_pct: 0, earned: false,
      breakdown: { error: `source não suportado: ${payload.source}` },
    };
  }

  if (payload.field !== 'loom_url') {
    return {
      rule_id: rule.id, raw_pct: 0, effective_pct: 0, earned: false,
      breakdown: { error: `field não suportado: ${payload.field}` },
    };
  }

  // Busca o Loom URL salvo pra esse short_token. Pode haver múltiplas linhas
  // por token (uma por update); pegamos o mais recente não-nulo.
  let loomUrl = null;
  try {
    const rows = await query(
      `SELECT loom_url
       FROM ${REPORT_HUB_TABLE}
       WHERE short_token = @t AND loom_url IS NOT NULL AND loom_url != ''
       ORDER BY updated_at DESC
       LIMIT 1`,
      { t: ctx.shortToken },
      'US' // campaign_results vive na região US
    );
    if (rows.length > 0) loomUrl = rows[0].loom_url;
  } catch (err) {
    console.warn(`[loom] erro ao buscar Loom de ${ctx.shortToken}:`, err.message);
  }

  const earned = !!loomUrl;
  const evidenceUrl = (payload.evidence_url_template || '')
    .replace('{short_token}', ctx.shortToken);

  return {
    rule_id: rule.id,
    raw_pct: earned ? rule.bonus_pct : 0,
    effective_pct: earned ? rule.bonus_pct : 0,
    earned,
    breakdown: {
      source: 'report_center',
      loom_url: loomUrl,
      evidence_url: evidenceUrl,
    },
  };
}

export const condition_kind = 'external_field_present';
