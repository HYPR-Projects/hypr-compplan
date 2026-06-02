-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  08 — Fix: volumetria contratada (impressions/views/bonus) vem do PI      ║
-- ║                                                                            ║
-- ║  PROBLEMA:                                                                 ║
-- ║  hypr_sales_center.checklists (Command) tem cs_email, formatos, agencia,   ║
-- ║  etc — mas NÃO tem volumetria contratada de display/video. Os campos      ║
-- ║  o2o_impressoes / o2o_views / bonus_o2o_impressoes / bonus_o2o_views são  ║
-- ║  100% NULL nas 105 campanhas que estão no Command (verificado em prod).    ║
-- ║                                                                            ║
-- ║  Essa volumetria vem do PI/proposta, que alimenta a tabela legacy         ║
-- ║  checklist_info_snapshot. Como a view atual prioriza Command e ignora     ║
-- ║  o snapshot quando a campanha existe nas 2 fontes, o Over fica sempre    ║
-- ║  em 0% (denominador zero) → item de MÉTRICA não bate o limite → bônus    ║
-- ║  de métrica não é pago.                                                   ║
-- ║                                                                            ║
-- ║  FIX:                                                                      ║
-- ║  Na Fonte 1, fazer COALESCE entre Command e snapshot pros campos de      ║
-- ║  volumetria. Command continua vencendo se vier preenchido (futuro), mas  ║
-- ║  hoje 100% das campanhas usam o snapshot como fonte real.                ║
-- ║                                                                            ║
-- ║  Também passa a popular ooh_* (que o Command não tem) a partir do        ║
-- ║  snapshot — antes estavam hardcoded como NULL.                            ║
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

  -- ⚠️ VOLUMETRIA CONTRATADA: Command sempre vence quando preenchido;
  -- se NULL, usa snapshot do PI (que é a fonte real hoje).
  CAST(COALESCE(c.o2o_impressoes,       snap.contracted_o2o_display_impressions) AS INT64) AS o2o_display_impressions,
  CAST(COALESCE(c.o2o_views,            snap.contracted_o2o_video_completions)   AS INT64) AS o2o_video_completions,
  CAST(COALESCE(c.bonus_o2o_impressoes, snap.bonus_o2o_display_impressions)      AS INT64) AS bonus_o2o_display_impressions,
  CAST(COALESCE(c.bonus_o2o_views,      snap.bonus_o2o_video_completions)        AS INT64) AS bonus_o2o_video_completions,

  -- Command não tem OOH; usa direto do snapshot
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
  IFNULL(o.reviewed, FALSE)                 AS reviewed,
  o.reviewed_at,
  o.notes,
  o.audiences_count
FROM `site-hypr.hypr_sales_center.checklists` AS c
LEFT JOIN `site-hypr.hypr_commplan.commplan_command_overrides` AS o
  ON c.short_token = o.short_token
-- NEW: LEFT JOIN com snapshot pra trazer volumetria contratada (fonte real do PI)
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
-- ║  RESUMO DO FIX:                                                            ║
-- ║                                                                            ║
-- ║  ANTES:                                                                    ║
-- ║   - 100% das 105 campanhas do Command tinham o2o_impressoes = NULL         ║
-- ║   - View ignorava o snapshot, retornava NULL                              ║
-- ║   - Backend calculava over_percent com denominador 0 → resultado 0%       ║
-- ║   - Item de MÉTRICA "Over ≤ 25%" não passava → bônus zerado por métrica  ║
-- ║                                                                            ║
-- ║  DEPOIS:                                                                   ║
-- ║   - View faz COALESCE entre Command e snapshot pra volumetria             ║
-- ║   - OOH passa a vir populado do snapshot (antes era hardcoded NULL)       ║
-- ║   - over_percent calcula corretamente (numerador entregue / contratado)  ║
-- ║   - Item de MÉTRICA passa quando entregar dentro do limite                ║
-- ║   - Bônus dos CSs sobe pros valores corretos                              ║
-- ║                                                                            ║
-- ║  IMPACTO ESPERADO:                                                         ║
-- ║   - Bônus do Isaac, Mariana e demais CSs deve AUMENTAR (item de métrica  ║
-- ║     passa a contar quando bater limite)                                   ║
-- ║   - Visão geral admin e painel individual continuam batendo (usam mesmo  ║
-- ║     pipeline computeCsBonus)                                              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
