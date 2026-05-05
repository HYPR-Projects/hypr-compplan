/**
 * scripts/refresh-snapshot.js
 *
 * Refresh manual da snapshot `checklist_info_snapshot` (cross-region).
 *
 * BigQuery proíbe JOIN cross-region. Solução: lê em US, escreve em
 * us-central1 via 2 operações isoladas. Em vez de INSERT ... VALUES (que
 * exige escape manual de strings), usamos table.insert() (streaming insert)
 * que serializa nativamente — zero risco de quebra por aspas/quebras de linha.
 *
 * Uso:
 *   node scripts/refresh-snapshot.js
 *   node scripts/refresh-snapshot.js --since=2026-04-01
 */

import 'dotenv/config';
import { BigQuery } from '@google-cloud/bigquery';

const PROJECT_ID = process.env.GCP_PROJECT_ID || 'site-hypr';
const SOURCE_TABLE = `${PROJECT_ID}.prod_assets.checklist_info`;
const SNAPSHOT_DATASET = 'hypr_commplan';
const SNAPSHOT_TABLE_NAME = 'checklist_info_snapshot';

const args = process.argv.slice(2);
const sinceArg = args.find(a => a.startsWith('--since='));
const SINCE = sinceArg ? sinceArg.split('=')[1] : '2026-04-01';

if (!/^\d{4}-\d{2}-\d{2}$/.test(SINCE)) {
  console.error(`✗ --since deve ser YYYY-MM-DD, recebido: ${SINCE}`);
  process.exit(1);
}

const bq = new BigQuery({ projectId: PROJECT_ID });

async function main() {
  console.log(`▸ Project: ${PROJECT_ID}`);
  console.log(`▸ Source:  ${SOURCE_TABLE}  (location: US)`);
  console.log(`▸ Dest:    ${PROJECT_ID}.${SNAPSHOT_DATASET}.${SNAPSHOT_TABLE_NAME}  (location: us-central1)`);
  console.log(`▸ Since:   ${SINCE}`);
  console.log('');

  // ── PASSO 1: SELECT em US ─────────────────────────────────────────────
  console.log('▸ Lendo checklist_info de prod_assets (US)...');
  const selectSql = `
    SELECT
      short_token,
      client_name,
      campaign_name,
      salesman,
      agency,
      industry,
      campaign_type,
      start_date,
      end_date,
      total_value,
      formats,
      sold_audiences,
      cpm_amount,
      cpcv_amount,
      contracted_o2o_display_impressions,
      contracted_o2o_video_completions,
      bonus_o2o_display_impressions,
      bonus_o2o_video_completions,
      contracted_ooh_display_impressions,
      contracted_ooh_video_completions,
      bonus_ooh_display_impressions,
      bonus_ooh_video_completions
    FROM \`${SOURCE_TABLE}\`
    WHERE start_date >= DATE '${SINCE}'
  `;

  const [rows] = await bq.query({
    query: selectSql,
    useLegacySql: false,
    location: 'US',
  });

  console.log(`  ✓ ${rows.length} campanhas lidas`);

  if (rows.length === 0) {
    console.log('  Nada pra inserir, saindo.');
    return;
  }

  // ── PASSO 2: TRUNCATE em us-central1 ──────────────────────────────────
  console.log('\n▸ Truncando snapshot anterior...');
  await bq.query({
    query: `TRUNCATE TABLE \`${PROJECT_ID}.${SNAPSHOT_DATASET}.${SNAPSHOT_TABLE_NAME}\``,
    useLegacySql: false,
    location: 'us-central1',
  });
  console.log('  ✓ truncated');

  // ── PASSO 3: Insert via streaming (table.insert) em us-central1 ──────
  // Isso é o load job nativo do BigQuery — handles todos os tipos
  // automaticamente, sem precisar escapar strings manualmente.
  console.log('\n▸ Inserindo nova snapshot...');

  // Normaliza objetos {value: '...'} de DATE/TIMESTAMP pra string ISO simples
  const normalize = v => {
    if (v == null) return null;
    if (typeof v === 'object' && 'value' in v) return v.value;
    return v;
  };

  const now = new Date().toISOString();
  const insertRows = rows.map(r => ({
    short_token:                          normalize(r.short_token),
    client_name:                          normalize(r.client_name),
    campaign_name:                        normalize(r.campaign_name),
    salesman:                             normalize(r.salesman),
    agency:                               normalize(r.agency),
    industry:                             normalize(r.industry),
    campaign_type:                        normalize(r.campaign_type),
    start_date:                           normalize(r.start_date),
    end_date:                             normalize(r.end_date),
    total_value:                          r.total_value,
    formats:                              normalize(r.formats),
    sold_audiences:                       normalize(r.sold_audiences),
    cpm_amount:                           r.cpm_amount,
    cpcv_amount:                          r.cpcv_amount,
    contracted_o2o_display_impressions:   r.contracted_o2o_display_impressions,
    contracted_o2o_video_completions:     r.contracted_o2o_video_completions,
    bonus_o2o_display_impressions:        r.bonus_o2o_display_impressions,
    bonus_o2o_video_completions:          r.bonus_o2o_video_completions,
    contracted_ooh_display_impressions:   r.contracted_ooh_display_impressions,
    contracted_ooh_video_completions:     r.contracted_ooh_video_completions,
    bonus_ooh_display_impressions:        r.bonus_ooh_display_impressions,
    bonus_ooh_video_completions:          r.bonus_ooh_video_completions,
    snapshot_taken_at:                    now,
  }));

  const dataset = bq.dataset(SNAPSHOT_DATASET, { location: 'us-central1' });
  const table = dataset.table(SNAPSHOT_TABLE_NAME);

  // Streaming insert em batches de 500 (limite recomendado)
  const BATCH_SIZE = 500;
  let inserted = 0;
  for (let i = 0; i < insertRows.length; i += BATCH_SIZE) {
    const batch = insertRows.slice(i, i + BATCH_SIZE);
    await table.insert(batch);
    inserted += batch.length;
    process.stdout.write(`  ${inserted}/${insertRows.length}...\r`);
  }
  console.log(`  ✓ ${inserted} linhas inseridas em us-central1`);
  console.log('\n✓ Snapshot refresh completo.');
}

main().catch(err => {
  console.error('\n✗ FATAL:', err.message);
  // Erros de streaming insert vêm com array de PartialFailureError
  if (err.errors && Array.isArray(err.errors)) {
    console.error('Errors detail (first 3):');
    err.errors.slice(0, 3).forEach((e, i) => {
      console.error(`  [${i}]`, JSON.stringify(e, null, 2));
    });
  }
  process.exit(1);
});
