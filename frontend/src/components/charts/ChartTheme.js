/**
 * Tema unificado dos gráficos. Usa CSS vars resolvidos via getComputedStyle
 * pra reagir ao theme switch automaticamente.
 */

export function chartColors() {
  if (typeof window === 'undefined') {
    return { cyan: '#3397B9', text: '#78909C', grid: 'rgba(252,254,254,0.05)' };
  }
  const styles = getComputedStyle(document.documentElement);
  return {
    // mantenho nome 'cyan' pra compat retroativa nos componentes existentes
    cyan:   styles.getPropertyValue('--brand').trim() || '#3397B9',
    cyanDim: styles.getPropertyValue('--brand-strong').trim() || '#246C84',
    green:  styles.getPropertyValue('--status-green').trim() || '#4CB050',
    yellow: styles.getPropertyValue('--status-yellow').trim() || '#EDD900',
    red:    styles.getPropertyValue('--status-red').trim() || '#F5272B',
    text:   styles.getPropertyValue('--text-tertiary').trim() || '#78909C',
    textPrimary: styles.getPropertyValue('--text-primary').trim() || '#FCFEFE',
    grid:   styles.getPropertyValue('--border-subtle').trim() || 'rgba(252,254,254,0.05)',
    surface: styles.getPropertyValue('--bg-elevated').trim() || '#2A3540',
    border: styles.getPropertyValue('--border').trim() || 'rgba(252,254,254,0.10)',
  };
}

export const chartFontFamily = "'JetBrains Mono', monospace";
export const chartTickStyle = {
  fontSize: 11,
  fontFamily: chartFontFamily,
};
