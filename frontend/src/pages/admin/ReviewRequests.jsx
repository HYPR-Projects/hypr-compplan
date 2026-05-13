import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, AlertTriangle, ArrowRight, Clock } from 'lucide-react';
import AppShell from '../../components/layout/AppShell.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { fmt } from '../../lib/format.js';
import { endpoints } from '../../lib/api.js';
import './ReviewRequests.css';

export default function ReviewRequestsPage() {
  const navigate = useNavigate();
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setError(null);
    endpoints.adminReviewRequests()
      .then(d => setList(d.items || []))
      .catch(e => setError(e.message));
  }, []);

  if (error) {
    return (
      <AppShell>
        <Card variant="warn">
          <strong>Erro:</strong> {error}
        </Card>
      </AppShell>
    );
  }

  if (!list) {
    return (
      <AppShell>
        <div className="empty-state">Carregando…</div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <header className="admin-page-header fade-up">
        <div>
          <h1 className="page-title">
            <MessageSquare size={20} style={{ verticalAlign: 'middle', marginRight: 8 }} />
            Pedidos de análise
          </h1>
          <div className="page-subtitle">
            Campanhas em que o CS solicitou revisão admin.
          </div>
        </div>
      </header>

      {list.length === 0 ? (
        <Card>
          <p className="card__subtitle">
            Nenhum pedido de análise pendente. 🎉
          </p>
        </Card>
      ) : (
        <div className="review-list">
          {list.map((r, i) => (
            <div
              key={r.short_token}
              className="review-card stagger"
              style={{ '--i': Math.min(i, 20) }}
              onClick={() => navigate(`/admin/cs/${encodeURIComponent(r.cs_email)}/campanha/${r.short_token}`)}
            >
              <div className="review-card__stripe"></div>
              <div className="review-card__main">
                <div className="review-card__title-row">
                  <span className="review-card__client">{r.client_name}</span>
                  <Badge variant="neutral">{r.short_token}</Badge>
                  {r.is_legacy && <Badge variant="neutral">Legacy</Badge>}
                  <Badge variant="yellow"><AlertTriangle size={10} /> Pedido de análise</Badge>
                </div>
                <div className="review-card__campaign">{r.campaign_name}</div>
                <div className="review-card__meta">
                  CS: {r.cs_name || r.cs_email} · {fmt.dateRange(r.start_date, r.end_date)}
                </div>
                {r.notes && (
                  <div className="review-card__notes">
                    <MessageSquare size={12} />
                    <span>{r.notes}</span>
                  </div>
                )}
                <div className="review-card__footer">
                  <Clock size={12} /> Solicitado por {r.requested_by} · {fmt.date(r.requested_at)}
                </div>
              </div>
              <ArrowRight size={18} className="review-card__arrow" />
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
