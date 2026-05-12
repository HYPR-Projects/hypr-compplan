import { useEffect, useState } from 'react';
import AppShell from '../../components/layout/AppShell.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { fmt, currentQuarter } from '../../lib/format.js';
import { endpoints } from '../../lib/api.js';

export default function CsHistory() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);
  const currQ = currentQuarter();

  useEffect(() => {
    endpoints.meHistory()
      .then(d => setItems(d.items || []))
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
            <span>Todos os quarters em que você teve campanhas</span>
          </div>
        </div>
      </header>

      {loading && <div className="empty-state">Carregando…</div>}

      {!loading && items.length === 0 && (
        <Card>
          <p className="card__subtitle">
            Você ainda não tem histórico de quarters anteriores.
          </p>
        </Card>
      )}

      {items.length > 0 && (
        <div className="campaigns-table">
          <div className="campaigns-table__head" style={{ gridTemplateColumns: '1fr 100px 140px 140px' }}>
            <span>Quarter</span>
            <span style={{ textAlign: 'right' }}>Campanhas</span>
            <span style={{ textAlign: 'right' }}>Bruto</span>
            <span style={{ textAlign: 'right' }}>Líquido</span>
          </div>

          {items.map((q, i) => (
            <div
              key={q.quarter}
              className="campaigns-table__row stagger"
              style={{ '--i': i, gridTemplateColumns: '1fr 100px 140px 140px' }}
            >
              <div>
                <strong>{q.quarter}</strong>
                {q.quarter === currQ && (
                  <Badge variant="cyan" style={{ marginLeft: 'var(--space-2)' }}>Atual</Badge>
                )}
              </div>
              <div className="mono campaigns-table__num">{q.n_camp}</div>
              <div className="mono campaigns-table__num">{fmt.brl(q.bruto)}</div>
              <div className="mono campaigns-table__num campaigns-table__num--cyan">
                {fmt.brl(q.liquido)}
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
