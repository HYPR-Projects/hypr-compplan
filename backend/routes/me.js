/**
 * routes/me.js — endpoints do portal CS com cálculo de bônus.
 *
 * Endpoints:
 *   GET  /commplan/me/dashboard/:q          → KPIs (incluindo bônus total) + campanhas
 *   GET  /commplan/me/campaign/:token       → detalhe + breakdown de bônus
 *   PUT  /commplan/me/campaign/:token       → salva manual checks e recalcula
 *   GET  /commplan/me/history               → quarters anteriores
 *   GET  /commplan/me/features-catalog      → features tier1/2/3
 *   GET  /commplan/me/studies-catalog       → estudos do catalog
 */

import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { query, tableRef } from '../lib/bigquery.js';
import { getSalaryForCs } from '../data/cs-config.js';
import { isOverException } from '../data/over-exceptions.js';
import { findStudyByName } from '../data/studies.js';
import { getFloorOverride } from '../data/floor-overrides.js';
import { sendEmail } from '../lib/email.js';
import { overviewHandler } from './admin/overview.js';

const VERSION_ID = '2026';

/**
 * Resolve studies_info pra uma campanha:
 * - Pega studies_used (array de nomes vindos do Command)
 * - Faz lookup por nome em commplan_studies_catalog
 * - Retorna array [{ name, id, author_email, author_name, link, ... }]
 */
async function resolveStudiesInfo(campaign, studyAssigneeOverride = null) {
  const studyNames = Array.isArray(campaign.studies_used) ? campaign.studies_used : [];
  if (studyNames.length === 0) return [];

  // Parse studies_data_json (rico, do Command — name, cs, link, status)
  let extraData = [];
  try {
    if (campaign.studies_data_json) {
      const parsed = typeof campaign.studies_data_json === 'string'
        ? JSON.parse(campaign.studies_data_json)
        : campaign.studies_data_json;
      extraData = Array.isArray(parsed) ? parsed : [];
    }
  } catch (_) { /* silent */ }

  const result = [];
  for (const name of studyNames) {
    if (!name) continue;
    let entry = {
      name,
      id: null,
      author_email: null,
      author_name: null,
      link: null,
      status: null,
      delivery: null,
      found_in_catalog: false,
      assignee_overridden: false,
    };
    // Lookup no catálogo
    try {
      const study = await findStudyByName(name, VERSION_ID);
      if (study) {
        entry.id = study.id;
        entry.author_email = study.author_email || null;
        entry.found_in_catalog = true;
      }
    } catch (e) { console.warn(`findStudyByName(${name}): ${e.message}`); }
    // Enriquece com dados do JSON do Command (cs name, link, etc)
    const extra = extraData.find(d => (d.name || '').toLowerCase() === name.toLowerCase());
    if (extra) {
      entry.author_name = entry.author_name || extra.cs || null;
      entry.link = extra.link || null;
      entry.status = extra.status || null;
      entry.delivery = extra.delivery || null;
    }
    // Override do admin: sobrescreve author_email pra um CS específico nesta campanha.
    if (studyAssigneeOverride) {
      entry.author_email = studyAssigneeOverride;
      entry.assignee_overridden = true;
    }
    result.push(entry);
  }
  return result;
}
import { parseQuarter } from '../engine/quarter-resolver.js';
import { computeBonus } from '../engine/compplan-engine.js';
import { FEATURE_TIERS, COMPPLAN_CATALOG } from '../engine/compplan-catalog.js';

export const router = Router();
router.use(authRequired);

const TAX_RATE = 0.1653;
const NET_FACTOR = 1 - TAX_RATE;

// ── GET /me/features-catalog ───────────────────────────────────────────
router.get('/features-catalog', (req, res) => {
  res.json({
    catalog: {
      tier1: [...FEATURE_TIERS.tier1],
      tier2: [...FEATURE_TIERS.tier2],
      tier3: [...FEATURE_TIERS.tier3],
    },
  });
});

// ── GET /me/studies-catalog ────────────────────────────────────────────
router.get('/studies-catalog', async (req, res) => {
  try {
    const items = await query(
      `SELECT id, display_name, status
       FROM ${tableRef('commplan_studies_catalog')}
       WHERE active = TRUE
       ORDER BY display_name`
    );
    res.json({ items });
  } catch (err) {
    console.error('GET /me/studies-catalog error:', err);
    res.json({ items: [] });
  }
});

