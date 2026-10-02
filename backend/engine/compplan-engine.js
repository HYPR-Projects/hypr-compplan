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

import {
  getFeatureTier, getCatalog, getFeatureTiers, resolveCatalogVersion,
  VERSION_2026_Q4, classifyFeatures2026Q4, proveMaxAttention,
} from './compplan-catalog.js';

const TAX_RATE = 0.1653;
const NET_FACTOR = 1 - TAX_RATE;

/**
 * Etapas que podem ser atribuídas a um CS diferente do dono da campanha
 * (ex.: João é dono, mas quem fez o Setup foi a Mariana).
 *
 * Armazenamento:
 *   - pre_campaign → coluna pre_campaign_assignee_email (fluxo antigo, mantido)
 *   - demais       → admin_overrides.__stage_assignees[<etapa>] = { email, by, at }
 */
export const ASSIGNABLE_STAGES = ['pre_campaign', 'setup', 'optimization', 'account_mgmt', 'extras', 'onboarding'];

// Items que NÃO seguem a atribuição da etapa (têm regra própria de destino).
// ex_estudos vai sempre pro AUTOR do estudo.
export const STAGE_EXEMPT_ITEMS = new Set(['ex_estudos']);

/**
 * Resolve o mapa { etapa → email } de responsáveis por etapa da campanha.
 * Etapas sem responsável não aparecem no mapa (= contam pro dono).
 */
export function resolveStageAssignees(adminOverrides = {}, preAssignee = null) {
  const map = {};
  const raw = (adminOverrides && adminOverrides.__stage_assignees) || {};
  for (const stage of ASSIGNABLE_STAGES) {
    const entry = raw[stage];
    const email = typeof entry === 'string' ? entry : entry?.email;
    if (email) map[stage] = String(email).toLowerCase();
  }
  if (preAssignee) map.pre_campaign = String(preAssignee).toLowerCase();
  return map;
}

/**
 * Soma o que um CS ganha numa etapa atribuída a ele (breakdown calculado com
 * csOwner = esse CS). Ignora items isentos (ex_estudos).
 */
export function stageSubtotal(breakdown, stage) {
  const cat = breakdown?.by_category?.[stage];
  if (!cat) return { pct: 0, brl: 0 };
  const items = cat.items.filter(i => i.earned && !STAGE_EXEMPT_ITEMS.has(i.id));
  return {
    pct: items.reduce((s, i) => s + i.pct, 0),
    brl: items.reduce((s, i) => s + i.value_brl, 0),
  };
}

/**
 * Infere quais items AUTOMÁTICOS e SEMI_AUTO estão atingidos baseado no checklist.
 * Retorna Set de ids inferidos.
 */
