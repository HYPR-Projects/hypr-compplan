// Testes da engine nas duas versões do Compplan (2026 e 2026-Q4).
// Rodar: npm test   (node --test, sem dependências)

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { computeBonus } from '../engine/compplan-engine.js';
import {
  classifyFeatures2026Q4, proveMaxAttention, resolveCatalogVersion,
  VERSION_2026, VERSION_2026_Q4, detectDeckFeatures2026Q4, setCatalogOverrides,
} from '../engine/compplan-catalog.js';
import { validatePvMeeting, optimizationState, collectPendingActions } from '../engine/compplan-engine.js';

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
  const meeting = { event_id: 'e1', start: '2026-11-05T15:00:00Z', status: 'confirmed', external_attendees: 2 };
  const mc = { __pv_meeting: meeting, am_pv_doc: true, am_pv_onepage: true, am_ren_no_vp: true };
  const bd = computeBonus(base(), mc, null, {}, { maLinks: [] });
  assert.deepEqual(earnedIds(bd, 'account_mgmt'), ['am_pv_meeting', 'am_ren_no_vp']);
  // Sem reunião vinculada, marcar o checkbox não conta (paga o Doc PDF, maior restante)
  const noMeeting = computeBonus(base(), { am_pv_meeting: true, am_pv_doc: true }, null, {}, { maLinks: [] });
  assert.deepEqual(earnedIds(noMeeting, 'account_mgmt'), ['am_pv_doc']);
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

test('Q4: reunião de pós-venda — janela, cancelada e convidado externo', () => {
  const c = base(); // fim 2026-10-30
  const ok = { event_id: 'e', start: '2026-11-10T10:00:00Z', status: 'confirmed', external_attendees: 1 };
  assert.equal(validatePvMeeting(ok, c).ok, true);
  assert.equal(validatePvMeeting({ ...ok, start: '2026-12-31T10:00:00Z' }, c).ok, false);
  assert.equal(validatePvMeeting({ ...ok, start: '2026-10-10T10:00:00Z' }, c).ok, false);
  assert.equal(validatePvMeeting({ ...ok, status: 'cancelled' }, c).ok, false);
  assert.equal(validatePvMeeting({ ...ok, external_attendees: 0 }, c).ok, false);
});

test('Q4: Loom e relatório vêm do Report Center com evidência automática', () => {
  const bd = computeBonus(base(), {}, null, {}, { facts: { maLinks: [], loom_url: 'https://loom.com/x', share_id: 'abc123' } });
  assert.equal(item(bd, 'account_mgmt', 'am_loom').earned, true);
  assert.equal(item(bd, 'account_mgmt', 'am_loom').auto_evidence, 'https://loom.com/x');
  assert.equal(item(bd, 'account_mgmt', 'am_loom').needs_evidence, false);
  assert.equal(item(bd, 'account_mgmt', 'am_reports').auto_evidence, 'https://report.hypr.mobi/report/abc123');
  assert.equal(item(bd, 'account_mgmt', 'am_loom').validation, 'confirmed');
  const none = computeBonus(base(), { am_loom: true }, null, {}, { facts: { maLinks: [] } });
  assert.equal(item(none, 'account_mgmt', 'am_loom').validation, 'declared');
});

test('Q4: feature na pré-campanha = ofertada no deck ∩ ativada', () => {
  const c = base({ features: ['Tap to Go', 'PDOOH', 'Weather'], products: ['Groundflow'] });
  const deck = { deck_id: 'd', title: 'Proposta', created_time: '2026-09-20T10:00:00Z',
    offered_features: ['Tap to Go', 'Weather', 'Footfall', 'GroundFlow'] };
  const links = [{ creative_id: '1', name: 'x', template_slug: 'tap-to-map' }];
  const bd = computeBonus(c, { __pre_deck: deck }, null, {}, { maLinks: links });
  // ofertadas e ativadas: Tap to Go + Weather (Footfall não ativou; PDOOH não ofertado)
  assert.deepEqual(earnedIds(bd, 'pre_campaign'), ['pre_feat_rmnf', 'pre_feat_1', 'pre_feat_2']);
  assert.deepEqual(bd.pre_deck.matched.sort(), ['Tap to Go', 'Weather']);
  // PDOOH ativou sem ser ofertado: paga só no Setup
  assert.ok(bd.by_category.setup.items.find(i => i.id === 'setup_tier1_2').earned);
  // Deck criado depois do início da campanha não conta
  const late = computeBonus(c, { __pre_deck: { ...deck, created_time: '2026-10-20T10:00:00Z' } }, null, {}, { maLinks: links });
  assert.deepEqual(earnedIds(late, 'pre_campaign'), []);
  assert.equal(late.pre_deck.after_start, true);
});

test('Q4: detecção de features no texto do deck', () => {
  const f = detectDeckFeatures2026Q4('Vamos usar Tap to Map, P-DOOH e Brand Lift; gatilhos climáticos; mapa do RevIQ. Video survey no fim.');
  assert.deepEqual(f, ['Tap to Go', 'PDOOH', 'Survey', 'Weather', 'Video Survey', 'RevIQ']);
});

test('Q4: setup marcado pelo CS sem dado do checklist = divergente', () => {
  const bd = computeBonus(base(), { setup_tier3_1: true }, null, {}, { maLinks: [] });
  assert.equal(item(bd, 'setup', 'setup_tier3_1').validation, 'divergent');
});

