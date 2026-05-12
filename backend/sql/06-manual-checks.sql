-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  06 — manual_checks                                                        ║
-- ║                                                                            ║
-- ║  Adiciona campo JSON `manual_checks` em ambas as tabelas pra armazenar    ║
-- ║  o estado de cada item do CompPlan que o CS marcou manualmente.          ║
-- ║                                                                            ║
-- ║  Formato: { "am_analytics": true, "am_loom": true, ... }                  ║
-- ║                                                                            ║
-- ║  Substitui os campos antigos (features_manual, products_manual,           ║
-- ║  audiences_count, had_cs_meeting) — esses ficam, mas não são usados.    ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- 1. commplan_command_overrides (Command novo)
ALTER TABLE `site-hypr.hypr_commplan.commplan_command_overrides`
ADD COLUMN IF NOT EXISTS manual_checks STRING;
-- (STRING contendo JSON serializado, ex: '{"am_analytics":true}')

-- 2. commplan_legacy_assignments
ALTER TABLE `site-hypr.hypr_commplan.commplan_legacy_assignments`
ADD COLUMN IF NOT EXISTS manual_checks STRING;
