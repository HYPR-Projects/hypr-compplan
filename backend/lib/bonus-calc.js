/**
 * lib/bonus-calc.js — cálculo unificado de bônus por CS num quarter.
 *
 * Usado por:
 *   - routes/me.js (painel individual do CS)
 *   - routes/admin/overview.js (visão geral admin)
 *
 * Garante que os dois caminhos calculem EXATAMENTE o mesmo número.
 * Antes desta refatoração, /admin/overview ignorava adminOverrides,
 * preAssignee, studyAssignee e studiesInfo — gerando divergência
 * (ex: Isaac R$ 21.509,25 no painel vs R$ 20.820,63 na visão geral).
 *
 * Pipeline:
 *   1. Busca campanhas do CS no quarter (mesma query)
 *   2. Batch: manual_checks + admin_overrides + pre_assignee + study_assignee
 *   3. Batch: métricas (eCPM, CTR, OVER com exceções)
 *   4. Resolve studiesInfo por campanha
 *   5. Chama computeBonus com TODOS os argumentos
 */

import { query, tableRef } from './bigquery.js';
import { computeBonus } from '../engine/compplan-engine.js';
import { isOverException } from '../data/over-exceptions.js';
import { findStudyByName, getStudyById } from '../data/studies.js';

const VERSION_ID = '2026';

/**
 * Resolve metadata dos estudos de uma campanha (catalog + override admin).
 * Movido de routes/me.js pra cá pra ser reutilizável.
 */
export async function resolveStudiesInfo(campaign, studyAssigneeOverride = null, studyIdOverride = null) {
  const studyNames = Array.isArray(campaign.studies_used) ? campaign.studies_used : [];

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

  // Caso especial: admin atribuiu study_id_override sem haver estudos no Command
  if (studyNames.length === 0 && studyIdOverride) {
    try {
      const study = await getStudyById(studyIdOverride, VERSION_ID);
      if (study) {
        result.push({
          name: study.display_name,
          id: study.id,
          author_email: studyAssigneeOverride || study.author_email || null,
          author_name: null,
          link: null,
          status: null,
          delivery: null,
          found_in_catalog: true,
          assignee_overridden: !!studyAssigneeOverride,
          id_overridden: true,
        });
      }
    } catch (e) { console.warn(`getStudyById(${studyIdOverride}): ${e.message}`); }
    return result;
  }

  if (studyNames.length === 0) return [];

  for (const name of studyNames) {
    if (!name) continue;
    let entry = {
      name, id: null, author_email: null, author_name: null,
      link: null, status: null, delivery: null,
      found_in_catalog: false, assignee_overridden: false, id_overridden: false,
    };
    try {
      const study = await findStudyByName(name, VERSION_ID);
      if (study) {
        entry.id = study.id;
        entry.author_email = study.author_email || null;
        entry.found_in_catalog = true;
      }
    } catch (e) { console.warn(`findStudyByName(${name}): ${e.message}`); }
    const extra = extraData.find(d => (d.name || '').toLowerCase() === name.toLowerCase());
    if (extra) {
      entry.author_name = entry.author_name || extra.cs || null;
      entry.link = extra.link || null;
      entry.status = extra.status || null;
      entry.delivery = extra.delivery || null;
    }
    if (studyAssigneeOverride) {
      entry.author_email = studyAssigneeOverride;
      entry.assignee_overridden = true;
    }
    result.push(entry);
  }
  return result;
}

/**
 * Calcula o bônus total bruto de um CS num quarter, aplicando TODOS os
 * overlays (manual_checks, admin_overrides, pre_assignee, study_assignee,
 * studiesInfo, métricas com exceções de OVER).
 *
 * @param {object} args
 * @param {string} args.csEmail - email lowercase
 * @param {string} args.startDate - YYYY-MM-DD
 * @param {string} args.endDate - YYYY-MM-DD
 *
 * @returns {Promise<{ total_brl: number, by_campaign: Array<{short_token, bonus_brl}> }>}
 */
