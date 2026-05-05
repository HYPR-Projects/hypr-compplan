/**
 * engine/evaluators/study-used.js — bônus de estudo usado em campanha.
 *
 * Quando o CP marca no checklist do Command que usou um estudo (campo
 * `studies_used`), o autor do estudo (que está em `commplan_studies_catalog`)
 * recebe 0,30% da receita líquida da campanha. NÃO o CS dono da campanha.
 *
 * Regra: máximo 1 estudo por campanha (definido pelo Compplan 2026 — UI
 * do Command já restringe). Se vier múltiplos no array, pega o primeiro
 * e ignora o resto, logando warning.
 *
 * Caso especial: se o autor do estudo é o próprio CS dono da campanha
 * (ex: João Buzolin usa estudo de Festivais que ele mesmo fez), ainda
 * marca goes_to_study_author=true e mentor_email=joao@..., mas o
 * orchestrator vai agregar isso pra ele mesmo. Sem problema.
 */

import { getStudyById } from '../../data/studies.js';

export async function evaluate({ rule, ctx, checklist }) {
  const studiesUsed = Array.isArray(checklist.studies_used) ? checklist.studies_used : [];

  if (studiesUsed.length === 0) {
    return {
      rule_id: rule.id,
      raw_pct: 0,
      effective_pct: 0,
      earned: false,
      breakdown: { reason: 'nenhum estudo marcado no checklist' },
    };
  }

  if (studiesUsed.length > 1) {
    console.warn(`[study-used] campanha ${ctx.shortToken} marcou ${studiesUsed.length} estudos; usando apenas o primeiro (regra: 1 estudo/campanha)`);
  }

  const studyId = studiesUsed[0];
  const study = await getStudyById(studyId, ctx.versionId);

  if (!study) {
    return {
      rule_id: rule.id,
      raw_pct: 0,
      effective_pct: 0,
      earned: false,
      breakdown: {
        study_id: studyId,
        error: 'estudo não encontrado no catálogo (talvez de outra versão ou removido)',
      },
    };
  }

  if (!study.author_email) {
    return {
      rule_id: rule.id,
      raw_pct: 0,
      effective_pct: 0,
      earned: false,
      breakdown: {
        study_id: studyId,
        study_name: study.display_name,
        error: 'estudo sem author_email definido — verificar com admin',
      },
    };
  }

  return {
    rule_id: rule.id,
    raw_pct: rule.bonus_pct,
    effective_pct: rule.bonus_pct,
    earned: true,
    goes_to_study_author: true,                  // sinaliza pro orchestrator
    study_author_email: study.author_email,
    breakdown: {
      study_id: studyId,
      study_name: study.display_name,
      author_email: study.author_email,
      campaign_cs: ctx.csEmail,
      same_person: study.author_email.toLowerCase() === ctx.csEmail.toLowerCase(),
    },
  };
}

export const condition_kind = 'study_used';
