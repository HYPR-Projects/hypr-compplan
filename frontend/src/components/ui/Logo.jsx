import './Logo.css';

/**
 * Logo HYPR° — usa a imagem oficial preta (PNG sem fundo).
 *
 * No dark theme, aplicamos CSS filter pra inverter pra branco.
 * No light theme, fica preto natural.
 *
 * Props:
 *   subtitle: texto secundário (default 'Compplan')
 *   size:     sm | md | lg
 */
export default function Logo({ subtitle = 'Compplan', size = 'md' }) {
  const cls = `hypr-logo hypr-logo--${size}`;
  return (
    <div className={cls}>
      <img
        src="/hypr-logo.png"
        alt="HYPR"
        className="hypr-logo__img"
      />
      {subtitle && (
        <span className="hypr-logo__sub">{subtitle}</span>
      )}
    </div>
  );
}
