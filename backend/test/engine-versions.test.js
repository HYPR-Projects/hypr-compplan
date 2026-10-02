// Testes da engine nas duas versões do Compplan (2026 e 2026-Q4).
// Rodar: npm test   (node --test, sem dependências)

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeBonus } from '../engine/compplan-engine.js';
import {
  classifyFeatures2026Q4, proveMaxAttention, resolveCatalogVersion,
  VERSION_2026, VERSION_2026_Q4,
} from '../engine/compplan-catalog.js';

const base = (over = {}) => ({
  short_token: 'TEST01', total_value: 100000, cs_email: 'cs@hypr.mobi',
  start_date: '2026-10-05', end_date: '2026-10-30',
  features: [], products: [], formats: ['Display'],
  ...over,
});

const item = (bd, cat, id) => bd.by_category[cat].items.find(i => i.id === id);
const earnedIds = (bd, cat) => bd.by_category[cat].items.filter(i => i.earned).map(i => i.id);

test('versão é escolhida pela data de início', () => {
  assert.equal(resolveCatalogVersion('2026-09-30'), VERSION_2026);
  assert.equal(resolveCatalogVersion('2026-10-01'), VERSION_2026_Q4);
  assert.equal(resolveCatalogVersion({ value: '2026-11-15' }), VERSION_2026_Q4);
  assert.equal(computeBonus(base({ start_date: '2026-08-01' })).version, VERSION_2026);
  assert.equal(computeBonus(base()).version, VERSION_2026_Q4);
});

test('Q4: grafias do Force são normalizadas e Tap To vira Max Attention', () => {
  const cls = classifyFeatures2026Q4(['P-DOOH', 'Tap To Scratch', 'Tap to Map', 'Tap to Go', 'Downloaded Apps', 'CTV', 'Attention Ad', 'Seat', 'Video Survey']);
  assert.deepEqual(cls.tier1, ['PDOOH']);
  assert.deepEqual(cls.max_attention.map(m => m.name), ['Tap to Scratch', 'Tap to Go']); // Tap to Map = Tap to Go
  assert.deepEqual(cls.tier2, ['Downloaded apps']);
  assert.deepEqual(cls.tier3, ['Video Survey']);
  assert.deepEqual(cls.excluded, ['CTV', 'Attention Ad', 'Seat']);
});

test('Q4: formato Max Attention só conta com peça vinculada no Report Hub', () => {
  const c = base({ features: ['Tap to Go', 'Tap To Carousel'] });
  const none = computeBonus(c, {}, null, {}, { maLinks: [] });
  assert.deepEqual(earnedIds(none, 'setup').filter(id => id.startsWith('setup_tier')), []);

  const one = computeBonus(c, {}, null, {}, { maLinks: [{ creative_id: '1', name: 'X_taptomap_300x250', template_slug: 'tap-to-map' }] });
  assert.deepEqual(earnedIds(one, 'setup').filter(id => id.startsWith('setup_tier')), ['setup_tier1_1']);

  const two = computeBonus(c, {}, null, {}, { maLinks: [
    { creative_id: '1', name: 'X_taptomap_300x250', template_slug: 'tap-to-map' },
    { creative_id: '2', name: 'X_carousel_300x600', template_slug: 'carrossel' },
  ] });
  assert.deepEqual(earnedIds(two, 'setup').filter(id => id.startsWith('setup_tier')), ['setup_tier1_1', 'setup_tier1_2']);
});

test('Q4: Carousel + Slide exigem duas peças de carrossel (tamanhos não contam)', () => {
  const formats = [{ name: 'Tap to Carousel', template: 'carrossel' }, { name: 'Tap to Slide', template: 'carrossel' }];
  const sameCreative = proveMaxAttention(formats, [
    { creative_id: 'a', name: 'HYPR_CLIENTE_CAROUSEL_300x250', template_slug: 'carrossel' },
    { creative_id: 'b', name: 'HYPR_CLIENTE_CAROUSEL_300x600', template_slug: 'slider' },
  ]);
  assert.deepEqual(sameCreative.map(f => f.proven), [true, false]);
  const twoCreatives = proveMaxAttention(formats, [
    { creative_id: 'a', name: 'HYPR_CLIENTE_CAROUSEL_A', template_slug: 'carrossel' },
    { creative_id: 'b', name: 'HYPR_CLIENTE_CAROUSEL_B', template_slug: 'carrossel' },
  ]);
  assert.deepEqual(twoCreatives.map(f => f.proven), [true, true]);
});

