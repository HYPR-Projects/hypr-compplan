/**
 * engine/evaluators/bool-field-true.js — checa se um campo BOOL é true.
 *
 * Payload: { field: 'had_cs_meeting' }
 */

export function evaluate({ rule, checklist }) {
  const payload = typeof rule.condition_payload === 'string'
    ? JSON.parse(rule.condition_payload)
    : rule.condition_payload || {};

  const value = checklist[payload.field];
  const earned = value === true || value === 'true' || value === 'Sim';

  return {
    rule_id: rule.id,
    raw_pct: earned ? rule.bonus_pct : 0,
    effective_pct: earned ? rule.bonus_pct : 0,
    earned,
    breakdown: { field: payload.field, actual: value },
  };
}

export const condition_kind = 'bool_field_true';
