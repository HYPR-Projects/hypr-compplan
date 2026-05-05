import './Badge.css';

/**
 * Badge — pequeno tag tipo "GRUPO" ou "AGRUPADO" do Report Center.
 */
export function Badge({ children, variant = 'neutral', icon: Icon, className = '' }) {
  return (
    <span className={`badge badge--${variant} ${className}`}>
      {Icon && <Icon size={11} />}
      {children}
    </span>
  );
}

/**
 * Pill — chip grande, tipo "Tap to Map" no checklist do Command.
 * Pode ser interactive (selecionável).
 */
export function Pill({ children, active = false, onClick, disabled, icon: Icon, className = '' }) {
  const interactive = typeof onClick === 'function';
  const Tag = interactive ? 'button' : 'span';
  const cls = [
    'pill',
    active && 'pill--active',
    interactive && 'pill--interactive',
    disabled && 'pill--disabled',
    className,
  ].filter(Boolean).join(' ');

  return (
    <Tag className={cls} onClick={onClick} disabled={disabled}>
      {Icon && <Icon size={12} />}
      {children}
    </Tag>
  );
}

/**
 * StatusDot — círculo colorido (vermelho/amarelo/verde) tipo "14 críticas".
 */
export function StatusDot({ status = 'green', size = 'md', pulse = false }) {
  const cls = [
    'status-dot',
    `status-dot--${status}`,
    `status-dot--${size}`,
    pulse && 'status-dot--pulse',
  ].filter(Boolean).join(' ');
  return <span className={cls} />;
}

/**
 * Tabs — navegação tipo "Por mês | Por cliente | Lista | Top Performers".
 */
export function Tabs({ items = [], value, onChange }) {
  return (
    <div className="tabs">
      {items.map((it) => (
        <button
          key={it.value}
          className={`tabs__item ${value === it.value ? 'tabs__item--active' : ''}`}
          onClick={() => onChange(it.value)}
        >
          {it.icon && <it.icon size={14} />}
          {it.label}
          {it.count != null && (
            <span className="tabs__count mono">{it.count}</span>
          )}
        </button>
      ))}
    </div>
  );
}
