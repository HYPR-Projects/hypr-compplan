import './CampaignIdentity.css';

/**
 * Identidade da campanha — sempre mostra Cliente + Campanha + PI (short_token).
 *
 * Uso consistente em listas, headers e modais. Variantes:
 *   - 'inline'  → tudo numa linha (listas compactas)
 *   - 'stacked' → empilhado (cards e detalhes)
 *   - 'hero'    → grande, pra page headers
 *
 * Sempre mostra os 3 identificadores juntos (regra de UX: "PI é parte do nome
 * da campanha", igual ao Report Center).
 */
export default function CampaignIdentity({
  clientName,
  campaignName,
  shortToken,
  variant = 'inline',
  isLegacy = false,
  isAbs = false,
}) {
  return (
    <div className={`campaign-identity campaign-identity--${variant}`}>
      <div className="campaign-identity__line-1">
        <span className="campaign-identity__client">{clientName}</span>
        {shortToken && (
          <span className="campaign-identity__token" title={`PI: ${shortToken}`}>
            <span className="campaign-identity__token-prefix">PI</span>
            <code>{shortToken}</code>
          </span>
        )}
        {isAbs && (
          <span className="campaign-identity__tag campaign-identity__tag--abs">ABS</span>
        )}
        {isLegacy && (
          <span className="campaign-identity__tag campaign-identity__tag--legacy" title="Campanha pré-Command">
            Legada
          </span>
        )}
      </div>
      <div className="campaign-identity__line-2">{campaignName}</div>
    </div>
  );
}
