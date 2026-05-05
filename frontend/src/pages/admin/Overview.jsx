import { useNavigate } from 'react-router-dom';
import { TrendingUp, Users, Sparkles, Target, ArrowRight } from 'lucide-react';
import AppShell from '../../components/layout/AppShell.jsx';
import { Card, KpiCard } from '../../components/ui/Card.jsx';
import { Badge, StatusDot } from '../../components/ui/Badge.jsx';
import Avatar from '../../components/ui/Avatar.jsx';
import AreaChart from '../../components/charts/AreaChart.jsx';
import BarChart from '../../components/charts/BarChart.jsx';
import { fmt, currentQuarter } from '../../lib/format.js';
import {
  MOCK_TEAM_OVERVIEW, MOCK_GROWTH_DATA, MOCK_TOP_STUDIES,
  MOCK_AUDIENCES_PER_MONTH,
} from '../../lib/mockData.js';
import './Overview.css';

export default function AdminOverview() {
  const navigate = useNavigate();
  const team = MOCK_TEAM_OVERVIEW;
  const quarter = currentQuarter();

  const totalBonusQ = team.reduce((s, c) => s + c.bonus_q1_brl, 0);
  const totalCampaigns = team.reduce((s, c) => s + c.campaigns_active, 0);
  const totalPending = team.reduce((s, c) => s + c.pending_claims, 0);
  // Mock: faturamento total bruto/líquido — calcular do backend depois
  const totalRevenueGross = 14_750_000;
  const totalRevenueNet = totalRevenueGross * 0.8347;

  // Cresc. compplan agregado
  const aggGrowth = MOCK_GROWTH_DATA.map(g => ({
    ...g,
    compplan: g.compplan * team.length * 1.4, // aproxima total time
  }));

  return (
    <AppShell pendingEvidences={totalPending}>
      <header className="page-header fade-up">
        <div>
          <h1 className="page-title">Visão geral</h1>
          <div className="page-subtitle">
            <span className="page-subtitle__highlight">{quarter}</span>
            <span className="page-subtitle__sep">·</span>
            <span>{team.length} CSs ativos</span>
            <span className="page-subtitle__sep">·</span>
            <span>{totalCampaigns} campanhas</span>
            {totalPending > 0 && (
              <>
                <span className="page-subtitle__sep">·</span>
                <span style={{ color: 'var(--status-yellow)' }}>
                  {totalPending} evidências aguardando revisão
                </span>
              </>
            )}
          </div>
        </div>
      </header>

      {/* ─── KPIs do time ───────────────────────────────────────────── */}
      <section className="kpi-row">
        <Card className="kpi kpi--hero stagger" style={{ '--i': 0 }}>
          <div className="kpi__label label">Investimento gerido — {quarter}</div>
          <div className="kpi__value mono kpi__value--cyan">
            {fmt.brlCompact(totalRevenueGross)}
          </div>
          <div className="kpi__hero-breakdown">
            <span className="mono">{fmt.brlCompact(totalRevenueNet)} líquido</span>
            <span className="page-subtitle__sep">·</span>
            <span>tax 16,53%</span>
          </div>
        </Card>

        <KpiCard
          label="Bônus total do time"
          value={fmt.brlCompact(totalBonusQ)}
        />
        <KpiCard
          label="Campanhas ativas"
          value={totalCampaigns}
        />
        <KpiCard
          label="Evidências pendentes"
          value={totalPending}
          status={totalPending > 5 ? 'yellow' : 'green'}
        />
      </section>

      {/* ─── Gráficos ───────────────────────────────────────────────── */}
      <section className="dashboard-grid">
        <Card className="dashboard-grid__main fade-up" style={{ '--i': 4 }}>
          <header className="card__header">
            <div>
              <h3 className="card__title">Compplan agregado</h3>
              <p className="card__subtitle">Todos os CSs · últimos 6 meses</p>
            </div>
          </header>
          <AreaChart
            data={aggGrowth}
            xKey="x"
            yKey="compplan"
            color="cyan"
            height={260}
            formatY={(v) => fmt.brlCompact(v)}
            formatTooltip={(v) => fmt.brl(v)}
            tooltipLabel="Compplan total"
          />
        </Card>

        <Card className="fade-up" style={{ '--i': 5 }}>
          <header className="card__header">
            <div>
              <h3 className="card__title">Audiences Discoveries</h3>
              <p className="card__subtitle">Total time · por mês</p>
            </div>
          </header>
          <AreaChart
            data={MOCK_AUDIENCES_PER_MONTH.map(d => ({ ...d, value: d.value * 6 }))}
            xKey="x"
            yKey="value"
            color="green"
            height={180}
            formatY={(v) => fmt.numCompact(v)}
            formatTooltip={(v) => `${v} audiences`}
          />
        </Card>
      </section>

      {/* ─── Performance por CS ─────────────────────────────────────── */}
      <section className="fade-up" style={{ '--i': 6 }}>
        <header className="section-header">
          <h2 className="section-title">Performance por CS</h2>
          <button className="section-action" onClick={() => navigate('/admin/team')}>
            Gerenciar time <ArrowRight size={14} />
          </button>
        </header>

        <div className="cs-leaderboard">
          {[...team]
            .sort((a, b) => b.bonus_q1_brl - a.bonus_q1_brl)
            .map((cs, i) => (
              <CsLeaderRow key={cs.email} cs={cs} rank={i + 1} i={i} />
            ))}
        </div>
      </section>

      {/* ─── Estudos mais usados ────────────────────────────────────── */}
      <section className="dashboard-grid">
        <Card className="fade-up" style={{ '--i': 9 }}>
          <header className="card__header">
            <div>
              <h3 className="card__title">Ranking de estudos</h3>
              <p className="card__subtitle">Mais usados no quarter</p>
            </div>
          </header>
          <BarChart
            data={MOCK_TOP_STUDIES}
            xKey="name"
            yKey="value"
            layout="horizontal"
            height={260}
            color="cyan"
            highlightTopN={3}
            formatValue={(v) => `${v}×`}
          />
        </Card>

        <Card className="fade-up" style={{ '--i': 10 }}>
          <header className="card__header">
            <div>
              <h3 className="card__title">Distribuição de bônus</h3>
              <p className="card__subtitle">Por CS · {quarter}</p>
            </div>
          </header>
          <BarChart
            data={team.map(c => ({ name: c.name.split(' ')[0], value: c.bonus_q1_brl }))}
            xKey="name"
            yKey="value"
            layout="horizontal"
            height={260}
            color="cyan"
            formatValue={(v) => fmt.brlCompact(v)}
          />
        </Card>
      </section>
    </AppShell>
  );
}

