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
  // Tier 2 — 8 features
  tier2: new Set([
    'Spotify', 'Seat', 'Map Intelligence', 'Downloaded apps',
    'Click to Calendar', 'Carbon Neutral', 'Attention Ad', 'Footfall',
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
      // Display (campanhas com Display, inclui Display+Video). Apenas 1 das duas paga.
      { id: 'opt_with_abs',    label: 'Com ABS — Over ≤ 25% E eCPM ≤ R$ 1,50 E CTR ≥ 0,50%', pct: 0.0030, source: 'metrics', constraint: 'oneof_group:opt', help: 'Calculado automaticamente após a campanha fechar.' },
      { id: 'opt_without_abs', label: 'Sem ABS — Over ≤ 25% E eCPM ≤ R$ 0,70 E CTR ≥ 0,70%', pct: 0.0030, source: 'metrics', constraint: 'oneof_group:opt', help: 'Calculado automaticamente após a campanha fechar.' },
      // Vídeo (SÓ campanhas exclusivamente de vídeo, sem display)
      { id: 'opt_video',       label: 'Vídeo — Tech Cost ≤ 3% E VTR ≥ 85%',                pct: 0.0030, source: 'metrics', constraint: 'oneof_group:opt', help: 'Calculado automaticamente após a campanha fechar. Aparece apenas em campanhas exclusivamente de vídeo.' },
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
      { id: 'ex_estudos',      label: 'Estudos',                  pct: 0.0030, source: 'auto', help: 'Bônus vai pro AUTOR do estudo cadastrado em /admin/estudos, não pro CS dono da campanha.' },
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

// ═══════════════════════════════════════════════════════════════════════
// VERSÃO 2026-Q4 — vale para campanhas com início a partir de 01/10/2026.
// Plano: docs/PLANO-COMPPLAN-AUTOMATICO.md §5.
//
// Os IDs dos items são os MESMOS da versão 2026 quando o item só mudou de
// nome/% (ex.: pre_enrich_kepler agora é "Mapas GeoIQ e RevIQ",
// setup_rmn_fisico agora é "GroundFlow"). Assim o que o CS já marcou no Q4,
// os overrides do admin e as colunas de auditoria continuam valendo sem
// migração. Item novo = ID novo; item que saiu some do catálogo.
// ═══════════════════════════════════════════════════════════════════════

export const VERSION_2026 = '2026';
export const VERSION_2026_Q4 = '2026-Q4';

// Data de corte (início da campanha). Configurável por env para dar pra
// desligar a versão nova sem deploy de código (ex.: COMPPLAN_2026Q4_FROM=2099-01-01).
export function q4StartDate() {
  return (process.env.COMPPLAN_2026Q4_FROM || '2026-10-01').trim();
}

/** Normaliza nome de feature: minúsculas, sem acento, só letras e números. */
export function normalizeFeatureName(name) {
  return String(name ?? '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Formatos Max Attention (no Force cada um é uma feature separada; no
 * Compplan todos são "Max Attention" e cada formato DIFERENTE conta 1
 * feature do Tier 1). `template` é o template da HYPR Platform que aparece
 * na aba Max Attention do Report Center (`report_ma_links.template_slug`):
 * a peça vinculada é a prova de que o formato rodou. Formatos sem template
 * na Platform (template: null) não têm como ser provados pela aba.
 */
export const MAX_ATTENTION_FORMATS_2026Q4 = [
  { name: 'Tap to Go',         template: 'tap-to-map', aliases: ['Tap to Map'] },
  { name: 'Tap to Carousel',   template: 'carrossel',  aliases: [] },
  { name: 'Tap to Slide',      template: 'carrossel',  aliases: [] },
  { name: 'Tap to Scratch',    template: 'scratch',    aliases: ['Tap to Reveal'] },
  { name: 'Tap to Choose',     template: 'survey',     aliases: [] },
  { name: 'Tap to Game',       template: 'play',       aliases: [] },
  { name: 'Tap to Chat',       template: null,         aliases: [] },
  { name: 'Tap to Hotspot',    template: null,         aliases: [] },
  { name: 'Tap to Max',        template: null,         aliases: [] },
  { name: 'Tap to Experience', template: null,         aliases: [] },
];

// Templates da Platform que NÃO contam como Max Attention (peça padrão).
export const MAX_ATTENTION_IGNORED_TEMPLATES = new Set(['freeform', 'adserver']);
// Grafias legadas de template na Platform → canônico (espelha o Report Center).
export const MAX_ATTENTION_TEMPLATE_ALIASES = { slider: 'carrossel' };

// Demais features por tier (Max Attention é Tier 1, tratado à parte).
export const FEATURE_DEFS_2026Q4 = [
  { name: 'PDOOH',            tier: 'tier1', aliases: ['P-DOOH'] },
  { name: 'Survey',           tier: 'tier1', aliases: [] },
  { name: 'Purchase Context', tier: 'tier1', aliases: [] },
  { name: 'HYPR Signals',     tier: 'tier1', aliases: [] },

  { name: 'Spotify',           tier: 'tier2', aliases: [] },
  { name: 'Map Intelligence',  tier: 'tier2', aliases: [] },
  { name: 'Downloaded apps',   tier: 'tier2', aliases: [] },
  { name: 'Click to Calendar', tier: 'tier2', aliases: [] },
  { name: 'Carbon Neutral',    tier: 'tier2', aliases: [] },
  { name: 'Footfall',          tier: 'tier2', aliases: [] },

  { name: 'TV Sync',      tier: 'tier3', aliases: [] },
  { name: 'HYPR Pass',    tier: 'tier3', aliases: [] },
  { name: 'Brand Query',  tier: 'tier3', aliases: [] },
  { name: 'Topics',       tier: 'tier3', aliases: [] },
  { name: 'Weather',      tier: 'tier3', aliases: [] },
  { name: 'Twitch TV',    tier: 'tier3', aliases: ['TwitchTV'] },
  { name: 'Video Survey', tier: 'tier3', aliases: [] },
];

// Aparecem no checklist mas não são feature no Compplan.
export const NON_FEATURES_2026Q4 = ['CTV', 'Attention Ad', 'Seat'];

const _maByKey = new Map();
for (const f of MAX_ATTENTION_FORMATS_2026Q4) {
  for (const n of [f.name, ...f.aliases]) _maByKey.set(normalizeFeatureName(n), f);
}
const _featByKey = new Map();
for (const f of FEATURE_DEFS_2026Q4) {
  for (const n of [f.name, ...f.aliases]) _featByKey.set(normalizeFeatureName(n), f);
}
const _nonFeatKeys = new Set(NON_FEATURES_2026Q4.map(normalizeFeatureName));

/**
 * Classifica as features do checklist pela versão 2026-Q4.
 * Retorna nomes canônicos, sem repetição:
 *   { max_attention: [{name, template}], tier1, tier2, tier3, excluded, unknown }
 * Qualquer "Tap to X" que não esteja na lista vira formato Max Attention sem
 * template ("tudo que for Tap To vira Max Attention").
 */
export function classifyFeatures2026Q4(features) {
  const out = { max_attention: [], tier1: [], tier2: [], tier3: [], excluded: [], unknown: [] };
  const seen = new Set();
  for (const raw of Array.isArray(features) ? features : []) {
    const key = normalizeFeatureName(raw);
    if (!key) continue;
    let ma = _maByKey.get(key);
    if (!ma && key.startsWith('tapto')) ma = { name: String(raw).trim(), template: null };
    if (ma) {
      if (seen.has(`ma:${ma.name}`)) continue;
      seen.add(`ma:${ma.name}`);
      out.max_attention.push({ name: ma.name, template: ma.template });
      continue;
    }
    const def = _featByKey.get(key);
    if (def) {
      if (seen.has(def.name)) continue;
      seen.add(def.name);
      out[def.tier].push(def.name);
      continue;
    }
    if (_nonFeatKeys.has(key)) { out.excluded.push(String(raw).trim()); continue; }
    out.unknown.push(String(raw).trim());
  }
  return out;
}

/** Catálogo de features por tier da 2026-Q4 (pra UI). */
export const FEATURE_TIERS_2026Q4 = {
  tier1: new Set(['Max Attention', ...FEATURE_DEFS_2026Q4.filter(f => f.tier === 'tier1').map(f => f.name)]),
  tier2: new Set(FEATURE_DEFS_2026Q4.filter(f => f.tier === 'tier2').map(f => f.name)),
  tier3: new Set(FEATURE_DEFS_2026Q4.filter(f => f.tier === 'tier3').map(f => f.name)),
};

const PCT = (n) => n / 100;

export const COMPPLAN_CATALOG_2026Q4 = {
  pre_campaign: {
    label: 'Pré Campanha',
    shared_evidence: {
      key: 'pre_campaign',
      label: 'Documento da Pré Campanha',
      help: 'Deck do cliente na pasta Audience Discovery que cobre os items marcados desta seção.',
    },
    items: [
      { id: 'pre_audiences',     label: 'Definição de audiências (OOH, O2O ou RMN)', pct: PCT(0.15), source: 'manual',
        card: { what: 'Você definiu as audiências da campanha (OOH, O2O ou RMN) na proposta.', obs: 'A definição precisa estar no deck da pré-campanha.' } },
      { id: 'pre_feat_rmnf',     label: 'Definição de features — GroundFlow',        pct: PCT(0.25), source: 'manual',
        card: { what: 'A proposta definiu o uso de GroundFlow para a campanha.', obs: 'Precisa estar no deck da pré-campanha.' } },
      { id: 'pre_feat_1',        label: 'Definição de features — Feature 1',          pct: PCT(0.20), source: 'manual',
        card: { what: 'Você ofereceu no deck da pré-campanha pelo menos 1 feature e ela foi ativada na campanha.', obs: 'Feature ativada mas não oferecida no deck paga só no Setup.' } },
      { id: 'pre_feat_2',        label: 'Definição de features — Feature 2',          pct: PCT(0.15), source: 'manual',
        card: { what: 'Ofereceu e ativou 2 ou mais features.', obs: 'Feature ativada mas não oferecida no deck paga só no Setup.' } },
      { id: 'pre_feat_3',        label: 'Definição de features — Feature 3',          pct: PCT(0.10), source: 'manual',
        card: { what: 'Ofereceu e ativou 3 ou mais features.', obs: 'Feature ativada mas não oferecida no deck paga só no Setup.' } },
      { id: 'pre_enrich_bench',  label: 'Enriquecimento — Case, estudo ou bench',      pct: PCT(0.10), source: 'manual',
        card: { what: 'A proposta usou um case, estudo ou benchmark.', obs: 'Explorer e Map Intelligence não contam mais aqui.' } },
      { id: 'pre_enrich_kepler', label: 'Enriquecimento — Uso de mapas do GeoIQ e RevIQ', pct: PCT(0.20), source: 'manual',
        card: { what: 'A proposta tem mapa do GeoIQ ou do RevIQ feito para esta campanha (marca, praças, audiência ou dados de venda do cliente).',
                obs: 'Não vale mapa genérico ou reaproveitado de outra proposta só para preencher slide.' } },
      { id: 'pre_seasonal_plan', label: 'Criação de plano sazonal',                   pct: PCT(0.20), source: 'manual',
        card: { what: 'Você criou um plano sazonal para o cliente.' } },
    ],
  },

  setup: {
    label: 'Setup',
    items: [
      { id: 'setup_o2o_ooh',     label: 'O2O / OOH',   pct: PCT(0.45), source: 'semi_auto', help: 'Pré-marcado se a campanha tem produtos O2O ou OOH. Você pode editar.' },
      { id: 'setup_rmn_digital', label: 'RMN Digital', pct: PCT(0.15), source: 'semi_auto', help: 'Pré-marcado se RMN Digital detectado. Você pode editar.' },
      { id: 'setup_rmn_fisico',  label: 'GroundFlow',  pct: PCT(0.55), source: 'semi_auto', help: 'Pré-marcado se GroundFlow detectado no checklist. Você pode editar.' },
      { id: 'setup_tier1_1', label: 'Tier 1 — 1ª implementação',    pct: PCT(0.25), source: 'semi_auto', help: 'Max Attention (cada formato conta 1, com peça vinculada no Report Hub), PDOOH, Survey, Purchase Context, HYPR Signals.' },
      { id: 'setup_tier1_2', label: 'Tier 1 — 2ª implementação',    pct: PCT(0.20), source: 'semi_auto', help: 'Pré-marcado se ≥ 2 features Tier 1.' },
      { id: 'setup_tier1_3', label: 'Tier 1 — 3ª implementação',    pct: PCT(0.15), source: 'semi_auto', help: 'Pré-marcado se ≥ 3 features Tier 1.' },
      { id: 'setup_tier2_1', label: 'Tier 2 — 1ª implementação',    pct: PCT(0.20), source: 'semi_auto', help: 'Pré-marcado se ≥ 1 feature Tier 2.' },
      { id: 'setup_tier2_2', label: 'Tier 2 — 2ª implementação',    pct: PCT(0.15), source: 'semi_auto', help: 'Pré-marcado se ≥ 2 features Tier 2.' },
      { id: 'setup_tier3_1', label: 'Tier 3 — Implementação única', pct: PCT(0.20), source: 'semi_auto', help: 'Pré-marcado se ≥ 1 feature Tier 3.' },
    ],
    notes: COMPPLAN_CATALOG.setup.notes,
  },

  optimization: COMPPLAN_CATALOG.optimization,

  account_mgmt: {
    label: 'Account Management',
    items: [
      { id: 'am_analytics',  label: 'Visão analytics', pct: PCT(0.20), source: 'manual' },
      { id: 'am_reports',    label: 'Relatórios',      pct: PCT(0.10), source: 'manual', needs_evidence: true, evidence_type: 'link' },
      { id: 'am_loom',       label: 'Loom',            pct: PCT(0.10), source: 'manual', needs_evidence: true, evidence_type: 'link' },
      { id: 'am_pv_meeting', label: 'Pós-venda — Reunião (online/presencial)', pct: PCT(0.30), source: 'manual', needs_evidence: true, evidence_type: 'link', constraint: 'non_cumulative_group:posvenda' },
      { id: 'am_pv_doc',     label: 'Pós-venda — Doc. Pós Venda (PDF)',        pct: PCT(0.20), source: 'manual', needs_evidence: true, evidence_type: 'link', constraint: 'non_cumulative_group:posvenda' },
      { id: 'am_pv_onepage', label: 'Pós-venda — Slides / One page',           pct: PCT(0.10), source: 'manual', needs_evidence: true, evidence_type: 'link', constraint: 'non_cumulative_group:posvenda' },
      { id: 'am_ren_no_vp',  label: 'Renovação',                               pct: PCT(0.25), source: 'manual' },
    ],
  },

  extras: COMPPLAN_CATALOG.extras,
  onboarding: COMPPLAN_CATALOG.onboarding,
};

/** Versão do Compplan que vale para uma data de início ('YYYY-MM-DD' ou {value}). */
export function resolveCatalogVersion(startDate) {
  const s = (startDate && typeof startDate === 'object' && 'value' in startDate) ? startDate.value : startDate;
  const str = s instanceof Date ? s.toISOString().slice(0, 10) : String(s || '').slice(0, 10);
  if (str && str >= q4StartDate()) return VERSION_2026_Q4;
  return VERSION_2026;
}

export function getCatalog(version) {
  return version === VERSION_2026_Q4 ? COMPPLAN_CATALOG_2026Q4 : COMPPLAN_CATALOG;
}

export function getFeatureTiers(version) {
  return version === VERSION_2026_Q4 ? FEATURE_TIERS_2026Q4 : FEATURE_TIERS;
}

/** Labels de todos os items de todas as versões (id → label mais recente). */
export function allItemLabels() {
  const out = {};
  for (const cat of [COMPPLAN_CATALOG, COMPPLAN_CATALOG_2026Q4]) {
    for (const c of Object.values(cat)) for (const it of c.items) out[it.id] = it.label;
  }
  return out;
}

// Tamanho de criativo no nome ("300x250") — mesmo recorte do Report Center
// (ma_matching.creative_line): os N tamanhos de uma peça são UMA peça.
const _SIZE_RE = /(^|[^\dx])\d{2,4}\s*[x×]\s*\d{2,4}(?![\dx])/gi;

function _canonicalTemplate(slug) {
  const s = String(slug || '').trim().toLowerCase();
  return MAX_ATTENTION_TEMPLATE_ALIASES[s] || s;
}

function _pieceKey(link) {
  const name = String(link?.name || '').replace(_SIZE_RE, '$1').replace(/[-_| ]{2,}/g, '_').replace(/^[-_| ]+|[-_| ]+$/g, '').toUpperCase();
  return name || String(link?.creative_id || '');
}

/**
 * Cruza os formatos Max Attention do checklist com as peças vinculadas na aba
 * Max Attention do Report Center.
 *
 * Regra (decidida): cada formato diferente conta 1 feature, desde que exista
 * peça vinculada daquele formato. Formatos que dividem o mesmo template na
 * Platform (Tap to Carousel e Tap to Slide → `carrossel`) exigem uma peça
 * distinta para cada um (tamanhos da mesma peça não contam como peças novas).
 *
 * @param {Array<{name, template}>} maFormats  saída de classifyFeatures2026Q4().max_attention
 * @param {Array|null} maLinks  vínculos do RC ({creative_id, name, template_slug});
 *                              null = não foi possível consultar o RC.
 * @returns {Array<{name, template, proven: boolean, proof: 'linked'|'not_linked'|'no_template'|'unavailable'}>}
 */
export function proveMaxAttention(maFormats, maLinks) {
  const piecesByTemplate = {};
  for (const l of Array.isArray(maLinks) ? maLinks : []) {
    const t = _canonicalTemplate(l?.template_slug);
    if (!t || MAX_ATTENTION_IGNORED_TEMPLATES.has(t)) continue;
    (piecesByTemplate[t] ||= new Set()).add(_pieceKey(l));
  }
  const used = {};
  return (maFormats || []).map(f => {
    if (!f.template) return { ...f, proven: true, proof: 'no_template' };
    if (!Array.isArray(maLinks)) return { ...f, proven: false, proof: 'unavailable' };
    const available = piecesByTemplate[f.template]?.size || 0;
    const n = used[f.template] || 0;
    if (n < available) {
      used[f.template] = n + 1;
      return { ...f, proven: true, proof: 'linked' };
    }
    return { ...f, proven: false, proof: 'not_linked' };
  });
}
