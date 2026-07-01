-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  12 — Fix: volumetria em cascata SEM cross-region                         ║
-- ║       (coluna Command → extras JSON → checklist_info_snapshot)            ║
-- ║                                                                            ║
-- ║  CONTEXTO:                                                                 ║
-- ║  A migration 11 tentou incluir prod_assets.checklist_info na cascata,     ║
-- ║  mas esse dataset está na região US enquanto hypr_commplan está em        ║
-- ║  us-central1. BigQuery NÃO permite JOIN entre datasets de regiões         ║
-- ║  diferentes numa view → erro "Dataset prod_assets not found in            ║
-- ║  location us-central1". A migration 11 FALHOU ao aplicar.                 ║
-- ║                                                                            ║
-- ║  SOLUÇÃO:                                                                  ║
-- ║  Não precisamos da tabela nova! O bônus que faltava (WTKITT) está no      ║
-- ║  campo `extras` (JSON) do Command, que fica em us-central1 (mesma         ║
-- ║  região da view). A cascata coluna → extras → snapshot resolve tudo.     ║
-- ║                                                                            ║
-- ║  PROBLEMA ORIGINAL (WTKITT):                                              ║
-- ║   - o2o_impressoes (coluna)       = 14.036.000 ✅                         ║
-- ║   - bonus_o2o_impressoes (coluna) = NULL       ❌                         ║
-- ║   - extras.O2O_bonus_imp (JSON)   = 7.018.000  ✅ ← usa este             ║
-- ║                                                                            ║
-- ║  Conta correta:                                                           ║
-- ║   denominador = 14.036.000 + 7.018.000 = 21.054.000                      ║
-- ║   over = (23.558.529 / 21.054.000) - 1 = 11.9%  (< 50% ✓)                ║
-- ║                                                                            ║
-- ║  Chaves JSON (confirmadas em prod):                                       ║
-- ║   O2O_imp, O2O_bonus_imp, O2O_views, O2O_bonus_views,                     ║
-- ║   OOH_imp, OOH_bonus_imp, OOH_views, OOH_bonus_views                      ║
-- ║                                                                            ║
-- ║  Cascata por campo:                                                        ║
-- ║   1. coluna dedicada do Command                                           ║
-- ║   2. JSON extras (onde o Command joga hoje)                              ║
-- ║   3. checklist_info_snapshot (fallback legado)                           ║
-- ║                                                                            ║
-- ║  Mantém fix da migration 09 (studies_used array vazio).                  ║
-- ║  NOTA: se um dia prod_assets migrar pra us-central1 (ou for copiada       ║
-- ║  pra cá), dá pra reincluir na cascata.                                    ║
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

  -- ⚡ FIX 12: cascata coluna → extras JSON → snapshot (sem cross-region).
  -- o2o display contratado
  CAST(COALESCE(
    c.o2o_impressoes,
    SAFE_CAST(JSON_VALUE(c.extras, '$.O2O_imp') AS FLOAT64),
    snap.contracted_o2o_display_impressions
  ) AS INT64) AS o2o_display_impressions,

  -- o2o video contratado
  CAST(COALESCE(
    c.o2o_views,
    SAFE_CAST(JSON_VALUE(c.extras, '$.O2O_views') AS FLOAT64),
    snap.contracted_o2o_video_completions
  ) AS INT64) AS o2o_video_completions,

  -- o2o display bônus  ← o campo que estava NULL pra WTKITT
  CAST(COALESCE(
    c.bonus_o2o_impressoes,
    SAFE_CAST(JSON_VALUE(c.extras, '$.O2O_bonus_imp') AS FLOAT64),
    snap.bonus_o2o_display_impressions
  ) AS INT64) AS bonus_o2o_display_impressions,

  -- o2o video bônus
  CAST(COALESCE(
    c.bonus_o2o_views,
    SAFE_CAST(JSON_VALUE(c.extras, '$.O2O_bonus_views') AS FLOAT64),
    snap.bonus_o2o_video_completions
  ) AS INT64) AS bonus_o2o_video_completions,

  -- ooh display contratado (Command não tem coluna; extras → snapshot)
  CAST(COALESCE(
    SAFE_CAST(JSON_VALUE(c.extras, '$.OOH_imp') AS FLOAT64),
    snap.contracted_ooh_display_impressions
  ) AS INT64) AS ooh_display_impressions,

  -- ooh video contratado
  CAST(COALESCE(
    SAFE_CAST(JSON_VALUE(c.extras, '$.OOH_views') AS FLOAT64),
    snap.contracted_ooh_video_completions
  ) AS INT64) AS ooh_video_completions,

  -- ooh display bônus
  CAST(COALESCE(
    SAFE_CAST(JSON_VALUE(c.extras, '$.OOH_bonus_imp') AS FLOAT64),
    snap.bonus_ooh_display_impressions
  ) AS INT64) AS bonus_ooh_display_impressions,

  -- ooh video bônus
  CAST(COALESCE(
    SAFE_CAST(JSON_VALUE(c.extras, '$.OOH_bonus_views') AS FLOAT64),
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

-- ── Fonte 2: legados puros (snapshot + assignments) ───────────────────────
-- NOTA: aqui `ci` = checklist_info_snapshot (não a tabela nova). Mantido igual.
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
-- ║  1. WTKITT deve ter bônus populado (via extras):                         ║
-- ║     SELECT short_token, o2o_display_impressions,                          ║
-- ║            bonus_o2o_display_impressions                                   ║
-- ║     FROM `site-hypr.hypr_commplan.commplan_checklists`                    ║
-- ║     WHERE short_token = 'WTKITT'                                          ║
-- ║     → esperado: 14036000 | 7018000                                       ║
-- ║                                                                            ║
-- ║  2. Over do WTKITT cai de 67.8% pra ~11.9% → setup não anulado          ║
-- ║                                                                            ║
-- ║  3. Q2 não regride (194/210 com contratação continua igual ou sobe)     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
