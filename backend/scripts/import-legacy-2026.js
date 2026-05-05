/**
 * scripts/import-legacy-2026.js
 *
 * Auto-atribuição de campanhas legadas. Aplica 2 estratégias:
 *
 * 1. AUTO_CLIENT_MATCH (em us-central1):
 *    Se cliente tem CS unânime em hypr_sales_center.checklists, herda.
 *
 * 2. REPORTCENTER_OVERRIDE (em US):
 *    Se já tem entry em prod_assets.report_owners_overrides (admin do RC
 *    configurou), reutiliza.
 *
 * IMPORTANTE: cada query usa `location` explícita porque os datasets estão
 * em regiões diferentes:
 *   - hypr_commplan, hypr_sales_center → us-central1
 *   - prod_assets                       → US (multi-region)
 *
 * Uso:
 *   node scripts/import-legacy-2026.js              # dry-run
 *   node scripts/import-legacy-2026.js --execute    # aplica
 */

import 'dotenv/config';
import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = process.env.GCP_PROJECT_ID || 'site-hypr';
const DATASET = process.env.BQ_DATASET || 'hypr_commplan';
const SOURCE_DATASET = process.env.BQ_SOURCE_DATASET || 'hypr_sales_center';
const CUTOFF_DATE = '2026-04-01';

const bq = new BigQuery({ projectId: PROJECT_ID });

/**
 * Roda query com location especificada.
 */
async function runQuery(sql, location, params = null) {
  const opts = { query: sql, useLegacySql: false, location };
  if (params) opts.params = params;
  const [rows] = await bq.query(opts);
  return rows;
}

/**
 * Lista campanhas legadas pendentes — usa a VIEW que já filtra
 * (em us-central1, snapshot já está populado).
 */
async function listPendingLegacyCampaigns() {
  const sql = `SELECT * FROM \`${PROJECT_ID}.${DATASET}.commplan_pending_legacy\``;
  return runQuery(sql, 'us-central1');
}

/**
 * Estratégia 1: cliente → CS dominante (us-central1).
 */
async function buildClientToCsMap() {
  const sql = `
    WITH client_cs AS (
      SELECT
        LOWER(TRIM(client))        AS client_norm,
        LOWER(TRIM(cs_email))      AS cs_email,
        COUNT(*)                   AS n
      FROM \`${PROJECT_ID}.${SOURCE_DATASET}.checklists\`
      WHERE start_date >= '2026-01-01'
        AND cs_email IS NOT NULL
        AND TRIM(cs_email) != ''
      GROUP BY 1, 2
    ),
    client_summary AS (
      SELECT
        client_norm,
        ARRAY_AGG(STRUCT(cs_email, n) ORDER BY n DESC) AS cs_list,
        COUNT(DISTINCT cs_email) AS distinct_cs_count
      FROM client_cs
      GROUP BY client_norm
    )
    SELECT
      client_norm,
      cs_list[OFFSET(0)].cs_email AS dominant_cs
    FROM client_summary
    WHERE distinct_cs_count = 1
  `;
  const rows = await runQuery(sql, 'us-central1');
  const map = new Map();
  for (const r of rows) map.set(r.client_norm, r.dominant_cs);
  return map;
}

/**
 * Estratégia 2: overrides do Report Center (US multi-region).
 */
async function buildReportCenterOverridesMap() {
  try {
    const sql = `
      SELECT short_token, LOWER(TRIM(cs_email)) AS cs_email
      FROM \`${PROJECT_ID}.prod_assets.report_owners_overrides\`
      WHERE cs_email IS NOT NULL AND TRIM(cs_email) != ''
    `;
    const rows = await runQuery(sql, 'US');
    const map = new Map();
    for (const r of rows) map.set(r.short_token, r.cs_email);
    return map;
  } catch (err) {
    console.warn(`  ⚠ report_owners_overrides não acessível: ${err.message}`);
    return new Map();
  }
}

