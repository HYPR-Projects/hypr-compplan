import { useState, useEffect, useCallback, useMemo } from 'react';
import { currentQuarter } from './format.js';

/**
 * Chave única compartilhada por TODAS as páginas e TODOS os usuários.
 * Trocar o quarter em qualquer página reflete nas demais.
 */
const QUARTER_STORAGE_KEY = 'compplan.selectedQuarter';

/** Evento custom pra sincronizar instâncias do hook na mesma aba. */
const QUARTER_EVENT = 'compplan:quarter-changed';

/**
 * Últimos N quarters (do mais recente pro mais antigo), com piso em Q1-2026
 * (início da plataforma). Compartilhado por todas as páginas.
 */
export function buildQuarterOptions(count = 6) {
  const now = new Date();
  const y = now.getFullYear();
  const q = Math.floor(now.getMonth() / 3) + 1;
  const opts = [];
  for (let i = 0; i < count; i++) {
    let qi = q - i;
    let yi = y;
    while (qi <= 0) { qi += 4; yi -= 1; }
    if (yi < 2026) break; // piso Q1-2026
    opts.push(`Q${qi}-${yi}`);
  }
  return opts;
}

/** Lê o quarter salvo, validando contra as opções. Fallback: quarter atual. */
function readStoredQuarter() {
  const current = currentQuarter();
  try {
    const saved = localStorage.getItem(QUARTER_STORAGE_KEY);
    if (saved && buildQuarterOptions().includes(saved)) return saved;
  } catch (_) {}
  return current;
}

/**
 * Hook de quarter selecionado, global e persistente.
 *
 * - Persiste pra TODOS os usuários (admin e CS) em localStorage.
 * - Chave ÚNICA: trocar numa página reflete nas outras.
 * - Sincroniza em tempo real:
 *     • entre abas do navegador (evento nativo 'storage')
 *     • entre componentes da mesma aba (evento custom 'compplan:quarter-changed')
 *
 * Uso:
 *   const { quarter, setQuarter, quarterOptions } = useQuarter();
 */
export function useQuarter() {
  const [quarter, setQuarterState] = useState(() => readStoredQuarter());
  const quarterOptions = useMemo(() => buildQuarterOptions(), []);

  const setQuarter = useCallback((q) => {
    setQuarterState(q);
    try {
      localStorage.setItem(QUARTER_STORAGE_KEY, q);
    } catch (_) {}
    // Notifica outras instâncias do hook na MESMA aba (o evento 'storage'
    // nativo só dispara em OUTRAS abas, não na que fez a escrita).
    try {
      window.dispatchEvent(new CustomEvent(QUARTER_EVENT, { detail: q }));
    } catch (_) {}
  }, []);

  useEffect(() => {
    // Sincroniza quando outra aba muda o quarter (evento nativo).
    const onStorage = (e) => {
      if (e.key === QUARTER_STORAGE_KEY && e.newValue) {
        setQuarterState((prev) => (prev !== e.newValue ? e.newValue : prev));
      }
    };
    // Sincroniza quando outra instância na mesma aba muda (evento custom).
    const onCustom = (e) => {
      const q = e.detail;
      if (q) setQuarterState((prev) => (prev !== q ? q : prev));
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener(QUARTER_EVENT, onCustom);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener(QUARTER_EVENT, onCustom);
    };
  }, []);

  return { quarter, setQuarter, quarterOptions };
}
