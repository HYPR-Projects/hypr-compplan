/**
 * engine/evaluators/feature-in-tier.js — avalia regras de "1ª/2ª/3ª feature do Tier X".
 *
 * Lê checklist.features (array de nomes), normaliza, cruza com
 * commplan_features_catalog pra resolver tier de cada uma, e atribui
 * ranking dentro do tier.
 *
 * Ordem do ranking dentro do tier: ordem de aparição no array
 * checklist.features (se o CS marcou "Spotify" antes de "Map Intelligence",
 * Spotify é a 1ª do Tier 2). Não temos critério melhor — features não têm
 * "ordem de implementação" registrada no checklist.
 *
 * Payload da regra:
 *   { tier: 1|2|3, ranking: 1|2|3, implemented_required: true }
 *
 * Quando a regra tem `any_tier: true` (caso da Pré Campanha "1ª/2ª/3ª
 * feature qualquer"), o ranking é global (todas as features juntas, em
 * ordem de aparição).
 */

import { getFeaturesCatalog } from '../../data/features-catalog.js';

/** Normaliza "Tap to Go" → "tap_to_go". Mesmo padrão do owners.normalize_client_name. */
export function normalizeFeatureName(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/**
 * Resolve cada feature do checklist pra { feature_code, tier, display_name } usando o catálogo.
 * Features não encontradas no catálogo são marcadas com tier=null e logged.
 */
export async function resolveCampaignFeatures(checklist, versionId) {
  const raw = Array.isArray(checklist.features) ? checklist.features : [];
  const catalog = await getFeaturesCatalog(versionId);
  // catalog é Map<normalizedKey, {feature_code, display_name, tier}>

  const resolved = [];
  for (const featRaw of raw) {
    const norm = normalizeFeatureName(featRaw);
    const entry = catalog.get(norm);
    if (entry) {
      resolved.push({ ...entry, raw_input: featRaw });
    } else {
      // Feature desconhecida — pode ser typo no checklist ou catálogo desatualizado.
      console.warn(`[features] feature desconhecida no checklist: "${featRaw}" (norm="${norm}")`);
      resolved.push({ feature_code: null, display_name: featRaw, tier: null, raw_input: featRaw, unknown: true });
    }
  }
  return resolved;
}

export function evaluate({ rule, ctx }) {
  const payload = typeof rule.condition_payload === 'string'
    ? JSON.parse(rule.condition_payload)
    : rule.condition_payload || {};

  const targetTier  = payload.tier;        // 1, 2, 3 ou null
  const targetRank  = payload.ranking;     // 1, 2 ou 3
  const anyTier     = !!payload.any_tier;

  // ctx.resolvedFeatures vem pré-computado em engine/index.js pra evitar
  // resolver o catálogo N vezes na mesma campanha.
  const features = ctx.resolvedFeatures || [];

  let pool;
  if (anyTier) {
    pool = features.filter(f => f.tier !== null);  // qualquer tier conhecido
  } else {
    pool = features.filter(f => f.tier === targetTier);
  }

  // ranking = posição na ordem de aparição (1-based)
  const matched = pool[targetRank - 1] || null;

  if (!matched) {
    return {
      rule_id: rule.id,
      raw_pct: 0,
      effective_pct: 0,
      earned: false,
      breakdown: {
        target_tier: targetTier,
        target_ranking: targetRank,
        any_tier: anyTier,
        pool_size: pool.length,
        reason: pool.length === 0
          ? `nenhuma feature do tier ${targetTier}`
          : `só tem ${pool.length} feature(s), faltou pra atingir ranking ${targetRank}`,
      },
    };
  }

  return {
    rule_id: rule.id,
    raw_pct: rule.bonus_pct,
    effective_pct: rule.bonus_pct,
    earned: true,
    breakdown: {
      target_tier: targetTier,
      target_ranking: targetRank,
      any_tier: anyTier,
      matched_feature: matched.display_name,
      matched_code: matched.feature_code,
    },
  };
}

export const condition_kind = 'feature_in_tier';
