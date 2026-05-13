/**
 * engine/compplan-engine.js — calcula bônus de uma campanha.
 *
 * SOURCES:
 *   - 'auto':      inferido do checklist, NÃO editável (audiences, estudos)
 *   - 'semi_auto': inferido do checklist, MAS editável pelo CS (setup items)
 *                  Em manualChecks, se ausente, usa o inferido. Se presente, usa o do CS.
 *   - 'manual':    sempre vem do CS marcando manualmente
 *   - 'metrics':   calculado das métricas reais (Otimizações)
 *
 * SETUP VALIDATION:
 *   Se a campanha tem dados de performance e bate alguma condição abaixo,
 *   TODO o setup é zerado e mostra a justificativa:
 *     - Over > 50%
 *     - Criative fee > R$ 1.000
 *     - Under (entregou menos que contratado)
 */

import { COMPPLAN_CATALOG, getFeatureTier } from './compplan-catalog.js';

const TAX_RATE = 0.1653;
const NET_FACTOR = 1 - TAX_RATE;

/**
 * Infere quais items AUTOMÁTICOS e SEMI_AUTO estão atingidos baseado no checklist.
 * Retorna Set de ids inferidos.
 */
function inferAutoItems(campaign) {
  const earned = new Set();
  const features = Array.isArray(campaign.features) ? campaign.features : [];
  const products = Array.isArray(campaign.products) ? campaign.products : [];
  const formats = Array.isArray(campaign.formats) ? campaign.formats : [];

  // Pré Campanha — TUDO manual agora (CS marca o que fez).
  // (Removidos inferências automáticas de audiences e features.)

  // Setup — O2O / OOH (semi_auto)
  // Detecta de: products, formats, ou se a campanha tem display/video impressions contratadas
  const hasO2O = products.some(p => /o2o|ooh|display|video/i.test(p))
              || formats.some(f => /o2o|ooh|display|video/i.test(f))
              || (Number(campaign.o2o_display_impressions) > 0)
              || (Number(campaign.o2o_video_completions) > 0)
              || (Number(campaign.ooh_display_impressions) > 0)
              || (Number(campaign.ooh_video_completions) > 0);
  if (hasO2O) earned.add('setup_o2o_ooh');

  // Setup — RMN Digital (semi_auto)
  const hasRmnDig = products.some(p => /rmn\s*digital|rmnd/i.test(p))
                 || formats.some(f => /rmn\s*digital|rmnd/i.test(f));
  if (hasRmnDig) earned.add('setup_rmn_digital');

  // Setup — RMN Físico (semi_auto)
  const hasRmnFis = products.some(p => /rmn\s*f[ií]sico|rmnf/i.test(p))
                 || formats.some(f => /rmn\s*f[ií]sico|rmnf/i.test(f))
                 || (campaign.pracas_type && /f[ií]sico/i.test(campaign.pracas_type));
  if (hasRmnFis) earned.add('setup_rmn_fisico');

  // Setup — tiers de features (semi_auto)
  let nT1 = 0, nT2 = 0, nT3 = 0;
  for (const f of features) {
    const tier = getFeatureTier(f);
    if (tier === 'tier1') nT1++;
    else if (tier === 'tier2') nT2++;
    else if (tier === 'tier3') nT3++;
  }
  if (nT1 >= 1) earned.add('setup_tier1_1');
  if (nT1 >= 2) earned.add('setup_tier1_2');
  if (nT1 >= 3) earned.add('setup_tier1_3');
  if (nT2 >= 1) earned.add('setup_tier2_1');
  if (nT2 >= 2) earned.add('setup_tier2_2');
  if (nT3 >= 1) earned.add('setup_tier3_1');

  // Extras — Estudos: NÃO entra no breakdown do CS dono da campanha.
  // 0.30% vai pro AUTOR do estudo, processado separadamente no orchestrator
  // de quarter via evaluators/study-used.js (que credita study_author_email).
  // Aqui só registramos pra UI mostrar "estudo X usado" sem somar no bônus.
  // → ex_estudos é renderizado mas com earned=false sempre pra o CS dono.

  return earned;
}

/**
 * Items dependentes de métricas (Otimizações).
 */
function inferMetricItems(campaign, metrics, manualChecks = {}) {
  const earned = new Set();
  if (!metrics) return earned;

  // is_abs: prioriza override manual do CS. Se não, fallback pro campo do checklist.
  const hasOverride = Object.prototype.hasOwnProperty.call(manualChecks, '__is_abs');
  const isABS = hasOverride ? !!manualChecks.__is_abs : !!campaign.is_abs;

  const over = Number(metrics.over_percent) || 0;
  const ecpm = Number(metrics.ecpm) || 0;
  const ctr = Number(metrics.ctr) || 0;

  if (isABS) {
    if (over <= 25 && ecpm > 0 && ecpm <= 1.50 && ctr >= 0.005) {
      earned.add('opt_with_abs');
    }
  } else {
    if (over <= 25 && ecpm > 0 && ecpm <= 0.70 && ctr >= 0.007) {
      earned.add('opt_without_abs');
    }
  }

  return earned;
}

