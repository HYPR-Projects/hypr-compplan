import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, Clock, AlertCircle, Search, ArrowRight } from 'lucide-react';
import AppShell from '../../components/layout/AppShell.jsx';
import { Card, KpiCard } from '../../components/ui/Card.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { fmt, currentQuarter } from '../../lib/format.js';
import { auth, endpoints } from '../../lib/api.js';
import './CSDashboard.css';

export default function CsDashboard() {
  const navigate = useNavigate();
  const user = auth.getUser();
  const quarter = currentQuarter();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    endpoints.meDashboard(quarter)
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [quarter]);

  const items = data?.items || [];
  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return items;
    return items.filter(c =>
      (c.client_name || '').toLowerCase().includes(t) ||
      (c.campaign_name || '').toLowerCase().includes(t) ||
      (c.short_token || '').toLowerCase().includes(t)
    );
  }, [items, search]);

  if (error) {
    return (
      <AppShell pendingCount={data?.kpis?.n_pending || 0}>
        <Card>
          <h2 className="page-title">Erro ao carregar painel</h2>
          <p className="card__subtitle">{error}</p>
        </Card>
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell>
        <header className="page-header">
          <h1 className="page-title">Meu painel</h1>
          <div className="page-subtitle">Carregando…</div>
        </header>
      </AppShell>
    );
  }

  const { kpis } = data;
  const firstName = (user?.name || user?.email || 'CS').split(' ')[0].split('.')[0];

  return (
    <AppShell pendingCount={kpis.n_pending}>
      <header className="page-header fade-up">
        <div>
          <h1 className="page-title">Olá, {firstName}!</h1>
          <div className="page-subtitle">
            <span className="page-subtitle__highlight">{quarter}</span>
            <span className="page-subtitle__sep">·</span>
            <span>{kpis.n_camp} campanhas</span>
            {kpis.n_pending > 0 && (
              <>
                <span className="page-subtitle__sep">·</span>
                <span style={{ color: 'var(--accent-yellow, #f5a524)' }}>
                  {kpis.n_pending} aguardando revisão
                </span>
              </>
            )}
          </div>
        </div>
      </header>

      <section className="kpi-row">
        <Card className="kpi kpi--hero stagger" style={{ '--i': 0 }}>
          <div className="kpi__label label">Investimento bruto — {quarter}</div>
          <div className="kpi__value mono kpi__value--cyan">
            {fmt.brlCompact(kpis.bruto_total)}
          </div>
          <div className="kpi__hero-breakdown">
            <span className="mono">{fmt.brlCompact(kpis.liquido_total)} líquido</span>
            <span className="page-subtitle__sep">·</span>
            <span>imposto {(kpis.tax_rate * 100).toFixed(2)}%</span>
          </div>
        </Card>

        <KpiCard label="Total campanhas" value={kpis.n_camp} />
        <KpiCard
          label="Revisadas"
          value={kpis.n_reviewed}
          status="green"
        />
        <KpiCard
          label="Pendentes"
          value={kpis.n_pending}
          status={kpis.n_pending > 0 ? 'yellow' : 'green'}
        />
      </section>

      <section className="fade-up" style={{ '--i': 3 }}>
        <header className="section-header">
          <h2 className="section-title">Minhas campanhas</h2>
        </header>

        <div style={{ marginBottom: 'var(--space-3)' }}>
          <Input
            icon={Search}
            placeholder="Buscar por cliente, campanha ou token..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {filtered.length === 0 ? (
          <Card>
            <p className="card__subtitle">
              {items.length === 0
                ? `Você ainda não tem campanhas atribuídas no ${quarter}.`
                : 'Nenhuma campanha encontrada com essa busca.'}
            </p>
          </Card>
        ) : (
          <div className="cs-campaign-list">
            {filtered.map((c, i) => (
              <CampaignRow
                key={c.short_token}
                campaign={c}
                onClick={() => navigate(`/cs/campanha/${c.short_token}`)}
                i={i}
              />
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}

function CampaignRow({ campaign, onClick, i }) {
  const reviewed = campaign.reviewed;

  return (
    <div
      className="cs-campaign-row stagger"
      style={{ '--i': Math.min(i, 20) }}
      onClick={onClick}
    >
      <div className="cs-campaign-row__indicator">
        {reviewed ? (
          <CheckCircle2 size={20} className="status-icon--green" />
        ) : (
          <Clock size={20} className="status-icon--yellow" />
        )}
      </div>

      <div className="cs-campaign-row__main">
        <div className="cs-campaign-row__title">
          <span className="cs-campaign-row__client">{campaign.client_name}</span>
          <Badge variant="neutral">{campaign.short_token}</Badge>
          {campaign.is_legacy && <Badge variant="neutral">Legacy</Badge>}
        </div>
        <div className="cs-campaign-row__campaign">{campaign.campaign_name}</div>
        <div className="cs-campaign-row__meta">
          {fmt.dateRange(campaign.start_date, campaign.end_date)}
          {campaign.agency && <> · {campaign.agency}</>}
        </div>
      </div>

      <div className="cs-campaign-row__num">
        <span className="label">Bruto</span>
        <span className="mono">{fmt.brl(campaign.bruto)}</span>
      </div>

      <div className="cs-campaign-row__num">
        <span className="label">Líquido</span>
        <span className="mono cs-campaign-row__num--cyan">{fmt.brl(campaign.liquido)}</span>
      </div>

      <div className="cs-campaign-row__cta">
        <Badge variant={reviewed ? 'green' : 'yellow'}>
          {reviewed ? 'Revisada' : 'Revisar'}
        </Badge>
        <ArrowRight size={16} className="cs-campaign-row__arrow" />
      </div>
    </div>
  );
}
