-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  HYPR Commplan — Seeds 2026                                           ║
-- ║  Roda DEPOIS do 01-schema.sql                                          ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- ── Versão ────────────────────────────────────────────────────────────────
INSERT INTO `site-hypr.hypr_commplan.commplan_versions`
  (id, effective_from, effective_to, active, notes, created_at, updated_at)
VALUES
  ('2026', DATE '2026-01-01', DATE '2026-12-31', TRUE,
   'Compplan 2026 — versão inicial',
   CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP());

-- ── Catálogo de Features (28 features do Command + Inventário Parceiro) ──
-- Critério (definido com o time HYPR):
--   Tier 1: features com alta conversão direta ou medição complexa
--   Tier 2: features de engajamento/segmentação + inventários parceiros
--   Tier 3: features avançadas/premium com baixa frequência de uso
INSERT INTO `site-hypr.hypr_commplan.commplan_features_catalog`
  (feature_code, display_name, tier, version_id, active, notes, created_at, updated_at)
VALUES
  -- ╔══ Tier 1 (9 features) — alta conversão / complexidade ══╗
  ('p_dooh',           'P-DOOH',           1, '2026', TRUE, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),
  ('tap_to_go',        'Tap to Go',        1, '2026', TRUE, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),
  ('tap_to_scratch',   'Tap To Scratch',   1, '2026', TRUE, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),
  ('tap_to_slide',     'Tap To Slide',     1, '2026', TRUE, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),
  ('tap_to_carousel',  'Tap To Carousel',  1, '2026', TRUE, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),
  ('tap_to_chat',      'Tap To Chat',      1, '2026', TRUE, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),
  ('tap_to_hotspot',   'Tap To Hotspot',   1, '2026', TRUE, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),
  ('survey',           'Survey',           1, '2026', TRUE, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),
  ('footfall',         'Footfall',         1, '2026', TRUE, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

  -- ╔══ Tier 2 (16 features) — engajamento + invent\u00e1rios parceiros ══╗
  ('weather',          'Weather',          2, '2026', TRUE, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),
  ('topics',           'Topics',           2, '2026', TRUE, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),
  ('click_to_calendar', 'Click to Calendar', 2, '2026', TRUE, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),
  ('downloaded_apps',  'Downloaded Apps',  2, '2026', TRUE, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),
  ('purchase_context', 'Purchase Context', 2, '2026', TRUE, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),
  ('attention_ad',     'Attention Ad',     2, '2026', TRUE, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),
  ('video_survey',     'Video Survey',     2, '2026', TRUE, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),
  -- Inventários parceiros (entram como features Tier 2)
  ('globoplay',        'Globoplay',        2, '2026', TRUE, 'inventário parceiro', CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),
  ('twitchtv',         'TwitchTV',         2, '2026', TRUE, 'inventário parceiro', CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),
  ('disneyplus',       'DisneyPlus',       2, '2026', TRUE, 'inventário parceiro', CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),
  ('activision',       'Activision',       2, '2026', TRUE, 'inventário parceiro', CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),
  ('blizzard',         'Blizzard',         2, '2026', TRUE, 'inventário parceiro', CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),
  ('samsungtv',        'SamsungTV',        2, '2026', TRUE, 'inventário parceiro', CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),
  ('plutotv',          'PlutoTV',          2, '2026', TRUE, 'inventário parceiro', CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),
  ('roku',             'Roku',             2, '2026', TRUE, 'inventário parceiro', CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),
  ('spotify',          'Spotify',          2, '2026', TRUE, 'inventário parceiro', CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

  -- ╔══ Tier 3 (3 features) — avançadas / baixa frequência ══╗
  ('ctv',              'CTV',              3, '2026', TRUE, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),
  ('tv_sync',          'TV Sync',          3, '2026', TRUE, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),
  ('hypr_pass',        'HYPR Pass',        3, '2026', TRUE, 'wallet/cupom', CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP());

-- ── Clientes ABS ──────────────────────────────────────────────────────────
-- Lista fornecida pelo usuário. Os advertiser_ids precisam ser confirmados
-- antes do go-live em produção (especialmente JDE/Kenvue que estavam
-- duplicados, e Amazon Prime Video / Nestlé que estavam faltando).
INSERT INTO `site-hypr.hypr_commplan.commplan_abs_clients`
  (advertiser_id, client_group, display_name, via_partner, active, notes, created_at, updated_at)
VALUES
  ('1116541',  'Colgate',     'Colgate',                      NULL,    TRUE, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),
  ('1142420',  'Mondelez',    'Mondelez',                     NULL,    TRUE, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),
  ('1175340',  'Boticário',   'Grupo Boticário',              NULL,    TRUE, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),
  ('1297544',  'Santander',   'Santander',                    NULL,    TRUE, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),
  ('2125996',  'Diageo',      'Diageo',                       NULL,    TRUE, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),
  ('1856472',  'Kraft-Heinz', 'Kraft-Heinz',                  NULL,    TRUE, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),
  ('2061345',  'Mercedes',    'Mercedes-Benz',                NULL,    TRUE, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),
  ('1972881',  'Reckitt',     'Reckitt',                      NULL,    TRUE, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),
  ('5134821',  'Amazon',      'Amazon Web Services',          'XCM',   TRUE, 'via XCM', CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),
  ('5134822',  'Amazon',      'Amazon (XCM)',                 'XCM',   TRUE, 'via XCM', CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),
  ('1283044',  'Unilever',    'Unilever',                     NULL,    TRUE, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),
  ('2410092',  'Uber',        'Uber',                         NULL,    TRUE, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),
  ('51004515', 'JDE',         'JDE',                          NULL,    TRUE, 'CONFIRMAR ID — pode estar duplicado com Kenvue', CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),
  ('51004516', 'Kenvue',      'Kenvue',                       NULL,    TRUE, 'CONFIRMAR ID — placeholder', CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),
  ('1948302',  'PepsiCo',     'PepsiCo',                      NULL,    TRUE, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP());

-- ── Regras do Compplan 2026 ───────────────────────────────────────────────
-- Estrutura: id, version, category, subcategory, display_name, display_order,
--            bonus_pct, evaluation_mode, condition_kind, condition_payload,
--            cap_group, cap_max_pct, exclusion_group, active, ts, ts

INSERT INTO `site-hypr.hypr_commplan.commplan_rules`
  (id, version_id, category, subcategory, display_name, display_order,
   bonus_pct, evaluation_mode, condition_kind, condition_payload,
   cap_group, cap_max_pct, exclusion_group, active, created_at, updated_at)
VALUES

-- ╔════════════════════════════════════════════════════════════════╗
-- ║ PRÉ CAMPANHA (cap total: 1,35%)                                 ║
-- ╚════════════════════════════════════════════════════════════════╝
('pre_camp_audiencias_2026', '2026',
 'pre_campaign', 'audiencias', 'Audiências', 10,
 0.0015, 'manual', 'manual_claim',
 JSON '{"description": "Estratégia de audiências definida e aprovada na pré-campanha"}',
 NULL, NULL, NULL, TRUE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

-- "Definição de features" (cap 0,70%) — 4 itens empilháveis
('pre_camp_rmn_fisico_2026', '2026',
 'pre_campaign', 'definicao_features', 'RMN Físico (inédito)', 21,
 0.0025, 'manual', 'manual_claim',
 JSON '{"description": "RMN Físico inédito — primeira ativação no cliente"}',
 'pre_camp_definicao_features', 0.0070, NULL, TRUE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

('pre_camp_feature_1st_2026', '2026',
 'pre_campaign', 'definicao_features', '1ª feature definida', 22,
 0.0020, 'manual', 'manual_claim',
 JSON '{"description": "Primeira feature definida na pré-campanha (qualquer tier)"}',
 'pre_camp_definicao_features', 0.0070, NULL, TRUE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

('pre_camp_feature_2nd_2026', '2026',
 'pre_campaign', 'definicao_features', '2ª feature definida', 23,
 0.0015, 'manual', 'manual_claim',
 JSON '{"description": "Segunda feature definida na pré-campanha"}',
 'pre_camp_definicao_features', 0.0070, NULL, TRUE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

('pre_camp_feature_3rd_2026', '2026',
 'pre_campaign', 'definicao_features', '3ª feature definida', 24,
 0.0010, 'manual', 'manual_claim',
 JSON '{"description": "Terceira feature definida na pré-campanha"}',
 'pre_camp_definicao_features', 0.0070, NULL, TRUE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

-- "Enriquecimento de plano" (cap 0,30%)
('pre_camp_bench_case_2026', '2026',
 'pre_campaign', 'enriquecimento', 'Bench / Case na pré-campanha', 31,
 0.0010, 'manual', 'manual_claim',
 JSON '{"description": "Apresentação de bench ou case prévio relevante na pré-campanha"}',
 'pre_camp_enriquecimento', 0.0030, NULL, TRUE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

('pre_camp_kepler_2026', '2026',
 'pre_campaign', 'enriquecimento', 'Uso do Kepler', 32,
 0.0020, 'manual', 'manual_claim',
 JSON '{"description": "Uso do Kepler para enriquecimento de plano"}',
 'pre_camp_enriquecimento', 0.0030, NULL, TRUE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

('pre_camp_seasonal_plan_2026', '2026',
 'pre_campaign', 'plano_sazonal', 'Plano sazonal', 40,
 0.0020, 'manual', 'manual_claim',
 JSON '{"description": "Plano sazonal definido e aprovado pelo cliente"}',
 NULL, NULL, NULL, TRUE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

-- ╔════════════════════════════════════════════════════════════════╗
-- ║ SETUP (cap total: 2,30%)                                        ║
-- ╚════════════════════════════════════════════════════════════════╝
-- Mídia base — O2O xor OOH (exclusion_group), valor único 0,45%
('setup_media_o2o_2026', '2026',
 'setup', 'media_base', 'Mídia base: O2O', 51,
 0.0045, 'auto', 'field_present',
 JSON '{"field": "products", "any_of": ["O2O"]}',
 NULL, NULL, 'setup_o2o_ooh', TRUE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

('setup_media_ooh_2026', '2026',
 'setup', 'media_base', 'Mídia base: OOH', 52,
 0.0045, 'auto', 'field_present',
 JSON '{"field": "products", "any_of": ["OOH"]}',
 NULL, NULL, 'setup_o2o_ooh', TRUE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

('setup_media_rmn_digital_2026', '2026',
 'setup', 'media_base', 'Mídia base: RMN Digital', 53,
 0.0015, 'auto', 'field_present',
 JSON '{"field": "products", "any_of": ["RMN Digital", "RMNd"]}',
 NULL, NULL, NULL, TRUE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

('setup_media_rmn_fisico_2026', '2026',
 'setup', 'media_base', 'Mídia base: RMN Físico', 54,
 0.0055, 'auto', 'field_present',
 JSON '{"field": "products", "any_of": ["RMN Físico", "RMN Fisico", "RMNf"]}',
 NULL, NULL, NULL, TRUE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

-- Tier 1: 1ª, 2ª, 3ª (cap 0,60%)
('setup_tier1_1st_2026', '2026',
 'setup', 'tier1', '1ª feature Tier 1', 61,
 0.0030, 'auto', 'feature_in_tier',
 JSON '{"tier": 1, "ranking": 1}',
 'setup_tier1', 0.0060, NULL, TRUE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

('setup_tier1_2nd_2026', '2026',
 'setup', 'tier1', '2ª feature Tier 1', 62,
 0.0020, 'auto', 'feature_in_tier',
 JSON '{"tier": 1, "ranking": 2}',
 'setup_tier1', 0.0060, NULL, TRUE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

('setup_tier1_3rd_2026', '2026',
 'setup', 'tier1', '3ª feature Tier 1', 63,
 0.0010, 'auto', 'feature_in_tier',
 JSON '{"tier": 1, "ranking": 3}',
 'setup_tier1', 0.0060, NULL, TRUE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

-- Tier 2: 1ª, 2ª (cap 0,35%)
('setup_tier2_1st_2026', '2026',
 'setup', 'tier2', '1ª feature Tier 2', 71,
 0.0020, 'auto', 'feature_in_tier',
 JSON '{"tier": 2, "ranking": 1}',
 'setup_tier2', 0.0035, NULL, TRUE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

('setup_tier2_2nd_2026', '2026',
 'setup', 'tier2', '2ª feature Tier 2', 72,
 0.0015, 'auto', 'feature_in_tier',
 JSON '{"tier": 2, "ranking": 2}',
 'setup_tier2', 0.0035, NULL, TRUE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

-- Tier 3: 1ª (sem cap_group, item único)
('setup_tier3_1st_2026', '2026',
 'setup', 'tier3', '1ª feature Tier 3', 81,
 0.0020, 'auto', 'feature_in_tier',
 JSON '{"tier": 3, "ranking": 1}',
 NULL, NULL, NULL, TRUE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

-- Setup invalidators (3 variants — não pagam, zeram Setup)
('setup_inv_under_2026', '2026',
 'setup', '_invalidators', 'Pacing < 90% (under)', 91,
 0.0000, 'auto', 'setup_invalidator_under',
 JSON '{"threshold_pct": 90}',
 NULL, NULL, NULL, TRUE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

('setup_inv_over_2026', '2026',
 'setup', '_invalidators', 'Pacing > 150% (over sem justif.)', 92,
 0.0000, 'hybrid', 'setup_invalidator_over',
 JSON '{"threshold_pct": 150}',
 NULL, NULL, NULL, TRUE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

('setup_inv_creative_fee_2026', '2026',
 'setup', '_invalidators', 'Creative fee > R$ 1.000', 93,
 0.0000, 'manual', 'setup_invalidator_manual',
 JSON '{"description": "Houve creative fee acima de R$ 1.000 nesta campanha?", "threshold_brl": 1000}',
 NULL, NULL, NULL, TRUE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

-- ╔════════════════════════════════════════════════════════════════╗
-- ║ OTIMIZAÇÃO (0,30%)                                              ║
-- ╚════════════════════════════════════════════════════════════════╝
('opt_media_2026', '2026',
 'optimization', 'media', 'Otimização: Display ou Video (KPIs)', 100,
 0.0030, 'auto', 'media_optimization',
 JSON '{"description": "Avalia Display se houver; senão Video. KPIs: pacing<125%, eCPM e CTR/VTR conforme threshold ABS"}',
 NULL, NULL, NULL, TRUE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

-- ╔════════════════════════════════════════════════════════════════╗
-- ║ ACCOUNT MANAGEMENT (cap total: 1,20%)                           ║
-- ╚════════════════════════════════════════════════════════════════╝
('am_analytics_2026', '2026',
 'account_mgmt', 'analytics', 'Visão analytics', 110,
 0.0020, 'manual', 'manual_claim',
 JSON '{"description": "Visão analytics entregue ao cliente (PowerBI/Looker)"}',
 NULL, NULL, NULL, TRUE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

('am_relatorios_2026', '2026',
 'account_mgmt', 'relatorios', 'Relatórios entregues', 111,
 0.0010, 'manual', 'manual_claim',
 JSON '{"description": "Relatórios entregues no prazo durante a campanha"}',
 NULL, NULL, NULL, TRUE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

('am_loom_2026', '2026',
 'account_mgmt', 'loom', 'Loom (post-mortem)', 112,
 0.0010, 'auto', 'external_field_present',
 JSON '{"source": "report_center", "table": "campaign_results", "field": "loom_url", "evidence_url_template": "https://report-center.../report/{short_token}"}',
 NULL, NULL, NULL, TRUE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

-- Pós-venda (cap 0,30%)
('am_post_sale_meeting_2026', '2026',
 'account_mgmt', 'pos_venda', 'Reunião de pós-venda', 121,
 0.0015, 'manual', 'manual_claim',
 JSON '{"description": "Reunião de pós-venda realizada com o cliente"}',
 'am_pos_venda', 0.0030, NULL, TRUE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

('am_post_sale_doc_2026', '2026',
 'account_mgmt', 'pos_venda', 'Documento de pós-venda', 122,
 0.0015, 'manual', 'manual_claim',
 JSON '{"description": "Documento estruturado de pós-venda entregue"}',
 'am_pos_venda', 0.0030, NULL, TRUE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

-- Renovação (exclusion_group: com OU sem value prop)
('am_renewal_with_vp_2026', '2026',
 'account_mgmt', 'renovacao', 'Renovação com value proposition', 131,
 0.0050, 'manual', 'manual_claim',
 JSON '{"description": "Cliente renovou após apresentação de value proposition estruturada"}',
 NULL, NULL, 'am_renewal_choice', TRUE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

('am_renewal_no_vp_2026', '2026',
 'account_mgmt', 'renovacao', 'Renovação sem value proposition', 132,
 0.0030, 'manual', 'manual_claim',
 JSON '{"description": "Cliente renovou sem apresentação formal de value proposition"}',
 NULL, NULL, 'am_renewal_choice', TRUE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

-- ╔════════════════════════════════════════════════════════════════╗
-- ║ EXTRAS (cap total: 0,55%)                                       ║
-- ╚════════════════════════════════════════════════════════════════╝
('extras_dark_test_2026', '2026',
 'extras', 'dark_test', 'Dark test (RMN Digital)', 140,
 0.0010, 'manual', 'manual_claim',
 JSON '{"description": "Dark test executado em RMN Digital (teste sem comunicação)"}',
 NULL, NULL, NULL, TRUE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

('extras_design_studio_2026', '2026',
 'extras', 'design_studio', 'Design studio', 141,
 0.0015, 'manual', 'manual_claim',
 JSON '{"description": "Uso do design studio interno para criação de peças"}',
 NULL, NULL, NULL, TRUE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

('extras_studies_2026', '2026',
 'extras', 'estudos', 'Estudo usado em campanha (autor recebe)', 142,
 0.0030, 'auto', 'study_used',
 JSON '{"description": "0,30% sobre receita líquida quando o CP marca um estudo no checklist. Bônus vai para o autor do estudo, não para o CS dono da campanha."}',
 NULL, NULL, NULL, TRUE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

-- ╔════════════════════════════════════════════════════════════════╗
-- ║ ONBOARDING / MENTORIA                                            ║
-- ╚════════════════════════════════════════════════════════════════╝
('onboarding_mentor_2026', '2026',
 'onboarding', 'mentor', 'Bônus de mentoria (mentor recebe)', 200,
 0.0025, 'auto', 'mentorship_revenue',
 JSON '{"description": "0,25% sobre receita líquida de cada campanha do mentee, vai pro mentor"}',
 NULL, NULL, NULL, TRUE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP());


-- ── Admins iniciais em team_members ───────────────────────────────────────
-- Estes registros precisam que team_members já exista no Command. Se não
-- existir, o script grava normalmente (BQ tolera schema permissivo). Após
-- criar, o login Google desses emails retorna role='admin'.
INSERT INTO `site-hypr.hypr_sales_center.team_members`
  (email, name, role, added_by, added_at, active)
VALUES
  ('matheus.machado@hypr.mobi', 'Matheus Machado',  'admin', 'system', CURRENT_TIMESTAMP(), TRUE),
  ('mateus.lambranho@hypr.mobi', 'Mateus Lambranho', 'admin', 'system', CURRENT_TIMESTAMP(), TRUE),
  -- CSs ativos do time (sem salário inicial — admin define depois via UI)
  ('beatriz.severine@hypr.mobi',  'Beatriz Severine',  'cs', 'system', CURRENT_TIMESTAMP(), TRUE),
  ('isaac.lobo@hypr.mobi',        'Isaac Lobo',        'cs', 'system', CURRENT_TIMESTAMP(), TRUE),
  ('mariana.lewinski@hypr.mobi',  'Mariana Lewinski',  'cs', 'system', CURRENT_TIMESTAMP(), TRUE),
  ('thiago.nascimento@hypr.mobi', 'Thiago Nascimento', 'cs', 'system', CURRENT_TIMESTAMP(), TRUE),
  ('joao.buzolin@hypr.mobi',      'João Buzolin',      'cs', 'system', CURRENT_TIMESTAMP(), TRUE),
  ('joao.armelin@hypr.mobi',      'João Armelin',      'cs', 'system', CURRENT_TIMESTAMP(), TRUE);

-- ── Catálogo de Estudos Sazonais 2026 ─────────────────────────────────────
-- Espelha a planilha do time. Os e-mails dos autores estão como
-- {primeiro_nome}.{sobrenome}@hypr.mobi — confirmar/corrigir antes do go-live.
INSERT INTO `site-hypr.hypr_commplan.commplan_studies_catalog`
  (id, version_id, display_name, author_email, celebration_date,
   delivery_estimate, status, link_url, active, notes, created_at, updated_at)
VALUES
  ('dia_das_mulheres_2026', '2026', 'Dia das Mulheres',
   'beatriz.severine@hypr.mobi', DATE '2026-03-08', '01/2026', 'feito',
   NULL, TRUE, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

  ('pascoa_2026', '2026', 'Páscoa',
   'isaac.lobo@hypr.mobi', DATE '2026-04-05', '01/2026', 'feito',
   NULL, TRUE, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

  ('copa_do_mundo_2026', '2026', 'Copa do Mundo',
   'thiago.nascimento@hypr.mobi', DATE '2026-06-11', '01/2026', 'feito',
   NULL, TRUE, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

  ('dia_das_maes_2026', '2026', 'Dia das Mães',
   'mariana.lewinski@hypr.mobi', DATE '2026-05-10', '02/2026', 'feito',
   NULL, TRUE, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

  ('festivais_2026', '2026', 'Festivais',
   'joao.buzolin@hypr.mobi', NULL, '02/2026', 'feito',
   NULL, TRUE, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

  ('dia_dos_namorados_2026', '2026', 'Dia dos Namorados',
   'joao.armelin@hypr.mobi', DATE '2026-06-12', '03/2026', 'feito',
   NULL, TRUE, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

  ('festa_junina_2026', '2026', 'Festa Junina',
   'joao.buzolin@hypr.mobi', DATE '2026-06-24', '04/2026', 'feito',
   NULL, TRUE, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

  ('dia_dos_pais_2026', '2026', 'Dia dos Pais',
   'joao.armelin@hypr.mobi', DATE '2026-08-09', '05/2026', 'planejado',
   NULL, TRUE, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

  ('dia_das_criancas_2026', '2026', 'Dia das Crianças',
   'isaac.lobo@hypr.mobi', DATE '2026-10-12', '07/2026', 'planejado',
   NULL, TRUE, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

  ('black_friday_2026', '2026', 'Black Friday',
   'joao.armelin@hypr.mobi', DATE '2026-11-27', '08/2026', 'planejado',
   NULL, TRUE, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

  ('verao_ferias_2026', '2026', 'Verão/Férias',
   'thiago.nascimento@hypr.mobi', DATE '2027-01-01', '09/2026', 'planejado',
   NULL, TRUE, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

  ('natal_2026', '2026', 'Natal',
   'beatriz.severine@hypr.mobi', DATE '2026-12-25', '09/2026', 'planejado',
   NULL, TRUE, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

  ('formula_1_2026', '2026', 'Fórmula 1',
   'mariana.lewinski@hypr.mobi', DATE '2026-11-06', '09/2026', 'planejado',
   NULL, TRUE, 'Marcado em laranja na planilha — confirmar com Mariana se status real é "feito"', CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

  ('carnaval_2026', '2026', 'Carnaval',
   'thiago.nascimento@hypr.mobi', DATE '2027-02-13', '10/2026', 'planejado',
   NULL, TRUE, 'Carnaval 2027 — planejamento começa em out/2026', CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP()),

  ('volta_as_aulas_2026', '2026', 'Volta às Aulas',
   'joao.buzolin@hypr.mobi', DATE '2027-01-31', '10/2026', 'planejado',
   NULL, TRUE, NULL, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP());
