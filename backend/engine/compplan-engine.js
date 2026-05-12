/**
 * engine/compplan-engine.js — calcula bônus de uma campanha.
 *
 * INPUT:
 *   - campaign:   dados da campanha (do view commplan_checklists)
 *   - manualChecks: { [itemId]: true } — items que o CS marcou manualmente
 *   - metrics:    dados de unified_performance_metrics (opcional)
 *
 * OUTPUT:
 *   {
 *     bruto, liquido, tax_rate,
 *     by_category: {
 *       pre_campaign: { label, items: [...], subtotal_pct, subtotal_brl },
 *       ...
 *     },
 *     total_pct, total_brl,
 *   }
 *
 * Cada item.items[i] contém:
 *   { id, label, pct, source, earned, locked_reason, value_brl, help }
 */

import { COMPPLAN_CATALOG, getFeatureTier } from './compplan-catalog.js';

const TAX_RATE = 0.1653;
const NET_FACTOR = 1 - TAX_RATE;

/**
 * Infere quais items AUTOMÁTICOS estão atingidos baseado no checklist.
 * Não toca em items manuais ou metrics — só os 'auto'.
 */
function inferAutoItems(campaign) {
  const earned = new Set();
  const features = Array.isArray(campaign.features) ? campaign.features : [];
  const products = Array.isArray(campaign.products) ? campaign.products : [];

  // Pré Campanha — audiences
  if (campaign.audiences && String(campaign.audiences).trim().length > 0) {
    earned.add('pre_audiences');
  }

  // Pré Campanha — features (Feature 1/2/3 baseado na CONTAGEM total)
  const totalFeatures = features.length;
  if (totalFeatures >= 1) earned.add('pre_feat_1');
  if (totalFeatures >= 2) earned.add('pre_feat_2');
  if (totalFeatures >= 3) earned.add('pre_feat_3');

  // Pré Campanha — RMN Físico em features (regra especial: precisaria audiência inédita, mas inferimos otimisticamente)
  const hasRmnFisicoFeature = features.some(f => /rmn\s*f[ií]sico|rmnf/i.test(f));
  if (hasRmnFisicoFeature) earned.add('pre_feat_rmnf');

  // Setup — O2O / OOH
  const hasO2O = products.some(p => /o2o|ooh/i.test(p)) || (Array.isArray(campaign.formats) && campaign.formats.some(f => /o2o|ooh/i.test(f)));
  if (hasO2O) earned.add('setup_o2o_ooh');

  // Setup — RMN Digital
  const hasRmnDig = products.some(p => /rmn\s*digital|rmnd/i.test(p));
  if (hasRmnDig) earned.add('setup_rmn_digital');

  // Setup — RMN Físico
  const hasRmnFis = products.some(p => /rmn\s*f[ií]sico|rmnf/i.test(p))
                  || (campaign.pracas_type && /f[ií]sico/i.test(campaign.pracas_type));
  if (hasRmnFis) earned.add('setup_rmn_fisico');

  // Setup — tiers de features (conta cada tier)
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

  // Extras — Estudos (puxa de studies_used)
  const studies = Array.isArray(campaign.studies_used) ? campaign.studies_used : [];
  if (studies.length > 0) earned.add('ex_estudos');

  return earned;
}

/**
 * Resolve items dependentes de métricas (Otimizações).
 * Retorna Set com ids atingidos.
 */
function inferMetricItems(campaign, metrics) {
  const earned = new Set();
  if (!metrics) return earned;

  const isABS = !!campaign.is_abs;
  const over = Number(metrics.over_percent ?? metrics.over) || 0;
  const ecpm = Number(metrics.ecpm) || 0;
  const ctr = Number(metrics.ctr) || 0; // como decimal (0.005 = 0.5%)

  if (isABS) {
    // Com ABS: over≤25, ecpm≤1.50, ctr≥0.5%
    if (over <= 25 && ecpm > 0 && ecpm <= 1.50 && ctr >= 0.005) {
      earned.add('opt_with_abs');
    }
  } else {
    // Sem ABS: over≤25, ecpm≤0.70, ctr≥0.7%
    if (over <= 25 && ecpm > 0 && ecpm <= 0.70 && ctr >= 0.007) {
      earned.add('opt_without_abs');
    }
  }

  return earned;
}

/**
 * Aplica constraints (non_cumulative_group, oneof_group) — escolhe o maior
 * dentre os items marcados do mesmo grupo, descarta os outros.
 *
 * Mutates earnedItems removendo perdedores.
 */
function applyConstraints(earnedItems, allItems) {
  // Agrupa por constraint group
  const groups = {}; // { groupName: [items] }
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

  // Pra cada grupo, mantém só o de maior pct
  for (const items of Object.values(groups)) {
    if (items.length <= 1) continue;
    items.sort((a, b) => b.pct - a.pct);
    // Remove todos exceto o primeiro (maior pct)
    for (let i = 1; i < items.length; i++) {
      earnedItems.delete(items[i].id);
    }
  }
}

/**
 * Calcula o breakdown completo de bônus de uma campanha.
 *
 * @param {Object} campaign       - row da view commplan_checklists
 * @param {Object} manualChecks   - { [itemId]: true } — overrides do CS
 * @param {Object|null} metrics   - row de unified_performance_metrics (opcional)
 * @returns {Object} breakdown
 */
export function computeBonus(campaign, manualChecks = {}, metrics = null) {
  const bruto = Number(campaign.total_value) || 0;
  const liquido = bruto * NET_FACTOR;

  // 1. Auto items (do checklist)
  const earned = inferAutoItems(campaign);

  // 2. Metric items (Otimizações)
  const metricEarned = inferMetricItems(campaign, metrics);
  for (const id of metricEarned) earned.add(id);

  // 3. Manual items (o que o CS marcou)
  for (const [id, val] of Object.entries(manualChecks)) {
    if (val === true || val === 'true') earned.add(id);
  }

  // 4. Flatten lista de items pra aplicar constraints
  const allItems = [];
  for (const [catKey, cat] of Object.entries(COMPPLAN_CATALOG)) {
    for (const item of cat.items) {
      allItems.push({ ...item, category: catKey });
    }
  }

  // 5. Aplica constraints (non_cumulative + oneof)
  applyConstraints(earned, allItems);

  // 6. Monta breakdown por categoria
  const byCategory = {};
  let totalPct = 0;

  for (const [catKey, cat] of Object.entries(COMPPLAN_CATALOG)) {
    const items = cat.items.map(item => {
      const isEarned = earned.has(item.id);
      const valueBrl = isEarned ? liquido * item.pct : 0;
      const itemRet = {
        id: item.id,
        label: item.label,
        pct: item.pct,
        source: item.source,
        constraint: item.constraint || null,
        help: item.help || null,
        earned: isEarned,
        value_brl: valueBrl,
      };
      return itemRet;
    });

    const subtotalPct = items.filter(i => i.earned).reduce((s, i) => s + i.pct, 0);
    const subtotalBrl = items.filter(i => i.earned).reduce((s, i) => s + i.value_brl, 0);

    byCategory[catKey] = {
      label: cat.label,
      notes: cat.notes || null,
      items,
      subtotal_pct: subtotalPct,
      subtotal_brl: subtotalBrl,
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
  };
}
