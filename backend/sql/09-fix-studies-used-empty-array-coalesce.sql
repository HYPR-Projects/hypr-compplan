-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  09 — Fix: studies_used array vazio do override sobrescrevia o Command   ║
-- ║                                                                            ║
-- ║  PROBLEMA:                                                                 ║
-- ║  A view commplan_checklists usava IFNULL(o.studies_used, c.studies_used). ║
-- ║  Mas IFNULL só cai pro fallback se o primeiro for NULL, e em BigQuery     ║
-- ║  um array vazio [] NÃO é NULL.                                             ║
-- ║                                                                            ║
-- ║  Quando o admin abre uma campanha pela primeira vez (review, edit,        ║
-- ║  manual_check), é criada uma linha em commplan_command_overrides com      ║
-- ║  studies_used = [] (array vazio). A partir desse momento, mesmo que       ║
-- ║  c.studies_used (Command) tenha estudos populados, a view retornava       ║
-- ║  o array vazio do override.                                                ║
-- ║                                                                            ║
-- ║  REPRODUÇÃO (campanha PL87Z3 - AON BR Dia das Mães):                      ║
-- ║    c.studies_used        = ['Dia das Mães']                                ║
-- ║    o.studies_used        = []  (vazio, NÃO NULL)                          ║
-- ║    IFNULL(o, c)          = []  ❌                                          ║
-- ║                                                                            ║
-- ║  IMPACTO:                                                                  ║
-- ║  Bônus de 0,30% atribuído ao autor do estudo (Mariana, Thiago, Isaac,    ║
-- ║  etc) NÃO estava sendo creditado em nenhuma campanha do Q2.               ║
-- ║                                                                            ║
-- ║  FIX:                                                                      ║
-- ║  Mudar IFNULL pra IF(ARRAY_LENGTH(o.studies_used) > 0, o, c). Override   ║
-- ║  só ganha quando TEM itens; senão cai pro Command.                        ║
-- ║                                                                            ║
-- ║  Mesma view do migration 08 com a única alteração na linha de            ║
-- ║  studies_used.                                                             ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE VIEW `site-hypr.hypr_commplan.commplan_checklists` AS

-- ── Fonte 1: checklists novos (Command) + fallback de volumetria do snapshot ──
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
  CAST(COALESCE(c.o2o_impressoes,       snap.contracted_o2o_display_impressions) AS INT64) AS o2o_display_impressions,
  CAST(COALESCE(c.o2o_views,            snap.contracted_o2o_video_completions)   AS INT64) AS o2o_video_completions,
  CAST(COALESCE(c.bonus_o2o_impressoes, snap.bonus_o2o_display_impressions)      AS INT64) AS bonus_o2o_display_impressions,
  CAST(COALESCE(c.bonus_o2o_views,      snap.bonus_o2o_video_completions)        AS INT64) AS bonus_o2o_video_completions,
  CAST(snap.contracted_ooh_display_impressions AS INT64)  AS ooh_display_impressions,
  CAST(snap.contracted_ooh_video_completions   AS INT64)  AS ooh_video_completions,
  CAST(snap.bonus_ooh_display_impressions      AS INT64)  AS bonus_ooh_display_impressions,
  CAST(snap.bonus_ooh_video_completions        AS INT64)  AS bonus_ooh_video_completions,
  CAST(c.cpm AS FLOAT64)                    AS cpm_amount,
  CAST(c.cpcv AS FLOAT64)                   AS cpcv_amount,
  c.audiences,
  IFNULL(o.had_cs_meeting, c.had_cs_meeting) AS had_cs_meeting,
  c.pracas_type,
  c.pracas_detail,
  IFNULL(o.features_override, c.features)   AS features,
  c.feature_volumes,
  -- ⚡ FIX 09: array vazio do override não pode sobrescrever Command.
  -- Override só ganha se tem itens; senão cai pro Command.
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

-- ── Fonte 2: legados puros (snapshot + assignments, sem registro no Command) ──
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
-- ║  VALIDAÇÃO PÓS-EXECUÇÃO:                                                   ║
-- ║                                                                            ║
-- ║  Antes (Q2 2026):                                                          ║
-- ║    SELECT COUNT(*) FROM commplan_checklists                               ║
-- ║    WHERE ARRAY_LENGTH(IFNULL(studies_used, [])) > 0                       ║
-- ║      AND start_date >= '2026-04-01' AND start_date <= '2026-06-30'        ║
-- ║    → 0                                                                     ║
-- ║                                                                            ║
-- ║  Depois (esperado):                                                        ║
-- ║    → 12+ (matching com o que existe em hypr_sales_center.checklists)      ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
