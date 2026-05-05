/**
 * engine/caps-and-exclusions.js — pós-processamento dos resultados.
 *
 * Aplica, em ordem:
 *   1. setup_invalidators: zera todas as regras de category='setup' se algum disparou
 *   2. exclusion_groups: regras do mesmo group competem; vence o cluster com maior soma
 *   3. cap_groups: limita a soma das regras de um group ao cap_max_pct
 *
 * Mutação: altera `result.effective_pct` em cada item, preservando `raw_pct`
 * pra debug/auditoria. Adiciona `result.applied_modifiers` listando o que rolou.
 */

/** Step 1: zera Setup se algum invalidador disparou. */
export function applySetupInvalidators(items) {
  const triggered = items.find(it => it.result.voids_setup === true);
  if (!triggered) return;

  for (const item of items) {
    if (item.rule.category !== 'setup') continue;
    if (item.rule.subcategory === '_invalidators') continue; // o próprio invalidator
    if (item.result.effective_pct === 0) continue;

    item.result.applied_modifiers = item.result.applied_modifiers || [];
    item.result.applied_modifiers.push({
      kind: 'setup_invalidated',
      by_rule: triggered.rule.id,
      previous_pct: item.result.effective_pct,
    });
    item.result.effective_pct = 0;
  }
}

/**
 * Step 2: exclusion_groups.
 *
 * Estratégia: pra cada group, agrupamos as regras pelo CLUSTER. Cluster aqui
 * quer dizer "regras que naturalmente somam juntas". Com um único exclusion_group,
 * cada regra é seu próprio cluster e escolhemos a de maior raw_pct.
 *
 * No nosso modelo atual:
 *   - 'setup_o2o_ooh' (O2O xor OOH): 2 regras, mesma %, escolhe qualquer uma (a primeira earned)
 *   - 'renewal_choice' (renovação com/sem VP): escolhe a de maior pct
 *   - 'enrich_map_intel' (enriquecimento bench vs feature): caso especial, fica no claim
 *
 * A decisão é simples: dentro do exclusion_group, mantém apenas o item de
 * maior `raw_pct` que foi `earned`. Demais zeram.
 */
export function applyExclusionGroups(items) {
  const groups = {};
  for (const item of items) {
    const g = item.rule.exclusion_group;
    if (!g) continue;
    (groups[g] = groups[g] || []).push(item);
  }

  for (const [g, list] of Object.entries(groups)) {
    const earned = list.filter(it => it.result.earned);
    if (earned.length <= 1) continue; // 0 ou 1 earned → nada a fazer

    // Escolhe o de maior raw_pct
    earned.sort((a, b) => (b.result.raw_pct || 0) - (a.result.raw_pct || 0));
    const winner = earned[0];

    for (const it of earned) {
      if (it === winner) continue;
      it.result.applied_modifiers = it.result.applied_modifiers || [];
      it.result.applied_modifiers.push({
        kind: 'excluded_by_group',
        group: g,
        winner_rule: winner.rule.id,
        previous_pct: it.result.effective_pct,
      });
      it.result.effective_pct = 0;
    }
  }
}

/**
 * Step 3: cap_groups.
 *
 * Pra cada group, soma effective_pct dos earned. Se a soma > cap_max_pct,
 * reduz proporcionalmente cada item até bater o cap.
 *
 * Critério da redução: ordem de display_order ascendente — itens "mais
 * cedo" no grupo recebem o pct integral; os últimos absorvem o corte.
 * Isso garante determinismo.
 */
export function applyCapGroups(items) {
  const groups = {};
  for (const item of items) {
    const g = item.rule.cap_group;
    if (!g) continue;
    (groups[g] = groups[g] || []).push(item);
  }

  for (const [g, list] of Object.entries(groups)) {
    const cap = list[0].rule.cap_max_pct;
    if (!cap) continue;

    const earnedItems = list.filter(it => it.result.effective_pct > 0);
    let sum = earnedItems.reduce((s, it) => s + it.result.effective_pct, 0);
    if (sum <= cap) continue; // dentro do cap, nada a fazer

    // Ordena por display_order ascendente — primeiros levam pct integral
    earnedItems.sort((a, b) => (a.rule.display_order || 0) - (b.rule.display_order || 0));

    let remaining = cap;
    for (const it of earnedItems) {
      const original = it.result.effective_pct;
      const allowed = Math.min(original, remaining);
      if (allowed < original) {
        it.result.applied_modifiers = it.result.applied_modifiers || [];
        it.result.applied_modifiers.push({
          kind: 'capped',
          group: g,
          cap,
          previous_pct: original,
        });
        it.result.effective_pct = allowed;
      }
      remaining = Math.max(0, remaining - allowed);
    }
  }
}

/** Aplica todos os pós-processadores em ordem. Mutação in-place. */
export function applyAllModifiers(items) {
  applySetupInvalidators(items);
  applyExclusionGroups(items);
  applyCapGroups(items);
}