function inferAutoItems(campaign, opts = {}) {
  const earned = new Set();
  const features = Array.isArray(campaign.features) ? campaign.features : [];
  const products = Array.isArray(campaign.products) ? campaign.products : [];
  const formats = Array.isArray(campaign.formats) ? campaign.formats : [];
  const { studiesInfo = [], version = null, maLinks = null } = opts;
  const isQ4 = version === VERSION_2026_Q4;

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

  // Setup — RMN Físico (2026) / GroundFlow (2026-Q4) — mesmo item, semi_auto
  if (isQ4) {
    const hasGroundflow = products.some(p => /ground\s*flow/i.test(p))
                       || formats.some(f => /ground\s*flow/i.test(f));
    if (hasGroundflow) earned.add('setup_rmn_fisico');
  } else {
    const hasRmnFis = products.some(p => /rmn\s*f[ií]sico|rmnf/i.test(p))
                   || formats.some(f => /rmn\s*f[ií]sico|rmnf/i.test(f))
                   || (campaign.pracas_type && /f[ií]sico/i.test(campaign.pracas_type));
    if (hasRmnFis) earned.add('setup_rmn_fisico');
  }

  // Setup — tiers de features (semi_auto)
  // Coleta features por tier pra UI mostrar quais foram detectadas
  const featuresByTier = { tier1: [], tier2: [], tier3: [], unknown: [] };
  let maxAttention = null;
  if (isQ4) {
    // 2026-Q4: grafias normalizadas (P-DOOH = PDOOH) e "Tap to X" vira Max
    // Attention — cada formato com peça vinculada no Report Hub conta 1 no Tier 1.
    const cls = classifyFeatures2026Q4(features);
    maxAttention = proveMaxAttention(cls.max_attention, maLinks);
    const provenMa = maxAttention.filter(m => m.proven).map(m => `Max Attention — ${m.name}`);
    featuresByTier.tier1.push(...provenMa, ...cls.tier1);
    featuresByTier.tier2.push(...cls.tier2);
    featuresByTier.tier3.push(...cls.tier3);
    featuresByTier.unknown.push(...cls.unknown);
    featuresByTier.excluded = cls.excluded;
  } else {
    for (const f of features) {
      const tier = getFeatureTier(f);
      if (tier === 'tier1') featuresByTier.tier1.push(f);
      else if (tier === 'tier2') featuresByTier.tier2.push(f);
      else if (tier === 'tier3') featuresByTier.tier3.push(f);
      else if (f) featuresByTier.unknown.push(f);
    }
  }
  const nT1 = featuresByTier.tier1.length;
  const nT2 = featuresByTier.tier2.length;
  const nT3 = featuresByTier.tier3.length;
  if (nT1 >= 1) earned.add('setup_tier1_1');
  if (nT1 >= 2) earned.add('setup_tier1_2');
  if (nT1 >= 3) earned.add('setup_tier1_3');
  if (nT2 >= 1) earned.add('setup_tier2_1');
  if (nT2 >= 2) earned.add('setup_tier2_2');
  if (nT3 >= 1) earned.add('setup_tier3_1');

  // Anexa pra ser usado lá fora (return value-like)
  earned.__featuresByTier = featuresByTier;
  earned.__maxAttention = maxAttention;

  // Extras — Estudos: marca ex_estudos como earned se há algum estudo:
  //   - vindo do Command (studies_used não vazio), OU
  //   - atribuído manualmente pelo admin via studiesInfo (override).
  // O bônus pro CS dono fica zero quando ele NÃO é o autor — vai pro autor.
  const studies = Array.isArray(campaign.studies_used) ? campaign.studies_used : [];
  if (studies.length > 0 || studiesInfo.length > 0) earned.add('ex_estudos');

  return earned;
}

/**
 * Detecta se uma campanha é EXCLUSIVAMENTE de vídeo (sem display, sem OOH).
 * Usa o campo `formats` da commplan_checklists, que é ARRAY<STRING>.
 *
 * Valores reais no BQ (verificado em prod):
 *   'Display'                → não é só video
 *   'Display,Video'          → não é só video (tem display)
 *   'Video,Display'          → não é só video (tem display)
 *   'Video'                  → É só video ✅
 */
function isVideoOnlyCampaign(campaign) {
  const formats = Array.isArray(campaign.formats) ? campaign.formats : [];
  if (formats.length === 0) return false;
  const hasVideo = formats.some(f => /video/i.test(f));
  const hasDisplay = formats.some(f => /display/i.test(f));
  const hasOoh = formats.some(f => /ooh/i.test(f));
  return hasVideo && !hasDisplay && !hasOoh;
}

/**
 * Items dependentes de métricas (Otimizações).
 *
 * Regras:
 *   - Campanha SÓ Display ou Display+Video → avalia opt_with_abs / opt_without_abs (display)
 *   - Campanha SÓ Video                    → avalia opt_video (Tech Cost / VTR)
 *
 * Tolerância "em andamento": se a campanha ainda está rodando (ou encerrou
 * há menos de 1 dia) E não tem dado de métrica, o item conta como aprovado
 * (mesma lógica do Setup). Evita penalizar campanha que mal começou.
 */
