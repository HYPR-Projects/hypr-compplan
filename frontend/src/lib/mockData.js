/**
 * Mock data pra desenvolvimento UI sem precisar do backend BQ rodando.
 * Em produção (sem dev mode), useApi vai fazer fetch real.
 */

export const MOCK_CSS = [
  { email: 'beatriz.severine@hypr.mobi',  name: 'Beatriz Severine',  active: true },
  { email: 'isaac.lobo@hypr.mobi',        name: 'Isaac Lobo',        active: true },
  { email: 'mariana.lewinski@hypr.mobi',  name: 'Mariana Lewinski',  active: true },
  { email: 'thiago.nascimento@hypr.mobi', name: 'Thiago Nascimento', active: true },
  { email: 'joao.buzolin@hypr.mobi',      name: 'João Buzolin',      active: true },
  { email: 'joao.armelin@hypr.mobi',      name: 'João Armelin',      active: true },
];

export const MOCK_CAMPAIGNS = [
  {
    short_token: 'CYTX53',
    cs_email: 'joao.buzolin@hypr.mobi',
    client_name: 'Boticário',
    campaign_name: 'Tap to Map - Campanha Q1',
    campaign_start_date: '2026-01-15',
    campaign_end_date: '2026-03-31',
    revenue_gross: 850000,
    revenue_net: 709495,
    cs_total_pct: 0.0275,
    cs_bonus_amount: 23375,
    is_abs: true,
    has_pending_evidences: 3,
    rule_results: [
      { rule_id: 'pre_camp_audiencias_2026', display_name: 'Audiências',
        category: 'pre_campaign', earned: true, effective_pct: 0.0015,
        breakdown: { evidence_status: 'approved' } },
      { rule_id: 'pre_camp_rmn_fisico_2026', display_name: 'RMN Físico (inédito)',
        category: 'pre_campaign', earned: true, effective_pct: 0.0025,
        breakdown: { evidence_status: 'approved' } },
      { rule_id: 'pre_camp_feature_1st_2026', display_name: '1ª feature',
        category: 'pre_campaign', earned: true, effective_pct: 0.0020,
        breakdown: { evidence_status: 'approved' } },
      { rule_id: 'pre_camp_seasonal_plan_2026', display_name: 'Plano sazonal',
        category: 'pre_campaign', earned: false, effective_pct: 0,
        breakdown: { evidence_status: 'not_claimed' } },
      { rule_id: 'setup_media_o2o_2026', display_name: 'Mídia base: O2O',
        category: 'setup', earned: true, effective_pct: 0.0045 },
      { rule_id: 'setup_tier1_1st_2026', display_name: '1ª feature Tier 1',
        category: 'setup', earned: true, effective_pct: 0.0030,
        breakdown: { matched_feature: 'Tap to Go' } },
      { rule_id: 'setup_tier2_1st_2026', display_name: '1ª feature Tier 2',
        category: 'setup', earned: true, effective_pct: 0.0020,
        breakdown: { matched_feature: 'Spotify' } },
      { rule_id: 'opt_media_2026', display_name: 'Otimização: Display ou Video',
        category: 'optimization', earned: true, effective_pct: 0.0030,
        breakdown: { evaluated_as: 'display', is_abs: true,
          over: { value: 112, ok: true }, ecpm: { value: 1.32, ok: true }, ctr: { value: 0.67, ok: true } } },
      { rule_id: 'am_loom_2026', display_name: 'Loom (post-mortem)',
        category: 'account_mgmt', earned: true, effective_pct: 0.0010,
        breakdown: { source: 'report_center', loom_url: 'https://loom.com/...' } },
      { rule_id: 'am_analytics_2026', display_name: 'Visão analytics',
        category: 'account_mgmt', earned: false, effective_pct: 0,
        breakdown: { evidence_status: 'pending_review' } },
      { rule_id: 'am_relatorios_2026', display_name: 'Relatórios entregues',
        category: 'account_mgmt', earned: false, effective_pct: 0,
        breakdown: { evidence_status: 'not_claimed' } },
    ],
  },
  {
    short_token: 'P4LW2W',
    cs_email: 'joao.buzolin@hypr.mobi',
    client_name: 'PepsiCo',
    campaign_name: 'Quaker Inverno',
    campaign_start_date: '2026-02-01',
    campaign_end_date: '2026-03-31',
    revenue_gross: 420000,
    revenue_net: 350574,
    cs_total_pct: 0.0185,
    cs_bonus_amount: 6486,
    is_abs: true,
    has_pending_evidences: 2,
    rule_results: [],
  },
  {
    short_token: 'PYG08F',
    cs_email: 'joao.buzolin@hypr.mobi',
    client_name: 'GeneralMotors',
    campaign_name: 'Varejo 2026',
    campaign_start_date: '2026-03-01',
    campaign_end_date: '2026-03-31',
    revenue_gross: 290000,
    revenue_net: 242063,
    cs_total_pct: 0.0145,
    cs_bonus_amount: 3510,
    is_abs: false,
    has_pending_evidences: 0,
    rule_results: [],
  },
];

