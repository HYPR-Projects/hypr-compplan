import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';
import AppShell from '../../components/layout/AppShell.jsx';
import { Card, KpiCard } from '../../components/ui/Card.jsx';
import Avatar from '../../components/ui/Avatar.jsx';
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

  const { kpis, by_cs: team } = data;

  return (
    <AppShell>
      <header className="page-header fade-up">
        <div>
          <h1 className="page-title">Visão geral</h1>
          <div className="page-subtitle">
            <span className="page-subtitle__highlight">{quarter}</span>
            <span className="page-subtitle__sep">·</span>
            <span>{kpis.n_cs} CSs ativos</span>
            <span className="page-subtitle__sep">·</span>
            <span>{kpis.n_camp} campanhas</span>
          </div>
        </div>
      </header>

      {/* ─── KPIs ────────────────────────────────────────────── */}
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

        <KpiCard label="Líquido total" value={fmt.brlCompact(kpis.liquido_total)} />
        <KpiCard label="Campanhas" value={kpis.n_camp} />
        <KpiCard label="CSs ativos" value={kpis.n_cs} />
      </section>

      {/* ─── Ranking por CS ──────────────────────────────────── */}
      <section className="fade-up" style={{ '--i': 4 }}>
        <header className="section-header">
          <h2 className="section-title">Ranking por CS</h2>
          <button className="section-action" onClick={() => navigate('/admin/campanhas')}>
            Ver campanhas <ArrowRight size={14} />
          </button>
        </header>

        {team.length === 0 ? (
          <Card>
            <p className="card__subtitle">Nenhum CS com campanhas atribuídas no {quarter}.</p>
          </Card>
        ) : (
          <div className="cs-leaderboard">
            {team.map((cs, i) => (
              <CsLeaderRow key={cs.cs_email} cs={cs} rank={i + 1} i={i} />
            ))}
          </div>
        )}
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
        <span className="label">Campanhas</span>
        <span className="mono cs-row__metric-value">{cs.n_camp}</span>
      </div>

      <div className="cs-row__metric">
        <span className="label">Bruto</span>
        <span className="mono cs-row__metric-value">{fmt.brlCompact(cs.bruto)}</span>
      </div>

      <div className="cs-row__metric">
        <span className="label">Líquido</span>
        <span className="mono cs-row__metric-value cs-row__metric-value--cyan">
          {fmt.brlCompact(cs.liquido)}
        </span>
      </div>
    </div>
  );
}
