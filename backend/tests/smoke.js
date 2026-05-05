/**
 * tests/smoke.js — testes rápidos das funções puras (sem BQ).
 *
 * Roda com: node tests/smoke.js
 */

import { netRevenue, NET_FACTOR, TAX_RATE } from '../engine/revenue.js';
import { dateToQuarter, parseQuarter, currentQuarter } from '../engine/quarter-resolver.js';
import { applyAllModifiers } from '../engine/caps-and-exclusions.js';
import { evaluate as fieldPresentEvaluate } from '../engine/evaluators/field-present.js';
import { evaluate as mediaOptEvaluate } from '../engine/evaluators/media-optimization.js';
import { normalizeFeatureName } from '../engine/evaluators/feature-in-tier.js';

let pass = 0, fail = 0;

function t(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    pass++;
  } catch (err) {
    console.log(`  ✗ ${name}`);
    console.log(`     ${err.message}`);
    fail++;
  }
}
function assertEq(actual, expected, label) {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${label || ''} esperava ${e}, recebeu ${a}`);
}
function assertClose(actual, expected, eps = 0.01, label) {
  if (Math.abs(actual - expected) > eps) throw new Error(`${label || ''} esperava ~${expected}, recebeu ${actual}`);
}

// ─── revenue.js ──────────────────────────────────────────────────────────
console.log('▸ revenue');
t('TAX_RATE = 16,53%', () => assertEq(TAX_RATE, 0.1653));
t('NET_FACTOR = 0,8347', () => assertClose(NET_FACTOR, 0.8347, 0.0001));
t('netRevenue(100k) = 83.470', () => assertClose(netRevenue(100000), 83470, 0.5));
t('netRevenue(0) = 0',  () => assertEq(netRevenue(0), 0));
t('netRevenue(null) = 0', () => assertEq(netRevenue(null), 0));

// ─── quarter-resolver.js ─────────────────────────────────────────────────
console.log('▸ quarter');
t('jan/2026 → Q1-2026',  () => assertEq(dateToQuarter('2026-01-15'), 'Q1-2026'));
t('mar/2026 → Q1-2026',  () => assertEq(dateToQuarter('2026-03-31'), 'Q1-2026'));
t('abr/2026 → Q2-2026',  () => assertEq(dateToQuarter('2026-04-01'), 'Q2-2026'));
t('dez/2026 → Q4-2026',  () => assertEq(dateToQuarter('2026-12-31'), 'Q4-2026'));
t('parseQuarter Q1-2026', () => {
  const p = parseQuarter('Q1-2026');
  assertEq(p.startDate, '2026-01-01', 'startDate');
  assertEq(p.endDate, '2026-03-31', 'endDate');
});
t('parseQuarter Q2-2026', () => {
  const p = parseQuarter('Q2-2026');
  assertEq(p.startDate, '2026-04-01', 'startDate');
  assertEq(p.endDate, '2026-06-30', 'endDate');
});
t('parseQuarter Q4-2026', () => {
  const p = parseQuarter('Q4-2026');
  assertEq(p.endDate, '2026-12-31');
});
t('quarter inválido lança', () => {
  let threw = false;
  try { parseQuarter('bobagem'); } catch { threw = true; }
  if (!threw) throw new Error('deveria ter lançado');
});

// ─── normalize feature name ──────────────────────────────────────────────
console.log('▸ feature normalization');
t('Tap to Map → tap_to_map', () => assertEq(normalizeFeatureName('Tap to Map'), 'tap_to_map'));
t('Connected TV → connected_tv', () => assertEq(normalizeFeatureName('Connected TV'), 'connected_tv'));
t('RMN Físico → rmn_fisico (sem acento)', () => assertEq(normalizeFeatureName('RMN Físico'), 'rmn_fisico'));
t('  spaces  → trim', () => assertEq(normalizeFeatureName('  Spotify  '), 'spotify'));

// ─── field-present evaluator ─────────────────────────────────────────────
console.log('▸ field_present');
t('any_of: O2O em products', () => {
  const r = fieldPresentEvaluate({
    rule: { id: 'r1', bonus_pct: 0.0045, condition_payload: { field: 'products', any_of: ['O2O'] } },
    checklist: { products: ['O2O', 'OOH'] },
  });
  assertEq(r.earned, true);
  assertClose(r.effective_pct, 0.0045);
});
t('any_of: O2O ausente', () => {
  const r = fieldPresentEvaluate({
    rule: { id: 'r1', bonus_pct: 0.0045, condition_payload: { field: 'products', any_of: ['O2O'] } },
    checklist: { products: ['OOH'] },
  });
  assertEq(r.earned, false);
});
t('any_of case-insensitive', () => {
  const r = fieldPresentEvaluate({
    rule: { id: 'r1', bonus_pct: 0.0015, condition_payload: { field: 'products', any_of: ['RMN Digital', 'RMNd'] } },
    checklist: { products: ['rmn digital'] },
  });
  assertEq(r.earned, true);
});
t('non_empty: audiences preenchido', () => {
  const r = fieldPresentEvaluate({
    rule: { id: 'r1', bonus_pct: 0.0015, condition_payload: { field: 'audiences', non_empty: true } },
    checklist: { audiences: 'Lookalike LTV' },
  });
  assertEq(r.earned, true);
});
t('non_empty: vazio', () => {
  const r = fieldPresentEvaluate({
    rule: { id: 'r1', bonus_pct: 0.0015, condition_payload: { field: 'audiences', non_empty: true } },
    checklist: { audiences: '' },
  });
  assertEq(r.earned, false);
});

// ─── media-optimization evaluator ────────────────────────────────────────
console.log('▸ media_optimization');
t('Display passa todos KPIs sem ABS', () => {
  const r = mediaOptEvaluate({
    rule: { id: 'opt', bonus_pct: 0.0030 },
    perf: {
      display_impressions: 1000000, display_pacing: 100, display_ecpm: 0.50, display_ctr: 0.80,
      video_impressions: 0,
    },
    isABS: false,
  });
  assertEq(r.earned, true, 'earned');
  assertClose(r.effective_pct, 0.0030);
  assertEq(r.breakdown.evaluated_as, 'display');
});
t('Display falha CTR sem ABS (CTR<0.70%)', () => {
  const r = mediaOptEvaluate({
    rule: { id: 'opt', bonus_pct: 0.0030 },
    perf: {
      display_impressions: 1000000, display_pacing: 100, display_ecpm: 0.50, display_ctr: 0.55,
      video_impressions: 0,
    },
    isABS: false,
  });
  assertEq(r.earned, false);
  assertEq(r.breakdown.ctr.ok, false);
});
t('Display passa CTR=0.55% COM ABS (limite 0.50%)', () => {
  const r = mediaOptEvaluate({
    rule: { id: 'opt', bonus_pct: 0.0030 },
    perf: {
      display_impressions: 1000000, display_pacing: 100, display_ecpm: 1.00, display_ctr: 0.55,
      video_impressions: 0,
    },
    isABS: true,
  });
  assertEq(r.earned, true);
  assertEq(r.breakdown.is_abs, true);
});
t('Display+Video → avalia só Display (Video é ignorado)', () => {
  const r = mediaOptEvaluate({
    rule: { id: 'opt', bonus_pct: 0.0030 },
    perf: {
      display_impressions: 1000000, display_pacing: 100, display_ecpm: 0.50, display_ctr: 0.80,
      video_impressions: 500000, video_pacing: 200, video_ecpm: 10.0, video_vtr: 30, // video terrível
    },
    isABS: false,
  });
  assertEq(r.earned, true, 'earned (Display passou; Video terrível mas ignorado)');
  assertEq(r.breakdown.evaluated_as, 'display');
  assertEq(r.breakdown.had_video_too, true);
});
t('Só Video, passa todos KPIs', () => {
  const r = mediaOptEvaluate({
    rule: { id: 'opt', bonus_pct: 0.0030 },
    perf: {
      display_impressions: 0,
      video_impressions: 500000, video_pacing: 100, video_ecpm: 1.50, video_vtr: 85,
    },
    isABS: false,
  });
  assertEq(r.earned, true);
  assertEq(r.breakdown.evaluated_as, 'video');
});
t('Só Video, VTR=80% NÃO passa (precisa >80, não >=80)', () => {
  const r = mediaOptEvaluate({
    rule: { id: 'opt', bonus_pct: 0.0030 },
    perf: {
      display_impressions: 0,
      video_impressions: 500000, video_pacing: 100, video_ecpm: 1.50, video_vtr: 80.0,
    },
    isABS: false,
  });
  assertEq(r.earned, false);
});
t('Sem delivery → 0%', () => {
  const r = mediaOptEvaluate({
    rule: { id: 'opt', bonus_pct: 0.0030 },
    perf: { display_impressions: 0, video_impressions: 0 },
    isABS: false,
  });
  assertEq(r.earned, false);
  assertEq(r.effective_pct, 0);
});

// ─── caps-and-exclusions ─────────────────────────────────────────────────
console.log('▸ caps & exclusions');
t('Setup invalidator zera Setup', () => {
  const items = [
    { rule: { id: 'inv', category: 'setup', subcategory: '_invalidators' },
      result: { effective_pct: 0, voids_setup: true } },
    { rule: { id: 's1', category: 'setup', subcategory: 'tier1' },
      result: { effective_pct: 0.0030, earned: true, raw_pct: 0.0030 } },
    { rule: { id: 's2', category: 'setup', subcategory: 'media_base' },
      result: { effective_pct: 0.0045, earned: true, raw_pct: 0.0045 } },
    { rule: { id: 'p1', category: 'pre_campaign' },
      result: { effective_pct: 0.0015, earned: true, raw_pct: 0.0015 } },
  ];
  applyAllModifiers(items);
  assertEq(items[1].result.effective_pct, 0, 'tier1 zerado');
  assertEq(items[2].result.effective_pct, 0, 'media_base zerado');
  assertClose(items[3].result.effective_pct, 0.0015, 0.0001, 'pre_campaign preservado');
});
t('Cap group: 4 itens somando 0.70 dentro do cap 0.70 → ok', () => {
  const items = [
    { rule: { id: 'a', category: 'pre_campaign', cap_group: 'g', cap_max_pct: 0.0070, display_order: 1 },
      result: { effective_pct: 0.0025, earned: true, raw_pct: 0.0025 } },
    { rule: { id: 'b', category: 'pre_campaign', cap_group: 'g', cap_max_pct: 0.0070, display_order: 2 },
      result: { effective_pct: 0.0020, earned: true, raw_pct: 0.0020 } },
    { rule: { id: 'c', category: 'pre_campaign', cap_group: 'g', cap_max_pct: 0.0070, display_order: 3 },
      result: { effective_pct: 0.0015, earned: true, raw_pct: 0.0015 } },
    { rule: { id: 'd', category: 'pre_campaign', cap_group: 'g', cap_max_pct: 0.0070, display_order: 4 },
      result: { effective_pct: 0.0010, earned: true, raw_pct: 0.0010 } },
  ];
  applyAllModifiers(items);
  const sum = items.reduce((s, it) => s + it.result.effective_pct, 0);
  assertClose(sum, 0.0070, 0.00001, 'soma exata = cap');
});
t('Cap group: itens estourando 1% num cap 0.70 → reduzido', () => {
  const items = [
    { rule: { id: 'a', category: 'pre_campaign', cap_group: 'g', cap_max_pct: 0.0070, display_order: 1 },
      result: { effective_pct: 0.0050, earned: true, raw_pct: 0.0050 } },
    { rule: { id: 'b', category: 'pre_campaign', cap_group: 'g', cap_max_pct: 0.0070, display_order: 2 },
      result: { effective_pct: 0.0050, earned: true, raw_pct: 0.0050 } },
  ];
  applyAllModifiers(items);
  const sum = items.reduce((s, it) => s + it.result.effective_pct, 0);
  assertClose(sum, 0.0070, 0.00001, 'soma capada');
  // Primeiro item leva integral, segundo absorve corte
  assertClose(items[0].result.effective_pct, 0.0050, 0.00001);
  assertClose(items[1].result.effective_pct, 0.0020, 0.00001);
});
t('Exclusion group: O2O xor OOH (mesmo pct, 1 vence)', () => {
  const items = [
    { rule: { id: 'o2o', category: 'setup', exclusion_group: 'setup_o2o_ooh', display_order: 51 },
      result: { effective_pct: 0.0045, earned: true, raw_pct: 0.0045 } },
    { rule: { id: 'ooh', category: 'setup', exclusion_group: 'setup_o2o_ooh', display_order: 52 },
      result: { effective_pct: 0.0045, earned: true, raw_pct: 0.0045 } },
  ];
  applyAllModifiers(items);
  const earned = items.filter(it => it.result.effective_pct > 0);
  assertEq(earned.length, 1, 'só 1 sobrevive');
});
t('Exclusion group: renewal 0.50 vs 0.30 → 0.50 vence', () => {
  const items = [
    { rule: { id: 'with_vp', category: 'account_mgmt', exclusion_group: 'am_renewal_choice', display_order: 131 },
      result: { effective_pct: 0.0050, earned: true, raw_pct: 0.0050 } },
    { rule: { id: 'no_vp',   category: 'account_mgmt', exclusion_group: 'am_renewal_choice', display_order: 132 },
      result: { effective_pct: 0.0030, earned: true, raw_pct: 0.0030 } },
  ];
  applyAllModifiers(items);
  assertClose(items[0].result.effective_pct, 0.0050, 0.00001, 'with_vp vence');
  assertEq(items[1].result.effective_pct, 0, 'no_vp zerado');
});

// ─── Cenário ponta-a-ponta: CS hipotético ────────────────────────────────
console.log('▸ end-to-end');
t('Cenário: CS atinge teto Pré Campanha (1.35%)', () => {
  const items = [
    // Audiências
    { rule: { id: 'audiencias', category: 'pre_campaign' },
      result: { effective_pct: 0.0015, earned: true, raw_pct: 0.0015 } },
    // Definição features (4 itens, cap 0.70)
    { rule: { id: 'rmn_fisico', category: 'pre_campaign', cap_group: 'def_features', cap_max_pct: 0.0070, display_order: 21 },
      result: { effective_pct: 0.0025, earned: true, raw_pct: 0.0025 } },
    { rule: { id: 'feat1', category: 'pre_campaign', cap_group: 'def_features', cap_max_pct: 0.0070, display_order: 22 },
      result: { effective_pct: 0.0020, earned: true, raw_pct: 0.0020 } },
    { rule: { id: 'feat2', category: 'pre_campaign', cap_group: 'def_features', cap_max_pct: 0.0070, display_order: 23 },
      result: { effective_pct: 0.0015, earned: true, raw_pct: 0.0015 } },
    { rule: { id: 'feat3', category: 'pre_campaign', cap_group: 'def_features', cap_max_pct: 0.0070, display_order: 24 },
      result: { effective_pct: 0.0010, earned: true, raw_pct: 0.0010 } },
    // Enriquecimento (cap 0.30)
    { rule: { id: 'kepler', category: 'pre_campaign', cap_group: 'enrich', cap_max_pct: 0.0030, display_order: 32 },
      result: { effective_pct: 0.0020, earned: true, raw_pct: 0.0020 } },
    { rule: { id: 'bench',  category: 'pre_campaign', cap_group: 'enrich', cap_max_pct: 0.0030, display_order: 31 },
      result: { effective_pct: 0.0010, earned: true, raw_pct: 0.0010 } },
    // Plano sazonal
    { rule: { id: 'sazonal', category: 'pre_campaign' },
      result: { effective_pct: 0.0020, earned: true, raw_pct: 0.0020 } },
  ];
  applyAllModifiers(items);
  const sum = items.reduce((s, it) => s + it.result.effective_pct, 0);
  assertClose(sum, 0.0135, 0.00001, 'teto Pré Campanha exato');
});

console.log(`\n${pass} passou, ${fail} falhou.`);
process.exit(fail > 0 ? 1 : 0);
