-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  HYPR Commplan — Legacy Assignments + Snapshot + VIEW Unificada      ║
-- ║                                                                        ║
-- ║  Tipos das colunas verificados contra schema real de                   ║
-- ║  hypr_sales_center.checklists (39 colunas).                           ║
-- ║                                                                        ║
-- ║  ARRAY<STRING>: formats, products, marketplaces, features, redirect_urls,
-- ║                 studies_used                                           ║
-- ║  JSON:          feature_volumes, extras                                ║
-- ║  STRING:        audiences (texto livre, não array)                    ║
-- ║                                                                        ║
-- ║  Roda DEPOIS de 01-schema.sql + 02-seeds.sql + 03-migrations.sql.     ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- ── A. Tabela de atribuições manuais para campanhas legadas ──────────────
CREATE TABLE IF NOT EXISTS `site-hypr.hypr_commplan.commplan_legacy_assignments` (
  short_token        STRING NOT NULL,
  cs_email           STRING NOT NULL,
  features_manual    ARRAY<STRING>,
  products_manual    ARRAY<STRING>,
  audiences_count    INT64,
  had_cs_meeting     BOOL,
  studies_used       ARRAY<STRING>,
  source_attribution STRING NOT NULL,
  attributed_by      STRING NOT NULL,
  attributed_at      TIMESTAMP NOT NULL,
  updated_by         STRING,
  updated_at         TIMESTAMP,
  notes              STRING
);

-- ── B. Snapshot table de checklist_info ──────────────────────────────────
CREATE TABLE IF NOT EXISTS `site-hypr.hypr_commplan.checklist_info_snapshot` (
  short_token                            STRING,
  client_name                            STRING,
  campaign_name                          STRING,
  salesman                               STRING,
  agency                                 STRING,
  industry                               STRING,
  campaign_type                          STRING,
  start_date                             DATE,
  end_date                               DATE,
  total_value                            FLOAT64,
  formats                                STRING,
  sold_audiences                         STRING,
  cpm_amount                             FLOAT64,
  cpcv_amount                            FLOAT64,
  contracted_o2o_display_impressions     INT64,
  contracted_o2o_video_completions       INT64,
  bonus_o2o_display_impressions          INT64,
  bonus_o2o_video_completions            INT64,
  contracted_ooh_display_impressions     INT64,
  contracted_ooh_video_completions       INT64,
  bonus_ooh_display_impressions          INT64,
  bonus_ooh_video_completions            INT64,
  snapshot_taken_at                      TIMESTAMP NOT NULL
);

-- ── D. VIEW unificada — fonte única de checklists para o Compplan ────────
--
-- Tipos das colunas (todas tipadas explicitamente pra UNION ALL não falhar):
--   short_token, source, id, cp_name, cp_email, submitted_by,
--   submitted_by_email, cs_name, cs_email                   STRING
--   agency, industry, campaign_type, client_name, campaign_name STRING
--   start_date, end_date                                   DATE
--   total_value, cpm_amount, cpcv_amount                   FLOAT64
--   deal_dv360, had_cs_meeting, has_bonus, is_legacy       BOOL
--   formats, products, marketplaces, features,
--     redirect_urls, studies_used                          ARRAY<STRING>
--   audiences                                              STRING (texto livre)
--   o2o_*, ooh_*                                           INT64
--   pracas_type, pracas_detail, ooh_link, pecas_link,
--     pi_link, proposta_link                               STRING
--   feature_volumes, extras                                JSON
--   created_at                                             TIMESTAMP

CREATE OR REPLACE VIEW `site-hypr.hypr_commplan.commplan_checklists` AS

-- ── Fonte 1: checklists novos (Command) ─────────────────────────────────
SELECT
  short_token,
  CAST('checklists' AS STRING)              AS source,
  id,
  cp_name,
  cp_email,
  submitted_by,
  submitted_by_email,
  cs_name,
  LOWER(cs_email)                           AS cs_email,
  agency,
  industry,
  campaign_type,
  client                                    AS client_name,
  campaign_name,
  start_date,
  end_date,
  CAST(investment AS FLOAT64)               AS total_value,
  deal_dv360,
  formats,
  products,
  marketplaces,
  CAST(o2o_impressoes AS INT64)             AS o2o_display_impressions,
  CAST(o2o_views AS INT64)                  AS o2o_video_completions,
  CAST(bonus_o2o_impressoes AS INT64)       AS bonus_o2o_display_impressions,
  CAST(bonus_o2o_views AS INT64)            AS bonus_o2o_video_completions,
  CAST(NULL AS INT64)                       AS ooh_display_impressions,
  CAST(NULL AS INT64)                       AS ooh_video_completions,
  CAST(NULL AS INT64)                       AS bonus_ooh_display_impressions,
  CAST(NULL AS INT64)                       AS bonus_ooh_video_completions,
  CAST(cpm AS FLOAT64)                      AS cpm_amount,
  CAST(cpcv AS FLOAT64)                     AS cpcv_amount,
  audiences,
  had_cs_meeting,
  pracas_type,
  pracas_detail,
  features,
  feature_volumes,
  studies_used,
  ooh_link,
  pecas_link,
  redirect_urls,
  pi_link,
  proposta_link,
  has_bonus,
  extras,
  created_at,
  FALSE                                     AS is_legacy