/**
 * Verifica se o setup deve ser zerado.
 * Retorna { invalidated: bool, reason: string|null } baseado nas métricas.
 */
function validateSetup(metrics) {
  if (!metrics) {
    return { invalidated: false, reason: null };
  }

  const over = Number(metrics.over_percent) || 0;

  // 1. Over > 50%
  if (over > 50) {
    return {
      invalidated: true,
      reason: `Setup anulado: campanha entregou ${over.toFixed(1)}% de over (limite 50%).`,
    };
  }

  // 2. Under: entregou menos que contratado
  if (over < 0) {
    return {
      invalidated: true,
      reason: `Setup anulado: campanha em under (entregou ${(100 + over).toFixed(1)}% do contratado).`,
    };
  }

  // NOTA: Creative fee > R$ 1.000 será implementado quando tivermos a fonte correta.

  return { invalidated: false, reason: null };
}

function applyConstraints(earnedItems, allItems, adminOverriddenItems = new Set()) {
  const groups = {};
  for (const item of allItems) {
    if (!earnedItems.has(item.id)) continue;
    if (!item.constraint) continue;
    const [type, groupName] = item.constraint.split(':');
    if (type === 'non_cumulative_group' || type === 'oneof_group') {
      const key = `${type}:${groupName}`;
      groups[key] = groups[key] || [];
      groups[key].push(item);
    }
  }

  for (const items of Object.values(groups)) {
    if (items.length <= 1) continue;
    // Se algum item do grupo foi forçado pelo admin, ele tem prioridade absoluta
    const adminForced = items.filter(i => adminOverriddenItems.has(i.id));
    if (adminForced.length > 0) {
      // Mantém só os admin-forced (ou só o de maior pct entre eles)
      adminForced.sort((a, b) => b.pct - a.pct);
      for (const it of items) {
        if (it.id !== adminForced[0].id) earnedItems.delete(it.id);
      }
      continue;
    }
    // Senão, comportamento normal: mantém só o maior pct
    items.sort((a, b) => b.pct - a.pct);
    for (let i = 1; i < items.length; i++) {
      earnedItems.delete(items[i].id);
    }
  }
}

/**
 * Calcula o breakdown completo de bônus.
 *
 * @param {object} campaign - Dados da campanha (do checklist)
 * @param {object} manualChecks - JSON do que o CS marcou (item_id → bool)
 * @param {object} metrics - Métricas (eCPM, CTR, over)
 * @param {object} adminOverrides - JSON com overrides admin
 * @param {object} opts - { preAssignee: email|null, csOwner: email }
 *   Se preAssignee diferente de null, os itens de pre_campaign NÃO contam pro CS dono.
 *   Eles continuam aparecendo (e podem ser marcados) mas value_brl=0 no breakdown do dono.
 *   Quando engine roda PRO assignee (outra view), preAssignee === csOwner → conta normalmente.
 */
