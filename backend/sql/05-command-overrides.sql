-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  05 — commplan_command_overrides                                          ║
-- ║                                                                            ║
-- ║  Tabela auxiliar pra ARMAZENAR confirmações/correções do CS em campanhas  ║
-- ║  do Command novo. NÃO modifica hypr_sales_center.checklists (source of    ║
-- ║  truth). Tudo aqui é OVERLAY: se vazio, usa o valor do checklist;         ║
-- ║  se preenchido, sobrescreve.                                              ║
-- ║                                                                            ║
-- ║  Pra campanhas legacy: já usa commplan_legacy_assignments (mesma forma).  ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE TABLE IF NOT EXISTS `site-hypr.hypr_commplan.commplan_command_overrides` (
  short_token        STRING NOT NULL,
  cs_email           STRING NOT NULL,       -- guarda quem confirmou (= cs_email da campanha)

  -- Campos do double-check. NULL = usar valor do checklist; preenchido = override.
  features_override  ARRAY<STRING>,
  products_override  ARRAY<STRING>,
  audiences_count    INT64,
  had_cs_meeting     BOOL,
  studies_used       ARRAY<STRING>,
  notes              STRING,

  -- Workflow
  reviewed           BOOL NOT NULL,         -- TRUE quando CS clicou em "Confirmar"
  reviewed_at        TIMESTAMP,

  -- Auditoria
  created_at         TIMESTAMP NOT NULL,
  updated_at         TIMESTAMP NOT NULL,
  updated_by         STRING NOT NULL
);

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Atualiza commplan_checklists VIEW pra incluir status de revisão         ║
-- ║  e usar overrides quando existirem.                                      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE VIEW `site-hypr.hypr_commplan.commplan_checklists` AS

-- ── Fonte 1: checklists novos (Command) + overrides do CS ─────────────────
SELECT
  c.short_token,
  CAST('checklists' AS STRING)              AS source,
  c.id,
  c.cp_name,
  c.cp_email,
  c.submitted_by,
  c.submitted_by_email,
  c.cs_name,
  LOWER(c.cs_email)                         AS cs_email,
  c.agency,
  c.industry,
  c.campaign_type,
  c.client                                  AS client_name,
  c.campaign_name,
  c.start_date,
  c.end_date,
  CAST(c.investment AS FLOAT64)             AS total_value,
  c.deal_dv360,
  c.formats,
  -- Products: override se existir, senão checklist
  IFNULL(o.products_override, c.products)   AS products,
  c.marketplaces,
  CAST(c.o2o_impressoes AS INT64)           AS o2o_display_impressions,
  CAST(c.o2o_views AS INT64)                AS o2o_video_completions,
  CAST(c.bonus_o2o_impressoes AS INT64)     AS bonus_o2o_display_impressions,
  CAST(c.bonus_o2o_views AS INT64)          AS bonus_o2o_video_completions,
  CAST(NULL AS INT64)                       AS ooh_display_impressions,
  CAST(NULL AS INT64)                       AS ooh_video_completions,
  CAST(NULL AS INT64)                       AS bonus_ooh_display_impressions,
  CAST(NULL AS INT64)                       AS bonus_ooh_video_completions,
  CAST(c.cpm AS FLOAT64)                    AS cpm_amount,
  CAST(c.cpcv AS FLOAT64)                   AS cpcv_amount,
  c.audiences,
  -- had_cs_meeting: override prioritário
  IFNULL(o.had_cs_meeting, c.had_cs_meeting) AS had_cs_meeting,
  c.pracas_type,
  c.pracas_detail,
  -- Features: override prioritário
  IFNULL(o.features_override, c.features)   AS features,
  c.feature_volumes,
  -- Studies: override prioritário
  IFNULL(o.studies_used, c.studies_used)    AS studies_used,
  c.ooh_link,
  c.pecas_link,
  c.redirect_urls,
  c.pi_link,
  c.proposta_link,
  c.has_bonus,
  c.extras,
  c.created_at,
  FALSE                                     AS is_legacy,
  -- Status do double-check
  IFNULL(o.reviewed, FALSE)                 AS reviewed,
  o.reviewed_at,
  o.notes,
  o.audiences_count
FROM `site-hypr.hypr_sales_center.checklists` AS c
LEFT JOIN `site-hypr.hypr_commplan.commplan_command_overrides` AS o
  ON c.short_token = o.short_token
WHERE c.start_date >= DATE '2026-04-01'

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
  IFNULL(SPLIT(ci.formats, ', '), ARRAY<STRING>[]) AS formats,
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
  TRUE                                      AS is_legacy,
  -- Pra legacy, considera "revisada" se updated_at preenchido após attributed_at
  CASE
    WHEN la.updated_at IS NOT NULL AND la.updated_at > la.attributed_at THEN TRUE
    ELSE FALSE
  END                                       AS reviewed,
  la.updated_at                             AS reviewed_at,
  la.notes,
  la.audiences_count
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
