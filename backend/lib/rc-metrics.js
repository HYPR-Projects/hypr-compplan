/**
 * lib/rc-metrics.js — métricas das campanhas no Report Center (mesma régua
 * que o CS e o cliente veem no painel). Lê a lista admin do RC (`?list=true`)
 * com um JWT de serviço assinado com o JWT_SECRET compartilhado.
 *
 * Campos usados por campanha (todos calculados no backend do RC):
 *   display_ecpm   custo DSP / impressões × 1000 (display, sem survey)
 *   display_ctr    cliques / impressões visíveis × 100
 *   video_vtr      completions visíveis / impressões visíveis × 100
 *   display_pacing / video_pacing
 *   tech_cost_pct  custo DSP com survey / valor faturável do PI × 100
 *                  (mesma conta do painel admin do RC — aggregation.js)
 *
 * Cache de 10 min (o próprio RC cacheia a lista por 5 min).
 */

import { issueJwt } from './auth.js';

const RC_URL = (process.env.REPORT_CENTER_URL || 'https://report-data-453955675457.us-central1.run.app').replace(/\/$/, '');
const TTL_MS = 10 * 60 * 1000;
let cache = { at: 0, byToken: null };
let inflight = null;

function billableValue(c) {
  const contracted = (Number(c.d_client_budget) || 0) + (Number(c.v_client_budget) || 0);
  const early = c.early_end_date && String(c.early_end_date) <= new Date().toISOString().slice(0, 10);
  if (early && Number.isFinite(Number(c.client_delivered_value))) return Number(c.client_delivered_value);
  return contracted;
}

function toMetrics(c) {
  const num = (v) => (v === null || v === undefined || v === '' ? null : Number(v));
  const budget = billableValue(c);
  const costFull = num(c.admin_total_cost_full) ?? num(c.admin_total_cost);
  return {
    display_ecpm: num(c.display_ecpm),
    display_ctr_pct: num(c.display_ctr),
    video_vtr_pct: num(c.video_vtr),
    display_pacing: num(c.display_pacing),
    video_pacing: num(c.video_pacing),
    tech_cost_pct: budget > 0 && costFull !== null ? (costFull / budget) * 100 : null,
  };
}

async function load() {
  const token = issueJwt({ email: 'commplan-service@hypr.mobi', role: 'admin' });
  const r = await fetch(`${RC_URL}/?list=true`, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Report Center ${r.status}`);
  const data = await r.json();
  const byToken = {};
  for (const c of data.campaigns || []) {
    if (c?.short_token) byToken[String(c.short_token).toUpperCase()] = toMetrics(c);
  }
  cache = { at: Date.now(), byToken };
  return byToken;
}

/** Mapa TOKEN → métricas do RC. null se o RC estiver indisponível. */
export async function fetchRcMetricsByToken() {
  if (cache.byToken && Date.now() - cache.at < TTL_MS) return cache.byToken;
  if (!inflight) {
    inflight = load()
      .catch((e) => { console.warn('rc-metrics:', e.message); return cache.byToken; })
      .finally(() => { inflight = null; });
  }
  return inflight;
}
