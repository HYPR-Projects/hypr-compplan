-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  07 — Fix bug "limbo": campanhas no Command sem cs_email preenchido       ║
-- ║                                                                            ║
-- ║  PROBLEMA:                                                                 ║
-- ║  Quando uma campanha entra em hypr_sales_center.checklists com cs_email   ║
-- ║  NULL (vendedor esqueceu de preencher), ela some do sistema:               ║
-- ║   - View commplan_checklists Fonte 2 (legacy) é excluída pelo NOT IN       ║
-- ║   - View commplan_pending_legacy também exclui pelo NOT IN checklists      ║
-- ║   - Painel CS filtra cs_email NOT NULL → não aparece pra ninguém           ║
-- ║                                                                            ║
-- ║  REGRA DE PRIORIDADE (decidida com o admin):                               ║
-- ║  Command sempre vence quando preenchido. Se vier vazio, cai como pendente.║
-- ║                                                                            ║
-- ║  FIX:                                                                      ║
-- ║  Recria commplan_pending_legacy pra incluir TAMBÉM campanhas que estão    ║
-- ║  em hypr_sales_center.checklists mas com cs_email NULL/vazio.              ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE VIEW `site-hypr.hypr_commplan.commplan_pending_legacy` AS

-- ── Fonte A: legacy puro (snapshot sem registro em Command nem assignments) ──
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
  ci.contracted_o2o_video_completions   + IFNULL(ci.contracted_ooh_video_completions, 0)   AS total_video_completions,
  CAST('legacy_sem_atribuicao' AS STRING) AS pending_source
FROM `site-hypr.hypr_commplan.checklist_info_snapshot` AS ci
WHERE ci.start_date >= DATE '2026-04-01'
  AND ci.short_token NOT IN (
    SELECT short_token FROM `site-hypr.hypr_sales_center.checklists`
  )
  AND ci.short_token NOT IN (
    SELECT short_token FROM `site-hypr.hypr_commplan.commplan_legacy_assignments`
  )

UNION ALL

-- ── Fonte B: campanha do Command MAS sem cs_email (órfã do CP) ──────────────
-- Casa da Whirlpool 0RVLY8 antes do CP atribuir o CS no Command.
SELECT
  c.short_token,
  c.client AS client_name,
  c.campaign_name,
  c.cp_name,
  c.agency,
  c.industry,
  c.campaign_type,
  c.start_date,
  c.end_date,
  CAST(c.investment AS FLOAT64) AS total_value,
  -- formats no checklists é ARRAY<STRING>; concatena pra ficar STRING
  ARRAY_TO_STRING(IFNULL(c.formats, ARRAY<STRING>[]), ', ') AS formats_str,
  c.audiences AS sold_audiences,
  CAST(c.cpm AS FLOAT64) AS cpm_amount,
  CAST(c.cpcv AS FLOAT64) AS cpcv_amount,
  CAST(IFNULL(c.o2o_impressoes, 0) + IFNULL(c.bonus_o2o_impressoes, 0) AS INT64) AS total_display_impressions,
  CAST(IFNULL(c.o2o_views, 0) + IFNULL(c.bonus_o2o_views, 0) AS INT64)           AS total_video_completions,
  CAST('command_sem_cs' AS STRING) AS pending_source
FROM `site-hypr.hypr_sales_center.checklists` AS c
WHERE c.start_date >= DATE '2026-04-01'
  AND (c.cs_email IS NULL OR TRIM(c.cs_email) = '')
  -- Exclui se já existe legacy_assignment válido (admin já atribuiu manualmente)
  AND c.short_token NOT IN (
    SELECT short_token FROM `site-hypr.hypr_commplan.commplan_legacy_assignments`
    WHERE cs_email IS NOT NULL AND TRIM(cs_email) != ''
  )

ORDER BY start_date DESC, client_name
;

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  Atualiza commplan_checklists pra fallback inteligente:                   ║
-- ║                                                                            ║
-- ║  Regra (opção A confirmada com admin):                                    ║
-- ║    1. Se Command tem cs_email preenchido → usa Command (source of truth)  ║
-- ║    2. Se Command tem cs_email NULL → fallback pra legacy_assignments      ║
-- ║       (assim admin pode atribuir no Compplan quando CP esquece no Command)║
-- ║    3. Se ambos vazios → campanha aparece em pending (resolvido acima)     ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

CREATE OR REPLACE VIEW `site-hypr.hypr_commplan.commplan_checklists` AS

-- ── Fonte 1: checklists novos (Command) com fallback pro legacy_assignment ──
SELECT
  c.short_token,
  CAST('checklists' AS STRING)              AS source,
  c.id,
  c.cp_name,
  c.cp_email,
  c.submitted_by,
  c.submitted_by_email,
  -- cs_name: prioriza Command; se vazio, usa name do team_members baseado no la.cs_email
  COALESCE(
    NULLIF(TRIM(c.cs_name), ''),
    (SELECT name FROM `site-hypr.hypr_sales_center.team_members` tm
     WHERE LOWER(tm.email) = LOWER(la.cs_email) LIMIT 1)
  ) AS cs_name,
  -- cs_email: prioriza Command; se vazio, usa legacy_assignment
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
-- LEFT JOIN no legacy_assignments: usado SÓ como fallback do cs_email quando Command vazio.
-- Usa subquery com ROW_NUMBER() pra garantir 1 registro por short_token (defensivo).
LEFT JOIN (
  SELECT short_token, cs_email
  FROM `site-hypr.hypr_commplan.commplan_legacy_assignments`
  QUALIFY ROW_NUMBER() OVER (PARTITION BY short_token ORDER BY IFNULL(updated_at, attributed_at) DESC) = 1
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

-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  RESUMO DO FIX:                                                            ║
-- ║                                                                            ║
-- ║  ANTES:                                                                    ║
-- ║   - Command sem cs_email → some de pending E não aparece pra ninguém      ║
-- ║   - "Limbo" silencioso, admin não tem visibilidade                         ║
-- ║                                                                            ║
-- ║  DEPOIS:                                                                   ║
-- ║   - Command sem cs_email → aparece em pending_legacy (Fonte B)            ║
-- ║   - Admin pode atribuir aqui → legacy_assignment vira o cs_email efetivo  ║
-- ║   - Se CP depois preencher no Command → Command vence (priority A)        ║
-- ║   - Sem trabalho perdido, sem campanhas em limbo                          ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
