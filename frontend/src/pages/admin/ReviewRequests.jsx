import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  MessageSquare, AlertTriangle, ArrowRight, Clock,
  Check, X, RotateCcw,
} from 'lucide-react';
import AppShell from '../../components/layout/AppShell.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { Textarea } from '../../components/ui/Input.jsx';
import { fmt } from '../../lib/format.js';
import { endpoints } from '../../lib/api.js';
import './ReviewRequests.css';

export default function ReviewRequestsPage() {
  const navigate = useNavigate();
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);

  // Modal de decisão: { token, decision: 'approved' | 'rejected', existingComment }
  const [modalState, setModalState] = useState(null);
  // Token sendo processado (loading no card)
  const [busyToken, setBusyToken] = useState(null);

  useEffect(() => {
    setError(null);
    endpoints.adminReviewRequests()
      .then(d => setList(d.items || []))
      .catch(e => setError(e.message));
  }, []);

  // Persiste decisão no backend
  async function saveDecision(token, decision, comment) {
    setBusyToken(token);
    try {
      const resp = await endpoints.adminReviewRequestSetDecision(token, decision, comment);
      setList(prev => prev.map(r =>
        r.short_token === token
          ? {
              ...r,
              decision: resp.decision,
              decision_at: resp.decision_at,
              decision_by: resp.decision_by,
              decision_comment: resp.decision_comment,
              decision_seen_at: null, // resetou ao decidir
            }
          : r
      ));
      setModalState(null);
    } catch (err) {
      setError(`Falha ao salvar decisão: ${err.message}`);
    } finally {
      setBusyToken(null);
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

  const pendentes = list.filter(r => !r.decision).length;
  const aprovados = list.filter(r => r.decision === 'approved').length;
  const recusados = list.filter(r => r.decision === 'rejected').length;

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
              <>
                {' · '}<strong>{pendentes}</strong> pendentes
                {aprovados > 0 && <> · <strong>{aprovados}</strong> aprovados</>}
                {recusados > 0 && <> · <strong>{recusados}</strong> recusados</>}
              </>
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
            const decided = !!r.decision;
            const isApproved = r.decision === 'approved';
            const isRejected = r.decision === 'rejected';
            const isBusy = busyToken === r.short_token;

            // Classe muda conforme status — define cor da stripe e card
            const cardClass = [
              'review-card stagger',
              decided ? 'review-card--decided' : '',
              isApproved ? 'review-card--approved' : '',
              isRejected ? 'review-card--rejected' : '',
            ].filter(Boolean).join(' ');

            return (
              <div
                key={r.short_token}
                className={cardClass}
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
                    {isApproved && <Badge variant="green"><Check size={10} /> Aprovado</Badge>}
                    {isRejected && <Badge variant="red"><X size={10} /> Recusado</Badge>}
                    {!decided && <Badge variant="yellow"><AlertTriangle size={10} /> Pedido de análise</Badge>}
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
                  {decided && r.decision_comment && (
                    <div className={`review-card__decision-comment review-card__decision-comment--${r.decision}`}>
                      <strong>Sua resposta:</strong> {r.decision_comment}
                    </div>
                  )}
                  <div className="review-card__footer">
                    <Clock size={12} /> Solicitado por {r.requested_by} · {fmt.date(r.requested_at)}
                    {decided && (
                      <>
                        {' · '}
                        {isApproved ? <Check size={12} /> : <X size={12} />}
                        {' '}{isApproved ? 'Aprovado' : 'Recusado'} por {r.decision_by} · {fmt.date(r.decision_at)}
                        {r.decision_seen_at && <> · <Check size={12} /> Visto pelo CS em {fmt.date(r.decision_seen_at)}</>}
                      </>
                    )}
                  </div>
                </div>

                {/* Botões de ação à direita: aprovar/recusar OU revisar decisão */}
                <div className="review-card__actions" onClick={(e) => e.stopPropagation()}>
                  {!decided && (
                    <>
                      <button
                        type="button"
                        className="review-card__action-btn review-card__action-btn--approve"
                        onClick={() => setModalState({ token: r.short_token, decision: 'approved', existingComment: '' })}
                        disabled={isBusy}
                        title="Aprovar com comentário"
                        aria-label="Aprovar"
                      >
                        <Check size={16} /> Aprovar
                      </button>
                      <button
                        type="button"
                        className="review-card__action-btn review-card__action-btn--reject"
                        onClick={() => setModalState({ token: r.short_token, decision: 'rejected', existingComment: '' })}
                        disabled={isBusy}
                        title="Recusar com comentário"
                        aria-label="Recusar"
                      >
                        <X size={16} /> Recusar
                      </button>
                    </>
                  )}
                  {decided && (
                    <button
                      type="button"
                      className="review-card__action-btn review-card__action-btn--reset"
                      onClick={() => saveDecision(r.short_token, null, '')}
                      disabled={isBusy}
                      title="Desfazer decisão"
                      aria-label="Desfazer"
                    >
                      <RotateCcw size={14} /> Desfazer
                    </button>
                  )}
                </div>

                <ArrowRight size={18} className="review-card__arrow" />
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de decisão com comentário */}
      {modalState && (
        <DecisionModal
          decision={modalState.decision}
          existingComment={modalState.existingComment || ''}
          onCancel={() => setModalState(null)}
          onConfirm={(comment) => saveDecision(modalState.token, modalState.decision, comment)}
          busy={busyToken === modalState.token}
        />
      )}
    </AppShell>
  );
}

/**
 * Modal de confirmação de aprovação/recusa.
 * Comentário é obrigatório (mínimo 5 caracteres).
 */
function DecisionModal({ decision, existingComment, onCancel, onConfirm, busy }) {
  const [comment, setComment] = useState(existingComment);
  const isApprove = decision === 'approved';
  const title = isApprove ? 'Aprovar pedido de análise' : 'Recusar pedido de análise';
  const ctaLabel = isApprove ? 'Aprovar e notificar CS' : 'Recusar e notificar CS';
  const canSubmit = comment.trim().length >= 5 && !busy;

  return (
    <Modal open onClose={onCancel} title={title}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
          O CS dono da campanha vai receber este comentário por email e ver na página da campanha.
          O comentário fica registrado permanentemente.
        </p>

        <div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
            Comentário <span style={{ color: 'var(--accent-red)' }}>*</span>
          </label>
          <Textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={5}
            placeholder={isApprove
              ? "Ex: Aprovado considerando o CPM atípico de R$ 0,73."
              : "Ex: Não vou considerar pois a meta de over não foi atingida."
            }
            autoFocus
          />
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
            {comment.trim().length < 5 ? 'Mínimo 5 caracteres' : `${comment.trim().length} caracteres`}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancelar</Button>
          <Button
            onClick={() => onConfirm(comment.trim())}
            disabled={!canSubmit}
            style={!isApprove ? { background: 'var(--accent-red, #f43f5e)', borderColor: 'var(--accent-red, #f43f5e)', color: 'white' } : undefined}
          >
            {busy ? 'Salvando…' : ctaLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
