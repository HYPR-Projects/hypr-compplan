/**
 * engine/evaluators/field-present.js — checa presença de valor no checklist.
 *
 * Payload:
 *   { field: 'audiences', non_empty: true }
 *   { field: 'products', any_of: ['O2O', 'OOH'] }
 *   { field: 'products', any_of: ['RMN Digital', 'RMNd'] }
 */

function fieldValue(checklist, fieldPath) {
  // Suporta paths simples por enquanto. Aprofunda se aparecer dot-path.
  return checklist[fieldPath];
}

function asArray(v) {
  if (Array.isArray(v)) return v;
  if (v == null || v === '') return [];
  return [v];
}

function ciIncludes(haystackArr, needle) {
  const n = String(needle).toLowerCase().trim();
  return haystackArr.some(x => String(x).toLowerCase().trim() === n);
}

export function evaluate({ rule, checklist }) {
  const payload = typeof rule.condition_payload === 'string'
    ? JSON.parse(rule.condition_payload)
    : rule.condition_payload || {};

  const value = fieldValue(checklist, payload.field);

  // any_of: campo é array (ou stringificado) e contém algum dos valores listados
  if (payload.any_of) {
    const arr = asArray(value);
    const hit = payload.any_of.find(needle => ciIncludes(arr, needle));
    const earned = !!hit;
    return {
      rule_id: rule.id,
      raw_pct: earned ? rule.bonus_pct : 0,
      effective_pct: earned ? rule.bonus_pct : 0,
      earned,
      breakdown: {
        field: payload.field,
        any_of: payload.any_of,
        matched: hit || null,
        actual: arr,
      },
    };
  }

  // non_empty: campo está preenchido (não-null, não vazio)
  if (payload.non_empty) {
    const isEmpty = value == null || value === '' || (Array.isArray(value) && value.length === 0);
    const earned = !isEmpty;
    return {
      rule_id: rule.id,
      raw_pct: earned ? rule.bonus_pct : 0,
      effective_pct: earned ? rule.bonus_pct : 0,
      earned,
      breakdown: {
        field: payload.field,
        non_empty: true,
        actual: value,
      },
    };
  }

  // Default: campo igual a um valor esperado
  if ('equals' in payload) {
    const earned = String(value) === String(payload.equals);
    return {
      rule_id: rule.id,
      raw_pct: earned ? rule.bonus_pct : 0,
      effective_pct: earned ? rule.bonus_pct : 0,
      earned,
      breakdown: { field: payload.field, expected: payload.equals, actual: value },
    };
  }

  // Sem critério reconhecido — não atribui pra evitar bug silencioso
  return {
    rule_id: rule.id,
    raw_pct: 0,
    effective_pct: 0,
    earned: false,
    breakdown: { error: 'condition_payload sem critério reconhecido', payload },
  };
}

export const condition_kind = 'field_present';