export async function computeCsBonus({ csEmail, startDate, endDate }) {
  // 1. Campanhas do CS
  const campaigns = await query(
    `SELECT
       c.short_token, c.client_name, c.is_legacy,
       c.total_value, c.features, c.products,
       c.formats, c.audiences, c.studies_used, c.pracas_type,
       c.o2o_display_impressions, c.bonus_o2o_display_impressions,
       c.ooh_display_impressions, c.bonus_ooh_display_impressions
     FROM ${tableRef('commplan_checklists')} c
     WHERE LOWER(c.cs_email) = @cs
       AND c.start_date >= @s AND c.start_date <= @e`,
    { cs: csEmail.toLowerCase(), s: startDate, e: endDate }
  );

  if (campaigns.length === 0) {
    return { total_brl: 0, by_campaign: [] };
  }

  const tokens = campaigns.map(c => c.short_token);

  // 2. Batch: overlays (manual_checks, admin_overrides, assignees)
  let manualChecksByToken = {};
  let adminOverridesByToken = {};
  let preAssigneeByToken = {};
  let studyAssigneeByToken = {};
  let studyIdOverrideByToken = {};

  try {
    const [overrideRows, legacyRows] = await Promise.all([
      query(
        `SELECT short_token, manual_checks, admin_overrides,
                pre_campaign_assignee_email, study_assignee_email, study_id_override
         FROM ${tableRef('commplan_command_overrides')}
         WHERE short_token IN UNNEST(@toks)`,
        { toks: tokens }
      ),
      query(
        `SELECT short_token, manual_checks, admin_overrides,
                pre_campaign_assignee_email, study_assignee_email, study_id_override
         FROM ${tableRef('commplan_legacy_assignments')}
         WHERE short_token IN UNNEST(@toks)`,
        { toks: tokens }
      ),
    ]);
    for (const r of [...overrideRows, ...legacyRows]) {
      if (r.manual_checks) {
        try { manualChecksByToken[r.short_token] = JSON.parse(r.manual_checks); } catch (_) {}
      }
      if (r.admin_overrides) {
        try { adminOverridesByToken[r.short_token] = JSON.parse(r.admin_overrides); } catch (_) {}
      }
      if (r.pre_campaign_assignee_email) preAssigneeByToken[r.short_token] = r.pre_campaign_assignee_email;
      if (r.study_assignee_email)        studyAssigneeByToken[r.short_token] = r.study_assignee_email;
      if (r.study_id_override)           studyIdOverrideByToken[r.short_token] = r.study_id_override;
    }
  } catch (e) {
    console.warn('computeCsBonus overlays batch:', e.message);
  }

  // 3. Batch: métricas (eCPM, CTR, OVER com exceções)
  let metricsByToken = {};
  try {
    const [perfRows, contractedRows] = await Promise.all([
      query(
        `SELECT short_token,
           SUM(IF(LOWER(media_type) = 'display', impressions, 0))           AS display_imps,
           SUM(IF(LOWER(media_type) = 'display', viewable_impressions, 0))  AS display_viewable,
           SUM(IF(LOWER(media_type) = 'display', clicks, 0))                AS display_clicks,
           SUM(IF(LOWER(media_type) = 'display', total_cost, 0))            AS display_cost
         FROM \`site-hypr.prod_assets.unified_daily_performance_metrics\`
         WHERE short_token IN UNNEST(@toks)
           AND LOWER(IFNULL(line_name, '')) NOT LIKE '%survey%'
           AND LOWER(IFNULL(line_name, '')) NOT LIKE '%controle%'
           AND LOWER(IFNULL(line_name, '')) NOT LIKE '%exposto%'
         GROUP BY short_token`,
        { toks: tokens },
        'US'
      ),
      query(
        `SELECT short_token,
           IFNULL(o2o_display_impressions, 0)
         + IFNULL(bonus_o2o_display_impressions, 0)
         + IFNULL(ooh_display_impressions, 0)
         + IFNULL(bonus_ooh_display_impressions, 0) AS display_contracted
         FROM ${tableRef('commplan_checklists')}
         WHERE short_token IN UNNEST(@toks)`,
        { toks: tokens }
      ),
    ]);
    const contractedMap = {};
    for (const r of contractedRows) contractedMap[r.short_token] = Number(r.display_contracted) || 0;

    const clientByToken = {};
    for (const c of campaigns) clientByToken[c.short_token] = c.client_name;

    for (const r of perfRows) {
      const displayContracted = contractedMap[r.short_token] || 0;
      const displayImps = Number(r.display_imps) || 0;
      const displayViewable = Number(r.display_viewable) || 0;
      const displayClicks = Number(r.display_clicks) || 0;
      const displayCost = Number(r.display_cost) || 0;

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
    console.warn('computeCsBonus metrics batch:', e.message);
  }

  // 4. Resolve studiesInfo em paralelo
  const studiesInfoByToken = {};
  await Promise.all(campaigns.map(async (c) => {
    try {
      studiesInfoByToken[c.short_token] = await resolveStudiesInfo(
        c,
        studyAssigneeByToken[c.short_token] || null,
        studyIdOverrideByToken[c.short_token] || null,
      );
    } catch (_) {
      studiesInfoByToken[c.short_token] = [];
    }
  }));

  // 5. Calcula bônus de cada campanha COM TODOS OS ARGUMENTOS
  let total = 0;
  const byCampaign = [];
  for (const c of campaigns) {
    const mc = manualChecksByToken[c.short_token] || {};
    const ao = adminOverridesByToken[c.short_token] || {};
    const preAssignee = preAssigneeByToken[c.short_token] || null;
    const metrics = metricsByToken[c.short_token] || null;
    const studiesInfo = studiesInfoByToken[c.short_token] || [];

    const breakdown = computeBonus(c, mc, metrics, ao, {
      preAssignee, csOwner: csEmail, studiesInfo
    });

    total += breakdown.total_brl;
    byCampaign.push({ short_token: c.short_token, bonus_brl: breakdown.total_brl });
  }

  return { total_brl: total, by_campaign: byCampaign };
}