// ─────────────────────────────────────────────────────────────────────
// Helper: busca métricas de performance pra calcular Otimizações.
// Agrega TODAS as linhas da campanha em campaign_results, filtra display
// pro cálculo de over.
// ─────────────────────────────────────────────────────────────────────
async function fetchPerformanceMetrics(shortToken, clientName = null) {
  try {
    // 1. Busca métricas brutas da campanha em prod_assets.unified_daily_performance_metrics (US).
    //
    // total_cost = custo REAL de plataforma (vs effective_total_cost de campaign_results,
    // que é o cobrado do cliente). Usar total_cost dá o eCPM real.
    //
    // Excluímos lines com 'survey', 'controle' ou 'exposto' no nome — não fazem parte
    // do cálculo de mídia/performance.
    const [perfRow] = await query(
      `SELECT
         short_token,
         -- Display (relevante pras regras de Otimização)
         SUM(IF(LOWER(media_type) = 'display', impressions, 0))           AS display_impressions,
         SUM(IF(LOWER(media_type) = 'display', viewable_impressions, 0))  AS display_viewable,
         SUM(IF(LOWER(media_type) = 'display', clicks, 0))                AS display_clicks,
         SUM(IF(LOWER(media_type) = 'display', total_cost, 0))            AS display_cost,
         -- Totais (display + video) pra contexto
         SUM(impressions)            AS total_impressions,
         SUM(viewable_impressions)   AS total_viewable,
         SUM(clicks)                 AS total_clicks,
         SUM(total_cost)             AS total_cost
       FROM \`site-hypr.prod_assets.unified_daily_performance_metrics\`
       WHERE short_token = @t
         AND LOWER(IFNULL(line_name, '')) NOT LIKE '%survey%'
         AND LOWER(IFNULL(line_name, '')) NOT LIKE '%controle%'
         AND LOWER(IFNULL(line_name, '')) NOT LIKE '%exposto%'
       GROUP BY short_token`,
      { t: shortToken },
      'US'
    );

    if (!perfRow) return null;

    // 2. Busca contratado de display da view commplan_checklists (us-central1).
    // A view já une Command (checklists) e Legacy (checklist_info_snapshot) e expõe
    // as 4 colunas separadas: contracted + bonus de O2O e OOH.
    const [contractedRow] = await query(
      `SELECT
         IFNULL(o2o_display_impressions, 0)
       + IFNULL(bonus_o2o_display_impressions, 0)
       + IFNULL(ooh_display_impressions, 0)
       + IFNULL(bonus_ooh_display_impressions, 0) AS display_contracted
       FROM ${tableRef('commplan_checklists')}
       WHERE short_token = @t
       LIMIT 1`,
      { t: shortToken }
    );

    const displayContracted  = Number(contractedRow?.display_contracted) || 0;
    const displayImpressions = Number(perfRow.display_impressions) || 0;
    const displayViewable    = Number(perfRow.display_viewable) || 0;
    const displayClicks      = Number(perfRow.display_clicks) || 0;
    const displayCost        = Number(perfRow.display_cost) || 0;

    // Exceções de OVER (Pepsico, Amazon, ...) usam impressões TOTAIS no numerador.
    // Só o OVER muda. eCPM, CTR e todos os limites continuam idênticos pra esses clientes.
    const usesTotalImps = await isOverException(clientName);
    const overNumerator = usesTotalImps ? displayImpressions : displayViewable;

    return {
      // Métricas que entram nas regras (todas baseadas em DISPLAY)
      ecpm: displayImpressions > 0 ? (displayCost / displayImpressions) * 1000 : 0,
      ctr: displayViewable > 0 ? displayClicks / displayViewable : 0,
      over_percent: displayContracted > 0 ? ((overNumerator / displayContracted) - 1) * 100 : 0,
      over_uses_total_imps: usesTotalImps,

      // Detalhes pra UI
      display_impressions: displayImpressions,
      display_viewable: displayViewable,
      display_clicks: displayClicks,
      display_cost: displayCost,
      display_contracted: displayContracted,

      // Totais (display + video) — só pra contexto
      total_impressions: Number(perfRow.total_impressions) || 0,
      total_viewable: Number(perfRow.total_viewable) || 0,
      total_clicks: Number(perfRow.total_clicks) || 0,
      total_cost: Number(perfRow.total_cost) || 0,

      creative_fee_estimate: null,
    };
  } catch (err) {
    console.warn(`fetchPerformanceMetrics(${shortToken}): ${err.message}`);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────
// Helper: resolve qual CS estamos vendo.
// - Se o user é admin E passou ?as=email, retorna esse email (impersonação).
// - Senão, retorna o email do user logado.
// Permite admin ver/editar campanhas de qualquer CS.
// ─────────────────────────────────────────────────────────────────────
function resolveTargetCs(req) {
  const myEmail = (req.user?.email || '').toLowerCase();
  const isAdmin = req.user?.role === 'admin';
  const asParam = (req.query?.as || '').toLowerCase().trim();

  if (isAdmin && asParam) {
    return { csEmail: asParam, impersonating: true, byEmail: myEmail, isAdmin };
  }
  return { csEmail: myEmail, impersonating: false, byEmail: myEmail, isAdmin };
}

// ─────────────────────────────────────────────────────────────────────
// Helper: pega manual_checks salvos (de overrides ou legacy_assignments)
// ─────────────────────────────────────────────────────────────────────
async function fetchManualChecks(shortToken, isLegacy) {
  try {
    const table = isLegacy ? 'commplan_legacy_assignments' : 'commplan_command_overrides';
    const [row] = await query(
      `SELECT manual_checks, admin_overrides, admin_overrides_by, admin_overrides_at,
              pre_campaign_assignee_email, pre_campaign_assigned_at,
              study_assignee_email
       FROM ${tableRef(table)}
       WHERE short_token = @t LIMIT 1`,
      { t: shortToken }
    );
    const manualChecks = row?.manual_checks ? JSON.parse(row.manual_checks) : {};
    const adminOverrides = row?.admin_overrides ? JSON.parse(row.admin_overrides) : {};
    return {
      manualChecks,
      adminOverrides,
      adminOverridesBy: row?.admin_overrides_by || null,
      adminOverridesAt: row?.admin_overrides_at?.value || row?.admin_overrides_at || null,
      preAssignee: row?.pre_campaign_assignee_email || null,
      preAssignedAt: row?.pre_campaign_assigned_at?.value || row?.pre_campaign_assigned_at || null,
      studyAssignee: row?.study_assignee_email || null,
    };
  } catch (err) {
    console.warn(`fetchManualChecks(${shortToken}): ${err.message}`);
    return { manualChecks: {}, adminOverrides: {}, adminOverridesBy: null, adminOverridesAt: null, preAssignee: null, preAssignedAt: null, studyAssignee: null };
  }
}

// ── GET /me/team-overview/:q ───────────────────────────────────────────
// Visão geral do time — disponível pra CS também (não só admin).
// Reusa o mesmo handler do /admin/overview/:q, sem requerer admin role.
router.get('/team-overview/:q', overviewHandler);

// ── GET /me/dashboard/:q ───────────────────────────────────────────────
router.get('/dashboard/:q', async (req, res) => {
  try {
    const { csEmail, impersonating, byEmail } = resolveTargetCs(req);
    if (!csEmail) return res.status(401).json({ error: 'sem email no token' });

    const quarter = req.params.q;
    const { startDate, endDate } = parseQuarter(quarter);

    // Pega campanhas + flag de reviewed do overrides/assignments
    const campaigns = await query(
      `SELECT
         c.short_token, c.client_name, c.campaign_name, c.cp_name, c.agency,
         c.start_date, c.end_date, c.is_legacy, c.features, c.products,
         c.formats, c.audiences, c.studies_used, c.pracas_type,
         IFNULL(c.total_value, 0) AS total_value,
         CASE
           WHEN c.is_legacy = TRUE THEN
             CASE WHEN la.updated_at IS NOT NULL AND la.updated_at > la.attributed_at THEN TRUE ELSE FALSE END
           ELSE IFNULL(o.reviewed, FALSE)
         END AS reviewed
       FROM ${tableRef('commplan_checklists')} c
       LEFT JOIN ${tableRef('commplan_command_overrides')} o ON c.short_token = o.short_token
       LEFT JOIN ${tableRef('commplan_legacy_assignments')} la ON c.short_token = la.short_token
       WHERE LOWER(c.cs_email) = @cs
         AND c.start_date >= @s AND c.start_date <= @e
       ORDER BY reviewed ASC, c.start_date DESC`,
      { cs: csEmail, s: startDate, e: endDate }
    );

    // Pra cada campanha, busca manual_checks + admin_overrides + métricas em batch
    const tokens = campaigns.map(c => c.short_token);
    let manualChecksByToken = {};
    let adminOverridesByToken = {};
    let preAssigneeByToken = {};
    let metricsByToken = {};

    if (tokens.length > 0) {
      // Batch 1: manual_checks + admin_overrides + pre_assignee de overrides + assignments
      try {
        const [overrideRows, legacyRows] = await Promise.all([
          query(
            `SELECT short_token, manual_checks, admin_overrides, pre_campaign_assignee_email
             FROM ${tableRef('commplan_command_overrides')}
             WHERE short_token IN UNNEST(@toks)`,
            { toks: tokens }
          ),
          query(
            `SELECT short_token, manual_checks, admin_overrides, pre_campaign_assignee_email
             FROM ${tableRef('commplan_legacy_assignments')}
             WHERE short_token IN UNNEST(@toks)`,
            { toks: tokens }
          ),
        ]);
        for (const r of [...overrideRows, ...legacyRows]) {
          if (r.manual_checks) {
            try { manualChecksByToken[r.short_token] = JSON.parse(r.manual_checks); }
            catch (_) { /* ignore */ }
          }
          if (r.admin_overrides) {
            try { adminOverridesByToken[r.short_token] = JSON.parse(r.admin_overrides); }
            catch (_) { /* ignore */ }
          }
          if (r.pre_campaign_assignee_email) {
            preAssigneeByToken[r.short_token] = r.pre_campaign_assignee_email;
          }
        }
      } catch (e) {
        console.warn('batch manual_checks:', e.message);
      }

      // Batch 2: métricas (precisa do contratado também, faz JOIN)
      try {
        const perfRows = await query(
          `WITH agg AS (
             SELECT
               short_token,
               SUM(IF(LOWER(media_type) = 'display', impressions, 0))           AS display_imps,
               SUM(IF(LOWER(media_type) = 'display', viewable_impressions, 0))  AS display_viewable,
               SUM(IF(LOWER(media_type) = 'display', clicks, 0))                AS display_clicks,
               SUM(IF(LOWER(media_type) = 'display', total_cost, 0))            AS display_cost
             FROM \`site-hypr.prod_assets.unified_daily_performance_metrics\`
             WHERE short_token IN UNNEST(@toks)
               AND LOWER(IFNULL(line_name, '')) NOT LIKE '%survey%'
               AND LOWER(IFNULL(line_name, '')) NOT LIKE '%controle%'
               AND LOWER(IFNULL(line_name, '')) NOT LIKE '%exposto%'
             GROUP BY short_token
           )
           SELECT * FROM agg`,
          { toks: tokens },
          'US'
        );

        const contractedRows = await query(
          `SELECT short_token,
             IFNULL(o2o_display_impressions, 0)
           + IFNULL(bonus_o2o_display_impressions, 0)
           + IFNULL(ooh_display_impressions, 0)
           + IFNULL(bonus_ooh_display_impressions, 0) AS display_contracted
           FROM ${tableRef('commplan_checklists')}
           WHERE short_token IN UNNEST(@toks)`,
          { toks: tokens }
        );

        const contractedMap = {};
        for (const r of contractedRows) contractedMap[r.short_token] = Number(r.display_contracted) || 0;

        // Mapa de client_name por token pra checar ABS
        const clientByToken = {};
        for (const c of campaigns) clientByToken[c.short_token] = c.client_name;

        for (const r of perfRows) {
          const displayContracted = contractedMap[r.short_token] || 0;
          const displayImps = Number(r.display_imps) || 0;
          const displayViewable = Number(r.display_viewable) || 0;
          const displayClicks = Number(r.display_clicks) || 0;
          const displayCost = Number(r.display_cost) || 0;

          // Exceções de OVER: usa impressões totais no numerador (só OVER muda)
          const usesTotalImps = await isOverException(clientByToken[r.short_token]);
          const overNumerator = usesTotalImps ? displayImps : displayViewable;

          metricsByToken[r.short_token] = {
            ecpm: displayImps > 0 ? (displayCost / displayImps) * 1000 : 0,
            ctr: displayViewable > 0 ? displayClicks / displayViewable : 0,
            over_percent: displayContracted > 0 ? ((overNumerator / displayContracted) - 1) * 100 : 0,
            over_uses_total_imps: usesTotalImps,
            display_impressions: displayImps,
            display_viewable: displayViewable,
            display_clicks: displayClicks,
            display_cost: displayCost,
            display_contracted: displayContracted,
            creative_fee_estimate: null,
          };
        }
      } catch (e) {
        console.warn('batch metrics:', e.message);
      }
    }

    // Agora calcula bônus de cada campanha com TODOS os dados
    let totalBonusBrl = 0;
    let totalBonusPreAssignedBrl = 0; // bônus de Pré atribuído pra este CS em campanhas de outros

    // Resolve studies pra todas as campanhas em paralelo (pra UI mostrar nome + autor)
    const studiesInfoByToken = {};
    await Promise.all(campaigns.map(async (c) => {
      try {
        studiesInfoByToken[c.short_token] = await resolveStudiesInfo(c);
      } catch (_) {
        studiesInfoByToken[c.short_token] = [];
      }
    }));

    const items = campaigns.map(c => {
      const mc = manualChecksByToken[c.short_token] || {};
      const ao = adminOverridesByToken[c.short_token] || {};
      const preAssignee = preAssigneeByToken[c.short_token] || null;
      const metrics = metricsByToken[c.short_token] || null;
      const studiesInfo = studiesInfoByToken[c.short_token] || [];
      const breakdown = computeBonus(c, mc, metrics, ao, {
        preAssignee, csOwner: csEmail, studiesInfo
      });
      totalBonusBrl += breakdown.total_brl;
      return {
        short_token: c.short_token,
        client_name: c.client_name,
        campaign_name: c.campaign_name,
        cp_name: c.cp_name,
        agency: c.agency,
        start_date: c.start_date?.value || c.start_date,
        end_date: c.end_date?.value || c.end_date,
        is_legacy: !!c.is_legacy,
        reviewed: !!c.reviewed,
        review_requested: !!mc.__review_requested,
        bruto: Number(c.total_value) || 0,
        liquido: (Number(c.total_value) || 0) * NET_FACTOR,
        bonus_brl: breakdown.total_brl,
        bonus_pct: breakdown.total_pct,
      };
    });

    const nReviewed = items.filter(i => i.reviewed).length;
    const bruto = items.reduce((s, i) => s + i.bruto, 0);

    // Busca campanhas onde este CS é PRE_ASSIGNEE mas NÃO é o CS dono
    // (Pré Campanha atribuída a este CS em campanhas de outros)
    let preAssignedItems = [];
    let preAssignedBonusBrl = 0;
    try {
      const qInfo = parseQuarter(quarter);
      if (!qInfo) throw new Error(`Quarter inválido: ${quarter}`);
      const { startDate: qStart, endDate: qEnd } = qInfo;

      const preCampaigns = await query(
        `SELECT
           c.short_token, c.client_name, c.campaign_name, c.cp_name, c.agency,
           c.start_date, c.end_date, c.is_legacy, c.cs_email, c.cs_name,
           c.total_value,
           IFNULL(o.manual_checks, la.manual_checks) AS manual_checks,
           IFNULL(o.admin_overrides, la.admin_overrides) AS admin_overrides
         FROM ${tableRef('commplan_checklists')} c
         LEFT JOIN ${tableRef('commplan_command_overrides')} o ON c.short_token = o.short_token
         LEFT JOIN ${tableRef('commplan_legacy_assignments')} la ON c.short_token = la.short_token
         WHERE LOWER(IFNULL(o.pre_campaign_assignee_email, la.pre_campaign_assignee_email)) = @cs
           AND LOWER(IFNULL(c.cs_email, '')) != @cs
           AND c.start_date >= @qStart AND c.start_date <= @qEnd`,
        { cs: csEmail, qStart, qEnd }
      );

      for (const pc of preCampaigns) {
        const mc = pc.manual_checks ? JSON.parse(pc.manual_checks) : {};
        const ao = pc.admin_overrides ? JSON.parse(pc.admin_overrides) : {};
        // Calcula com csOwner = csEmail (faz pre_campaign contar pra ele)
        const breakdown = computeBonus(pc, mc, null, ao, { preAssignee: csEmail, csOwner: csEmail });
        // Mas só pega o subtotal de pre_campaign (não conta setup/etc das campanhas de outros)
        const preSubtotal = breakdown.by_category?.pre_campaign?.subtotal_brl || 0;
        if (preSubtotal > 0) {
          preAssignedBonusBrl += preSubtotal;
          preAssignedItems.push({
            short_token: pc.short_token,
            client_name: pc.client_name,
            campaign_name: pc.campaign_name,
            owner_cs_email: pc.cs_email,
            owner_cs_name: pc.cs_name,
            start_date: pc.start_date?.value || pc.start_date,
            end_date: pc.end_date?.value || pc.end_date,
            is_legacy: !!pc.is_legacy,
            pre_subtotal_brl: preSubtotal,
            pre_subtotal_pct: breakdown.by_category.pre_campaign.subtotal_pct,
          });
        }
      }
    } catch (e) {
      console.warn(`Erro buscando pre-assigned: ${e.message}`);
    }

    // Busca campanhas onde este CS é AUTOR DE ESTUDO usado (mas não é CS dono)
    let studyAuthoredItems = [];
    let studyAuthoredBonusBrl = 0;
    try {
      const qInfo2 = parseQuarter(quarter);
      if (!qInfo2) throw new Error(`Quarter inválido: ${quarter}`);
      const qStart2 = qInfo2.startDate;
      const qEnd2 = qInfo2.endDate;

      // 1) Pega todos os estudos do catálogo cujo autor padrão é o CS
      const myStudies = await query(
        `SELECT id, display_name, author_email
         FROM ${tableRef('commplan_studies_catalog')}
         WHERE LOWER(author_email) = @cs AND active = TRUE AND version_id = @v`,
        { cs: csEmail, v: VERSION_ID }
      );
      const myStudyNamesLower = myStudies.map(s => s.display_name.toLowerCase());

      // 2) Busca campanhas no quarter:
      //    - onde studies_used contém algum estudo cujo AUTOR PADRÃO é este CS
      //    - OU onde admin atribuiu study_assignee_email = este CS
      //    Em ambos os casos só interessa se este CS NÃO é o dono da campanha.
      const studyCampaigns = await query(
        `SELECT
           c.short_token, c.client_name, c.campaign_name, c.cs_email, c.cs_name,
           c.start_date, c.end_date, c.is_legacy, c.total_value, c.studies_used,
           IFNULL(o.study_assignee_email, la.study_assignee_email) AS study_assignee_email
         FROM ${tableRef('commplan_checklists')} c
         LEFT JOIN ${tableRef('commplan_command_overrides')} o ON c.short_token = o.short_token
         LEFT JOIN ${tableRef('commplan_legacy_assignments')} la ON c.short_token = la.short_token
         WHERE LOWER(IFNULL(c.cs_email, '')) != @cs
           AND c.start_date >= @qStart AND c.start_date <= @qEnd
           AND ARRAY_LENGTH(IFNULL(c.studies_used, [])) > 0
           AND (
             LOWER(IFNULL(o.study_assignee_email, la.study_assignee_email)) = @cs
             OR (
               IFNULL(o.study_assignee_email, la.study_assignee_email) IS NULL
               AND EXISTS (
                 SELECT 1 FROM UNNEST(c.studies_used) AS s
                 WHERE LOWER(s) IN UNNEST(@names)
               )
             )
           )`,
        { cs: csEmail, qStart: qStart2, qEnd: qEnd2, names: myStudyNamesLower }
      );

      // 3) Calcula bonus de cada campanha pra este autor
      const STUDIES_PCT = 0.0030; // 0.30%
      for (const sc of studyCampaigns) {
        // Identifica o nome do estudo: se houver override, pega o primeiro;
        // senão, o que bate com o catálogo do CS.
        let studyName = null;
        if (sc.study_assignee_email) {
          studyName = (sc.studies_used || [])[0] || null;
        } else {
          studyName = (sc.studies_used || []).find(n =>
            myStudyNamesLower.includes((n || '').toLowerCase())
          ) || null;
        }
        if (!studyName) continue;

        const liquido = (Number(sc.total_value) || 0) * NET_FACTOR;
        const studyBonus = liquido * STUDIES_PCT;
        studyAuthoredBonusBrl += studyBonus;

        studyAuthoredItems.push({
          short_token: sc.short_token,
            client_name: sc.client_name,
            campaign_name: sc.campaign_name,
            owner_cs_email: sc.cs_email,
            owner_cs_name: sc.cs_name,
            start_date: sc.start_date?.value || sc.start_date,
            end_date: sc.end_date?.value || sc.end_date,
            is_legacy: !!sc.is_legacy,
            study_name: studyName,
            study_bonus_brl: studyBonus,
            study_bonus_pct: STUDIES_PCT,
            via_assignee_override: !!sc.study_assignee_email,
          });
        }
    } catch (e) {
      console.warn(`Erro buscando study-authored: ${e.message}`);
    }

    // Total = bonus das próprias + pré atribuída + estudo autorado
    totalBonusBrl += preAssignedBonusBrl + studyAuthoredBonusBrl;

    // Busca salário vigente do CS
    let monthlySalary = 0;
    try {
      const salaryRow = await getSalaryForCs({ csEmail });
      monthlySalary = Number(salaryRow?.fixed_salary_brl) || 0;
    } catch (e) {
      console.warn(`getSalaryForCs(${csEmail}): ${e.message}`);
    }

    // Floor override: admin pode tirar 1 ou 2 meses do piso desse CS no quarter
    let monthsWaived = 0;
    let floorOverrideInfo = null;
    try {
      const fo = await getFloorOverride({ csEmail, quarter });
      monthsWaived = fo?.months_off || 0;
      if (fo) floorOverrideInfo = { months_off: fo.months_off, note: fo.note };
    } catch (e) {
      console.warn(`getFloorOverride(${csEmail}, ${quarter}): ${e.message}`);
    }

    // Piso do quarter = (2 - months_waived) × salário mensal
    const floorMonths = Math.max(0, 2 - monthsWaived);
    const floorQuarter = monthlySalary * floorMonths;
    const bonusLiquido = Math.max(0, totalBonusBrl - floorQuarter);
    const hitFloor = totalBonusBrl >= floorQuarter;
    const bonusMensal = bonusLiquido / 3;

    // Se admin está impersonando, busca o nome do CS pra exibir no banner
    let csName = null;
    if (impersonating) {
      try {
        const [tm] = await query(
          `SELECT name FROM ${tableRef('compplan_team')} WHERE LOWER(email) = @e LIMIT 1`,
          { e: csEmail }
        );
        csName = tm?.name || null;
      } catch (_) { /* silent */ }
    }

    res.json({
      quarter,
      cs_email: csEmail,
      cs_name: csName,
      impersonating,
      viewer_email: byEmail,
      kpis: {
        n_camp: items.length,
        n_reviewed: nReviewed,
        n_pending: items.length - nReviewed,
        bruto_total: bruto,
        liquido_total: bruto * NET_FACTOR,
        bonus_total: totalBonusBrl,
        bonus_pre_assigned: preAssignedBonusBrl,
        bonus_study_authored: studyAuthoredBonusBrl,
        monthly_salary: monthlySalary,
        floor_quarter: floorQuarter,
        floor_months: floorMonths,
        floor_override: floorOverrideInfo,
        bonus_liquido: bonusLiquido,
        bonus_mensal: bonusMensal,
        hit_floor: hitFloor,
        tax_rate: TAX_RATE,
      },
      items,
      pre_assigned_items: preAssignedItems,
      study_authored_items: studyAuthoredItems,
    });
  } catch (err) {
    console.error('GET /me/dashboard error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /me/campaign/:token ────────────────────────────────────────────
router.get('/campaign/:token', async (req, res) => {
  try {
    const { csEmail, impersonating } = resolveTargetCs(req);
    const isAdmin = req.user?.role === 'admin';
    const { token } = req.params;

    const [campaign] = await query(
      `SELECT
         c.*,
         o.reviewed AS o_reviewed, o.reviewed_at AS o_reviewed_at,
         o.notes AS o_notes,
         o.updated_by AS o_updated_by, o.updated_at AS o_updated_at,
         la.updated_at AS la_updated_at, la.attributed_at AS la_attributed_at,
         la.notes AS la_notes,
         la.updated_by AS la_updated_by
       FROM ${tableRef('commplan_checklists')} c
       LEFT JOIN ${tableRef('commplan_command_overrides')} o ON c.short_token = o.short_token
       LEFT JOIN ${tableRef('commplan_legacy_assignments')} la ON c.short_token = la.short_token
       WHERE c.short_token = @t LIMIT 1`,
      { t: token }
    );

    if (!campaign) {
      return res.status(404).json({ error: `Campanha ${token} não encontrada` });
    }

    const isLegacy = !!campaign.is_legacy;

    // Pega manual_checks e métricas em paralelo
    const [mcData, metrics] = await Promise.all([
      fetchManualChecks(campaign.short_token, isLegacy),
      fetchPerformanceMetrics(campaign.short_token, campaign.client_name),
    ]);
    const { manualChecks, adminOverrides, adminOverridesBy, adminOverridesAt, preAssignee, preAssignedAt, studyAssignee } = mcData;

    // Permissão: CS dono OU admin OU assignee de pre_campaign
    if (!isAdmin
        && (campaign.cs_email || '').toLowerCase() !== csEmail
        && (preAssignee || '').toLowerCase() !== csEmail) {
      return res.status(403).json({ error: 'Sem permissão pra ver essa campanha' });
    }

    // Resolve estudos usados (nome → catálogo, com override de assignee se houver)
    const studiesInfo = await resolveStudiesInfo(campaign, studyAssignee);

    // Calcula breakdown completo (com admin overrides + pre assignee + studies aplicados)
    const breakdown = computeBonus(campaign, manualChecks, metrics, adminOverrides, {
      preAssignee,
      csOwner: csEmail,
      studiesInfo,
    });

    // Status reviewed
    let reviewed = false;
    let reviewedAt = null;
    if (isLegacy) {
      reviewed = !!(campaign.la_updated_at && campaign.la_attributed_at && campaign.la_updated_at > campaign.la_attributed_at);
      reviewedAt = campaign.la_updated_at?.value || campaign.la_updated_at;
    } else {
      reviewed = !!campaign.o_reviewed;
      reviewedAt = campaign.o_reviewed_at?.value || campaign.o_reviewed_at;
    }

    res.json({
      short_token: campaign.short_token,
      is_legacy: isLegacy,
      reviewed,
      reviewed_at: reviewedAt,
      last_edit_by: isLegacy ? campaign.la_updated_by : campaign.o_updated_by,
      last_edit_at: isLegacy ? (campaign.la_updated_at?.value || campaign.la_updated_at) : (campaign.o_updated_at?.value || campaign.o_updated_at),

      // Read-only
      client_name: campaign.client_name,
      campaign_name: campaign.campaign_name,
      cp_name: campaign.cp_name,
      agency: campaign.agency,
      industry: campaign.industry,
      // is_abs efetivo: prioriza override do CS, depois fallback pro checklist
      is_abs: Object.prototype.hasOwnProperty.call(manualChecks, '__is_abs')
        ? !!manualChecks.__is_abs
        : !!campaign.is_abs,
      is_abs_overridden: Object.prototype.hasOwnProperty.call(manualChecks, '__is_abs'),
      is_abs_default: !!campaign.is_abs,
      cs_email: campaign.cs_email,
      cs_name: campaign.cs_name,
      start_date: campaign.start_date?.value || campaign.start_date,
      end_date: campaign.end_date?.value || campaign.end_date,
      bruto: breakdown.bruto,
      liquido: breakdown.liquido,
      tax_rate: TAX_RATE,
      formats: campaign.formats || [],
      products: campaign.products || [],
      features: campaign.features || [],
      audiences: campaign.audiences,
      studies_used: campaign.studies_used || [],
      pracas_type: campaign.pracas_type,
      notes: isLegacy ? campaign.la_notes : campaign.o_notes,

      // Manual checks atuais
      manual_checks: manualChecks,

      // Admin overrides + CS review request
      admin_overrides: adminOverrides,
      admin_overrides_by: adminOverridesBy,
      admin_overrides_at: adminOverridesAt,
      review_requested: !!manualChecks.__review_requested,
      review_request_notes: manualChecks.__review_notes || '',

      // Pré Campanha — atribuída a outro CS?
      pre_campaign_assignee_email: preAssignee,
      pre_campaign_assigned_at: preAssignedAt,
      // Flag útil pra UI: o viewer atual é o assignee?
      viewer_is_pre_assignee: (preAssignee || '').toLowerCase() === csEmail,

      // Study assignee — admin pode atribuir bônus de estudo a outro CS
      study_assignee_email: studyAssignee,
      viewer_is_study_assignee: (studyAssignee || '').toLowerCase() === csEmail,

      // Métricas pra Otimizações (se houver)
      metrics: metrics ? {
        ecpm: Number(metrics.ecpm) || 0,
        ctr: Number(metrics.ctr) || 0,
        over_percent: Number(metrics.over_percent) || 0,
      } : null,

      // Breakdown completo
      breakdown,
    });
  } catch (err) {
    console.error('GET /me/campaign error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /me/campaign/:token ────────────────────────────────────────────
// Body: { manual_checks: { itemId: bool }, notes?, reviewed? }
router.put('/campaign/:token', async (req, res) => {
  try {
    const { csEmail, byEmail } = resolveTargetCs(req);
    const isAdmin = req.user?.role === 'admin';
    const { token } = req.params;
    const body = req.body || {};

    const [campaign] = await query(
      `SELECT short_token, cs_email, is_legacy
       FROM ${tableRef('commplan_checklists')}
       WHERE short_token = @t LIMIT 1`,
      { t: token }
    );

    if (!campaign) return res.status(404).json({ error: `Campanha ${token} não encontrada` });

    // Permissão: CS dono OU admin OU assignee de pre_campaign
    const prev = await fetchManualChecks(campaign.short_token, !!campaign.is_legacy);
    const preAssignee = prev.preAssignee;
    const isOwner = (campaign.cs_email || '').toLowerCase() === csEmail;
    const isPreAssignee = (preAssignee || '').toLowerCase() === csEmail;
    if (!isAdmin && !isOwner && !isPreAssignee) {
      return res.status(403).json({ error: 'Sem permissão pra editar' });
    }
    // Se o viewer é APENAS preAssignee (não dono nem admin), ele só pode
    // mexer nos items de Pré Campanha. Faz merge dos manual_checks dele
    // sobre os do dono — preservando tudo que NÃO é pre_*.
    const restrictToPre = !isAdmin && !isOwner && isPreAssignee;

    const manualChecksFromBody = body.manual_checks && typeof body.manual_checks === 'object'
      ? body.manual_checks
      : {};
    let manualChecks;
    if (restrictToPre) {
      // Pega manual_checks antigos do dono, sobrescreve só as keys pre_*
      const prevChecks = prev.manualChecks || {};
      manualChecks = { ...prevChecks };
      // Aplica só keys pre_* (e __evidence.pre_*)
      for (const [key, val] of Object.entries(manualChecksFromBody)) {
        if (key.startsWith('pre_')) {
          manualChecks[key] = val;
        }
      }
      // Evidências: só pre_*
      if (manualChecksFromBody.__evidence) {
        manualChecks.__evidence = { ...(prevChecks.__evidence || {}) };
        for (const [k, v] of Object.entries(manualChecksFromBody.__evidence)) {
          if (k.startsWith('pre_')) {
            manualChecks.__evidence[k] = v;
          }
        }
      }
    } else {
      manualChecks = manualChecksFromBody;
    }
    const manualChecksJson = JSON.stringify(manualChecks);
    const notes = body.notes || '';
    const reviewed = body.reviewed !== false;

    // Antes de salvar, busca estado anterior pra detectar mudança no review_requested
    let wasReviewRequested = !!prev.manualChecks?.__review_requested;

    const isNowReviewRequested = !!manualChecks.__review_requested;
    const reviewRequestedChanged = !wasReviewRequested && isNowReviewRequested;

    if (campaign.is_legacy) {
      // Legacy: salva em commplan_legacy_assignments (campo manual_checks JSON)
      await query(
        `UPDATE ${tableRef('commplan_legacy_assignments')}
         SET manual_checks = @mc,
             notes = @notes,
             updated_by = @byEmail,
             updated_at = CURRENT_TIMESTAMP()
         WHERE short_token = @token`,
        { mc: manualChecksJson, notes, byEmail, token }
      );
    } else {
      // Command novo: MERGE em commplan_command_overrides
      await query(
        `MERGE ${tableRef('commplan_command_overrides')} T
         USING (SELECT @token AS short_token) S
         ON T.short_token = S.short_token
         WHEN MATCHED THEN UPDATE SET
           manual_checks = @mc,
           notes = @notes,
           reviewed = @reviewed,
           reviewed_at = CURRENT_TIMESTAMP(),
           updated_at = CURRENT_TIMESTAMP(),
           updated_by = @byEmail
         WHEN NOT MATCHED THEN INSERT
           (short_token, cs_email, manual_checks, notes, reviewed, reviewed_at,
            created_at, updated_at, updated_by)
         VALUES
           (@token, @csEmail, @mc, @notes, @reviewed, CURRENT_TIMESTAMP(),
            CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP(), @byEmail)`,
        { token, csEmail, byEmail, mc: manualChecksJson, notes, reviewed }
      );
    }

    // Se CS solicitou análise (transição de false→true), notifica admins por email
    if (reviewRequestedChanged) {
      try {
        const adminEmails = await query(
          `SELECT email FROM ${tableRef('compplan_team')}
           WHERE role = 'admin' AND active = TRUE`
        );
        const reviewNotes = manualChecks.__review_notes || '(sem detalhes)';
        const subject = `[Compplan] CS pediu análise: ${campaign.client_name || token}`;
        const html = `
          <h2>Pedido de análise — ${campaign.client_name || token}</h2>
          <p><strong>Campanha:</strong> ${campaign.campaign_name || ''} (${token})</p>
          <p><strong>CS:</strong> ${byEmail}</p>
          <p><strong>Observação:</strong></p>
          <blockquote style="border-left: 3px solid #0891b2; padding-left: 12px; color: #555;">
            ${reviewNotes.replace(/</g, '&lt;').replace(/\n/g, '<br>')}
          </blockquote>
          <p><a href="https://hypr-compplan.vercel.app/admin/cs/${encodeURIComponent(byEmail)}/campanha/${token}">
            Abrir campanha →
          </a></p>
        `;
        for (const a of adminEmails) {
          await sendEmail({
            to: a.email,
            subject,
            html,
            text: `${byEmail} pediu análise da campanha ${token}: ${reviewNotes}`,
          });
        }
      } catch (e) {
        console.warn('Falha ao notificar admins por email:', e.message);
      }
    }

    // Re-calcula e retorna breakdown atualizado
    const [updated] = await query(
      `SELECT c.*
       FROM ${tableRef('commplan_checklists')} c
       WHERE c.short_token = @t LIMIT 1`,
      { t: token }
    );
    const metrics = await fetchPerformanceMetrics(token, updated?.client_name);
    // Re-busca admin_overrides + pre_assignee (não mudam pelo PUT, mas garante consistência)
    const post = await fetchManualChecks(token, !!campaign.is_legacy);
    const studiesInfoPost = await resolveStudiesInfo(updated, post.studyAssignee);
    const breakdown = computeBonus(updated, manualChecks, metrics, post.adminOverrides || {}, {
      preAssignee: post.preAssignee,
      csOwner: csEmail,
      studiesInfo: studiesInfoPost,
    });

    res.json({ ok: true, reviewed, breakdown });
  } catch (err) {
    console.error('PUT /me/campaign error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /me/history ────────────────────────────────────────────────────
router.get('/history', async (req, res) => {
  try {
    const csEmail = (req.user?.email || '').toLowerCase();
    if (!csEmail) return res.status(401).json({ error: 'sem email' });

    const items = await query(
      `SELECT
         CONCAT('Q', CAST(EXTRACT(QUARTER FROM start_date) AS STRING), '-',
                CAST(EXTRACT(YEAR FROM start_date) AS STRING))  AS quarter,
         EXTRACT(YEAR FROM start_date) AS year,
         EXTRACT(QUARTER FROM start_date) AS qnum,
         COUNT(*) AS n_camp,
         IFNULL(SUM(total_value), 0) AS bruto
       FROM ${tableRef('commplan_checklists')}
       WHERE LOWER(cs_email) = @cs
       GROUP BY year, qnum, quarter
       ORDER BY year DESC, qnum DESC`,
      { cs: csEmail }
    );

    res.json({
      items: items.map(r => {
        const b = Number(r.bruto) || 0;
        return {
          quarter: r.quarter, year: r.year, qnum: r.qnum,
          n_camp: r.n_camp || 0,
          bruto: b,
          liquido: b * NET_FACTOR,
        };
      }),
    });
  } catch (err) {
    console.error('GET /me/history error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * GET /commplan/me/pre-campaign-search?q=
 * Lista campanhas pra atribuir Pré Campanha (busca por cliente/campanha/token).
 */
router.get('/pre-campaign-search', async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim();
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);

    let sql = `
      SELECT
        c.short_token, c.client_name, c.campaign_name, c.start_date, c.end_date,
        c.is_legacy, c.cs_email, c.cs_name,
        IFNULL(o.pre_campaign_assignee_email, la.pre_campaign_assignee_email) AS pre_assignee
      FROM ${tableRef('commplan_checklists')} c
      LEFT JOIN ${tableRef('commplan_command_overrides')} o ON c.short_token = o.short_token
      LEFT JOIN ${tableRef('commplan_legacy_assignments')} la ON c.short_token = la.short_token
      WHERE c.cs_email IS NOT NULL
    `;
    const params = {};
    if (q) {
      sql += ` AND (
        LOWER(c.client_name) LIKE @q
        OR LOWER(c.campaign_name) LIKE @q
        OR LOWER(c.short_token) LIKE @q
        OR LOWER(c.cs_name) LIKE @q
      )`;
      params.q = `%${q.toLowerCase()}%`;
    }
    sql += ` ORDER BY c.start_date DESC LIMIT @lim`;
    params.lim = limit;

    const rows = await query(sql, params);

    res.json({
      count: rows.length,
      items: rows.map(r => ({
        short_token: r.short_token,
        client_name: r.client_name,
        campaign_name: r.campaign_name,
        start_date: r.start_date?.value || r.start_date,
        end_date: r.end_date?.value || r.end_date,
        is_legacy: !!r.is_legacy,
        cs_email: r.cs_email,
        cs_name: r.cs_name,
        pre_assignee: r.pre_assignee || null,
      })),
    });
  } catch (err) {
    console.error('GET /me/pre-campaign-search error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /commplan/me/campaign/:token/assign-pre
 * Atribui a Pré Campanha desta campanha ao CS logado.
 * Qualquer CS pode atribuir (não precisa ser admin nem dono).
 */
router.post('/campaign/:token/assign-pre', async (req, res) => {
  try {
    const { token } = req.params;
    const { csEmail, byEmail } = resolveTargetCs(req);

    const [campaign] = await query(
      `SELECT short_token, is_legacy, cs_email
       FROM ${tableRef('commplan_checklists')}
       WHERE short_token = @t LIMIT 1`,
      { t: token }
    );
    if (!campaign) return res.status(404).json({ error: 'campanha não encontrada' });

    const table = campaign.is_legacy ? 'commplan_legacy_assignments' : 'commplan_command_overrides';
    if (campaign.is_legacy) {
      await query(
        `UPDATE ${tableRef(table)}
         SET pre_campaign_assignee_email = @assignee,
             pre_campaign_assigned_at = CURRENT_TIMESTAMP(),
             updated_by = @by,
             updated_at = CURRENT_TIMESTAMP()
         WHERE short_token = @t`,
        { t: token, assignee: csEmail, by: byEmail }
      );
    } else {
      await query(
        `MERGE ${tableRef(table)} T
         USING (SELECT @t AS short_token) S
         ON T.short_token = S.short_token
         WHEN MATCHED THEN UPDATE SET
           pre_campaign_assignee_email = @assignee,
           pre_campaign_assigned_at = CURRENT_TIMESTAMP(),
           updated_at = CURRENT_TIMESTAMP(),
           updated_by = @by
         WHEN NOT MATCHED THEN INSERT
           (short_token, cs_email, pre_campaign_assignee_email, pre_campaign_assigned_at,
            reviewed, created_at, updated_at, updated_by)
         VALUES (@t, @csOriginal, @assignee, CURRENT_TIMESTAMP(),
                 FALSE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP(), @by)`,
        { t: token, assignee: csEmail, by: byEmail, csOriginal: campaign.cs_email || csEmail }
      );
    }

    res.json({ ok: true, assignee: csEmail, target_token: token });
  } catch (err) {
    console.error('POST assign-pre error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * DELETE /commplan/me/campaign/:token/assign-pre
 * Remove a atribuição. Quem pode: o próprio assignee OU o CS dono OU admin.
 */
router.delete('/campaign/:token/assign-pre', async (req, res) => {
  try {
    const { token } = req.params;
    const { csEmail, byEmail, isAdmin } = resolveTargetCs(req);

    const [campaign] = await query(
      `SELECT c.short_token, c.is_legacy, c.cs_email,
              IFNULL(o.pre_campaign_assignee_email, la.pre_campaign_assignee_email) AS pre_assignee
       FROM ${tableRef('commplan_checklists')} c
       LEFT JOIN ${tableRef('commplan_command_overrides')} o ON c.short_token = o.short_token
       LEFT JOIN ${tableRef('commplan_legacy_assignments')} la ON c.short_token = la.short_token
       WHERE c.short_token = @t LIMIT 1`,
      { t: token }
    );
    if (!campaign) return res.status(404).json({ error: 'campanha não encontrada' });

    const canRemove = isAdmin
      || (campaign.pre_assignee || '').toLowerCase() === csEmail
      || (campaign.cs_email || '').toLowerCase() === csEmail;
    if (!canRemove) {
      return res.status(403).json({ error: 'Sem permissão (precisa ser admin, assignee ou CS dono)' });
    }

    const table = campaign.is_legacy ? 'commplan_legacy_assignments' : 'commplan_command_overrides';
    await query(
      `UPDATE ${tableRef(table)}
       SET pre_campaign_assignee_email = NULL,
           pre_campaign_assigned_at = NULL,
           updated_by = @by,
           updated_at = CURRENT_TIMESTAMP()
       WHERE short_token = @t`,
      { t: token, by: byEmail }
    );

    res.json({ ok: true });
  } catch (err) {
    console.error('DELETE assign-pre error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /commplan/me/campaign/:token/assign-study
 * Admin atribui o bônus de Estudos desta campanha a um CS específico.
 * Sobrescreve o autor padrão do catálogo. Só admin pode.
 * Body: { cs_email: string|null }  → null limpa o override.
 */
router.post('/campaign/:token/assign-study', async (req, res) => {
  try {
    const { token } = req.params;
    const { byEmail, isAdmin } = resolveTargetCs(req);
    if (!isAdmin) return res.status(403).json({ error: 'Apenas admin pode atribuir estudo' });

    const newAssignee = (req.body?.cs_email || null) ? String(req.body.cs_email).toLowerCase() : null;

    const [campaign] = await query(
      `SELECT short_token, is_legacy, cs_email
       FROM ${tableRef('commplan_checklists')}
       WHERE short_token = @t LIMIT 1`,
      { t: token }
    );
    if (!campaign) return res.status(404).json({ error: 'campanha não encontrada' });

    const table = campaign.is_legacy ? 'commplan_legacy_assignments' : 'commplan_command_overrides';
    if (campaign.is_legacy) {
      await query(
        `UPDATE ${tableRef(table)}
         SET study_assignee_email = @a,
             updated_by = @by,
             updated_at = CURRENT_TIMESTAMP()
         WHERE short_token = @t`,
        { t: token, a: newAssignee, by: byEmail }
      );
    } else {
      await query(
        `MERGE ${tableRef(table)} T
         USING (SELECT @t AS short_token) S
         ON T.short_token = S.short_token
         WHEN MATCHED THEN UPDATE SET
           study_assignee_email = @a,
           updated_at = CURRENT_TIMESTAMP(),
           updated_by = @by
         WHEN NOT MATCHED THEN INSERT
           (short_token, cs_email, study_assignee_email,
            reviewed, created_at, updated_at, updated_by)
         VALUES (@t, @csOriginal, @a, FALSE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP(), @by)`,
        { t: token, a: newAssignee, by: byEmail, csOriginal: campaign.cs_email || byEmail }
      );
    }

    res.json({ ok: true, study_assignee_email: newAssignee });
  } catch (err) {
    console.error('POST assign-study error:', err);
    res.status(500).json({ error: err.message });
  }
});
router.get('/campaign/:token/replicate-sources', async (req, res) => {
  try {
    const { token } = req.params;
    const { csEmail, byEmail, isAdmin } = resolveTargetCs(req);

    const [target] = await query(
      `SELECT short_token, client_name, cs_email FROM ${tableRef('commplan_checklists')}
       WHERE short_token = @t LIMIT 1`,
      { t: token }
    );
    if (!target) return res.status(404).json({ error: 'campanha não encontrada' });
    if (!isAdmin && (target.cs_email || '').toLowerCase() !== csEmail) {
      return res.status(403).json({ error: 'Sem permissão' });
    }

    // Busca campanhas do mesmo cliente (mesmo CS, exceto a própria) com manual_checks
    const rows = await query(
      `WITH same_client_camps AS (
         SELECT c.short_token, c.campaign_name, c.start_date, c.end_date, c.is_legacy,
                IFNULL(o.manual_checks, la.manual_checks) AS manual_checks,
                IFNULL(o.updated_at, la.updated_at) AS last_updated
         FROM ${tableRef('commplan_checklists')} c
         LEFT JOIN ${tableRef('commplan_command_overrides')} o ON c.short_token = o.short_token
         LEFT JOIN ${tableRef('commplan_legacy_assignments')} la ON c.short_token = la.short_token
         WHERE LOWER(c.client_name) = LOWER(@client)
           AND LOWER(c.cs_email) = LOWER(@cs)
           AND c.short_token != @t
       )
       SELECT * FROM same_client_camps
       WHERE manual_checks IS NOT NULL
       ORDER BY last_updated DESC NULLS LAST, start_date DESC
       LIMIT 50`,
      { client: target.client_name, cs: csEmail, t: token }
    );

    const items = rows.map(r => {
      let n_filled = 0;
      try {
        const mc = r.manual_checks ? JSON.parse(r.manual_checks) : {};
        n_filled = Object.keys(mc).filter(k =>
          !k.startsWith('__') && mc[k] === true
        ).length;
      } catch (_) {}
      return {
        short_token: r.short_token,
        campaign_name: r.campaign_name,
        start_date: r.start_date?.value || r.start_date,
        end_date: r.end_date?.value || r.end_date,
        is_legacy: !!r.is_legacy,
        n_filled,
        last_updated: r.last_updated?.value || r.last_updated,
      };
    });

    res.json({
      target: {
        short_token: target.short_token,
        client_name: target.client_name,
      },
      count: items.length,
      items,
    });
  } catch (err) {
    console.error('GET replicate-sources error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * POST /commplan/me/campaign/:token/replicate-from
 * Body: { source_token }
 * Copia manual_checks da source pra target (mesmo cliente, mesmo CS).
 * SOBRESCREVE o que estava lá. Só copia items manuais (Pré Campanha, Account Mgmt, Extras,
 * Onboarding) + evidências. Setup e Otimizações ficam intactos (são auto).
 */
router.post('/campaign/:token/replicate-from', async (req, res) => {
  try {
    const { token } = req.params;
    const { source_token } = req.body || {};
    if (!source_token) return res.status(400).json({ error: 'source_token obrigatório' });
    if (source_token === token) return res.status(400).json({ error: 'origem e destino são iguais' });

    const { csEmail, byEmail, isAdmin } = resolveTargetCs(req);

    // Carrega ambas as campanhas pra validar (mesmo cliente + mesmo CS)
    const rows = await query(
      `SELECT short_token, client_name, cs_email, is_legacy
       FROM ${tableRef('commplan_checklists')}
       WHERE short_token IN (@t, @s)`,
      { t: token, s: source_token }
    );
    if (rows.length !== 2) return res.status(404).json({ error: 'campanha não encontrada' });

    const target = rows.find(r => r.short_token === token);
    const source = rows.find(r => r.short_token === source_token);
    if (!target || !source) return res.status(404).json({ error: 'campanha não encontrada' });

    if (!isAdmin) {
      if ((target.cs_email || '').toLowerCase() !== csEmail) return res.status(403).json({ error: 'Sem permissão (target)' });
      if ((source.cs_email || '').toLowerCase() !== csEmail) return res.status(403).json({ error: 'Sem permissão (source)' });
    }
    if ((target.client_name || '').toLowerCase() !== (source.client_name || '').toLowerCase()) {
      return res.status(400).json({ error: `clientes diferentes (${target.client_name} vs ${source.client_name})` });
    }

    // Busca manual_checks da origem
    const { manualChecks: srcMc } = await fetchManualChecks(source_token, !!source.is_legacy);

    // Carrega manual_checks atual da target pra preservar __is_abs (toggle ABS específico),
    // notas de revisão, __review_*, __evidence (mas evidências também são parte dos itens manuais → copia).
    const { manualChecks: dstMc } = await fetchManualChecks(token, !!target.is_legacy);

    // Lista de IDs de items "manuais" (não auto, não metrics, não semi_auto inferido)
    // Categorias: pre_campaign, account_mgmt, extras, onboarding
    // Note: setup (semi_auto) é EXCLUÍDO. optimization (metrics) tbm.
    const MANUAL_CATS = ['pre_campaign', 'account_mgmt', 'extras', 'onboarding'];
    const manualItemIds = new Set();
    for (const catKey of MANUAL_CATS) {
      const cat = COMPPLAN_CATALOG[catKey];
      if (!cat) continue;
      for (const item of cat.items) manualItemIds.add(item.id);
    }

    // Monta novo manualChecks:
    // - copia itens manuais (sobrescreve) da source
    // - copia __evidence só dos itens manuais + shared_evidence das categorias copiadas
    // - PRESERVA __is_abs, __review_*, __setup_force (esses são da campanha atual)
    const newMc = { ...dstMc };

    // Remove items manuais antigos (sobrescreve)
    for (const itemId of manualItemIds) delete newMc[itemId];
    // Limpa evidências dos itens manuais que vão ser substituídas
    if (newMc.__evidence) {
      const ev = { ...newMc.__evidence };
      for (const itemId of manualItemIds) delete ev[itemId];
      delete ev.pre_campaign; // shared evidence
      newMc.__evidence = ev;
    }

    // Aplica items manuais da source
    let nCopied = 0;
    for (const itemId of manualItemIds) {
      if (srcMc[itemId] === true) {
        newMc[itemId] = true;
        nCopied++;
      }
    }
    // Aplica evidências dos manuais
    if (srcMc.__evidence) {
      const ev = { ...(newMc.__evidence || {}) };
      for (const itemId of manualItemIds) {
        if (srcMc.__evidence[itemId]) ev[itemId] = srcMc.__evidence[itemId];
      }
      if (srcMc.__evidence.pre_campaign) ev.pre_campaign = srcMc.__evidence.pre_campaign;
      newMc.__evidence = ev;
    }

    const newMcJson = JSON.stringify(newMc);

    // Persiste
    if (target.is_legacy) {
      await query(
        `UPDATE ${tableRef('commplan_legacy_assignments')}
         SET manual_checks = @mc, updated_by = @by, updated_at = CURRENT_TIMESTAMP()
         WHERE short_token = @t`,
        { mc: newMcJson, by: byEmail, t: token }
      );
    } else {
      await query(
        `MERGE ${tableRef('commplan_command_overrides')} T
         USING (SELECT @t AS short_token) S
         ON T.short_token = S.short_token
         WHEN MATCHED THEN UPDATE SET
           manual_checks = @mc,
           updated_at = CURRENT_TIMESTAMP(),
           updated_by = @by
         WHEN NOT MATCHED THEN INSERT
           (short_token, cs_email, manual_checks, reviewed,
            created_at, updated_at, updated_by)
         VALUES (@t, @cs, @mc, FALSE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP(), @by)`,
        { t: token, cs: csEmail, mc: newMcJson, by: byEmail }
      );
    }

    res.json({ ok: true, n_copied: nCopied, source_token, target_token: token });
  } catch (err) {
    console.error('POST replicate-from error:', err);
    res.status(500).json({ error: err.message });
  }
});
