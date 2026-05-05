/**
 * lib/bigquery.js — wrapper do BigQuery com cache TTL e single-flight.
 *
 * Padrões espelhados do Report Center (Python). Em runtime persistente
 * (Cloud Run), instâncias permanecem warm — o cache global persiste entre
 * requests da mesma instância.
 */

import { BigQuery } from '@google-cloud/bigquery';

export const PROJECT_ID = process.env.GCP_PROJECT_ID || 'site-hypr';

// Dataset principal do Commplan — todas as 11 tabelas commplan_* vão aqui.
// Mantido isolado do Sales Center pra permissões e backup independentes.
export const DATASET = process.env.BQ_DATASET || 'hypr_commplan';

// Dataset onde fica `checklists` (escrito pelo HYPR Command).
// O Commplan apenas LÊ daqui (cross-dataset query) pra calcular bônus.
// Variável separada permite mudar sem afetar nada do Commplan.
export const SOURCE_DATASET = process.env.BQ_SOURCE_DATASET || 'hypr_sales_center';

// Dataset do Report Hub (campaign_results.loom_url, performance metrics).
// Usado pra regra de Account Management (Loom auto-detect).
export const REPORTHUB_DATASET = process.env.BQ_REPORTHUB_DATASET || 'prod_prod_hypr_reporthub';

export const bq = new BigQuery({
  projectId: PROJECT_ID,
  // Em Cloud Run, ADC pega service account de runtime automaticamente.
  // Local dev usa GOOGLE_APPLICATION_CREDENTIALS apontando pro JSON.
});

/**
 * Run a parameterized query and return rows.
 *
 * Params como objeto: { foo: 'bar', n: 42 }. BQ infere tipos.
 */
export async function query(sql, params = {}, location = 'us-central1') {
  const [rows] = await bq.query({
    query: sql,
    params,
    useLegacySql: false,
    location,
  });
  return rows;
}

/**
 * Cache TTL simples por chave. Use pra dados que mudam raramente.
 * Estrutura: Map<key, {expiresAt, value}>
 */
export class TTLCache {
  constructor(defaultTtlMs = 60_000) {
    this.store = new Map();
    this.defaultTtlMs = defaultTtlMs;
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  set(key, value, ttlMs = this.defaultTtlMs) {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }

  invalidate(key) { this.store.delete(key); }
  clear() { this.store.clear(); }
}

/**
 * Single-flight: garante que duas requests pra mesma chave NÃO disparam
 * duas queries simultâneas. Segunda request awaita a Promise da primeira.
 *
 * Padrão idêntico ao do Report Center (`_get_token_lock`).
 */
export class SingleFlight {
  constructor() { this.inflight = new Map(); }

  async run(key, fn) {
    if (this.inflight.has(key)) return this.inflight.get(key);
    const promise = fn().finally(() => this.inflight.delete(key));
    this.inflight.set(key, promise);
    return promise;
  }
}

/**
 * Helpers de escape pra INSERT manual (quando streaming insert não serve
 * porque vamos atualizar/deletar logo em seguida — streaming buffer trava
 * DML por ~90min).
 *
 * Padrão herdado do Command (que tem o mesmo problema).
 */
export const escSql = {
  str(v) {
    if (v === null || v === undefined || v === '') return 'NULL';
    const s = String(v).replace(/"""/g, '""\\"');
    return `r"""${s}"""`;
  },
  num(v) {
    if (v === null || v === undefined || v === '') return 'NULL';
    const n = Number(v);
    return isNaN(n) ? 'NULL' : String(n);
  },
  bool(v) {
    if (v === null || v === undefined) return 'NULL';
    return v === true || v === 'true' || v === 'Sim' ? 'TRUE' : 'FALSE';
  },
  date(v) {
    if (!v) return 'NULL';
    return `DATE '${String(v).split('T')[0].replace(/'/g, "''")}'`;
  },
  ts(v) {
    if (!v) return 'NULL';
    return `TIMESTAMP '${String(v).replace(/'/g, "''")}'`;
  },
  arr(arr) {
    if (!Array.isArray(arr) || arr.length === 0) return '[]';
    return '[' + arr.map(x => escSql.str(x)).join(', ') + ']';
  },
  json(obj) {
    const s = JSON.stringify(obj || {}).replace(/"""/g, '""\\"');
    return `JSON r"""${s}"""`;
  },
};

/** Helper pra montar nome qualificado de tabela no dataset do Commplan. */
export function tableRef(name) {
  return `\`${PROJECT_ID}.${DATASET}.${name}\``;
}

/** Helper pra ler tabelas do Sales Center (checklists, team_members). */
export function sourceTableRef(name) {
  return `\`${PROJECT_ID}.${SOURCE_DATASET}.${name}\``;
}

/** Helper pra ler tabelas do Report Hub (campaign_results, performance). */
export function reporthubTableRef(name) {
  return `\`${PROJECT_ID}.${REPORTHUB_DATASET}.${name}\``;
}
