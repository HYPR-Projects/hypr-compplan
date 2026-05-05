import './Logo.css';

/**
 * Logo HYPR° — replica o estilo "HYPR Report Center" das screenshots.
 * O degree symbol "°" é parte da identidade visual.
 */
export default function Logo({ subtitle = 'Commplan', size = 'md' }) {
  const cls = `hypr-logo hypr-logo--${size}`;
  return (
    <div className={cls}>
      <span className="hypr-logo__main">
        <span className="hypr-logo__h">H</span>
        <span className="hypr-logo__y">Y</span>
        <span className="hypr-logo__p">P</span>
        <span className="hypr-logo__r">R</span>
        <span className="hypr-logo__deg">°</span>
      </span>
      {subtitle && (
        <span className="hypr-logo__sub">{subtitle}</span>
      )}
    </div>
  );
}
