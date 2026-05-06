import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import AppShell from '../../components/layout/AppShell.jsx';
import { Card, KpiCard } from '../../components/ui/Card.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import Avatar from '../../components/ui/Avatar.jsx';
import AreaChart from '../../components/charts/AreaChart.jsx';
import BarChart from '../../components/charts/BarChart.jsx';
import { fmt, currentQuarter } from '../../lib/format.js';
import { endpoints } from '../../lib/api.js';
import './Overview.css';

export default function AdminOverview() {
  const navigate = useNavigate();
  const quarter = currentQuarter();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    let cancelled = false;
    endpoints.adminOverview(quarter)
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [quarter]);

  if (error) {
    return (
      <AppShell>
        <Card>
          <h2 className="page-title">Erro ao carregar visão geral</h2>
          <p className="card__subtitle">{error}</p>
        </Card>
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell>
        <header className="page-header">
          <h1 className="page-title">Visão geral</h1>
          <div className="page-subtitle">Carregando…</div>
        </header>
      </AppShell>
    );
  }

  const { kpis, by_cs: team, growth, top_studies, audiences_per_month } = data;

  // Adapta growth pro shape esperado pelo AreaChart
  const growthData = growth.map(g => ({
    x: g.month,
    compplan: g.invest_total,
  }));

  const audiencesData = audiences_per_month.map(a => ({
    x: a.month,
    value: a.n,
  }));

  // Top studies precisa do nome — se backend só mandou id, mostra o id
  const topStudiesData = top_studies.map(s => ({
    name: s.study_id,
    value: s.uses,
  }));

  // Distribuição por CS pra bar chart
  const distribByCs = team.map(c => ({
    name: (c.cs_name || c.cs_email).split(' ')[0],
    value: c.bonus_brl,
  }));

  return (
    <AppShell pendingEvidences={kpis.n_pending_evi}>
      <header className="page-header fade-up">
        <div>
          <h1 className="page-title">Visão geral</h1>
          <div className="page-subtitle">
            <span className="page-subtitle__highlight">{quarter}</span>
            <span className="page-subtitle__sep">·</span>
            <span>{team.length} CSs ativos</span>
            <span className="page-subtitle__sep">·</span>
            <span>{kpis.n_camp} campanhas</span>
            {kpis.n_pending_evi > 0 && (
              <>
                <span className="page-subtitle__sep">·</span>
                <span style={{ color: 'var(--status-yellow)' }}>
                  {kpis.n_pending_evi} evidências aguardando revisão
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
            {fmt.brlCompact(kpis.invest_total)}
          </div>
          <div className="kpi__hero-breakdown">
            <span className="mono">{fmt.brlCompact(kpis.invest_total * 0.8347)} líquido</span>
            <span className="page-subtitle__sep">·</span>
            <span>tax 16,53%</span>
          </div>
        </Card>

        <KpiCard
          label="Bônus total do time"
          value={fmt.brlCompact(kpis.total_bonus_brl)}
        />
        <KpiCard
          label="Campanhas ativas"
          value={kpis.n_camp}
        />
        <KpiCard
          label="Evidências pendentes"
          value={kpis.n_pending_evi}
          status={kpis.n_pending_evi > 5 ? 'yellow' : 'green'}
        />
      </section>

      {/* ─── Gráficos ───────────────────────────────────────────────── */}
      <section className="dashboard-grid">
        <Card className="dashboard-grid__main fade-up" style={{ '--i': 4 }}>
          <header className="card__header">
            <div>
              <h3 className="card__title">Investimento agregado</h3>
              <p className="card__subtitle">Todos os CSs · últimos 6 meses</p>
            </div>
          </header>
          {growthData.length > 0 ? (
            <AreaChart
              data={growthData}
              xKey="x"
              yKey="compplan"
              color="cyan"
              height={260}
              formatY={(v) => fmt.brlCompact(v)}
              formatTooltip={(v) => fmt.brl(v)}
              tooltipLabel="Investimento"
            />
          ) : (
            <div className="empty-state">Sem dados nos últimos 6 meses</div>
          )}
        </Card>

        <Card className="fade-up" style={{ '--i': 5 }}>
          <header className="card__header">
            <div>
              <h3 className="card__title">Campanhas com audiences</h3>
              <p className="card__subtitle">Por mês · últimos 6 meses</p>
            </div>
          </header>
          {audiencesData.length > 0 ? (
            <AreaChart
              data={audiencesData}
              xKey="x"
              yKey="value"
              color="green"
              height={180}
              formatY={(v) => fmt.numCompact(v)}
              formatTooltip={(v) => `${v} campanhas`}
            />
          ) : (
            <div className="empty-state">Sem dados</div>
          )}
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
            .sort((a, b) => b.bonus_brl - a.bonus_brl)
            .map((cs, i) => (
              <CsLeaderRow key={cs.cs_email} cs={cs} rank={i + 1} i={i} />
            ))}
        </div>
      </section>

      {/* ─── Estudos mais usados + Distribuição de bônus ─────────────── */}
      <section className="dashboard-grid">
        <Card className="fade-up" style={{ '--i': 9 }}>
          <header className="card__header">
            <div>
              <h3 className="card__title">Estudos mais usados</h3>
              <p className="card__subtitle">Top 10 do quarter</p>
            </div>
          </header>
          {topStudiesData.length > 0 ? (
            <BarChart
              data={topStudiesData}
              xKey="name"
              yKey="value"
              layout="horizontal"
              height={260}
              color="cyan"
              highlightTopN={3}
              formatValue={(v) => `${v}×`}
            />
          ) : (
            <div className="empty-state">Nenhum estudo declarado ainda</div>
          )}
        </Card>

        <Card className="fade-up" style={{ '--i': 10 }}>
          <header className="card__header">
            <div>
              <h3 className="card__title">Distribuição de bônus</h3>
              <p className="card__subtitle">Por CS · {quarter}</p>
            </div>
          </header>
          {distribByCs.some(d => d.value > 0) ? (
            <BarChart
              data={distribByCs}
              xKey="name"
              yKey="value"
              layout="horizontal"
              height={260}
              color="cyan"
              formatValue={(v) => fmt.brlCompact(v)}
            />
          ) : (
            <div className="empty-state">
              Sem bônus calculados ainda. Vá em <strong>Quarter atual</strong> e clique em <strong>Recalcular tudo</strong>.
            </div>
          )}
        </Card>
      </section>
    </AppShell>
  );
}

