/**
 * tests/smoke-studies.js — testes do evaluator study-used.
 *
 * Testa só os caminhos determinísticos (early returns antes do lookup BQ).
 * Os caminhos que dependem de getStudyById ficam como teste de integração
 * (rodar contra BQ real no ambiente).
 */

import { evaluate } from '../engine/evaluators/study-used.js';

let pass = 0, fail = 0;
function t(name, fn) {
  return Promise.resolve(fn())
    .then(() => { console.log(`  ✓ ${name}`); pass++; })
    .catch(err => { console.log(`  ✗ ${name}\n     ${err.message}`); fail++; });
}
function assertEq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label || ''} esperava ${e}, recebeu ${a}`);
}
function assertClose(actual, expected, eps = 0.0001, label) {
  if (Math.abs(actual - expected) > eps) throw new Error(`${label || ''} esperava ~${expected}, recebeu ${actual}`);
}

const RULE = { id: 'extras_studies_2026', bonus_pct: 0.0030 };

console.log('▸ study-used evaluator (early returns)');

await t('Sem estudos no checklist → 0%', async () => {
  const r = await evaluate({
    rule: RULE,
    ctx: { shortToken: 'abc', csEmail: 'joao.buzolin@hypr.mobi', versionId: '2026' },
    checklist: { studies_used: [] },
  });
  assertEq(r.earned, false);
  assertClose(r.effective_pct, 0);
  assertEq(r.breakdown.reason, 'nenhum estudo marcado no checklist');
});

await t('studies_used null → 0%', async () => {
  const r = await evaluate({
    rule: RULE,
    ctx: { shortToken: 'abc', csEmail: 'joao.buzolin@hypr.mobi', versionId: '2026' },
    checklist: { studies_used: null },
  });
  assertEq(r.earned, false);
});

await t('studies_used undefined → 0%', async () => {
  const r = await evaluate({
    rule: RULE,
    ctx: { shortToken: 'abc', csEmail: 'joao.buzolin@hypr.mobi', versionId: '2026' },
    checklist: {},
  });
  assertEq(r.earned, false);
});

await t('studies_used não-array (string solta) → 0% sem crash', async () => {
  const r = await evaluate({
    rule: RULE,
    ctx: { shortToken: 'abc', csEmail: 'joao.buzolin@hypr.mobi', versionId: '2026' },
    checklist: { studies_used: 'copa_do_mundo_2026' /* errado: deveria ser array */ },
  });
  assertEq(r.earned, false, 'evaluator robusto contra entrada malformada');
});

console.log(`\n${pass} passou, ${fail} falhou.`);
console.log('\n▸ Testes de lookup contra catálogo (estudo encontrado, autor != CS, etc.) ficam como');
console.log('  teste de integração — rodar com BQ real após o deploy.');
process.exit(fail > 0 ? 1 : 0);
