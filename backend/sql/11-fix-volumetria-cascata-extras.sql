-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  11 — Fix: volumetria contratada em cascata completa                      ║
-- ║       (coluna Command → extras JSON → prod_assets.checklist_info →         ║
-- ║        checklist_info_snapshot)                                            ║
-- ║                                                                            ║
-- ║  PROBLEMA (campanha WTKITT - UFC Freedom 250 White House):                ║
-- ║  Over calculado como 67.8% (anulou o setup), mas o correto é 11.9%.       ║
-- ║                                                                            ║
-- ║  Descoberta:                                                               ║
-- ║   - o2o_impressoes (coluna Command)       = 14.036.000 ✅                 ║
-- ║   - bonus_o2o_impressoes (coluna Command) = NULL       ❌                 ║
-- ║   - MAS extras (JSON) tem O2O_bonus_imp   = 7.018.000  ✅                 ║
-- ║                                                                            ║
-- ║  O Command salva a volumetria de forma inconsistente: às vezes na         ║
-- ║  coluna dedicada, às vezes só no JSON `extras`. A bonificação (7.018.000) ║
-- ║  ficou só no extras, então a view lia NULL e o denominador do over        ║
-- ║  ficava só com o contratado (14.036.000).                                 ║
-- ║                                                                            ║
-- ║  Conta correta:                                                            ║
-- ║   denominador = contratado + bônus = 14.036.000 + 7.018.000 = 21.054.000  ║
-- ║   over = (23.558.529 entregue / 21.054.000) - 1 = 11.9%  (< 50% ✓)       ║
-- ║                                                                            ║
-- ║  Chaves do JSON extras (confirmadas em prod):                            ║
-- ║   O2O_imp, O2O_bonus_imp, O2O_views, O2O_bonus_views,                     ║
-- ║   OOH_imp, OOH_bonus_imp, OOH_views, OOH_bonus_views                      ║
-- ║                                                                            ║
-- ║  FIX — cascata de COALESCE pra cada um dos 8 campos de volumetria:        ║
-- ║   1. coluna dedicada do Command (se popular certo)                        ║
-- ║   2. JSON extras (onde o Command joga hoje)                               ║
-- ║   3. prod_assets.checklist_info (tabela nova, Q3+)                        ║
-- ║   4. checklist_info_snapshot (fallback legado Q1/Q2)                      ║
-- ║                                                                            ║
-- ║  Mantém fixes das migrations 09 (studies_used) e engloba a 10            ║
-- ║  (prod_assets.checklist_info como fonte).                                 ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE VIEW `site-hypr.hypr_commplan.commplan_checklists` AS

-- ── Fonte 1: checklists novos (Command) + cascata de volumetria ──
SELECT
  c.short_token,
  CAST('checklists' AS STRING)              AS source,
  c.id,
  c.cp_name,
  c.cp_email,
  c.submitted_by,
  c.submitted_by_email,
  COALESCE(
    NULLIF(TRIM(c.cs_name), ''),
    la.cs_name_from_team
  )                                          AS cs_name,
  LOWER(COALESCE(NULLIF(TRIM(c.cs_email), ''), la.cs_email)) AS cs_email,
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
  IFNULL(o.products_override, c.products)   AS products,
  c.marketplaces,

  -- ⚡ FIX 11: cascata coluna → extras JSON → tabela nova → snapshot.
  -- o2o display contratado
  CAST(COALESCE(
    c.o2o_impressoes,
    SAFE_CAST(JSON_VALUE(c.extras, '$.O2O_imp') AS FLOAT64),
    ci.contracted_o2o_display_impressions,
    snap.contracted_o2o_display_impressions
  ) AS INT64) AS o2o_display_impressions,

  -- o2o video contratado
  CAST(COALESCE(
    c.o2o_views,
    SAFE_CAST(JSON_VALUE(c.extras, '$.O2O_views') AS FLOAT64),
    ci.contracted_o2o_video_completions,
    snap.contracted_o2o_video_completions
  ) AS INT64) AS o2o_video_completions,

  -- o2o display bônus  ← o campo que estava vindo NULL pra WTKITT
  CAST(COALESCE(
    c.bonus_o2o_impressoes,
    SAFE_CAST(JSON_VALUE(c.extras, '$.O2O_bonus_imp') AS FLOAT64),
    ci.bonus_o2o_display_impressions,
    snap.bonus_o2o_display_impressions
  ) AS INT64) AS bonus_o2o_display_impressions,

  -- o2o video bônus
  CAST(COALESCE(
    c.bonus_o2o_views,
    SAFE_CAST(JSON_VALUE(c.extras, '$.O2O_bonus_views') AS FLOAT64),
    ci.bonus_o2o_video_completions,
    snap.bonus_o2o_video_completions
  ) AS INT64) AS bonus_o2o_video_completions,

  -- ooh display contratado (Command não tem coluna; extras → tabela nova → snapshot)
  CAST(COALESCE(
    SAFE_CAST(JSON_VALUE(c.extras, '$.OOH_imp') AS FLOAT64),
    ci.contracted_ooh_display_impressions,
    snap.contracted_ooh_display_impressions
  ) AS INT64) AS ooh_display_impressions,

  -- ooh video contratado
  CAST(COALESCE(
    SAFE_CAST(JSON_VALUE(c.extras, '$.OOH_views') AS FLOAT64),
    ci.contracted_ooh_video_completions,
    snap.contracted_ooh_video_completions
  ) AS INT64) AS ooh_video_completions,

  -- ooh display bônus
  CAST(COALESCE(
    SAFE_CAST(JSON_VALUE(c.extras, '$.OOH_bonus_imp') AS FLOAT64),
    ci.bonus_ooh_display_impressions,
    snap.bonus_ooh_display_impressions
  ) AS INT64) AS bonus_ooh_display_impressions,

  -- ooh video bônus
  CAST(COALESCE(
    SAFE_CAST(JSON_VALUE(c.extras, '$.OOH_bonus_views') AS FLOAT64),
    ci.bonus_ooh_video_completions,
    snap.bonus_ooh_video_completions
  ) AS INT64) AS bonus_ooh_video_completions,

  CAST(c.cpm AS FLOAT64)                    AS cpm_amount,
  CAST(c.cpcv AS FLOAT64)                   AS cpcv_amount,
  c.audiences,
  IFNULL(o.had_cs_meeting, c.had_cs_meeting) AS had_cs_meeting,
  c.pracas_type,
  c.pracas_detail,
  IFNULL(o.features_override, c.features)   AS features,
  c.feature_volumes,
  -- fix da migration 09: array vazio do override não sobrescreve Command
  IF(
    ARRAY_LENGTH(IFNULL(o.studies_used, [])) > 0,
    o.studies_used,
    IFNULL(c.studies_used, ARRAY<STRING>[])
  ) AS studies_used,
  c.ooh_link,
  c.pecas_link,
  c.redirect_urls,
  c.pi_link,
  c.proposta_link,
  c.has_bonus,
  c.extras,
  c.created_at,
  FALSE                                     AS is_legacy,
  IFNULL(o.reviewed, FALSE)                 AS reviewed,
  o.reviewed_at,
  o.notes,
  o.audiences_count
