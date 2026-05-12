import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { CheckCircle2, Clock, Search, ArrowRight, ArrowLeft, Eye } from 'lucide-react';
import AppShell from '../../components/layout/AppShell.jsx';
import { Card, KpiCard } from '../../components/ui/Card.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { fmt, currentQuarter } from '../../lib/format.js';
import { auth, endpoints } from '../../lib/api.js';
import './CSDashboard.css';

export default function CsDashboard() {
  const navigate = useNavigate();
  const params = useParams();
  const user = auth.getUser();
  const quarter = currentQuarter();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  // Se a URL é /admin/cs/:csEmail, admin está impersonando
  const impersonateEmail = params.csEmail || null;
  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    let cancelled = false;
    const opts = impersonateEmail ? { as: impersonateEmail } : {};
    endpoints.meDashboard(quarter, opts)
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [quarter, impersonateEmail]);

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
        {impersonateEmail && <ImpersonationBanner emailOrName={impersonateEmail} onBack={() => navigate('/admin')} />}
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
        {impersonateEmail && <ImpersonationBanner emailOrName={impersonateEmail} onBack={() => navigate('/admin')} />}
        <header className="page-header">
          <h1 className="page-title">Meu painel</h1>
          <div className="page-subtitle">Carregando…</div>
        </header>
      </AppShell>
    );
  }

  const { kpis } = data;
  const displayName = impersonateEmail
    ? (data.cs_name || data.cs_email || impersonateEmail)
    : (user?.name || user?.email || 'CS');
  const firstName = displayName.split(' ')[0].split('.')[0];

  function getCampaignUrl(token) {
    return impersonateEmail
      ? `/admin/cs/${encodeURIComponent(impersonateEmail)}/campanha/${token}`
      : `/cs/campanha/${token}`;
  }

  return (
    <AppShell pendingCount={kpis.n_pending}>
      {data.impersonating && (
        <ImpersonationBanner
          emailOrName={data.cs_name || data.cs_email}
          onBack={() => navigate('/admin')}
        />
      )}

      <header className="page-header fade-up">
        <div>
          <h1 className="page-title">
            {impersonateEmail ? `Painel de ${firstName}` : `Olá, ${firstName}!`}
          </h1>
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
          <div className="kpi__label label">
            {kpis.hit_floor
              ? `Bônus a receber — ${quarter}`
              : `Salário fixo — ${quarter} (piso ainda não atingido)`}
          </div>
          <div className="kpi__value mono kpi__value--cyan">
            {fmt.brl(kpis.hit_floor ? kpis.bonus_liquido : (kpis.monthly_salary || 0) * 3)}
          </div>
          {kpis.hit_floor ? (
            <div className="kpi__hero-breakdown">
              <span>{fmt.brl(kpis.bonus_mensal)}/mês de bônus</span>
              {kpis.monthly_salary > 0 && (
                <>
                  <span className="page-subtitle__sep">·</span>
                  <span>+ {fmt.brl(kpis.monthly_salary)}/mês fixo</span>
                </>
              )}
            </div>
          ) : (
            <div className="kpi__hero-breakdown">
              <span>Faltam {fmt.brl((kpis.floor_quarter || 0) - (kpis.bonus_total || 0))} pra atingir piso</span>
            </div>
          )}
        </Card>

        <KpiCard
          label="Bônus acumulado (bruto)"
          value={fmt.brl(kpis.bonus_total || 0)}
        />
        <KpiCard
          label="Piso a abater (2× fixo)"
          value={fmt.brl(kpis.floor_quarter || 0)}
        />
        <KpiCard
          label="Campanhas"
          value={kpis.n_camp}
          status={kpis.n_pending > 0 ? 'yellow' : 'green'}
        />
      </section>

      <section className="fade-up" style={{ '--i': 3 }}>
        <header className="section-header">
          <h2 className="section-title">{impersonateEmail ? `Campanhas de ${firstName}` : 'Minhas campanhas'}</h2>
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
                ? `${impersonateEmail ? `${firstName} ainda não tem campanhas` : 'Você ainda não tem campanhas atribuídas'} no ${quarter}.`
                : 'Nenhuma campanha encontrada com essa busca.'}
            </p>
          </Card>
        ) : (
          <div className="cs-campaign-list">
            {filtered.map((c, i) => (
              <CampaignRow
                key={c.short_token}
                campaign={c}
                onClick={() => navigate(getCampaignUrl(c.short_token))}
                i={i}
              />
            ))}
          </div>
        )}
      </section>
    </AppShell>
  );
}

function ImpersonationBanner({ emailOrName, onBack }) {
  return (
    <div className="impersonation-banner">
      <Eye size={16} />
      <span>
        <strong>Visualizando como {emailOrName}.</strong> Edições serão registradas em seu nome.
      </span>
      <button className="impersonation-banner__back" onClick={onBack}>
        <ArrowLeft size={14} /> Voltar pra visão admin
      </button>
    </div>
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
        <span className="label">Bônus</span>
        <span className="mono cs-campaign-row__num--cyan">
          {fmt.brl(campaign.bonus_brl || 0)}
        </span>
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
