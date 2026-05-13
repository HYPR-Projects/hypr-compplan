/**
 * Helpers de formatação. Tudo em pt-BR.
 */

const BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL',
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

const BRL_COMPACT = new Intl.NumberFormat('pt-BR', {
  style: 'currency', currency: 'BRL',
  notation: 'compact', maximumFractionDigits: 1,
});

const NUM = new Intl.NumberFormat('pt-BR');
const NUM_COMPACT = new Intl.NumberFormat('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
const DATE = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
const DATE_SHORT = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit' });

/**
 * Parse de data sem cair na armadilha do timezone.
 * `new Date("2026-05-01")` interpreta como UTC midnight → vira 30/04 21:00 em São Paulo.
 * Aqui forçamos construção como data LOCAL, sem deslocar dia.
 */
function parseDateLocal(d) {
  if (!d) return null;
  if (d instanceof Date) return isNaN(d) ? null : d;
  if (typeof d !== 'string') return null;

  // Caso ISO data pura "YYYY-MM-DD" (com ou sem hora)
  const ymdMatch = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymdMatch) {
    return new Date(Number(ymdMatch[1]), Number(ymdMatch[2]) - 1, Number(ymdMatch[3]));
  }
  // Fallback
  const date = new Date(d);
  return isNaN(date) ? null : date;
}

export const fmt = {
  /** R$ 12.345,67 */
  brl(n) { return BRL.format(Number(n) || 0); },

  /** R$ 12,3k pra valores grandes */
  brlCompact(n) { return BRL_COMPACT.format(Number(n) || 0); },

  /** 12.345 */
  num(n) { return NUM.format(Number(n) || 0); },

  /** 12,3k */
  numCompact(n) { return NUM_COMPACT.format(Number(n) || 0); },

  /** 0.0125 → "1.25%" (1 casa decimal por default) */
  pct(n, decimals = 2) {
    if (n == null) return '—';
    return `${(n * 100).toFixed(decimals)}%`;
  },

  /** 31/12/2026 */
  date(d) {
    const date = parseDateLocal(d);
    if (!date) return '—';
    return DATE.format(date);
  },

  /** 31/12 — pra ranges curtos */
  dateShort(d) {
    const date = parseDateLocal(d);
    if (!date) return '—';
    return DATE_SHORT.format(date);
  },

  /** "01/05 → 31/05" */
  dateRange(start, end) {
    if (!start || !end) return '—';
    return `${this.dateShort(start)} → ${this.dateShort(end)}`;
  },

  /** "Jan 26", "Mai 26" */
  monthShort(d) {
    const date = parseDateLocal(d);
    if (!date) return '—';
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    return `${months[date.getMonth()]} ${String(date.getFullYear()).slice(-2)}`;
  },

  /** Iniciais pro avatar: "João Buzolin" → "JB", "Beatriz Severine" → "BS" */
  initials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  },

  /** Cor estável pra avatar baseada no nome (1-6) */
  avatarColor(name) {
    if (!name) return 1;
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
    return Math.abs(hash) % 6 + 1;
  },
};

/** Quarter atual em formato Q1-2026 */
export function currentQuarter() {
  const d = new Date();
  return `Q${Math.floor(d.getMonth() / 3) + 1}-${d.getFullYear()}`;
}

/** Lista de quarters anteriores (incluindo o atual) */
export function recentQuarters(count = 4) {
  const out = [];
  const d = new Date();
  let year = d.getFullYear();
  let q = Math.floor(d.getMonth() / 3) + 1;
  for (let i = 0; i < count; i++) {
    out.push(`Q${q}-${year}`);
    q--;
    if (q === 0) { q = 4; year--; }
  }
  return out;
}
