/**
 * Espelho enxuto do COMPPLAN_CATALOG (backend) pra montar as colunas da
 * matriz de auditoria. Cada item é uma coluna. Mantém ordem por categoria.
 *
 * Só precisa de: catKey, catLabel, item id, item label (curto pra header).
 * Se o catálogo do backend mudar, atualizar aqui também.
 */
export const AUDIT_MATRIX_CATEGORIES = [
  {
    key: 'setup',
    label: 'Setup',
    items: [
      { id: 'setup_o2o_ooh',     label: 'O2O / OOH' },
      { id: 'setup_rmn_digital', label: 'RMN Digital' },
      { id: 'setup_rmn_fisico',  label: 'RMN Físico' },
      { id: 'setup_tier1_1',     label: 'Tier 1 — 1ª' },
      { id: 'setup_tier1_2',     label: 'Tier 1 — 2ª' },
      { id: 'setup_tier1_3',     label: 'Tier 1 — 3ª' },
      { id: 'setup_tier2_1',     label: 'Tier 2 — 1ª' },
      { id: 'setup_tier2_2',     label: 'Tier 2 — 2ª' },
      { id: 'setup_tier3_1',     label: 'Tier 3 — única' },
    ],
  },
  {
    key: 'pre_campaign',
    label: 'Pré-Campanha',
    items: [
      { id: 'pre_audiences',     label: 'Def. audiências' },
      { id: 'pre_feat_rmnf',     label: 'Feat. RMN Físico' },
      { id: 'pre_feat_1',        label: 'Feature 1' },
      { id: 'pre_feat_2',        label: 'Feature 2' },
      { id: 'pre_feat_3',        label: 'Feature 3' },
      { id: 'pre_enrich_bench',  label: 'Enriq. Bench/case' },
      { id: 'pre_enrich_kepler', label: 'Enriq. Kepler' },
      { id: 'pre_seasonal_plan', label: 'Plano sazonal' },
    ],
  },
  {
    key: 'optimization',
    label: 'Otimização',
    items: [
      { id: 'opt_with_abs',    label: 'Com ABS' },
      { id: 'opt_without_abs', label: 'Sem ABS' },
      { id: 'opt_video',       label: 'Vídeo' },
    ],
  },
  {
    key: 'account_mgmt',
    label: 'Account Mgmt',
    items: [
      { id: 'am_analytics',  label: 'Visão analytics' },
      { id: 'am_reports',    label: 'Relatórios' },
      { id: 'am_loom',       label: 'Loom' },
      { id: 'am_pv_meeting', label: 'PV — Reunião' },
      { id: 'am_pv_doc',     label: 'PV — Doc PDF' },
      { id: 'am_pv_onepage', label: 'PV — One Page' },
      { id: 'am_ren_no_vp',  label: 'Renov. s/ VP' },
      { id: 'am_ren_vp',     label: 'Renov. c/ VP' },
    ],
  },
  {
    key: 'extras',
    label: 'Extras',
    items: [
      { id: 'ex_dark_test',     label: 'Dark test' },
      { id: 'ex_design_studio', label: 'Design studio' },
      { id: 'ex_estudos',       label: 'Estudos' },
    ],
  },
  {
    key: 'onboarding',
    label: 'Onboarding',
    items: [
      { id: 'on_implementation', label: 'Impl. CS novo' },
    ],
  },
];

/** Lista plana de todos os itens (ordem por categoria). */
export const AUDIT_MATRIX_ITEMS = AUDIT_MATRIX_CATEGORIES.flatMap(cat =>
  cat.items.map(it => ({ ...it, catKey: cat.key, catLabel: cat.label }))
);