FROM `site-hypr.hypr_sales_center.checklists`
WHERE start_date >= DATE '2026-04-01'

UNION ALL

-- ── Fonte 2: legados atribuídos (snapshot + assignments) ─────────────────
SELECT
  ci.short_token,
  CAST('checklist_info_snapshot' AS STRING) AS source,
  CAST(NULL AS STRING)                      AS id,
  ci.salesman                               AS cp_name,
  CAST(NULL AS STRING)                      AS cp_email,
  CAST(NULL AS STRING)                      AS submitted_by,
  CAST(NULL AS STRING)                      AS submitted_by_email,
  (SELECT name FROM `site-hypr.hypr_sales_center.team_members` tm
   WHERE LOWER(tm.email) = LOWER(la.cs_email) LIMIT 1) AS cs_name,
  LOWER(la.cs_email)                        AS cs_email,
  ci.agency,
  ci.industry,
  ci.campaign_type,
  ci.client_name,
  ci.campaign_name,
  ci.start_date,
  ci.end_date,
  ci.total_value,
  CAST(NULL AS BOOL)                        AS deal_dv360,
  -- Legacy: formats vem como STRING; split em ARRAY<STRING>
  IFNULL(SPLIT(ci.formats, ', '), ARRAY<STRING>[]) AS formats,
  -- Products: vem do legacy_assignments (admin preenche manualmente)
  IFNULL(la.products_manual, ARRAY<STRING>[])      AS products,
  CAST(ARRAY<STRING>[] AS ARRAY<STRING>)    AS marketplaces,
  ci.contracted_o2o_display_impressions     AS o2o_display_impressions,
  ci.contracted_o2o_video_completions       AS o2o_video_completions,
  ci.bonus_o2o_display_impressions          AS bonus_o2o_display_impressions,
  ci.bonus_o2o_video_completions            AS bonus_o2o_video_completions,
  ci.contracted_ooh_display_impressions     AS ooh_display_impressions,
  ci.contracted_ooh_video_completions       AS ooh_video_completions,
  ci.bonus_ooh_display_impressions          AS bonus_ooh_display_impressions,
  ci.bonus_ooh_video_completions            AS bonus_ooh_video_completions,
  ci.cpm_amount,
  ci.cpcv_amount,
  -- Audiences é STRING no schema; legacy usa sold_audiences (texto livre)
  ci.sold_audiences                         AS audiences,
  la.had_cs_meeting,
  CAST(NULL AS STRING)                      AS pracas_type,
  CAST(NULL AS STRING)                      AS pracas_detail,
  IFNULL(la.features_manual, ARRAY<STRING>[]) AS features,
  CAST(NULL AS JSON)                        AS feature_volumes,
  IFNULL(la.studies_used, ARRAY<STRING>[])  AS studies_used,
  CAST(NULL AS STRING)                      AS ooh_link,
  CAST(NULL AS STRING)                      AS pecas_link,
  CAST(ARRAY<STRING>[] AS ARRAY<STRING>)    AS redirect_urls,
  CAST(NULL AS STRING)                      AS pi_link,
  CAST(NULL AS STRING)                      AS proposta_link,
  CAST(NULL AS BOOL)                        AS has_bonus,
  CAST(NULL AS JSON)                        AS extras,
  la.attributed_at                          AS created_at,
  TRUE                                      AS is_legacy
FROM `site-hypr.hypr_commplan.checklist_info_snapshot` AS ci
INNER JOIN `site-hypr.hypr_commplan.commplan_legacy_assignments` AS la
  ON ci.short_token = la.short_token
WHERE ci.start_date >= DATE '2026-04-01'
  AND ci.short_token NOT IN (
    SELECT short_token
    FROM `site-hypr.hypr_sales_center.checklists`
    WHERE start_date >= DATE '2026-04-01'
  )
;

-- ── E. VIEW auxiliar: campanhas legadas SEM atribuição ────────────────────
CREATE OR REPLACE VIEW `site-hypr.hypr_commplan.commplan_pending_legacy` AS
SELECT
  ci.short_token,
  ci.client_name,
  ci.campaign_name,
  ci.salesman      AS cp_name,
  ci.agency,
  ci.industry,
  ci.campaign_type,
  ci.start_date,
  ci.end_date,
  ci.total_value,
  ci.formats       AS formats_str,
  ci.sold_audiences,
  ci.cpm_amount,
  ci.cpcv_amount,
  ci.contracted_o2o_display_impressions + IFNULL(ci.contracted_ooh_display_impressions, 0) AS total_display_impressions,
  ci.contracted_o2o_video_completions   + IFNULL(ci.contracted_ooh_video_completions, 0)   AS total_video_completions
FROM `site-hypr.hypr_commplan.checklist_info_snapshot` AS ci
WHERE ci.start_date >= DATE '2026-04-01'
  AND ci.short_token NOT IN (
    SELECT short_token
    FROM `site-hypr.hypr_sales_center.checklists`
  )
  AND ci.short_token NOT IN (
    SELECT short_token
    FROM `site-hypr.hypr_commplan.commplan_legacy_assignments`
  )
ORDER BY ci.start_date DESC, ci.client_name
;
