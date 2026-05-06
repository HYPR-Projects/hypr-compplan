import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertCircle, ArrowRight, Sparkles,
} from 'lucide-react';
import AppShell from '../../components/layout/AppShell.jsx';
import { Card, KpiCard } from '../../components/ui/Card.jsx';
import { Badge, StatusDot } from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import { auth, endpoints } from '../../lib/api.js';
import { fmt, currentQuarter } from '../../lib/format.js';
import './Dashboard.css';

export default function CsDashboard() {
  const navigate = useNavigate();
  const user = auth.getUser();
  const quarter = currentQuarter();
  const [summary, setSummary] = useState(null);
  const [campaigns, setCampaigns] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      endpoints.meQuarter(quarter).catch(() => null),
      endpoints.meCampaigns(quarter).catch(() => ({ campaigns: [] })),
    ]).then(([s, c]) => {
      if (cancelled) return;
      // meQuarter retorna { summary, campaigns } — pegamos só summary
      setSummary(s?.summary || null);
      // meCampaigns retorna { campaigns: [...] }
      setCampaigns(Array.isArray(c) ? c : (c.campaigns || c.items || []));
      setLoading(false);
    }).catch(e => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, [quarter]);

  if (error) {
    return (
      <AppShell>
        <Card>
          <h2 className="page-title">Erro ao carregar dashboard</h2>
          <p className="card__subtitle">{error}</p>
        </Card>
      </AppShell>
    );
  }

  if (loading) {
    return (
      <AppShell>
        <header className="page-header">
          <h1 className="page-title">Carregando…</h1>
        </header>
      </AppShell>
    );
  }

  const totalPending = campaigns.reduce((s, c) => s + (c.has_pending_evidences || 0), 0);
  const grossBrl = Number(summary?.bonus_gross_brl) || 0;
  const netBrl = Number(summary?.bonus_net_brl) || 0;
  const deduction = Number(summary?.salary_deduction_brl) || 0;
  const status = summary?.status || 'draft';

  return (
    <AppShell pendingEvidences={totalPending}>
      <header className="page-header">
        <div className="fade-up">
          <h1 className="page-title">Olá, {(user?.name || 'CS').split(' ')[0]}</h1>
          <div className="page-subtitle">
            <span className="page-subtitle__highlight">{quarter}</span>
            <span className="page-subtitle__sep">·</span>
            <span>{campaigns.length} campanhas</span>
            {totalPending > 0 && (
              <>
                <span className="page-subtitle__sep">·</span>
                <span>{totalPending} evidências pendentes</span>
              </>
            )}
            <span className="page-subtitle__sep">·</span>
            <Badge variant={
              status === 'paid' ? 'green'
              : status === 'approved' ? 'cyan'
              : status === 'pending_approval' ? 'yellow'
              : 'neutral'
            }>
              {status === 'draft' ? 'Em andamento'
                : status === 'pending_approval' ? 'Aguardando aprovação'
                : status === 'approved' ? 'Aprovado'
                : status === 'paid' ? 'Pago' : status}
            </Badge>
          </div>
        </div>

        {totalPending > 0 && (
          <Button
            variant="primary"
            icon={Sparkles}
            onClick={() => navigate('/campanhas')}
          >
            Revisar {totalPending} evidência{totalPending > 1 ? 's' : ''}
          </Button>
        )}
      </header>

      <section className="kpi-row">
        <Card className="kpi kpi--hero stagger" style={{ '--i': 0 }}>
          <div className="kpi__label label">Bônus líquido — {quarter}</div>
          <div className="kpi__value mono kpi__value--cyan">
            {fmt.brl(netBrl)}
          </div>
          <div className="kpi__hero-breakdown">
            <span>{fmt.brl(grossBrl)} bruto</span>
            <span className="page-subtitle__sep">−</span>
            <span>{fmt.brl(deduction)} desconto</span>
          </div>
        </Card>

        <KpiCard label="Bruto" value={fmt.brl(grossBrl)} />
        <KpiCard label="Campanhas" value={campaigns.length} />
        <KpiCard label="Pendentes" value={totalPending} status={totalPending > 0 ? 'yellow' : 'green'} />
      </section>

      <section className="fade-up" style={{ '--i': 6 }}>
        <header className="section-header">
          <h2 className="section-title">Suas campanhas no quarter</h2>
          <button className="section-action" onClick={() => navigate('/campanhas')}>
            Ver todas <ArrowRight size={14} />
          </button>
        </header>

        {campaigns.length === 0 ? (
          <Card>
            <p className="card__subtitle">
              Nenhuma campanha no {quarter} ainda. Quando uma campanha for atribuída a você no Command, ela vai aparecer aqui.
            </p>
          </Card>
        ) : (
          <div className="campaign-list">
            {campaigns.map((c, i) => (
              <CampaignRow
                key={c.short_token}
                campaign={c}
                onClick={() => navigate(`/campanhas/${c.short_token}`)}
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
  const pending = campaign.has_pending_evidences || 0;
  const investBrl = Number(campaign.total_value || campaign.revenue_gross) || 0;

  return (
    <div className="campaign-row stagger" style={{ '--i': i }} onClick={onClick}>
      <div className="campaign-row__indicator">
        <StatusDot
          status={pending > 0 ? 'yellow' : 'green'}
          size="md"
          pulse={pending > 0}
        />
      </div>

      <div className="campaign-row__main">
        <div className="campaign-row__title-row">
          <span className="campaign-row__client">{campaign.client_name}</span>
          <Badge variant="neutral">{campaign.short_token}</Badge>
          {campaign.is_abs && <Badge variant="cyan">ABS</Badge>}
          {campaign.is_legacy && <Badge variant="neutral">Legacy</Badge>}
        </div>
        <div className="campaign-row__name">{campaign.campaign_name}</div>
        <div className="campaign-row__meta">
          {fmt.dateRange(campaign.start_date || campaign.campaign_start_date, campaign.end_date || campaign.campaign_end_date)}
          <span className="page-subtitle__sep">·</span>
          {fmt.brl(investBrl)} investimento
        </div>
      </div>

      <div className="campaign-row__bonus">
        <span className="label">Bônus</span>
        <span className="campaign-row__bonus-value mono">
          {fmt.brl(Number(campaign.cs_bonus_amount) || 0)}
        </span>
      </div>

      <div className="campaign-row__cta">
        {pending > 0 && (
          <Badge variant="yellow">
            <AlertCircle size={11} />
            {pending} pendente{pending > 1 ? 's' : ''}
          </Badge>
        )}
        <ArrowRight size={16} className="campaign-row__arrow" />
      </div>
    </div>
  );
}