test('Q4: Free Form e Creative Ad Server não provam nada; RC fora do ar = não prova', () => {
  const f = [{ name: 'Tap to Go', template: 'tap-to-map' }];
  assert.equal(proveMaxAttention(f, [{ creative_id: '1', name: 'x', template_slug: 'freeform' }])[0].proven, false);
  assert.equal(proveMaxAttention(f, null)[0].proof, 'unavailable');
});

test('Q4: Tier 1 continua pagando até 3', () => {
  const c = base({ features: ['PDOOH', 'Survey', 'Purchase Context', 'HYPR Signals'] });
  const bd = computeBonus(c, {}, null, {}, { maLinks: [] });
  assert.deepEqual(earnedIds(bd, 'setup').filter(id => id.startsWith('setup_tier1')), ['setup_tier1_1', 'setup_tier1_2', 'setup_tier1_3']);
});

test('Q4: GroundFlow no lugar de RMN Físico', () => {
  const q4 = computeBonus(base({ products: ['Groundflow'] }), {}, null, {}, { maLinks: [] });
  assert.equal(item(q4, 'setup', 'setup_rmn_fisico').label, 'GroundFlow');
  assert.equal(item(q4, 'setup', 'setup_rmn_fisico').earned, true);
  const q4rmnf = computeBonus(base({ products: ['RMNF'] }), {}, null, {}, { maLinks: [] });
  assert.equal(item(q4rmnf, 'setup', 'setup_rmn_fisico').earned, false);
  const q3 = computeBonus(base({ start_date: '2026-08-01', products: ['RMNF'] }));
  assert.equal(item(q3, 'setup', 'setup_rmn_fisico').label, 'RMN Físico');
  assert.equal(item(q3, 'setup', 'setup_rmn_fisico').earned, true);
});

test('Q4: Account Management — novos % e pós-venda não cumulativo', () => {
  const mc = { am_pv_meeting: true, am_pv_doc: true, am_pv_onepage: true, am_ren_no_vp: true };
  const bd = computeBonus(base(), mc, null, {}, { maLinks: [] });
  assert.deepEqual(earnedIds(bd, 'account_mgmt'), ['am_pv_meeting', 'am_ren_no_vp']);
  assert.equal(item(bd, 'account_mgmt', 'am_pv_doc').pct, 0.002);
  assert.equal(item(bd, 'account_mgmt', 'am_ren_no_vp').label, 'Renovação');
  assert.equal(item(bd, 'account_mgmt', 'am_ren_vp'), undefined);
});

test('Q4: pré-campanha renomeada, % mantidos', () => {
  const bd = computeBonus(base(), {}, null, {}, { maLinks: [] });
  assert.equal(item(bd, 'pre_campaign', 'pre_enrich_kepler').label, 'Enriquecimento — Uso de mapas do GeoIQ e RevIQ');
  assert.equal(item(bd, 'pre_campaign', 'pre_enrich_kepler').pct, 0.002);
  assert.equal(item(bd, 'pre_campaign', 'pre_enrich_bench').pct, 0.001);
  assert.equal(item(bd, 'pre_campaign', 'pre_feat_rmnf').label, 'Definição de features — GroundFlow');
  assert.ok(item(bd, 'pre_campaign', 'pre_enrich_kepler').card?.obs);
});

test('2026 (Q3) não muda: tiers antigos com match exato', () => {
  const bd = computeBonus(base({ start_date: '2026-07-10', features: ['Tap to Go', 'Tap to Chat', 'Tap to Map', 'Attention Ad'] }));
  assert.deepEqual(earnedIds(bd, 'setup').filter(id => id.startsWith('setup_tier')), ['setup_tier1_1', 'setup_tier1_2', 'setup_tier1_3', 'setup_tier2_1']);
  assert.equal(item(bd, 'account_mgmt', 'am_pv_doc').pct, 0.003);
  assert.ok(item(bd, 'account_mgmt', 'am_ren_vp'));
});
