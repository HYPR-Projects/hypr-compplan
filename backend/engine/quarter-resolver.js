/**
 * engine/quarter-resolver.js — utilidades de quarter.
 *
 * Lembrete da regra de pagamento:
 *   Q1 = jan/fev/mar (bônus pago em jan)
 *   Q2 = abr/mai/jun (bônus pago em abr)
 *   Q3 = jul/ago/set (bônus pago em jul)
 *   Q4 = out/nov/dez (bônus pago em out)
 * (Os meses 2 e 3 do quarter pagam só salário fixo, descontados do bônus
 *  do quarter seguinte.)
 *
 * Critério de inclusão: campanha pertence ao quarter onde sua END_DATE cai.
 */

/** Retorna 'Q1-2026' pra uma data. */
export function dateToQuarter(date) {
  const d = typeof date === 'string' ? new Date(date) : date;
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth(); // 0-11
  const q = Math.floor(m / 3) + 1;
  return `Q${q}-${y}`;
}

/** Parse 'Q1-2026' → { quarter: 1, year: 2026, startDate, endDate }. */
export function parseQuarter(qStr) {
  const m = /^Q([1-4])-(\d{4})$/.exec(qStr);
  if (!m) throw new Error(`Quarter inválido: ${qStr}`);
  const quarter = parseInt(m[1]);
  const year = parseInt(m[2]);
  const startMonth = (quarter - 1) * 3; // 0, 3, 6, 9
  const startDate = `${year}-${String(startMonth + 1).padStart(2, '0')}-01`;
  // Último dia do quarter
  const lastMonth = startMonth + 3; // 3, 6, 9, 12
  const lastDate = new Date(Date.UTC(year, lastMonth, 0)).getUTCDate(); // dia 0 do próx mês = último do atual
  const endDate = `${year}-${String(lastMonth).padStart(2, '0')}-${String(lastDate).padStart(2, '0')}`;
  return { quarter, year, startDate, endDate };
}

/** Quarter atual (UTC). */
export function currentQuarter() {
  return dateToQuarter(new Date());
}
