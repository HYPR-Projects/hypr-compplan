-- ╔══════════════════════════════════════════════════════════════════════╗
-- ║  HYPR Commplan — Migrations em tabelas EXTERNAS                       ║
-- ║                                                                        ║
-- ║  Estas alterações são em tabelas que NÃO ficam no dataset do Commplan ║
-- ║  (hypr_commplan), mas em tabelas operacionais compartilhadas:          ║
-- ║    - hypr_sales_center.checklists (escrita pelo Command)              ║
-- ║                                                                        ║
-- ║  Roda DEPOIS de 02-seeds.sql, mas só uma vez por ambiente.             ║
-- ╚══════════════════════════════════════════════════════════════════════╝

-- ── Adiciona studies_used em checklists ───────────────────────────────────
-- Campo: ARRAY<STRING> com os IDs dos estudos selecionados pelo CP.
-- Hoje suportamos no máximo 1 estudo por campanha (regra do Compplan 2026),
-- mas o tipo é array pra suportar evolução futura sem migration.
--
-- Se a coluna já existe, BQ retorna erro — ignorar (idempotente em prática
-- porque rodamos manualmente).

ALTER TABLE `site-hypr.hypr_sales_center.checklists`
ADD COLUMN IF NOT EXISTS studies_used ARRAY<STRING>;

-- IMPORTANTE: o Command precisa ser atualizado pra:
--   1. Renderizar os "chips" de estudos disponíveis na seção 4 do checklist
--      (consumindo GET /commplan/studies/available do Commplan backend).
--   2. Permitir seleção de 1 estudo (UI: clique alterna; só 1 ativo por vez).
--   3. Persistir o id selecionado em checklists.studies_used como array de 1
--      elemento (ou array vazio se nenhum).
--   4. Mirror pro prod_assets.checklist_info NÃO precisa propagar este campo
--      (Report Center não usa). Mas pode propagar sem prejuízo.
