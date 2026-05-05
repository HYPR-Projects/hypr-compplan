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
    if (!d) return '—';
    const date = typeof d === 'string' ? new Date(d) : d;
    if (isNaN(date)) return '—';
    return DATE.format(date);
  },

  /** 31/12 — pra ranges curtos */
  dateShort(d) {
    if (!d) return '—';
    const date = typeof d === 'string' ? new Date(d) : d;
    if (isNaN(date)) return '—';
    return DATE_SHORT.format(date);
  },

  /** "01/05 → 31/05" */
  dateRange(start, end) {
    if (!start || !end) return '—';
    return `${this.dateShort(start)} → ${this.dateShort(end)}`;
  },

  /** "Jan 26", "Mai 26" */
  monthShort(d) {
    if (!d) return '—';
    const date = typeof d === 'string' ? new Date(d) : d;
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
