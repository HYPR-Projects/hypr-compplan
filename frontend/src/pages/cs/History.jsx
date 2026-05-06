import { useEffect, useState } from 'react';
import AppShell from '../../components/layout/AppShell.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { endpoints } from '../../lib/api.js';
import { fmt } from '../../lib/format.js';

export default function CsHistory() {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    endpoints.meHistory()
      .then(d => setHistory(Array.isArray(d) ? d : (d.history || d.items || [])))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (error) {
    return (
      <AppShell>
        <Card>
          <h2 className="page-title">Erro ao carregar histórico</h2>
          <p className="card__subtitle">{error}</p>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <header className="page-header fade-up">
        <div>
          <h1 className="page-title">Histórico</h1>
          <div className="page-subtitle">
            <span>Bônus de quarters anteriores</span>
          </div>
        </div>
      </header>

      {loading && <div className="empty-state">Carregando…</div>}

      {!loading && history.length === 0 && (
        <Card>
          <p className="card__subtitle">
            Você ainda não tem quarters fechados. Quando o admin marcar um quarter como pago, ele aparece aqui.
          </p>
        </Card>
      )}

      {history.length > 0 && (
        <div className="quarter-table">
          <div className="quarter-table__head">
            <span>Quarter</span>
            <span>Status</span>
            <span style={{ textAlign: 'right' }}>Bruto</span>
            <span style={{ textAlign: 'right' }}>Desconto</span>
            <span style={{ textAlign: 'right' }}>Líquido</span>
          </div>

          {history.map((q, i) => (
            <div key={q.quarter} className="quarter-row stagger" style={{ '--i': i }}>
              <div><strong>{q.quarter}</strong></div>
              <div>
                <Badge variant={
                  q.status === 'paid' ? 'green'
                  : q.status === 'approved' ? 'cyan'
                  : 'neutral'
                }>
                  {q.status === 'paid' ? 'Pago'
                    : q.status === 'approved' ? 'Aprovado'
                    : 'Em rascunho'}
                </Badge>
              </div>
              <div className="mono quarter-row__num">{fmt.brl(Number(q.bonus_gross_brl) || 0)}</div>
              <div className="mono quarter-row__num quarter-row__num--dim">
                −{fmt.brl(Number(q.salary_deduction_brl) || 0)}
              </div>
              <div className="mono quarter-row__num quarter-row__num--cyan">
                {fmt.brl(Number(q.bonus_net_brl) || 0)}
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
