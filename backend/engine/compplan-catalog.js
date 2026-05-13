/**
 * engine/compplan-catalog.js — Catálogo de items do CompPlan 2026.
 *
 * Single source of truth pras % e regras de cálculo de bônus do CS.
 * Extraído do PDF "HYPR _ NEW COMPPLAN 2026" (09-12-2025).
 *
 * STRUCTURE:
 *   - 6 categorias (pre_campaign, setup, optimization, account_mgmt, extras, onboarding)
 *   - Cada item tem id único, label, pct, auto/manual, e regras especiais
 */

// Tiers das features (do slide 6 do PDF)
export const FEATURE_TIERS = {
  // Tier 1 — 11 features
  tier1: new Set([
    'PDOOH', 'Survey', 'Tap to Go', 'Tap to Chat', 'Tap to Max',
    'Tap to Carousel', 'Tap to Scratch', 'Tap to Map', 'Tap to Experience',
    'Purchase Context', 'HYPR Signals',
  ]),
  // Tier 2 — 7 features
  tier2: new Set([
    'Spotify', 'Seat', 'Map Intelligence', 'Downloaded apps',
    'Click to Calendar', 'Carbon Neutral', 'Attention Ad',
  ]),
  // Tier 3 — 6 features
  tier3: new Set([
    'TV Sync', 'HYPR Pass', 'Brand Query', 'Topics', 'Weather', 'Twitch TV',
  ]),
};

/**
 * Retorna o tier de uma feature ('tier1' | 'tier2' | 'tier3' | null).
 */
export function getFeatureTier(featureName) {
  if (!featureName) return null;
  if (FEATURE_TIERS.tier1.has(featureName)) return 'tier1';
  if (FEATURE_TIERS.tier2.has(featureName)) return 'tier2';
  if (FEATURE_TIERS.tier3.has(featureName)) return 'tier3';
  return null;
}

/**
 * Catálogo de items de bônus.
 * Cada item:
 *  - id:          identificador único (chave de armazenamento)
 *  - label:       texto na UI
 *  - pct:         percentual decimal (0.0015 = 0.15%)
 *  - source:      'auto' (inferido do checklist) | 'manual' (CS marca) | 'metrics' (vem de unified_performance_metrics)
 *  - help:        explicação opcional
 *  - constraint:  regra especial (ex: 'non_cumulative_group:posvenda')
 */