function CsLeaderRow({ cs, rank, i }) {
  return (
    <div className="cs-row stagger" style={{ '--i': i }}>
      <div className="cs-row__rank">{rank}</div>
      <Avatar name={cs.cs_name || cs.cs_email} size="md" />
      <div className="cs-row__main">
        <div className="cs-row__name">{cs.cs_name || cs.cs_email}</div>
        <div className="cs-row__email">{cs.cs_email}</div>
      </div>

      <div className="cs-row__metric">
        <span className="label">Salário fixo</span>
        <span className="mono cs-row__metric-value">{fmt.brlCompact(cs.fixed_salary_brl)}</span>
      </div>

      <div className="cs-row__metric">
        <span className="label">Campanhas</span>
        <span className="mono cs-row__metric-value">{cs.n_camp}</span>
      </div>

      <div className="cs-row__metric">
        <span className="label">Bônus quarter</span>
        <span className="mono cs-row__metric-value cs-row__metric-value--cyan">
          {fmt.brl(cs.bonus_brl)}
        </span>
      </div>

      <div className="cs-row__cta">
        {cs.n_pending_evi > 0 && (
          <Badge variant="yellow">{cs.n_pending_evi} pendente{cs.n_pending_evi > 1 ? 's' : ''}</Badge>
        )}
      </div>
    </div>
  );
}
