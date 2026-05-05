/**
 * data/features-catalog.js — gerencia commplan_features_catalog.
 *
 * Retorna Map<normalizedKey, {feature_code, display_name, tier}> pra
 * lookup O(1) ao bater feature do checklist contra o catálogo.
 */

import { query, tableRef, escSql, TTLCache } from '../lib/bigquery.js';
import { normalizeFeatureName } from '../engine/evaluators/feature-in-tier.js';

const cache = new TTLCache(10 * 60_000); // 10min

export async function getFeaturesCatalog(versionId) {
  const cacheKey = `cat:${versionId}`;
  const cached = cache.get(cacheKey);
  if (cached !== null) return cached;

  const sql = `
    SELECT feature_code, display_name, tier
    FROM ${tableRef('commplan_features_catalog')}
    WHERE version_id = @v AND active = TRUE
  `;
  const rows = await query(sql, { v: versionId });

  const map = new Map();
  for (const r of rows) {
    // Indexamos por chave normalizada do display_name (que é o que vem do checklist)
    map.set(normalizeFeatureName(r.display_name), {
      feature_code: r.feature_code,
      display_name: r.display_name,
      tier: r.tier,
    });
    // Também pelo feature_code normalizado, por garantia
    map.set(normalizeFeatureName(r.feature_code), {
      feature_code: r.feature_code,
      display_name: r.display_name,
      tier: r.tier,
    });
  }
  cache.set(cacheKey, map);
  return map;
}

export async function listFeaturesCatalog(versionId) {
  return query(
    `SELECT * FROM ${tableRef('commplan_features_catalog')}
     WHERE version_id = @v
     ORDER BY tier, display_name`,
    { v: versionId }
  );
}

export function invalidateCatalogCache() { cache.clear(); }