export function computeBonus(campaign, manualChecks = {}, metrics = null, adminOverrides = {}, opts = {}) {
  const bruto = Number(campaign.total_value) || 0;
  const liquido = bruto * NET_FACTOR;

  const { preAssignee = null, csOwner = null } = opts;
  // Pré Campanha entra no breakdown do CS APENAS se:
  //   - Não há assignee (sem atribuição → conta pro dono)
  //   - OU o CS olhando É o assignee (mesma pessoa)
  // Quando preAssignee existe E é diferente do csOwner observador, pre_campaign zera.
  const csOwnerLower = (csOwner || '').toLowerCase();
  const preAssigneeLower = (preAssignee || '').toLowerCase();
  const preGoesToOwner = !preAssigneeLower || preAssigneeLower === csOwnerLower;

  // 1. Items inferidos do checklist (auto + semi_auto)
  const inferred = inferAutoItems(campaign);

  // 2. Items de métricas (Otimizações)
  const metricEarned = inferMetricItems(campaign, metrics, manualChecks);

  // 3. Constrói earned final por item:
  //    - 'auto':      sempre o inferido
  //    - 'semi_auto': se manualChecks tem chave, usa esse valor; senão, usa inferido
  //    - 'manual':    só se manualChecks.x === true
  //    - 'metrics':   o que o metricEarned disser
  //    Depois disso, aplica adminOverrides[item_id].earned (se houver) — admin tem palavra final.
  const earned = new Set();
  const adminOverriddenItems = new Set();
  const allItems = [];
  for (const [catKey, cat] of Object.entries(COMPPLAN_CATALOG)) {
    for (const item of cat.items) {
      allItems.push({ ...item, category: catKey });

      const explicitlySet = Object.prototype.hasOwnProperty.call(manualChecks, item.id);
      const manualVal = manualChecks[item.id] === true;

      if (item.source === 'auto') {
        if (inferred.has(item.id)) earned.add(item.id);
      } else if (item.source === 'semi_auto') {
        if (explicitlySet) {
          if (manualVal) earned.add(item.id);
        } else {
          if (inferred.has(item.id)) earned.add(item.id);
        }
      } else if (item.source === 'manual') {
        if (manualVal) earned.add(item.id);
      } else if (item.source === 'metrics') {
        if (metricEarned.has(item.id)) earned.add(item.id);
      }

      // Admin override: sobrescreve a decisão automática
      const adminOv = adminOverrides[item.id];
      if (adminOv && typeof adminOv === 'object') {
        adminOverriddenItems.add(item.id);
        if (adminOv.earned === true) earned.add(item.id);
        else if (adminOv.earned === false) earned.delete(item.id);
      }
    }
  }

  // 4. Aplica constraints (non_cumulative, oneof) — mas só em items NÃO overridded
  // Admin override tem precedência sobre constraints automáticas.
  applyConstraints(earned, allItems, adminOverriddenItems);

  // 5. Valida setup (over > 50%, criative fee, under) + admin force
  const autoSetupValidation = validateSetup(metrics);
  const setupForce = adminOverrides.__setup_force || 'auto';
  let setupValidation = autoSetupValidation;
  let setupForcedBy = null;
  if (setupForce === 'valid') {
    setupValidation = { invalidated: false, reason: null, forced: true };
    setupForcedBy = adminOverrides.__setup_force_meta || null;
  } else if (setupForce === 'invalid') {
    setupValidation = {
      invalidated: true,
      reason: adminOverrides.__setup_force_meta?.reason || 'Setup anulado pelo admin.',
      forced: true,
    };
    setupForcedBy = adminOverrides.__setup_force_meta || null;
  }

  // 6. Monta breakdown por categoria
  const byCategory = {};
  let totalPct = 0;

  for (const [catKey, cat] of Object.entries(COMPPLAN_CATALOG)) {
    const isSetupInvalidated = catKey === 'setup' && setupValidation.invalidated;
    // Pré Campanha: se atribuída a outro CS, items aparecem mas value_brl=0 pro dono
    const isPreCampaignBlocked = catKey === 'pre_campaign' && !preGoesToOwner;

    const items = cat.items.map(item => {
      const wasEarned = earned.has(item.id);
      const blocked = isSetupInvalidated || isPreCampaignBlocked;
      const effectivelyEarned = wasEarned && !blocked;
      const adminOv = adminOverrides[item.id];
      return {
        id: item.id,
        label: item.label,
        pct: item.pct,
        source: item.source,
        constraint: item.constraint || null,
        help: item.help || null,
        needs_evidence: !!item.needs_evidence,
        evidence_type: item.evidence_type || null,
        earned: effectivelyEarned,
        was_earned: wasEarned,
        invalidated: isSetupInvalidated && wasEarned,
        pre_assigned_to_other: isPreCampaignBlocked && wasEarned,
        value_brl: effectivelyEarned ? liquido * item.pct : 0,
        admin_overridden: !!adminOv,
        admin_override: adminOv || null,
      };
    });

    const subtotalPct = items.filter(i => i.earned).reduce((s, i) => s + i.pct, 0);
    const subtotalBrl = items.filter(i => i.earned).reduce((s, i) => s + i.value_brl, 0);

    byCategory[catKey] = {
      label: cat.label,
      notes: cat.notes || null,
      shared_evidence: cat.shared_evidence || null,
      items,
      subtotal_pct: subtotalPct,
      subtotal_brl: subtotalBrl,
      invalidated: isSetupInvalidated,
      invalidation_reason: isSetupInvalidated ? setupValidation.reason : null,
      setup_forced: catKey === 'setup' ? (setupValidation.forced || false) : false,
      setup_force_meta: catKey === 'setup' ? setupForcedBy : null,
      pre_assigned_to: catKey === 'pre_campaign' ? (preAssignee || null) : null,
      pre_blocked_for_owner: isPreCampaignBlocked,
    };

    totalPct += subtotalPct;
  }

  return {
    bruto,
    liquido,
    tax_rate: TAX_RATE,
    by_category: byCategory,
    total_pct: totalPct,
    total_brl: liquido * totalPct,
    setup_validation: setupValidation,
    auto_setup_validation: autoSetupValidation,  // pra UI ver o que era automático
  };
}