export const MOCK_QUARTER_SUMMARY = {
  cs_email: 'joao.buzolin@hypr.mobi',
  quarter: 'Q1-2026',
  status: 'draft',
  bonus_from_own_campaigns_brl: 33371,
  bonus_from_mentorship_brl: 0,
  bonus_from_studies_brl: 4255,
  bonus_gross_brl: 37626,
  fixed_salary_monthly_brl: 12000,
  salary_deduction_brl: 24000,
  bonus_net_brl: 13626,
  campaigns_count: 8,
  evidences_pending_count: 5,
};

export const MOCK_HISTORY = [
  { quarter: 'Q4-2025', status: 'paid', bonus_gross_brl: 28430, bonus_net_brl: 4430, campaigns_count: 6 },
  { quarter: 'Q3-2025', status: 'paid', bonus_gross_brl: 31200, bonus_net_brl: 7200, campaigns_count: 7 },
  { quarter: 'Q2-2025', status: 'paid', bonus_gross_brl: 22100, bonus_net_brl: 0,    campaigns_count: 5 },
  { quarter: 'Q1-2025', status: 'paid', bonus_gross_brl: 35600, bonus_net_brl: 11600, campaigns_count: 8 },
];

export const MOCK_GROWTH_DATA = [
  { x: 'Out 25', compplan: 22000, campanhas: 5 },
  { x: 'Nov 25', compplan: 24500, campanhas: 6 },
  { x: 'Dez 25', compplan: 28430, campanhas: 6 },
  { x: 'Jan 26', compplan: 11200, campanhas: 3 },
  { x: 'Fev 26', compplan: 14800, campanhas: 4 },
  { x: 'Mar 26', compplan: 11626, campanhas: 5 },
];

export const MOCK_TOP_STUDIES = [
  { name: 'Copa do Mundo',     value: 12, author: 'Thiago Nascimento' },
  { name: 'Festa Junina',      value: 8,  author: 'João Buzolin' },
  { name: 'Dia das Mães',      value: 7,  author: 'Mariana Lewinski' },
  { name: 'Dia dos Namorados', value: 6,  author: 'João Armelin' },
  { name: 'Páscoa',            value: 5,  author: 'Isaac Lobo' },
  { name: 'Dia das Mulheres',  value: 4,  author: 'Beatriz Severine' },
  { name: 'Festivais',         value: 3,  author: 'João Buzolin' },
];

export const MOCK_TEAM_OVERVIEW = MOCK_CSS.map((cs, i) => ({
  ...cs,
  current_salary: [12000, 11000, 13000, 14000, 12500, 11500][i],
  campaigns_active: [2, 3, 5, 9, 8, 8][i],
  bonus_q1_brl:    [18250, 22340, 31200, 41500, 37626, 28900][i],
  pending_claims:  [0, 2, 1, 4, 5, 1][i],
  has_mentees:     i === 0 || i === 3,
}));

export const MOCK_AUDIENCES_PER_MONTH = [
  { x: 'Out 25', value: 18 },
  { x: 'Nov 25', value: 22 },
  { x: 'Dez 25', value: 31 },
  { x: 'Jan 26', value: 28 },
  { x: 'Fev 26', value: 35 },
  { x: 'Mar 26', value: 42 },
];

/** Detector simples — use mock quando token é "dev-fake-token" */
export function isDevMode() {
  return typeof window !== 'undefined'
    && sessionStorage.getItem('commplan_jwt') === 'dev-fake-token';
}