/**
 * Insere atribuição via streaming insert (us-central1).
 */
async function insertAssignment({ shortToken, csEmail, source, attributedBy }) {
  const dataset = bq.dataset(DATASET, { location: 'us-central1' });
  const table = dataset.table('commplan_legacy_assignments');
  await table.insert([{
    short_token: shortToken,
    cs_email: csEmail.toLowerCase(),
    source_attribution: source,
    attributed_by: attributedBy,
    attributed_at: new Date().toISOString(),
  }]);
}

async function main() {
  const args = process.argv.slice(2);
  const execute = args.includes('--execute');

  console.log(`▸ Mode: ${execute ? 'EXECUTE' : 'DRY-RUN (use --execute pra aplicar)'}`);
  console.log(`▸ Cutoff date: ${CUTOFF_DATE}`);
  console.log('');

  console.log('▸ Listando campanhas legadas pendentes...');
  const pending = await listPendingLegacyCampaigns();
  console.log(`  ${pending.length} campanhas precisam de atribuição\n`);

  if (pending.length === 0) {
    console.log('✓ Nada a fazer.');
    return;
  }

  console.log('▸ Construindo mapa cliente → CS (estratégia 1, us-central1)...');
  const clientMap = await buildClientToCsMap();
  console.log(`  ${clientMap.size} clientes têm CS unânime em campanhas atuais\n`);

  console.log('▸ Lendo overrides do Report Center (estratégia 2, US)...');
  const overridesMap = await buildReportCenterOverridesMap();
  console.log(`  ${overridesMap.size} overrides disponíveis\n`);

  let s1 = 0, s2 = 0, none = 0;
  const decisions = [];

  for (const camp of pending) {
    const startDate = camp.start_date?.value || camp.start_date;
    const summary = `[${camp.short_token}] ${camp.client_name} — ${camp.campaign_name} (${startDate})`;

    const override = overridesMap.get(camp.short_token);
    if (override) {
      decisions.push({ ...camp, cs_email: override, source: 'reportcenter_override' });
      console.log(`  ✓ ${summary} → ${override} (override RC)`);
      s2++;
      continue;
    }

    const clientNorm = (camp.client_name || '').toLowerCase().trim();
    const csByClient = clientMap.get(clientNorm);
    if (csByClient) {
      decisions.push({ ...camp, cs_email: csByClient, source: 'auto_client_match' });
      console.log(`  ✓ ${summary} → ${csByClient} (cliente)`);
      s1++;
      continue;
    }

    console.log(`  ✗ ${summary} → SEM ATRIBUIÇÃO (admin manual)`);
    none++;
  }

  console.log('');
  console.log('═══════════════════════════════════════════════');
  console.log(`  Total pendentes:                    ${pending.length}`);
  console.log(`  Estratégia 1 (match cliente):       ${s1}`);
  console.log(`  Estratégia 2 (override Report C.):  ${s2}`);
  console.log(`  Pendentes (admin manual):           ${none}`);
  console.log('═══════════════════════════════════════════════');

  if (!execute) {
    console.log('\nDry-run. Pra aplicar, rode:\n  node scripts/import-legacy-2026.js --execute');
    return;
  }

  console.log('\n▸ Aplicando atribuições...');
  for (const d of decisions) {
    try {
      await insertAssignment({
        shortToken: d.short_token,
        csEmail: d.cs_email,
        source: d.source,
        attributedBy: 'system:import-legacy-2026',
      });
    } catch (err) {
      console.error(`  ✗ falha em ${d.short_token}: ${err.message}`);
    }
  }
  console.log(`✓ ${decisions.length} atribuições aplicadas.`);
  console.log(`\n${none} campanhas ainda precisam de atribuição manual em /admin/legacy`);
}

main().catch(err => {
  console.error('FATAL:', err.message);
  if (err.errors) console.error(err.errors.slice(0, 3));
  process.exit(1);
});
