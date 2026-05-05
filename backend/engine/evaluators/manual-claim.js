/**
 * engine/evaluators/manual-claim.js — regra que depende de evidência manual
 * submetida pelo CS (commplan_evidences).
 */

export function evaluate({ rule, evidences }) {
  const evid = (evidences || []).find(
    e => e.rule_id === rule.id && e.status === 'approved'
  );

  if (!evid) {
    // Verifica se há claim pendente
    const pending = (evidences || []).find(
      e => e.rule_id === rule.id && e.status === 'claimed'
    );

    return {
      rule_id: rule.id,
      raw_pct: 0,
      effective_pct: 0,
      earned: false,
      breakdown: {
        evidence_status: pending ? 'pending_review' : 'not_claimed',
        evidence_id: pending?.id || null,
      },
    };
  }

  return {
    rule_id: rule.id,
    raw_pct: rule.bonus_pct,
    effective_pct: rule.bonus_pct,
    earned: true,
    breakdown: {
      evidence_status: 'approved',
      evidence_id: evid.id,
      evidence_payload: evid.evidence_payload,
      reviewed_by: evid.reviewed_by,
      reviewed_at: evid.reviewed_at,
    },
  };
}

export const condition_kind = 'manual_claim';
