/**
 * engine/evaluators/setup-invalidator.js — regras "negativas" que ZERAM Setup.
 *
 * Tem 3 variantes:
 *   1. setup_invalidator_under         → automático: pacing < 90% em qualquer mídia
 *   2. setup_invalidator_over          → híbrido: pacing > 150% + claim de justificativa
 *   3. setup_invalidator_manual        → manual: CS marca creative fee > R$1.000
 *
 * Diferente dos outros evaluators, estes NUNCA contribuem com bonus_pct.
 * O retorno tem `voids_setup: true` quando o invalidador disparou — o
 * orchestrator usa esse flag pra zerar todas as regras de category='setup'.
 */

const MIN_PACING_PCT = 90;
const MAX_OVER_PCT_THRESHOLD = 150; // pacing > 150% = over de 50%

/** Variante AUTO: under delivery. */
export function evaluateUnder({ rule, perf }) {
  const dPacing = perf.display_pacing;
  const vPacing = perf.video_pacing;

  const dUnder = dPacing != null && dPacing < MIN_PACING_PCT;
  const vUnder = vPacing != null && vPacing < MIN_PACING_PCT;
  const triggered = dUnder || vUnder;

  return {
    rule_id: rule.id,
    raw_pct: 0,
    effective_pct: 0,
    earned: false,
    voids_setup: triggered,
    breakdown: {
      kind: 'under',
      display_pacing: dPacing,
      video_pacing: vPacing,
      display_under: dUnder,
      video_under: vUnder,
      threshold_pct: MIN_PACING_PCT,
    },
  };
}

/** Variante HYBRID: over > 50% sem justificativa aprovada. */
export function evaluateOver({ rule, perf, evidences }) {
  const dPacing = perf.display_pacing;
  const vPacing = perf.video_pacing;

  const dOver = dPacing != null && dPacing > MAX_OVER_PCT_THRESHOLD;
  const vOver = vPacing != null && vPacing > MAX_OVER_PCT_THRESHOLD;
  const detected = dOver || vOver;

  if (!detected) {
    return {
      rule_id: rule.id, raw_pct: 0, effective_pct: 0, earned: false,
      voids_setup: false,
      breakdown: { kind: 'over', detected: false, display_pacing: dPacing, video_pacing: vPacing },
    };
  }

  // Detectado: precisa de justificativa aprovada
  const justification = (evidences || []).find(
    e => e.rule_id === rule.id && e.status === 'approved'
  );
  const hasPending = (evidences || []).some(
    e => e.rule_id === rule.id && e.status === 'claimed'
  );

  // Voids só se NÃO foi justificado ainda (claim aprovado salva o Setup)
  const voids_setup = !justification;

  return {
    rule_id: rule.id, raw_pct: 0, effective_pct: 0, earned: false,
    voids_setup,
    breakdown: {
      kind: 'over',
      detected: true,
      display_pacing: dPacing,
      video_pacing: vPacing,
      justification_status: justification ? 'approved' : (hasPending ? 'pending' : 'missing'),
      justification_id: justification?.id || null,
    },
  };
}

/** Variante MANUAL: CS marcou que houve creative fee acima de R$1.000. */
export function evaluateManual({ rule, evidences }) {
  // Aqui a "evidência" é uma confirmação de SIM, com valor + justificativa.
  // Se o CS afirmou que houve creative fee >R$1k → voids Setup.
  // O CS pode submeter "não, não houve" (status approved + payload {confirmed: false}) → não voids.

  const evid = (evidences || []).find(
    e => e.rule_id === rule.id && e.status === 'approved'
  );

  if (!evid) {
    // Não foi claimado ainda — Setup não é zerado mas fica como pendente
    return {
      rule_id: rule.id, raw_pct: 0, effective_pct: 0, earned: false,
      voids_setup: false,
      requires_claim: true,
      breakdown: { kind: 'creative_fee', status: 'not_claimed' },
    };
  }

  const payload = typeof evid.evidence_payload === 'string'
    ? JSON.parse(evid.evidence_payload)
    : evid.evidence_payload || {};

  const confirmed = payload.confirmed === true; // CS marcou que SIM houve creative fee >R$1k

  return {
    rule_id: rule.id, raw_pct: 0, effective_pct: 0, earned: false,
    voids_setup: confirmed,
    breakdown: {
      kind: 'creative_fee',
      confirmed,
      amount: payload.amount || null,
      notes: payload.notes || null,
      reviewed_by: evid.reviewed_by,
    },
  };
}

// Exporta os 3 com chaves diferentes
export const variants = {
  setup_invalidator_under:  evaluateUnder,
  setup_invalidator_over:   evaluateOver,
  setup_invalidator_manual: evaluateManual,
};
