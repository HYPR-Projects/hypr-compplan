import { useNavigate } from 'react-router-dom';
import {
  TrendingUp, AlertCircle, CheckCircle2, ArrowRight,
  Users, FileText, Sparkles, DollarSign,
} from 'lucide-react';
import AppShell from '../../components/layout/AppShell.jsx';
import { Card, KpiCard } from '../../components/ui/Card.jsx';
import { Badge, Pill, StatusDot } from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import AreaChart from '../../components/charts/AreaChart.jsx';
import BarChart from '../../components/charts/BarChart.jsx';
import { auth } from '../../lib/api.js';
import { fmt, currentQuarter } from '../../lib/format.js';
import {
  MOCK_QUARTER_SUMMARY, MOCK_CAMPAIGNS, MOCK_GROWTH_DATA,
  MOCK_AUDIENCES_PER_MONTH, MOCK_TOP_STUDIES, isDevMode,
} from '../../lib/mockData.js';
import './Dashboard.css';

export default function CsDashboard() {
  const navigate = useNavigate();
  const user = auth.getUser();
  const quarter = currentQuarter();

  // TODO: trocar mock por useFetch real quando backend tiver staging
  const summary = MOCK_QUARTER_SUMMARY;
  const campaigns = MOCK_CAMPAIGNS;
  const growthData = MOCK_GROWTH_DATA;
  const audiencesData = MOCK_AUDIENCES_PER_MONTH;
  const topStudies = MOCK_TOP_STUDIES.slice(0, 5);

  const totalPending = campaigns.reduce((s, c) => s + (c.has_pending_evidences || 0), 0);

  return (
    <AppShell pendingEvidences={totalPending}>
      <header className="page-header">
        <div className="fade-up">
          <h1 className="page-title">
            Olá, {(user?.name || 'CS').split(' ')[0]}
          </h1>
          <div className="page-subtitle">
            <span className="page-subtitle__highlight">{quarter}</span>
            <span className="page-subtitle__sep">·</span>
            <span>{summary.campaigns_count} campanhas</span>
            <span className="page-subtitle__sep">·</span>
            <span>{summary.evidences_pending_count} evidências pendentes</span>
            <span className="page-subtitle__sep">·</span>
            <Badge variant={summary.status === 'paid' ? 'green' : summary.status === 'approved' ? 'cyan' : 'yellow'}>
              {summary.status === 'draft' ? 'Em andamento'
                : summary.status === 'pending_approval' ? 'Aguardando aprovação'
                : summary.status === 'approved' ? 'Aprovado'
                : 'Pago'}
            </Badge>
          </div>
        </div>

        {totalPending > 0 && (
          <Button
            variant="primary"
            icon={Sparkles}
            onClick={() => navigate('/campanhas')}
            className="fade-up"
            style={{ '--i': 1 }}
          >
            Revisar {totalPending} evidência{totalPending > 1 ? 's' : ''}
          </Button>
        )}
      </header>

      {/* ─── KPIs principais ─────────────────────────────────────────── */}
      <section className="kpi-row">
        <Card className="kpi kpi--hero stagger" style={{ '--i': 0 }}>
          <div className="kpi__label label">Bônus líquido — {quarter}</div>
          <div className="kpi__value mono kpi__value--cyan">
            {fmt.brl(summary.bonus_net_brl)}
          </div>
          <div className="kpi__hero-breakdown">
            <span>{fmt.brl(summary.bonus_gross_brl)} bruto</span>
            <span className="page-subtitle__sep">−</span>
            <span>{fmt.brl(summary.salary_deduction_brl)} desconto</span>
          </div>
        </Card>

        <KpiCard
          label="Bruto"
          value={fmt.brl(summary.bonus_gross_brl)}
        />
        <KpiCard
          label="Próprias campanhas"
          value={fmt.brl(summary.bonus_from_own_campaigns_brl)}
        />
        <KpiCard
          label="Estudos / Mentoria"
          value={fmt.brl(summary.bonus_from_studies_brl + summary.bonus_from_mentorship_brl)}
        />
      </section>

      {/* ─── Gráfico de crescimento ─────────────────────────────────── */}
      <section className="dashboard-grid">
        <Card className="dashboard-grid__main fade-up" style={{ '--i': 4 }}>
          <header className="card__header">
            <div>
              <h3 className="card__title">Evolução de bônus</h3>
              <p className="card__subtitle">Últimos 6 meses</p>
            </div>
            <div className="legend">
              <span className="legend__item legend__item--cyan">
                <span className="legend__dot" /> Bônus líquido (R$)
              </span>
            </div>
          </header>
          <AreaChart
            data={growthData}
            xKey="x"
            yKey="compplan"
            color="cyan"
            height={260}
            formatY={(v) => fmt.brlCompact(v)}
            formatTooltip={(v) => fmt.brl(v)}
            tooltipLabel="Bônus líquido"
          />
        </Card>

        <Card className="fade-up" style={{ '--i': 5 }}>
          <header className="card__header">
            <div>
              <h3 className="card__title">Audiences Discoveries</h3>
              <p className="card__subtitle">Por mês</p>
            </div>
          </header>
          <AreaChart
            data={audiencesData}
            xKey="x"
            yKey="value"
            color="green"
            height={180}
            formatY={(v) => fmt.numCompact(v)}
            formatTooltip={(v) => `${v} audiences`}
            tooltipLabel=""
          />
        </Card>
      </section>

      {/* ─── Lista de campanhas ─────────────────────────────────────── */}
      <section className="fade-up" style={{ '--i': 6 }}>
        <header className="section-header">
          <h2 className="section-title">Suas campanhas no quarter</h2>
          <button className="section-action" onClick={() => navigate('/campanhas')}>
            Ver todas <ArrowRight size={14} />
          </button>
        </header>

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
      </section>

      {/* ─── Estudos mais usados ────────────────────────────────────── */}
      <section className="dashboard-grid">
        <Card className="fade-up" style={{ '--i': 7 }}>
          <header className="card__header">
            <div>
              <h3 className="card__title">Estudos mais usados</h3>
              <p className="card__subtitle">Top 5 do quarter (todo o time)</p>
            </div>
          </header>
          <BarChart
            data={topStudies}
            xKey="name"
            yKey="value"
            layout="horizontal"
            height={240}
            color="cyan"
            highlightTopN={3}
            formatValue={(v) => `${v}×`}
          />
        </Card>

        <Card className="fade-up" style={{ '--i': 8 }}>
          <header className="card__header">
            <div>
              <h3 className="card__title">Detalhamento do bônus</h3>
              <p className="card__subtitle">Composição do {quarter}</p>
            </div>
          </header>
          <BonusBreakdown summary={summary} />
        </Card>
      </section>
    </AppShell>
  );
}

