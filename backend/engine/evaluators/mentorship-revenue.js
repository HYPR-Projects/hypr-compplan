/**
 * engine/evaluators/mentorship-revenue.js — regra de Onboarding (mentoria).
 *
 * Mentor recebe 0,25% sobre receita líquida das campanhas implementadas
 * pelo mentee (CS novo) durante o período da mentoria.
 *
 * Diferença chave vs outras regras: o bônus NÃO vai pro cs_email da
 * campanha (que é o mentee). Vai pro mentor_email registrado em
 * commplan_mentorships.
 *
 * Por isso esta regra é avaliada de forma especial pelo orchestrator:
 * - Quando avalia campanha do mentee, esta regra computa o pct
 *   mas marca `goes_to_mentor: true` no breakdown
 * - O orchestrator agrega esse valor no commplan_quarter_summary do
 *   MENTOR (campo bonus_from_mentorship_brl), não do CS dono da campanha.
 */

import { findActiveMentorship } from '../../data/mentorships.js';

export async function evaluate({ rule, ctx }) {
  // ctx.csEmail é o CS DONO da campanha (potencial mentee).
  // ctx.campaignEndDate é a data de referência pra checar mentoria ativa.
  const mentorship = await findActiveMentorship({
    menteeEmail: ctx.csEmail,
    asOfDate: ctx.campaignEndDate,
  });

  if (!mentorship) {
    return {
      rule_id: rule.id,
      raw_pct: 0, effective_pct: 0,
      earned: false,
      breakdown: { has_mentor: false, mentee_email: ctx.csEmail },
    };
  }

  return {
    rule_id: rule.id,
    raw_pct: rule.bonus_pct,
    effective_pct: rule.bonus_pct,
    earned: true,
    goes_to_mentor: true,                // sinaliza pro orchestrator agregar pro mentor
    mentor_email: mentorship.mentor_email,
    breakdown: {
      has_mentor: true,
      mentor_email: mentorship.mentor_email,
      mentee_email: ctx.csEmail,
      mentorship_id: mentorship.id,
      mentorship_from: mentorship.effective_from,
    },
  };
}

export const condition_kind = 'mentorship_revenue';
