/**
 * engine/index.js — orquestrador da avaliação.
 *
 * Avalia UMA campanha pra UM cs_email. Carrega contexto, dispatcha pra cada
 * evaluator conforme rule.condition_kind, aplica caps/exclusions, calcula
 * receita líquida e bônus.
 *
 * Saída: estrutura completa pra UI exibir breakdown e pra snapshot em
 * commplan_campaign_calc.
 */

import { netRevenue } from './revenue.js';
import { applyAllModifiers } from './caps-and-exclusions.js';
import { resolveVersion } from '../lib/version-resolver.js';
import { dateToQuarter } from './quarter-resolver.js';

import { getChecklistByShortToken } from '../data/checklists.js';
import { getCampaignPerf, getAdvertiserId } from '../data/campaigns-perf.js';
import { isAdvertiserABS } from '../data/abs-clients.js';
import { getRulesByVersion } from '../data/rules.js';
import { getEvidencesByCampaign } from '../data/evidences.js';
import { resolveCampaignFeatures } from './evaluators/feature-in-tier.js';

// Evaluators
import * as manualClaim from './evaluators/manual-claim.js';
import * as fieldPresent from './evaluators/field-present.js';
import * as boolField from './evaluators/bool-field-true.js';
import * as featureInTier from './evaluators/feature-in-tier.js';
import * as mediaOpt from './evaluators/media-optimization.js';
import * as externalField from './evaluators/external-field-present.js';
import * as setupInvalidator from './evaluators/setup-invalidator.js';
import * as mentorship from './evaluators/mentorship-revenue.js';
import * as studyUsed from './evaluators/study-used.js';

const EVALUATORS = {
  manual_claim: manualClaim.evaluate,
  field_present: fieldPresent.evaluate,
  bool_field_true: boolField.evaluate,
  feature_in_tier: featureInTier.evaluate,
  media_optimization: mediaOpt.evaluate,
  external_field_present: externalField.evaluate,
  mentorship_revenue: mentorship.evaluate,
  study_used: studyUsed.evaluate,
  // setup invalidators têm múltiplas variants
  setup_invalidator_under: setupInvalidator.variants.setup_invalidator_under,
  setup_invalidator_over: setupInvalidator.variants.setup_invalidator_over,
  setup_invalidator_manual: setupInvalidator.variants.setup_invalidator_manual,
};

/**
 * Avalia uma campanha. Retorna { totalPct, bonusAmount, ruleResults, ... }
 * pronto pra ser salvo em commplan_campaign_calc.
 */
export async function evaluateCampaign({ shortToken, csEmail }) {
  // ── 1. Carrega contexto em paralelo ───────────────────────────────────
  const [checklist, perf, advertiserId] = await Promise.all([
    getChecklistByShortToken(shortToken),
    getCampaignPerf(shortToken),
    getAdvertiserId(shortToken),
  ]);

  if (!checklist) {
    throw new Error(`Checklist não encontrado pra ${shortToken}`);
  }

  const endDate = checklist.end_date?.value || checklist.end_date || perf?.end_date;
  if (!endDate) {
    throw new Error(`Campanha ${shortToken} sem end_date — não dá pra atribuir quarter/versão`);
  }

  const versionId = await resolveVersion(endDate);
  const quarter   = dateToQuarter(endDate);

  const [rules, evidences, isABS] = await Promise.all([
    getRulesByVersion(versionId),
    getEvidencesByCampaign(shortToken, csEmail),
    isAdvertiserABS(advertiserId),
  ]);

  // Resolve features uma vez só (caro: lê catálogo)
  const resolvedFeatures = await resolveCampaignFeatures(checklist, versionId);

  const ctx = {
    shortToken,
    csEmail,
    versionId,
    quarter,
    advertiserId,
    isABS,
    campaignEndDate: endDate,
    resolvedFeatures,
  };

  // ── 2. Avalia cada regra ──────────────────────────────────────────────
  const ruleResults = [];
  for (const rule of rules) {
    const evaluator = EVALUATORS[rule.condition_kind];
    if (!evaluator) {
      console.warn(`[engine] sem evaluator pra condition_kind="${rule.condition_kind}" (rule ${rule.id})`);
      ruleResults.push({
        rule,
        result: {
          rule_id: rule.id,
          raw_pct: 0, effective_pct: 0,
          earned: false,
          breakdown: { error: `unknown condition_kind: ${rule.condition_kind}` },
        },
      });
      continue;
    }

    let result;
    try {
      result = await evaluator({ rule, ctx, checklist, perf, isABS, evidences });
    } catch (err) {
      console.error(`[engine] erro avaliando ${rule.id}:`, err);
      result = {
        rule_id: rule.id,
        raw_pct: 0, effective_pct: 0,
        earned: false,
        breakdown: { error: err.message },
      };
    }
    ruleResults.push({ rule, result });
  }

  // ── 3. Pós-processadores: invalidators, exclusion_groups, cap_groups ──
  applyAllModifiers(ruleResults);

  // ── 4. Soma os pcts (separando o do mentor e do autor de estudo) ──────
  let csPct = 0;
  let mentorPct = 0;
  let mentorEmail = null;
  let studyAuthorPct = 0;
  let studyAuthorEmail = null;

  for (const { result } of ruleResults) {
    if (result.goes_to_mentor) {
      mentorPct += result.effective_pct;
      mentorEmail = mentorEmail || result.mentor_email;
    } else if (result.goes_to_study_author) {
      studyAuthorPct += result.effective_pct;
      studyAuthorEmail = studyAuthorEmail || result.study_author_email;
    } else {
      csPct += result.effective_pct;
    }
  }

  // ── 5. Receita e valores em BRL ────────────────────────────────────────
  const revenueGross = Number(checklist.investment || 0);
  const revenueNet   = netRevenue(revenueGross);
  const csBonus           = revenueNet * csPct;
  const mentorBonus       = revenueNet * mentorPct;
  const studyAuthorBonus  = revenueNet * studyAuthorPct;

  return {
    short_token: shortToken,
    cs_email: csEmail,
    quarter,
    version_id: versionId,
    client_name: checklist.client,
    campaign_name: checklist.campaign_name,
    campaign_start_date: checklist.start_date?.value || checklist.start_date,
    campaign_end_date: endDate,
    advertiser_id: advertiserId,
    is_abs: isABS,
    revenue_gross: revenueGross,
    revenue_net: revenueNet,
    cs_total_pct: csPct,
    cs_bonus_amount: csBonus,
    mentor_email: mentorEmail,
    mentor_total_pct: mentorPct,
    mentor_bonus_amount: mentorBonus,
    study_author_email: studyAuthorEmail,
    study_author_total_pct: studyAuthorPct,
    study_author_bonus_amount: studyAuthorBonus,
    rule_results: ruleResults.map(({ rule, result }) => ({
      rule_id: rule.id,
      category: rule.category,
      subcategory: rule.subcategory,
      display_name: rule.display_name,
      display_order: rule.display_order,
      bonus_pct_config: rule.bonus_pct,
      ...result,
    })),
  };
}