FROM `site-hypr.hypr_sales_center.checklists` AS c
LEFT JOIN `site-hypr.hypr_commplan.commplan_command_overrides` AS o
  ON c.short_token = o.short_token
-- tabela nova prod_assets (Q3+)
LEFT JOIN `site-hypr.prod_assets.checklist_info` AS ci
  ON c.short_token = ci.short_token
-- snapshot velho (Q1/Q2)
LEFT JOIN `site-hypr.hypr_commplan.checklist_info_snapshot` AS snap
  ON c.short_token = snap.short_token
LEFT JOIN (
  SELECT
    la_inner.short_token,
    la_inner.cs_email,
    tm.name AS cs_name_from_team
  FROM `site-hypr.hypr_commplan.commplan_legacy_assignments` AS la_inner
  LEFT JOIN (
    SELECT email, name
    FROM `site-hypr.hypr_sales_center.team_members`
    QUALIFY ROW_NUMBER() OVER (PARTITION BY LOWER(email) ORDER BY name) = 1
  ) AS tm
    ON LOWER(tm.email) = LOWER(la_inner.cs_email)
  QUALIFY ROW_NUMBER() OVER (
    PARTITION BY la_inner.short_token
    ORDER BY IFNULL(la_inner.updated_at, la_inner.attributed_at) DESC
  ) = 1
) AS la
  ON c.short_token = la.short_token
WHERE c.start_date >= DATE '2026-04-01'

UNION ALL

-- ── Fonte 2: legados puros (snapshot velho + assignments) ─────────────────
SELECT
  ci.short_token,
  CAST('checklist_info_snapshot' AS STRING) AS source,
  CAST(NULL AS STRING)                      AS id,
  ci.salesman                               AS cp_name,
  CAST(NULL AS STRING)                      AS cp_email,
  CAST(NULL AS STRING)                      AS submitted_by,
  CAST(NULL AS STRING)                      AS submitted_by_email,
  tm2.name                                  AS cs_name,
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
LEFT JOIN (
  SELECT email, name
  FROM `site-hypr.hypr_sales_center.team_members`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY LOWER(email) ORDER BY name) = 1
) AS tm2
  ON LOWER(tm2.email) = LOWER(la.cs_email)
WHERE ci.start_date >= DATE '2026-04-01'
  AND ci.short_token NOT IN (
    SELECT short_token
    FROM `site-hypr.hypr_sales_center.checklists`
    WHERE start_date >= DATE '2026-04-01'
  )
;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  VALIDAÇÃO PÓS-EXECUÇÃO:                                                  ║
-- ║                                                                            ║
-- ║  1. WTKITT deve ter bônus populado:                                       ║
-- ║     SELECT short_token, o2o_display_impressions,                          ║
-- ║            bonus_o2o_display_impressions                                   ║
-- ║     FROM `site-hypr.hypr_commplan.commplan_checklists`                    ║
-- ║     WHERE short_token = 'WTKITT'                                          ║
-- ║     → esperado: 14036000 | 7018000                                       ║
-- ║                                                                            ║
-- ║  2. Over do WTKITT deve cair de 67.8% pra ~11.9%:                        ║
-- ║     denominador = 14036000 + 7018000 = 21054000                          ║
-- ║     over = (23558529 / 21054000) - 1 = 0.119 = 11.9%                     ║
-- ║     → setup deixa de ser anulado, bônus da Isaac preservado             ║
-- ║                                                                            ║
-- ║  3. Nenhuma campanha Q2 regride (snapshot velho continua no fim da       ║
-- ║     cascata como fallback).                                               ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