function inferMetricItems(campaign, metrics, manualChecks = {}) {
  const earned = new Set();
  const videoOnly = isVideoOnlyCampaign(campaign);

  if (videoOnly) {
    // ── Campanha SÓ video → avalia Tech Cost + VTR ─────────────────────
    const vtr = Number(metrics?.video_vtr_pct) || 0;
    const techCost = Number(metrics?.video_tech_cost_pct);
    const hasStarts = Number(metrics?.video_starts) > 0;
    const hasCost = Number(metrics?.video_cost) >= 0 && metrics?.video_cost !== null && metrics?.video_cost !== undefined;

    // "Em andamento": sem dado e campanha rodando OU encerrou há < 1 dia.
    // Nesses casos, dá o item por aprovado (não penaliza início de campanha).
    if (!hasStarts || !hasCost) {
      if (isCampaignStillInGracePeriod(campaign)) {
        earned.add('opt_video');
      }
      // se já passou da grace period e ainda não tem dado, NÃO paga.
      return earned;
    }

    if (techCost <= 3 && vtr >= 85) {
      earned.add('opt_video');
    }
    return earned;
  }

  // ── Campanha com display (sozinho ou com video) → avalia display ───
  if (!metrics) return earned;

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
 * Retorna TRUE se a campanha ainda está em "grace period" (rodando ou
 * encerrou há menos de 1 dia). Usado pra tolerar falta de dados em
 * itens de métricas (mesma lógica do Setup pending).
 */
export function isCampaignStillInGracePeriod(campaign) {
  const endRaw = campaign?.end_date;
  const endStr = (endRaw && typeof endRaw === 'object' && 'value' in endRaw) ? endRaw.value : endRaw;
  if (!endStr) return false;
  const endDate = new Date(`${endStr}T23:59:59Z`);
  const now = new Date();
  const ONE_DAY_MS = 24 * 60 * 60 * 1000;
  return (now.getTime() - endDate.getTime() < ONE_DAY_MS);
}

/**
 * Verifica se o setup deve ser zerado.
 * Retorna { invalidated: bool, reason: string|null, pending: bool } baseado nas métricas.
 *
 * Regras:
 *   - Super-over (>50%): anula a QUALQUER momento (mesmo durante a campanha).
 *   - Under (entregou menos que contratado): anula APENAS se já passou >=1 dia
 *     do fim da campanha. Antes disso, a UI mostra "em andamento" (cinza neutro)
 *     e o setup conta como aprovado se as demais condições estiverem OK — porque
 *     entregar menos que contratado é normal em campanhas em curso.
 *
 * @param {object} metrics
 * @param {object} campaign - precisa de campaign.end_date (DATE 'YYYY-MM-DD' ou objeto BQ {value})
 * @returns {{ invalidated: boolean, reason: string|null, pending?: boolean }}
 */
function validateSetup(metrics, campaign = {}) {
  if (!metrics) {
    return { invalidated: false, reason: null };
  }

  const over = Number(metrics.over_percent) || 0;

  // 1. Super-over (>50%) — anula sempre, independente de quando.
  if (over > 50) {
    return {
      invalidated: true,
      reason: `Setup anulado: campanha entregou ${over.toFixed(1)}% de over (limite 50%).`,
    };
  }

  // 2. Under — só anula se já passou >=1 dia do fim da campanha.
  if (over < 0) {
    const endRaw = campaign?.end_date;
    const endStr = (endRaw && typeof endRaw === 'object' && 'value' in endRaw) ? endRaw.value : endRaw;
    const endDate = endStr ? new Date(`${endStr}T23:59:59Z`) : null;
    const now = new Date();

    // Considera "encerrada e madura" se passou pelo menos 1 dia inteiro após o fim.
    // Ex: end_date = 2026-05-31 → só conta como under a partir de 2026-06-02 00:00.
    const ONE_DAY_MS = 24 * 60 * 60 * 1000;
    const isMature = endDate && (now.getTime() - endDate.getTime() >= ONE_DAY_MS);

    if (!isMature) {
      // Campanha ainda em curso (ou recém-encerrada) — ignora o under.
      // Setup conta como aprovado se demais condições estiverem OK.
      return {
        invalidated: false,
        reason: null,
        pending: true,  // sinaliza pra UI mostrar "em andamento" (cinza neutro)
      };
    }

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
 * @param {object} opts - { preAssignee: email|null, csOwner: email, studiesInfo }
 *   csOwner = CS do ponto de vista de quem o bônus é calculado.
 *   Responsáveis por etapa vêm de preAssignee (Pré) + adminOverrides.__stage_assignees.
 *   Se uma etapa tem responsável diferente de csOwner, os items dela aparecem
 *   (e podem ser marcados) mas value_brl=0 — o valor vai pro responsável.
 *   Quando o engine roda PRO responsável, responsável === csOwner → conta normalmente.
 */
export function computeBonus(campaign, manualChecks = {}, metrics = null, adminOverrides = {}, opts = {}) {
  const bruto = Number(campaign.total_value) || 0;
  const liquido = bruto * NET_FACTOR;

  const { preAssignee = null, csOwner = null, studiesInfo = [], maLinks = null } = opts;
  // Versão do Compplan pela data de início da campanha (2026 × 2026-Q4).
  const version = resolveCatalogVersion(campaign.start_date);
  const CATALOG = getCatalog(version);
  const FEATURE_TIERS = getFeatureTiers(version);
  // Uma etapa entra no breakdown do CS APENAS se:
  //   - Não há responsável (sem atribuição → conta pro dono)
  //   - OU o CS olhando É o responsável (mesma pessoa)
  const csOwnerLower = (csOwner || '').toLowerCase();
  const stageAssignees = resolveStageAssignees(adminOverrides, preAssignee);
  const stageGoesToViewer = (stage) => !stageAssignees[stage] || stageAssignees[stage] === csOwnerLower;

  // 1. Items inferidos do checklist (auto + semi_auto)
  const inferred = inferAutoItems(campaign, { studiesInfo, version, maLinks });
  // Captura features por tier (anexado pelo inferAutoItems)
  const featuresByTier = inferred.__featuresByTier || { tier1: [], tier2: [], tier3: [], unknown: [] };

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
  for (const [catKey, cat] of Object.entries(CATALOG)) {
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
  const autoSetupValidation = validateSetup(metrics, campaign);
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

  for (const [catKey, cat] of Object.entries(CATALOG)) {
    const isSetupInvalidated = catKey === 'setup' && setupValidation.invalidated;
    // Etapa atribuída a outro CS: items aparecem mas value_brl=0 pra quem está olhando
    const isStageBlocked = !stageGoesToViewer(catKey);
    const isPreCampaignBlocked = catKey === 'pre_campaign' && isStageBlocked;

    // Filtra items relevantes pra esta campanha. Hoje só Otimizações tem
    // variação por tipo: campanhas só de vídeo veem apenas opt_video;
    // campanhas com display (sozinho ou +video) veem apenas opt_with_abs / opt_without_abs.
    const filteredItems = cat.items.filter(item => {
      if (catKey !== 'optimization') return true;
      const videoOnly = isVideoOnlyCampaign(campaign);
      if (item.id === 'opt_video') return videoOnly;
      // opt_with_abs / opt_without_abs: só pra campanhas com display
      return !videoOnly;
    });

    const items = filteredItems.map(item => {
      const wasEarned = earned.has(item.id);

      const adminOv = adminOverrides[item.id];

      // Prioridade do admin override do item: se o admin forçou explicitamente
      // OK/Não naquele item, isso vence o setup anulado. O force individual é
      // a palavra final sobre SE o item foi conquistado.
      let effectivelyEarned;
      if (adminOv && typeof adminOv.earned === 'boolean') {
        effectivelyEarned = adminOv.earned;
      } else {
        effectivelyEarned = wasEarned && !isSetupInvalidated;
      }

      // Atribuição de etapa decide PRA QUEM vai o item (não se foi conquistado).
      // Aplica mesmo com admin override — senão o item seria pago 2× (dono + responsável).
      const itemStageBlocked = isStageBlocked && !STAGE_EXEMPT_ITEMS.has(item.id);
      const assignedToOther = itemStageBlocked && effectivelyEarned;
      if (itemStageBlocked) effectivelyEarned = false;

      // ex_estudos: bônus vai pro AUTOR. Se o csOwner observador NÃO é o autor de algum
      // estudo da campanha, value_brl pro dono = 0.
      const isStudyItem = item.id === 'ex_estudos';
      let isStudyBlocked2 = false;
      if (isStudyItem && studiesInfo.length > 0) {
        const authors = studiesInfo.map(s => (s.author_email || '').toLowerCase()).filter(Boolean);
        isStudyBlocked2 = !authors.includes(csOwnerLower);
      }
      // Estudo que vai pro autor: mesmo com admin force OK no dono, o bônus é do autor.
      // Só bloqueia o valor se NÃO houver override explícito incluindo pro dono.
      if (isStudyBlocked2 && !(adminOv && adminOv.earned === true)) {
        effectivelyEarned = effectivelyEarned && !isStudyBlocked2;
      }

      // Anexa info de estudos no item ex_estudos pra UI mostrar nome + autor
      const studiesAttachment = (isStudyItem && studiesInfo.length > 0)
        ? studiesInfo
        : null;

      // Setup tier items: anexa as features detectadas dessa campanha
      let detectedFeatures = null;
      if (item.id.startsWith('setup_tier')) {
        const tierKey = item.id.includes('tier1') ? 'tier1'
                      : item.id.includes('tier2') ? 'tier2'
                      : item.id.includes('tier3') ? 'tier3' : null;
        if (tierKey && featuresByTier[tierKey] && featuresByTier[tierKey].length > 0) {
          detectedFeatures = featuresByTier[tierKey];
        }
      }

      // Pre Campanha pre_feat_*: anexa o catálogo completo de features do tier
      // pre_feat_rmnf não tem tier específico (só RMNF, regra à parte)
      // pre_feat_1/2/3 mostram features de TODOS os tiers (CS marca se sugeriu)
      let tierCatalog = null;
      if (item.id === 'pre_feat_1' || item.id === 'pre_feat_2' || item.id === 'pre_feat_3') {
        tierCatalog = {
          tier1: Array.from(FEATURE_TIERS.tier1),
          tier2: Array.from(FEATURE_TIERS.tier2),
          tier3: Array.from(FEATURE_TIERS.tier3),
        };
      }

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
        invalidated: isSetupInvalidated && wasEarned && !(adminOv && adminOv.earned === true),
        pre_assigned_to_other: isPreCampaignBlocked && assignedToOther,
        assigned_to_other: assignedToOther,
        study_goes_to_other: isStudyBlocked2 && wasEarned,
        value_brl: effectivelyEarned ? liquido * item.pct : 0,
        admin_overridden: !!adminOv,
        admin_override: adminOv || null,
        card: item.card || null,
        studies_info: studiesAttachment,
        detected_features: detectedFeatures,
        tier_catalog: tierCatalog,
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
      // Setup em "em andamento": campanha ainda rodando ou recém-encerrada
      // (under tolerado até 1 dia após end_date). UI mostra cinza neutro.
      setup_pending: catKey === 'setup' ? (setupValidation.pending || false) : false,
      pre_assigned_to: catKey === 'pre_campaign' ? (preAssignee || null) : null,
      pre_blocked_for_owner: isPreCampaignBlocked,
      // Responsável pela etapa (null = dono) e se ela está bloqueada pra quem olha
      assignee: stageAssignees[catKey] || null,
      assigned_to_other: isStageBlocked,
    };

    totalPct += subtotalPct;
  }

  return {
    version,
    bruto,
    liquido,
    tax_rate: TAX_RATE,
    by_category: byCategory,
    total_pct: totalPct,
    total_brl: liquido * totalPct,
    setup_validation: setupValidation,
    auto_setup_validation: autoSetupValidation,  // pra UI ver o que era automático
    stage_assignees: stageAssignees,
    // 2026-Q4: formatos Max Attention do checklist e se cada um tem peça no Report Hub
    max_attention: inferred.__maxAttention || null,
    excluded_features: featuresByTier.excluded || [],
  };
}
