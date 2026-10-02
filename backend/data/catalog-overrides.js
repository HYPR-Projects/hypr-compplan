/**
 * data/catalog-overrides.js — ajustes do admin no catálogo 2026-Q4
 * (tela "Etapas & regras"). Append-only: cada mudança é uma linha nova e
 * vale a mais recente por item. Mantido em memória e recarregado a cada 60s.
 */

import { query, tableRef, escSql } from '../lib/bigquery.js';
import { setCatalogOverrides, VERSION_2026_Q4 } from '../engine/compplan-catalog.js';

const TABLE = 'commplan_catalog_overrides';
const TTL_MS = 60 * 1000;
let loadedAt = 0;
let loading = null;
let tableReady = false;

async function ensureTable() {
  if (tableReady) return;
  await query(`
    CREATE TABLE IF NOT EXISTS ${tableRef(TABLE)} (
      version_id STRING NOT NULL,
      category STRING NOT NULL,
      item_id STRING NOT NULL,
      label STRING,
      pct FLOAT64,
      active BOOL,
      card_what STRING,
      card_obs STRING,
      is_new BOOL,
      updated_by STRING NOT NULL,
      updated_at TIMESTAMP NOT NULL
    )`);
  tableReady = true;
}

export async function listCatalogOverrides() {
  await ensureTable();
  return query(
    `SELECT * EXCEPT(rn) FROM (
       SELECT *, ROW_NUMBER() OVER (PARTITION BY item_id ORDER BY updated_at DESC) AS rn
       FROM ${tableRef(TABLE)} WHERE version_id = @v
     ) WHERE rn = 1`,
    { v: VERSION_2026_Q4 }
  );
}

/** Recarrega os ajustes se o cache tiver mais de 60s. Nunca lança. */
export async function refreshCatalogOverridesIfStale(force = false) {
  if (!force && Date.now() - loadedAt < TTL_MS) return;
  if (loading) return loading;
  loading = (async () => {
    try {
      setCatalogOverrides(await listCatalogOverrides());
      loadedAt = Date.now();
    } catch (e) {
      console.warn('catalog overrides:', e.message);
      loadedAt = Date.now(); // não martela o BQ se a tabela estiver inacessível
    } finally {
      loading = null;
    }
  })();
  return loading;
}

export async function saveCatalogOverride(row, byEmail) {
  await ensureTable();
  // Valores nulos via escSql (o client do BQ exige tipo explícito para parâmetro null).
  await query(
    `INSERT INTO ${tableRef(TABLE)}
       (version_id, category, item_id, label, pct, active, card_what, card_obs, is_new, updated_by, updated_at)
     VALUES (${escSql.str(VERSION_2026_Q4)}, ${escSql.str(row.category)}, ${escSql.str(row.item_id)},
             ${escSql.str(row.label)}, ${escSql.num(row.pct)}, ${escSql.bool(row.active)},
             ${escSql.str(row.card_what)}, ${escSql.str(row.card_obs)}, ${escSql.bool(!!row.is_new)},
             ${escSql.str(byEmail)}, CURRENT_TIMESTAMP())`
  );
  await refreshCatalogOverridesIfStale(true);
}

/** Middleware: garante os ajustes carregados (espera só na 1ª vez; depois atualiza em segundo plano). */
export function catalogOverridesMiddleware(req, res, next) {
  if (loadedAt === 0) {
    refreshCatalogOverridesIfStale().finally(() => next());
    return;
  }
  refreshCatalogOverridesIfStale();
  next();
}
