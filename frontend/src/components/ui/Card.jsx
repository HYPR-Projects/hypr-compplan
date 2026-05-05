import './Card.css';

export function Card({ children, className = '', interactive = false, accent, ...rest }) {
  const cls = [
    'card',
    interactive && 'card--interactive',
    accent && `card--accent-${accent}`,
    className,
  ].filter(Boolean).join(' ');
  return <div className={cls} {...rest}>{children}</div>;
}

export function CardHeader({ children, className = '' }) {
  return <div className={`card__header ${className}`}>{children}</div>;
}

export function CardTitle({ children, className = '' }) {
  return <h3 className={`card__title ${className}`}>{children}</h3>;
}

export function CardSubtitle({ children, className = '' }) {
  return <p className={`card__subtitle ${className}`}>{children}</p>;
}

export function CardBody({ children, className = '' }) {
  return <div className={`card__body ${className}`}>{children}</div>;
}

export function CardFooter({ children, className = '' }) {
  return <div className={`card__footer ${className}`}>{children}</div>;
}

/**
 * KpiCard — bloco "ATIVAS 39" / "PACING DSP 102%" do Report Center.
 * Mostra label uppercase + valor grande + delta opcional.
 */
export function KpiCard({ label, value, delta, deltaLabel, status, mono = true }) {
  const valueCls = ['kpi__value', mono && 'mono', status && `kpi__value--${status}`].filter(Boolean).join(' ');
  const deltaCls = delta != null
    ? `kpi__delta kpi__delta--${delta >= 0 ? 'up' : 'down'}`
    : '';
  return (
    <div className="card kpi">
      <div className="kpi__label label">{label}</div>
      <div className={valueCls}>{value}</div>
      {delta != null && (
        <div className={deltaCls}>
          <span className="kpi__delta-arrow">{delta >= 0 ? '▲' : '▼'}</span>
          <span className="kpi__delta-num mono">{Math.abs(delta).toFixed(1)}%</span>
          {deltaLabel && <span className="kpi__delta-label">{deltaLabel}</span>}
        </div>
      )}
    </div>
  );
}