export const COMPPLAN_CATALOG = {
  pre_campaign: {
    label: 'Pré Campanha',
    shared_evidence: {
      key: 'pre_campaign',
      label: 'Link da evidência da Pré Campanha',
      help: 'Cole um único link (Drive, Loom, doc) que cubra os items marcados desta seção.',
    },
    items: [
      { id: 'pre_audiences',       label: 'Definição de audiências (OOH, O2O ou RMN)', pct: 0.0015, source: 'manual', help: 'Marque se você fez a definição de audiências da campanha.' },
      { id: 'pre_feat_rmnf',       label: 'Definição de features — RMN Físico',         pct: 0.0025, source: 'manual', help: 'Só ganha se a criação de audiência usar dados de RMNF INÉDITAS por AD.' },
      { id: 'pre_feat_1',          label: 'Definição de features — Feature 1',          pct: 0.0020, source: 'manual', help: 'Marque se sugeriu e implementou pelo menos 1 feature.' },
      { id: 'pre_feat_2',          label: 'Definição de features — Feature 2',          pct: 0.0015, source: 'manual', help: 'Marque se sugeriu e implementou 2+ features.' },
      { id: 'pre_feat_3',          label: 'Definição de features — Feature 3',          pct: 0.0010, source: 'manual', help: 'Marque se sugeriu e implementou 3+ features.' },
      { id: 'pre_enrich_bench',    label: 'Enriquecimento — Bench/case/estudo/Explorer/Map Intelligence', pct: 0.0010, source: 'manual', help: 'Se feature Map Intelligence já estiver no setup, não conta como enriquecimento.' },
      { id: 'pre_enrich_kepler',   label: 'Enriquecimento — Uso de dados de venda RMNF / Mapa no Kepler', pct: 0.0020, source: 'manual' },
      { id: 'pre_seasonal_plan',   label: 'Criação de plano sazonal',                   pct: 0.0020, source: 'manual' },
    ],
  },

  setup: {
    label: 'Setup',
    items: [
      { id: 'setup_o2o_ooh',     label: 'O2O / OOH',                       pct: 0.0045, source: 'semi_auto', help: 'Pré-marcado se a campanha tem produtos O2O ou OOH. Você pode editar.' },
      { id: 'setup_rmn_digital', label: 'RMN Digital',                     pct: 0.0015, source: 'semi_auto', help: 'Pré-marcado se RMN Digital detectado. Você pode editar.' },
      { id: 'setup_rmn_fisico',  label: 'RMN Físico',                      pct: 0.0055, source: 'semi_auto', help: 'Pré-marcado se RMN Físico detectado. Você pode editar.' },
      // Tier 1: até 3 features cumulativas
      { id: 'setup_tier1_1',     label: 'Tier 1 — 1ª implementação',       pct: 0.0025, source: 'semi_auto', help: 'Pré-marcado se ≥ 1 feature Tier 1. Você pode editar.' },
      { id: 'setup_tier1_2',     label: 'Tier 1 — 2ª implementação',       pct: 0.0020, source: 'semi_auto', help: 'Pré-marcado se ≥ 2 features Tier 1. Você pode editar.' },
      { id: 'setup_tier1_3',     label: 'Tier 1 — 3ª implementação',       pct: 0.0015, source: 'semi_auto', help: 'Pré-marcado se ≥ 3 features Tier 1. Você pode editar.' },
      // Tier 2: até 2 features
      { id: 'setup_tier2_1',     label: 'Tier 2 — 1ª implementação',       pct: 0.0020, source: 'semi_auto', help: 'Pré-marcado se ≥ 1 feature Tier 2. Você pode editar.' },
      { id: 'setup_tier2_2',     label: 'Tier 2 — 2ª implementação',       pct: 0.0015, source: 'semi_auto', help: 'Pré-marcado se ≥ 2 features Tier 2. Você pode editar.' },
      // Tier 3: 1 só
      { id: 'setup_tier3_1',     label: 'Tier 3 — Implementação única',    pct: 0.0020, source: 'semi_auto', help: 'Pré-marcado se ≥ 1 feature Tier 3. Você pode editar.' },
    ],
    notes: 'Custo de criative fee > R$ 1.000, over > 50% (sem justificativa) ou under = perde 100% do setup.',
  },

  optimization: {
    label: 'Otimizações',
    items: [
      // Apenas 1 das duas: com ou sem ABS. Dependem das métricas.
      { id: 'opt_with_abs',    label: 'Com ABS — Over ≤ 25% E eCPM ≤ R$ 1,50 E CTR ≥ 0,50%', pct: 0.0030, source: 'metrics', constraint: 'oneof_group:opt', help: 'Calculado automaticamente após a campanha fechar.' },
      { id: 'opt_without_abs', label: 'Sem ABS — Over ≤ 25% E eCPM ≤ R$ 0,70 E CTR ≥ 0,70%', pct: 0.0030, source: 'metrics', constraint: 'oneof_group:opt', help: 'Calculado automaticamente após a campanha fechar.' },
    ],
  },

  account_mgmt: {
    label: 'Account Management',
    items: [
      { id: 'am_analytics',  label: 'Visão analytics',                        pct: 0.0020, source: 'manual' },
      { id: 'am_reports',    label: 'Relatórios',                             pct: 0.0010, source: 'manual', needs_evidence: true, evidence_type: 'link' },
      { id: 'am_loom',       label: 'Loom',                                   pct: 0.0010, source: 'manual', needs_evidence: true, evidence_type: 'link' },
      // Pós-venda — pega o MAIOR (não cumulativo)
      { id: 'am_pv_meeting', label: 'Pós-venda — Reunião (online/presencial)', pct: 0.0030, source: 'manual', needs_evidence: true, evidence_type: 'link', constraint: 'non_cumulative_group:posvenda' },
      { id: 'am_pv_doc',     label: 'Pós-venda — Doc. Pós Venda (PDF)',        pct: 0.0030, source: 'manual', needs_evidence: true, evidence_type: 'link', constraint: 'non_cumulative_group:posvenda' },
      { id: 'am_pv_onepage', label: 'Pós-venda — One Page',                    pct: 0.0010, source: 'manual', needs_evidence: true, evidence_type: 'link', constraint: 'non_cumulative_group:posvenda' },
      // Renovação — pega o MAIOR (não cumulativo)
      { id: 'am_ren_no_vp',  label: 'Renovação sem Value Proposition',         pct: 0.0025, source: 'manual', constraint: 'non_cumulative_group:renovacao' },
      { id: 'am_ren_vp',     label: 'Renovação com Value Proposition',         pct: 0.0050, source: 'manual', constraint: 'non_cumulative_group:renovacao' },
    ],
  },

  extras: {
    label: 'Extras',
    items: [
      { id: 'ex_dark_test',    label: 'Realização de dark test',  pct: 0.0010, source: 'manual', needs_evidence: true, evidence_type: 'link_or_file', help: 'RMNd e Feature como dark test não entram no setup.' },
      { id: 'ex_design_studio',label: 'Design studio',            pct: 0.0015, source: 'manual' },
      { id: 'ex_estudos',      label: 'Estudos',                  pct: 0.0030, source: 'manual', help: 'Marcado se há estudos publicados associados à campanha.' },
    ],
  },

  onboarding: {
    label: 'Onboarding',
    items: [
      { id: 'on_implementation', label: 'Acompanhamento de implementação de CS novo', pct: 0.0025, source: 'manual', help: 'Percentual sobre a receita da campanha implementada pelo CS novo.' },
    ],
  },
};

/**
 * Helper: lista plana de todos os items.
 */
export function getAllItems() {
  const all = [];
  for (const [catKey, cat] of Object.entries(COMPPLAN_CATALOG)) {
    for (const item of cat.items) {
      all.push({ ...item, category: catKey });
    }
  }
  return all;
}

/**
 * Helper: encontra um item pelo id.
 */
export function findItem(itemId) {
  for (const cat of Object.values(COMPPLAN_CATALOG)) {
    const item = cat.items.find(i => i.id === itemId);
    if (item) return item;
  }
  return null;
}