/* ─── Sub-componentes ────────────────────────────────────────────── */

function CampaignRow({ campaign, onClick, i }) {
  const isABS = campaign.is_abs;
  const pending = campaign.has_pending_evidences || 0;

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
          {isABS && <Badge variant="cyan">ABS</Badge>}
        </div>
        <div className="campaign-row__name">{campaign.campaign_name}</div>
        <div className="campaign-row__meta">
          {fmt.dateRange(campaign.campaign_start_date, campaign.campaign_end_date)}
          <span className="page-subtitle__sep">·</span>
          {fmt.brl(campaign.revenue_gross)} bruto
        </div>
      </div>

      <div className="campaign-row__pct">
        <span className="label">Pct atingido</span>
        <span className="campaign-row__pct-value mono">
          {fmt.pct(campaign.cs_total_pct)}
        </span>
      </div>

      <div className="campaign-row__bonus">
        <span className="label">Bônus</span>
        <span className="campaign-row__bonus-value mono">
          {fmt.brl(campaign.cs_bonus_amount)}
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

function BonusBreakdown({ summary }) {
  const items = [
    { label: 'Próprias campanhas',  value: summary.bonus_from_own_campaigns_brl, color: 'cyan' },
    { label: 'Bônus de estudos',    value: summary.bonus_from_studies_brl,        color: 'green' },
    { label: 'Bônus de mentoria',   value: summary.bonus_from_mentorship_brl,    color: 'yellow' },
  ].filter(i => i.value > 0);

  const total = items.reduce((s, i) => s + i.value, 0);

  return (
    <div className="breakdown">
      <div className="breakdown__bar">
        {items.map((it, i) => (
          <div
            key={i}
            className={`breakdown__segment breakdown__segment--${it.color}`}
            style={{ width: `${(it.value / total) * 100}%` }}
          />
        ))}
      </div>

      <div className="breakdown__list">
        {items.map((it, i) => (
          <div key={i} className="breakdown__item">
            <div className="breakdown__item-label">
              <span className={`breakdown__dot breakdown__dot--${it.color}`} />
              <span>{it.label}</span>
            </div>
            <span className="mono">{fmt.brl(it.value)}</span>
          </div>
        ))}
        <div className="breakdown__divider" />
        <div className="breakdown__item breakdown__item--total">
          <span>Total bruto</span>
          <span className="mono">{fmt.brl(summary.bonus_gross_brl)}</span>
        </div>
        <div className="breakdown__item breakdown__item--deduction">
          <span>Desconto (2× salário fixo de {fmt.brl(summary.fixed_salary_monthly_brl)})</span>
          <span className="mono">−{fmt.brl(summary.salary_deduction_brl)}</span>
        </div>
        <div className="breakdown__divider" />
        <div className="breakdown__item breakdown__item--final">
          <span>Bônus líquido</span>
          <span className="mono breakdown__final-value">{fmt.brl(summary.bonus_net_brl)}</span>
        </div>
      </div>
    </div>
  );
}
