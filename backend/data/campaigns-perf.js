/**
 * data/campaigns-perf.js — métricas de performance + advertiser_id.
 *
 * Lê de prod_assets.unified_daily_performance_metrics (delivery) e
 * prod_assets.dv360_daily_costs (admin cost). Mesmas tabelas que o
 * Report Center usa em query_campaigns_list.
 *
 * IMPORTANTE: a flag display_has_dv_abs / video_has_dv_abs do Report
 * Center NÃO é usada aqui. Pra Compplan, ABS é determinado pela tabela
 * commplan_abs_clients (lookup por advertiser_id).
 */

import { query, TTLCache } from '../lib/bigquery.js';

const UNIFIED  = '`site-hypr.prod_assets.unified_daily_performance_metrics`';
const DV_COSTS = '`site-hypr.prod_assets.dv360_daily_costs`';
const CHECKLIST_INFO = '`site-hypr.prod_assets.checklist_info`';

const perfCache = new TTLCache(5 * 60_000); // 5min — delivery atualiza no máx 1x/dia
const advCache  = new TTLCache(60 * 60_000); // 1h — advertiser_id é estável

/**
 * Performance agregada da campanha — Display + Video.
 *
 * Retorna:
 *   {
 *     display_impressions, display_viewable_impressions, display_clicks,
 *     display_pacing, display_ctr, display_ecpm,
 *     video_impressions, video_viewable_impressions, video_completions,
 *     video_pacing, video_vtr, video_ecpm,
 *     end_date,
 *   }
 *
 * Pacing usa o cálculo "calendar-based" do Report Center: delivered /
 * (negotiated × elapsed_days / total_days), expresso em %.
 *
 * Esta é a query mais pesada do Commplan — espelhamos a lógica de
 * query_campaigns_list (Python) num SQL próprio.
 */
export async function getCampaignPerf(shortToken) {
  const cacheKey = `perf:${shortToken}`;
  const cached = perfCache.get(cacheKey);
  if (cached !== null) return cached;

  const sql = `
    WITH checklist AS (
      SELECT
        short_token,
        MAX(start_date) AS start_date,
        MAX(end_date)   AS end_date,
        SUM(IFNULL(contracted_o2o_display_impressions, 0)
            + IFNULL(contracted_ooh_display_impressions, 0)
            + IFNULL(bonus_o2o_display_impressions, 0)
            + IFNULL(bonus_ooh_display_impressions, 0)) AS d_negotiated,
        SUM(IFNULL(contracted_o2o_video_completions, 0)
            + IFNULL(contracted_ooh_video_completions, 0)
            + IFNULL(bonus_o2o_video_completions, 0)
            + IFNULL(bonus_ooh_video_completions, 0)) AS v_negotiated
      FROM ${CHECKLIST_INFO}
      WHERE short_token = @t
      GROUP BY short_token
    ),
    perf AS (
      SELECT
        short_token,
        SUM(IF(media_type='DISPLAY', impressions, 0))            AS d_impr,
        SUM(IF(media_type='DISPLAY', viewable_impressions, 0))   AS d_vimpr,
        SUM(IF(media_type='DISPLAY', clicks, 0))                 AS d_clicks,
        SUM(IF(media_type='DISPLAY', total_cost, 0))             AS d_cost,
        SUM(IF(media_type='VIDEO', impressions, 0))              AS v_impr,
        SUM(IF(media_type='VIDEO', viewable_impressions, 0))     AS v_vimpr,
        SUM(IF(media_type='VIDEO', total_cost, 0))               AS v_cost,
        SUM(IF(media_type='VIDEO' AND impressions > 0,
               video_view_100_complete * (viewable_impressions / impressions),
               0))                                               AS v_vcompletions
      FROM ${UNIFIED}
      WHERE short_token = @t
        AND UPPER(line_name) NOT LIKE '%SURVEY%'
      GROUP BY short_token
    )
    SELECT
      c.start_date, c.end_date, c.d_negotiated, c.v_negotiated,
      p.d_impr, p.d_vimpr, p.d_clicks, p.d_cost,
      p.v_impr, p.v_vimpr, p.v_cost, p.v_vcompletions
    FROM checklist c
    LEFT JOIN perf p USING (short_token)
  `;

  const rows = await query(sql, { t: shortToken });
  if (rows.length === 0) {
    perfCache.set(cacheKey, null);
    return null;
  }

  const r = rows[0];
  const startDate = r.start_date?.value || r.start_date;
  const endDate   = r.end_date?.value   || r.end_date;

  // ── Pacing calendar-based (mesma fórmula do Report Center) ──────────
  const today = new Date();
  const sd = new Date(startDate);
  const ed = new Date(endDate);
  const totalDays = Math.max(1, Math.round((ed - sd) / 86400000) + 1);
  const elapsedDays = Math.max(0, Math.min(totalDays, Math.round((today - sd) / 86400000)));

  function pct(delivered, negotiated) {
    if (!negotiated || negotiated <= 0) return null;
    if (elapsedDays <= 0) return null;
    const expected = (negotiated / totalDays) * elapsedDays;
    if (expected <= 0) return null;
    return Math.round((delivered / expected) * 100 * 10) / 10; // 1 casa decimal
  }

  const dNeg = Number(r.d_negotiated || 0);
  const vNeg = Number(r.v_negotiated || 0);
  const dVImpr = Number(r.d_vimpr || 0);
  const vVImpr = Number(r.v_vimpr || 0);
  const vCompl = Number(r.v_vcompletions || 0);

  const result = {
    start_date: startDate,
    end_date: endDate,

    display_impressions:           Number(r.d_impr || 0),
    display_viewable_impressions:  dVImpr,
    display_clicks:                Number(r.d_clicks || 0),
    display_pacing: pct(dVImpr, dNeg),
    display_ctr:    dVImpr > 0 ? Math.round((Number(r.d_clicks || 0) / dVImpr) * 100 * 100) / 100 : null,
    display_ecpm:   Number(r.d_impr || 0) > 0 && Number(r.d_cost || 0) > 0
                      ? Math.round((Number(r.d_cost) / Number(r.d_impr)) * 1000 * 100) / 100
                      : null,

    video_impressions:           Number(r.v_impr || 0),
    video_viewable_impressions:  vVImpr,
    video_completions:           vCompl,
    video_pacing: pct(vCompl, vNeg),
    video_vtr:    vVImpr > 0 ? Math.round((vCompl / vVImpr) * 100 * 100) / 100 : null,
    video_ecpm:   Number(r.v_impr || 0) > 0 && Number(r.v_cost || 0) > 0
                      ? Math.round((Number(r.v_cost) / Number(r.v_impr)) * 1000 * 100) / 100
                      : null,
  };

  perfCache.set(cacheKey, result);
  return result;
}

/**
 * Resolve advertiser_id da campanha (DV360). Lê da tabela unified_*.
 *
 * Pode haver múltiplas linhas com mesmo short_token mas advertiser_ids
 * diferentes? Na prática não — pegamos o mais frequente como salvaguarda.
 */
export async function getAdvertiserId(shortToken) {
  const cacheKey = `adv:${shortToken}`;
  const cached = advCache.get(cacheKey);
  if (cached !== null) return cached;

  const sql = `
    SELECT advertiser_id, COUNT(*) AS n
    FROM ${UNIFIED}
    WHERE short_token = @t
      AND advertiser_id IS NOT NULL
    GROUP BY advertiser_id
    ORDER BY n DESC
    LIMIT 1
  `;
  const rows = await query(sql, { t: shortToken });
  const result = rows[0]?.advertiser_id || null;
  advCache.set(cacheKey, result);
  return result;
}