function CsLeaderRow({ cs, rank, i }) {
  const navigate = useNavigate();
  return (
    <div className="cs-row stagger" style={{ '--i': i }}>
      <div className="cs-row__rank">{rank}</div>
      <Avatar name={cs.name} size="md" />
      <div className="cs-row__main">
        <div className="cs-row__name">{cs.name}</div>
        <div className="cs-row__email">{cs.email}</div>
      </div>

      <div className="cs-row__metric">
        <span className="label">Salário fixo</span>
        <span className="mono cs-row__metric-value">{fmt.brlCompact(cs.current_salary)}</span>
      </div>

      <div className="cs-row__metric">
        <span className="label">Campanhas</span>
        <span className="mono cs-row__metric-value">{cs.campaigns_active}</span>
      </div>

      <div className="cs-row__metric">
        <span className="label">Bônus quarter</span>
        <span className="mono cs-row__metric-value cs-row__metric-value--cyan">
          {fmt.brl(cs.bonus_q1_brl)}
        </span>
      </div>

      <div className="cs-row__cta">
        {cs.pending_claims > 0 && (
          <Badge variant="yellow">{cs.pending_claims} pendente{cs.pending_claims > 1 ? 's' : ''}</Badge>
        )}
        {cs.has_mentees && <Badge variant="cyan">Mentor</Badge>}
      </div>
    </div>
  );
}
