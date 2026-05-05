import AppShell from '../../components/layout/AppShell.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import AreaChart from '../../components/charts/AreaChart.jsx';
import { fmt } from '../../lib/format.js';
import { MOCK_HISTORY, MOCK_QUARTER_SUMMARY } from '../../lib/mockData.js';
import './History.css';

export default function CsHistory() {
  // Inclui o quarter atual no início pra ver continuidade
  const allQuarters = [
    {
      quarter: MOCK_QUARTER_SUMMARY.quarter,
      status: MOCK_QUARTER_SUMMARY.status,
      bonus_gross_brl: MOCK_QUARTER_SUMMARY.bonus_gross_brl,
      bonus_net_brl: MOCK_QUARTER_SUMMARY.bonus_net_brl,
      campaigns_count: MOCK_QUARTER_SUMMARY.campaigns_count,
      current: true,
    },
    ...MOCK_HISTORY,
  ];

  // Ordem cronológica pro chart
  const chartData = [...allQuarters].reverse().map((q) => ({
    x: q.quarter,
    bruto: q.bonus_gross_brl,
    liquido: q.bonus_net_brl,
  }));

  const totalLifetime = MOCK_HISTORY.reduce((s, q) => s + q.bonus_net_brl, 0);
  const avgQuarterly = totalLifetime / MOCK_HISTORY.length;

  return (
    <AppShell>
      <header className="page-header fade-up">
        <div>
          <h1 className="page-title">Histórico</h1>
          <div className="page-subtitle">
            <span>Todos os quarters · ganhos consolidados</span>
          </div>
        </div>
      </header>

      <section className="history-stats fade-up" style={{ '--i': 1 }}>
        <div className="history-stats__item">
          <span className="label">Total acumulado (líquido)</span>
          <span className="history-stats__value mono">{fmt.brl(totalLifetime)}</span>
        </div>
        <div className="history-stats__divider" />
        <div className="history-stats__item">
          <span className="label">Média por quarter</span>
          <span className="history-stats__value mono">{fmt.brl(avgQuarterly)}</span>
        </div>
        <div className="history-stats__divider" />
        <div className="history-stats__item">
          <span className="label">Quarters fechados</span>
          <span className="history-stats__value mono">{MOCK_HISTORY.length}</span>
        </div>
      </section>

      <Card className="fade-up" style={{ '--i': 2, marginBottom: 'var(--space-8)' }}>
        <header className="card__header">
          <div>
            <h3 className="card__title">Evolução por quarter</h3>
            <p className="card__subtitle">Bônus bruto vs líquido</p>
          </div>
        </header>
        <AreaChart
          data={chartData}
          xKey="x"
          yKey="liquido"
          color="cyan"
          height={240}
          formatY={(v) => fmt.brlCompact(v)}
          formatTooltip={(v) => fmt.brl(v)}
          tooltipLabel="Líquido"
        />
      </Card>

      <section className="fade-up" style={{ '--i': 3 }}>
        <div className="history-table">
          <div className="history-table__head">
            <span>Quarter</span>
            <span>Status</span>
            <span style={{ textAlign: 'right' }}>Campanhas</span>
            <span style={{ textAlign: 'right' }}>Bruto</span>
            <span style={{ textAlign: 'right' }}>Líquido</span>
          </div>
          {allQuarters.map((q, i) => (
            <div key={q.quarter} className="history-row stagger" style={{ '--i': i }}>
              <div className="history-row__quarter">
                <span>{q.quarter}</span>
                {q.current && <Badge variant="cyan">Atual</Badge>}
              </div>
              <div>
                <Badge variant={q.status === 'paid' ? 'green' : q.status === 'approved' ? 'cyan' : 'yellow'}>
                  {q.status === 'paid' ? 'Pago'
                    : q.status === 'approved' ? 'Aprovado'
                    : q.status === 'pending_approval' ? 'Aguardando'
                    : 'Em andamento'}
                </Badge>
              </div>
              <div className="mono history-row__num">{q.campaigns_count}</div>
              <div className="mono history-row__num">{fmt.brl(q.bonus_gross_brl)}</div>
              <div className="mono history-row__num history-row__net">
                {fmt.brl(q.bonus_net_brl)}
              </div>
            </div>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
