/**
 * scripts/setup-schema.js — provisiona o schema e seeds do Commplan.
 *
 * Uso:
 *   node scripts/setup-schema.js                    # roda 01-schema + 02-seeds
 *   node scripts/setup-schema.js --schema-only      # só DDL
 *   node scripts/setup-schema.js --seeds-only       # só seeds (usar 1x)
 *
 * AVISO: 02-seeds.sql faz INSERT. Rodar 2 vezes vai duplicar dados.
 * Rode --seeds-only somente uma vez por ambiente.
 */

import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { bq, PROJECT_ID, DATASET } from '../lib/bigquery.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SQL_DIR = path.join(__dirname, '..', 'sql');

async function runSqlFile(file) {
  const fullPath = path.join(SQL_DIR, file);
  const content = await fs.readFile(fullPath, 'utf8');

  // Substitui placeholders se PROJECT/DATASET diferirem
  const replaced = content.replaceAll('site-hypr.hypr_commplan', `${PROJECT_ID}.${DATASET}`);

  // Quebra por ';' top-level. Pra cada chunk, remove linhas de comentário
  // mas preserva o resto do statement.
  const stmts = replaced
    .split(/;\s*\n/)
    .map(chunk => chunk
      .split('\n')
      .filter(line => {
        const t = line.trim();
        return t.length > 0 && !t.startsWith('--');
      })
      .join('\n')
      .trim()
    )
    .filter(s => s.length > 5);

  console.log(`▸ ${file}: ${stmts.length} statements`);
  let ok = 0, errs = 0;
  for (const stmt of stmts) {
    try {
      await bq.query({ query: stmt, useLegacySql: false, location: 'southamerica-east1' });
      ok++;
    } catch (err) {
      errs++;
      console.error(`  ✗ erro: ${err.message}`);
      console.error(`    statement (primeiros 200 chars): ${stmt.slice(0, 200)}...`);
    }
  }
  console.log(`  ${ok} ok, ${errs} erros`);
  return { ok, errs };
}

async function main() {
  const args = process.argv.slice(2);
  const schemaOnly = args.includes('--schema-only');
  const seedsOnly  = args.includes('--seeds-only');
  const migrationsOnly = args.includes('--migrations-only');

  console.log(`▸ Project: ${PROJECT_ID}`);
  console.log(`▸ Dataset: ${DATASET}`);

  if (migrationsOnly) {
    await runSqlFile('03-migrations.sql');
  } else {
    if (!seedsOnly) {
      await runSqlFile('01-schema.sql');
    }
    if (!schemaOnly) {
      await runSqlFile('02-seeds.sql');
    }
    if (!schemaOnly && !seedsOnly) {
      await runSqlFile('03-migrations.sql');
    }
  }

  console.log('▸ Done.');
}

main().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
