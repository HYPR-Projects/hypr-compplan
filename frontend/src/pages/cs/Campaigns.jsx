import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, ArrowRight, Search } from 'lucide-react';
import AppShell from '../../components/layout/AppShell.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Badge, StatusDot } from '../../components/ui/Badge.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { endpoints } from '../../lib/api.js';
import { fmt, currentQuarter } from '../../lib/format.js';

export default function CsCampaigns() {
  const navigate = useNavigate();
  const quarter = currentQuarter();
  const [campaigns, setCampaigns] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    endpoints.meCampaigns(quarter)
      .then(d => setCampaigns(Array.isArray(d) ? d : (d.items || [])))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
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

  const filtered = search.trim()
    ? campaigns.filter(c =>
        (c.client_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.campaign_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (c.short_token || '').toLowerCase().includes(search.toLowerCase())
      )
    : campaigns;

  return (
    <AppShell>
      <header className="page-header fade-up">
        <div>
          <h1 className="page-title">Suas campanhas</h1>
          <div className="page-subtitle">
            <span className="page-subtitle__highlight">{quarter}</span>
            <span className="page-subtitle__sep">·</span>
            <span>{campaigns.length} campanhas</span>
          </div>
        </div>
      </header>

      <section style={{ marginBottom: 'var(--space-4)' }}>
        <Input
          icon={Search}
          placeholder="Buscar por cliente, campanha ou token..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </section>

      {loading && <div className="empty-state">Carregando…</div>}

      {!loading && filtered.length === 0 && (
        <Card>
          <p className="card__subtitle">
            {campaigns.length === 0
              ? `Nenhuma campanha atribuída a você no ${quarter}.`
              : 'Nenhuma campanha encontrada com essa busca.'}
          </p>
        </Card>
      )}

      <div className="campaign-list">
        {filtered.map((c, i) => {
          const pending = c.has_pending_evidences || 0;
          const investBrl = Number(c.total_value || c.revenue_gross) || 0;
          return (
            <div
              key={c.short_token}
              className="campaign-row stagger"
              style={{ '--i': i }}
              onClick={() => navigate(`/campanhas/${c.short_token}`)}
            >
              <div className="campaign-row__indicator">
                <StatusDot
                  status={pending > 0 ? 'yellow' : 'green'}
                  size="md"
                  pulse={pending > 0}
                />
              </div>

              <div className="campaign-row__main">
                <div className="campaign-row__title-row">
                  <span className="campaign-row__client">{c.client_name}</span>
                  <Badge variant="neutral">{c.short_token}</Badge>
                  {c.is_legacy && <Badge variant="neutral">Legacy</Badge>}
                </div>
                <div className="campaign-row__name">{c.campaign_name}</div>
                <div className="campaign-row__meta">
                  {fmt.dateRange(c.start_date, c.end_date)}
                  <span className="page-subtitle__sep">·</span>
                  {fmt.brl(investBrl)} investimento
                </div>
              </div>

              <div className="campaign-row__bonus">
                <span className="label">Bônus</span>
                <span className="campaign-row__bonus-value mono">
                  {fmt.brl(Number(c.cs_bonus_amount) || 0)}
                </span>
              </div>

              <div className="campaign-row__cta">
                {pending > 0 && (
                  <Badge variant="yellow">
                    <AlertCircle size={11} />
                    {pending}
                  </Badge>
                )}
                <ArrowRight size={16} className="campaign-row__arrow" />
              </div>
            </div>
          );
        })}
      </div>
    </AppShell>
  );
}
