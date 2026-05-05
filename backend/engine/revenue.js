/**
 * engine/revenue.js — cálculo de receita líquida.
 *
 * Receita base: checklists.investment (preenchido pelo CP no Command).
 * Imposto: 16,53% (fixo, conforme política HYPR).
 *
 * receita_liquida = receita_bruta × (1 - 0,1653)
 *                = receita_bruta × 0,8347
 */

export const TAX_RATE = 0.1653;
export const NET_FACTOR = 1 - TAX_RATE; // 0.8347

export function netRevenue(grossRevenue) {
  if (grossRevenue == null || isNaN(grossRevenue)) return 0;
  return Number(grossRevenue) * NET_FACTOR;
}
