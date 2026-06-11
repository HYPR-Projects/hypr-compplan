import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { MessageSquare, AlertTriangle, ArrowRight, Clock, Check } from 'lucide-react';
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
  // Tokens em loading durante o toggle (evita duplo-clique)
  const [togglingTokens, setTogglingTokens] = useState(new Set());

  useEffect(() => {
    setError(null);
    endpoints.adminReviewRequests()
      .then(d => setList(d.items || []))
      .catch(e => setError(e.message));
  }, []);

  // Alterna o "visto/não visto" — otimista: atualiza UI antes do server confirmar
  async function toggleHandled(token, currentlyHandled) {
    if (togglingTokens.has(token)) return; // já está processando
    setTogglingTokens(prev => new Set(prev).add(token));

    // Atualização otimista
    setList(prev => prev.map(r =>
      r.short_token === token
        ? { ...r, handled_at: currentlyHandled ? null : new Date().toISOString() }
        : r
    ));

    try {
      const resp = await endpoints.adminReviewRequestSetHandled(token, !currentlyHandled);
      // Sincroniza com o que o backend retornou (mais preciso que o otimista)
      setList(prev => prev.map(r =>
        r.short_token === token
          ? { ...r, handled_at: resp.handled_at, handled_by: resp.handled_by }
          : r
      ));
    } catch (err) {
      // Rollback em caso de erro
      setList(prev => prev.map(r =>
        r.short_token === token
          ? { ...r, handled_at: currentlyHandled ? new Date().toISOString() : null }
          : r
      ));
      setError(`Falha ao marcar como visto: ${err.message}`);
    } finally {
      setTogglingTokens(prev => {
        const next = new Set(prev);
        next.delete(token);
        return next;
      });
    }
  }

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

  const pendentes = list.filter(r => !r.handled_at).length;
  const vistos = list.length - pendentes;

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
            {list.length > 0 && (
              <> · <strong>{pendentes}</strong> não vistos · <strong>{vistos}</strong> vistos</>
            )}
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
          {list.map((r, i) => {
            const isHandled = !!r.handled_at;
            const isToggling = togglingTokens.has(r.short_token);
            return (
              <div
                key={r.short_token}
                className={`review-card stagger${isHandled ? ' review-card--handled' : ''}`}
                style={{ '--i': Math.min(i, 20) }}
              >
                <div className="review-card__stripe"></div>
                <div
                  className="review-card__main"
                  onClick={() => navigate(`/admin/cs/${encodeURIComponent(r.cs_email)}/campanha/${r.short_token}`)}
                  style={{ cursor: 'pointer' }}
                >
                  <div className="review-card__title-row">
                    <span className="review-card__client">{r.client_name}</span>
                    <Badge variant="neutral">{r.short_token}</Badge>
                    {r.is_legacy && <Badge variant="neutral">Legacy</Badge>}
                    {isHandled
                      ? <Badge variant="green"><Check size={10} /> Visto</Badge>
                      : <Badge variant="yellow"><AlertTriangle size={10} /> Pedido de análise</Badge>
                    }
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
                    {isHandled && (
                      <> · <Check size={12} /> Visto por {r.handled_by} · {fmt.date(r.handled_at)}</>
                    )}
                  </div>
                </div>

                {/* Botão de tick: marca/desmarca como visto. stopPropagation pra não navegar */}
                <button
                  type="button"
                  className={`review-card__tick${isHandled ? ' is-handled' : ''}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggleHandled(r.short_token, isHandled);
                  }}
                  disabled={isToggling}
                  title={isHandled ? 'Desmarcar como visto' : 'Marcar como visto'}
                  aria-label={isHandled ? 'Desmarcar como visto' : 'Marcar como visto'}
                >
                  <Check size={18} />
                </button>

                <ArrowRight size={18} className="review-card__arrow" />
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
