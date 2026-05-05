/**
 * engine/evaluators/media-optimization.js — avalia o 0,30% de Otimização.
 *
 * Regra do Compplan 2026 (decisão final):
 *
 *   - Campanha SÓ Display      → avalia Display
 *   - Campanha SÓ Video        → avalia Video
 *   - Campanha Display+Video   → avalia APENAS Display (Video é ignorado)
 *
 * Em todos os casos, ganha 0,30% (nunca 0,60%) se a mídia avaliada
 * passar nos 3 thresholds simultaneamente:
 *
 *   Display:
 *     over <125% (= over delivery <25%)
 *     eCPM <= R$0,70 (sem ABS) ou R$1,50 (com ABS)
 *     CTR  >= 0,70% (sem ABS) ou 0,50% (com ABS)
 *
 *   Video:
 *     over <125%
 *     eCPM <= R$2,00 (sem ABS) ou R$3,00 (com ABS)
 *     VTR  > 80% (mesmo limite com/sem ABS)
 *
 * "Cliente ABS" é determinado pela tabela commplan_abs_clients
 * (advertiser_id presente = ABS), NÃO pela detecção dv360_daily_costs
 * do Report Center.
 */

const D_THRESHOLDS = {
  no_abs:   { max_over_pct: 125, max_ecpm: 0.70, min_ctr: 0.70 },
  with_abs: { max_over_pct: 125, max_ecpm: 1.50, min_ctr: 0.50 },
};

const V_THRESHOLDS = {
  no_abs:   { max_over_pct: 125, max_ecpm: 2.00, min_vtr: 80.0 },
  with_abs: { max_over_pct: 125, max_ecpm: 3.00, min_vtr: 80.0 },
};

export function evaluate({ rule, perf, isABS }) {
  const hasDisplay = (perf.display_impressions || 0) > 0;
  const hasVideo   = (perf.video_impressions   || 0) > 0;

  if (!hasDisplay && !hasVideo) {
    return {
      rule_id: rule.id,
      raw_pct: 0,                 // % bruta atribuída antes de caps/exclusions
      effective_pct: 0,           // será recomputada pelos pós-processadores
      earned: false,
      reason: 'sem delivery',
      breakdown: {},
    };
  }

  // Display+Video → avalia só Display. Só Video → avalia Video. Só Display → Display.
  const evaluateAs = hasDisplay ? 'display' : 'video';

  if (evaluateAs === 'display') {
    const t = isABS ? D_THRESHOLDS.with_abs : D_THRESHOLDS.no_abs;
    const over_ok = perf.display_pacing != null && perf.display_pacing < t.max_over_pct;
    const ecpm_ok = perf.display_ecpm   != null && perf.display_ecpm  <= t.max_ecpm;
    const ctr_ok  = perf.display_ctr    != null && perf.display_ctr   >= t.min_ctr;
    const passed = over_ok && ecpm_ok && ctr_ok;

    return {
      rule_id: rule.id,
      raw_pct: passed ? rule.bonus_pct : 0,
      effective_pct: passed ? rule.bonus_pct : 0,
      earned: passed,
      breakdown: {
        evaluated_as: 'display',
        had_video_too: hasVideo,
        is_abs: !!isABS,
        over: { value: perf.display_pacing, threshold: `<${t.max_over_pct}%`, ok: over_ok },
        ecpm: { value: perf.display_ecpm,   threshold: `<=R$${t.max_ecpm.toFixed(2)}`, ok: ecpm_ok },
        ctr:  { value: perf.display_ctr,    threshold: `>=${t.min_ctr}%`, ok: ctr_ok },
      },
    };
  }

  // Só Video
  const t = isABS ? V_THRESHOLDS.with_abs : V_THRESHOLDS.no_abs;
  const over_ok = perf.video_pacing != null && perf.video_pacing < t.max_over_pct;
  const ecpm_ok = perf.video_ecpm   != null && perf.video_ecpm  <= t.max_ecpm;
  const vtr_ok  = perf.video_vtr    != null && perf.video_vtr   >  t.min_vtr;
  const passed = over_ok && ecpm_ok && vtr_ok;

  return {
    rule_id: rule.id,
    raw_pct: passed ? rule.bonus_pct : 0,
    effective_pct: passed ? rule.bonus_pct : 0,
    earned: passed,
    breakdown: {
      evaluated_as: 'video',
      had_video_too: false,
      is_abs: !!isABS,
      over: { value: perf.video_pacing, threshold: `<${t.max_over_pct}%`, ok: over_ok },
      ecpm: { value: perf.video_ecpm,   threshold: `<=R$${t.max_ecpm.toFixed(2)}`, ok: ecpm_ok },
      vtr:  { value: perf.video_vtr,    threshold: `>${t.min_vtr}%`, ok: vtr_ok },
    },
  };
}

export const condition_kind = 'media_optimization';