test('Q4: ajustes do admin no catálogo (nome, %, item novo, desativar)', () => {
  setCatalogOverrides([
    { category: 'extras', item_id: 'ex_design_studio', label: 'Design Studio HYPR', pct: 0.002 },
    { category: 'extras', item_id: 'ex_novo', label: 'Item novo', pct: 0.001, is_new: true },
    { category: 'onboarding', item_id: 'on_implementation', active: false },
  ]);
  try {
    const bd = computeBonus(base(), { ex_novo: true }, null, {}, { maLinks: [] });
    assert.equal(item(bd, 'extras', 'ex_design_studio').label, 'Design Studio HYPR');
    assert.equal(item(bd, 'extras', 'ex_design_studio').pct, 0.002);
    assert.equal(item(bd, 'extras', 'ex_novo').earned, true);
    assert.equal(item(bd, 'onboarding', 'on_implementation'), undefined);
    // Q3 não é afetado
    const q3 = computeBonus(base({ start_date: '2026-08-01' }));
    assert.equal(item(q3, 'extras', 'ex_design_studio').label, 'Design studio');
  } finally {
    setCatalogOverrides([]);
  }
});

test('Q4: features do Force (extras.cl_features) e produtos do checklist original', () => {
  // View veio vazia (override com ARRAY []), checklist original tem Survey e Groundflow
  const c = base({ features: [], products: [] });
  const bd = computeBonus(c, {}, null, {}, { facts: { maLinks: [], checklist: { products: ['O2O', 'OOH', 'Groundflow'], features: ['Survey'] } } });
  assert.equal(item(bd, 'setup', 'setup_rmn_fisico').earned, true);   // GroundFlow
  assert.equal(item(bd, 'setup', 'setup_tier1_1').earned, true);      // Survey
  assert.deepEqual(bd.checklist_features, ['Survey']);
  // Ajuste manual na view (não vazio) continua valendo
  const ov = computeBonus(base({ features: ['Weather'] }), {}, null, {}, { facts: { maLinks: [], checklist: { products: [], features: ['Survey'] } } });
  assert.equal(item(ov, 'setup', 'setup_tier1_1').earned, false);
  assert.equal(item(ov, 'setup', 'setup_tier3_1').earned, true);
  // Q3 não usa o checklist original
  const q3 = computeBonus(base({ start_date: '2026-08-01', features: [] }), {}, null, {}, { facts: { maLinks: [], checklist: { products: [], features: ['Survey'] } } });
  assert.equal(item(q3, 'setup', 'setup_tier1_1').earned, false);
});

test('Otimização ao vivo: estado por data e dados', () => {
  const day = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const m = { display_impressions: 1000, ecpm: 0.5, ctr: 0.01 };
  assert.equal(optimizationState({ start_date: day(5), end_date: day(30) }, null).state, 'not_started');
  assert.equal(optimizationState({ start_date: day(-2), end_date: day(30) }, null).state, 'awaiting_data');
  assert.equal(optimizationState({ start_date: day(-2), end_date: day(30) }, m).state, 'live');
  assert.equal(optimizationState({ start_date: day(-40), end_date: day(-5) }, m).state, 'final');
  assert.equal(optimizationState({ start_date: day(-2), end_date: '2026-10-30' }, m).closes_on, '2026-10-31');
});

test('Q4: métricas do Report Center só entram no cálculo com OPT_METRICS_SOURCE=rc', () => {
  const metrics = { ecpm: 0.9, ctr: 0.006, over_percent: 10, display_impressions: 1000 };
  const facts = { maLinks: [], rc_metrics: { display_ecpm: 0.6, display_ctr_pct: 0.8 } };
  const off = computeBonus(base(), {}, metrics, {}, { facts });
  assert.equal(item(off, 'optimization', 'opt_without_abs').earned, false);
  assert.equal(off.opt_metrics_source, 'compplan');
  assert.deepEqual(off.rc_metrics, facts.rc_metrics);
  process.env.OPT_METRICS_SOURCE = 'rc';
  try {
    const on = computeBonus(base(), {}, metrics, {}, { facts });
    assert.equal(item(on, 'optimization', 'opt_without_abs').earned, true);
    assert.equal(on.opt_metrics_source, 'rc');
    // Q3 nunca usa o RC
    const q3 = computeBonus(base({ start_date: '2026-08-01' }), {}, metrics, {}, { facts });
    assert.equal(item(q3, 'optimization', 'opt_without_abs').earned, false);
  } finally {
    delete process.env.OPT_METRICS_SOURCE;
  }
});

test('Q4: pendências do CS para o painel', () => {
  const c = base({ features: ['Tap to Go'], end_date: '2026-10-10' });
  const mc = { pre_audiences: true, am_pv_doc: true };
  const bd = computeBonus(c, mc, null, {}, { maLinks: [] });
  const texts = collectPendingActions(bd, mc, c).map(a => a.text);
  assert.ok(texts.includes('Vincular a peça Tap to Go no Report Hub'));
  assert.ok(texts.includes('Escolher o deck da pré-campanha'));
  assert.ok(texts.some(t => t.includes('Doc. Pós Venda') && t.includes('falta evidência')));
  assert.deepEqual(collectPendingActions(computeBonus(base({ start_date: '2026-08-01' })), {}, {}), []);
});

test('Otimização: prévia do Report Center quando a base do Compplan ainda não tem entrega', () => {
  const day = (n) => { const d = new Date(); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  assert.equal(optimizationState({ start_date: day(-1), end_date: day(30) }, null, { display_ctr_pct: 0.8, display_ecpm: 0.6 }).state, 'rc_preview');
  assert.equal(optimizationState({ start_date: day(-1), end_date: day(30) }, null, null).state, 'awaiting_data');
});
