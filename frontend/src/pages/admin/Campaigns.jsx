import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import AppShell from '../../components/layout/AppShell.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Input } from '../../components/ui/Input.jsx';
import Avatar from '../../components/ui/Avatar.jsx';
import QuarterSelect from '../../components/ui/QuarterSelect.jsx';
import { fmt } from '../../lib/format.js';
import { useQuarter } from '../../lib/useQuarter.js';
import { endpoints } from '../../lib/api.js';
import './Campaigns.css';

export default function AdminCampaigns() {
  const { quarter, setQuarter, quarterOptions } = useQuarter();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    endpoints.adminCampaigns(quarter)
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [quarter]);

  if (error) {
    return (
      <AppShell>
        <Card>
          <h2 className="page-title">Erro ao carregar campanhas</h2>
          <p className="card__subtitle">{error}</p>
        </Card>
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell>
        <header className="page-header">
          <h1 className="page-title">Campanhas</h1>
          <div className="page-subtitle">Carregando…</div>
        </header>
      </AppShell>
    );
  }

  const items = data.items || [];
  const term = search.trim().toLowerCase();
  const filtered = term
    ? items.filter(c =>
        (c.client_name || '').toLowerCase().includes(term) ||
        (c.campaign_name || '').toLowerCase().includes(term) ||
        (c.cs_name || '').toLowerCase().includes(term) ||
        (c.cs_email || '').toLowerCase().includes(term) ||
        (c.short_token || '').toLowerCase().includes(term)
      )
    : items;

  const totalBruto = filtered.reduce((s, c) => s + (Number(c.bruto) || 0), 0);
  const totalLiquido = filtered.reduce((s, c) => s + (Number(c.liquido) || 0), 0);

  return (
    <AppShell>
      <header className="page-header fade-up">
        <div>
          <h1 className="page-title">Campanhas</h1>
          <div className="page-subtitle">
            <QuarterSelect value={quarter} options={quarterOptions} onChange={setQuarter} />
            <span className="page-subtitle__sep">·</span>
            <span>{filtered.length} de {items.length}</span>
            <span className="page-subtitle__sep">·</span>
            <span>{fmt.brlCompact(totalBruto)} bruto</span>
            <span className="page-subtitle__sep">·</span>
            <span>{fmt.brlCompact(totalLiquido)} líquido</span>
          </div>
        </div>
      </header>

      <section style={{ marginBottom: 'var(--space-4)' }}>
        <Input
          icon={Search}
          placeholder="Buscar por cliente, campanha, CS ou token..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </section>

      {filtered.length === 0 ? (
        <Card>
          <p className="card__subtitle">
            {items.length === 0
              ? `Nenhuma campanha no ${quarter}.`
              : 'Nenhuma campanha encontrada com essa busca.'}
          </p>
        </Card>
      ) : (
        <div className="campaigns-table">
          <div className="campaigns-table__head">
            <span>Cliente / Campanha</span>
            <span>CS responsável</span>
            <span style={{ textAlign: 'right' }}>Bruto</span>
            <span style={{ textAlign: 'right' }}>Líquido</span>
          </div>

          {filtered.map((c, i) => (
            <CampaignRow key={c.short_token + i} campaign={c} i={i} />
          ))}
        </div>
      )}
    </AppShell>
  );
}

function CampaignRow({ campaign, i }) {
  return (
    <div className="campaigns-table__row stagger" style={{ '--i': Math.min(i, 20) }}>
      <div className="campaigns-table__cell-main">
        <div className="campaigns-table__client">
          <span>{campaign.client_name}</span>
          {campaign.is_legacy && <Badge variant="neutral">Legacy</Badge>}
        </div>
        <div className="campaigns-table__campaign">{campaign.campaign_name}</div>
        <div className="campaigns-table__meta">
          {campaign.short_token}
          {campaign.agency && <> · {campaign.agency}</>}
        </div>
      </div>

      <div className="campaigns-table__cs">
        {campaign.cs_email ? (
          <>
            <Avatar name={campaign.cs_name || campaign.cs_email} size="sm" />
            <span>{campaign.cs_name || campaign.cs_email}</span>
          </>
        ) : (
          <span className="campaigns-table__cs--empty">Sem CS atribuído</span>
        )}
      </div>

      <div className="mono campaigns-table__num">{fmt.brl(campaign.bruto)}</div>
      <div className="mono campaigns-table__num campaigns-table__num--cyan">
        {fmt.brl(campaign.liquido)}
      </div>
    </div>
  );
}
