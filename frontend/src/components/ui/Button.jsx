import './Button.css';

/**
 * Button — variants: primary (cyan filled), secondary (outline), ghost (texto).
 * Tamanhos: sm | md (default) | lg.
 */
export default function Button({
  variant = 'primary',
  size = 'md',
  icon: Icon,
  iconPosition = 'left',
  loading = false,
  disabled = false,
  children,
  className = '',
  ...rest
}) {
  const cls = [
    'btn',
    `btn--${variant}`,
    `btn--${size}`,
    loading && 'btn--loading',
    className,
  ].filter(Boolean).join(' ');

  return (
    <button className={cls} disabled={disabled || loading} {...rest}>
      {loading && <span className="btn__spinner" />}
      {!loading && Icon && iconPosition === 'left' && <Icon size={size === 'sm' ? 14 : 16} />}
      {children && <span className="btn__label">{children}</span>}
      {!loading && Icon && iconPosition === 'right' && <Icon size={size === 'sm' ? 14 : 16} />}
    </button>
  );
}
