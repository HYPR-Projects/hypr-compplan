import { useState } from 'react';
import { CheckCircle2, XCircle, ExternalLink, Clock, Sparkles } from 'lucide-react';
import AppShell from '../../components/layout/AppShell.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Avatar from '../../components/ui/Avatar.jsx';
import { Textarea } from '../../components/ui/Input.jsx';
import { Modal, EmptyState } from '../../components/ui/Modal.jsx';
import { fmt } from '../../lib/format.js';
import './EvidencesReview.css';

// Mock — em prod: endpoints.pendingEvidences()
const MOCK_PENDING = [
  {
    id: 'ev_001',
    cs_email: 'joao.buzolin@hypr.mobi',
    cs_name: 'João Buzolin',
    short_token: 'CYTX53',
    client_name: 'Boticário',
    campaign_name: 'Tap to Map - Campanha Q1',
    rule_id: 'am_analytics_2026',
    rule_display_name: 'Visão analytics',
    rule_category: 'account_mgmt',
    bonus_pct: 0.0020,
    revenue_net: 709495,
    earns_brl: 709495 * 0.0020,
    status: 'claimed',
    claimed_at: '2026-04-18T14:22:00Z',
    evidence_payload: {
      description: 'Construímos um dashboard com cohorte de aquisição por feature, mostrando que Tap to Map gera 3.2× mais conversão vs creative padrão. Apresentado em call com o time da Boticário no dia 15/04.',
      link_url: 'https://docs.google.com/presentation/d/abc123/edit',
      notes: 'Cliente pediu pra rodar uma segunda análise focada em região Sul.',
    },
  },
  {
    id: 'ev_002',
    cs_email: 'thiago.nascimento@hypr.mobi',
    cs_name: 'Thiago Nascimento',
    short_token: 'P4LW2W',
    client_name: 'PepsiCo',
    campaign_name: 'Quaker Inverno',
    rule_id: 'am_relatorios_2026',
    rule_display_name: 'Relatórios entregues no prazo',
    rule_category: 'account_mgmt',
    bonus_pct: 0.0010,
    revenue_net: 350574,
    earns_brl: 350574 * 0.0010,
    status: 'claimed',
    claimed_at: '2026-04-19T09:45:00Z',
    evidence_payload: {
      description: 'Entregue daily, weekly e closing report dentro do prazo combinado em todos os 3 ciclos da campanha.',
      link_url: 'https://drive.google.com/drive/folders/xyz789',
      notes: '',
    },
  },
];

export default function AdminEvidencesReview() {
  const [items, setItems] = useState(MOCK_PENDING);
  const [reviewing, setReviewing] = useState(null);

  const handleReview = (decision, notes) => {
    // TODO: endpoints.approveEvidence ou rejectEvidence
    setItems((cur) => cur.filter(it => it.id !== reviewing.id));
    setReviewing(null);
  };

  return (
    <AppShell pendingEvidences={items.length}>
      <header className="page-header fade-up">
        <div>
          <h1 className="page-title">Evidências aguardando revisão</h1>
          <div className="page-subtitle">
            <span>{items.length} {items.length === 1 ? 'pendente' : 'pendentes'}</span>
            <span className="page-subtitle__sep">·</span>
            <span>Aprove ou rejeite com motivo claro pra que o CS possa corrigir</span>
          </div>
        </div>
      </header>

      {items.length === 0 ? (
        <Card>
          <EmptyState
            icon={Sparkles}
            title="Tudo em dia!"
            description="Não há evidências pendentes de revisão no momento. Quando os CSs submeterem novos claims eles aparecem aqui."
          />
        </Card>
      ) : (
        <div className="evidence-review-list fade-up">
          {items.map((it, i) => (
            <EvidenceCard
              key={it.id}
              item={it}
              onReview={() => setReviewing(it)}
              i={i}
            />
          ))}
        </div>
      )}

      {reviewing && (
        <ReviewModal
          item={reviewing}
          onClose={() => setReviewing(null)}
          onApprove={(notes) => handleReview('approve', notes)}
          onReject={(notes) => handleReview('reject', notes)}
        />
      )}
    </AppShell>
  );
}

function EvidenceCard({ item, onReview, i }) {
  return (
    <Card className="evidence-card stagger" style={{ '--i': i }} interactive onClick={onReview}>
      <div className="evidence-card__header">
        <div className="evidence-card__cs">
          <Avatar name={item.cs_name} size="sm" />
          <div>
            <div className="evidence-card__cs-name">{item.cs_name}</div>
            <div className="evidence-card__time">
              <Clock size={11} /> {fmt.date(item.claimed_at)}
            </div>
          </div>
        </div>
        <div className="evidence-card__amount">
          <span className="label">Vale</span>
          <span className="evidence-card__amount-value mono">{fmt.brl(item.earns_brl)}</span>
          <span className="evidence-card__amount-pct mono">({fmt.pct(item.bonus_pct)})</span>
        </div>
      </div>

      <div className="evidence-card__rule">
        <Badge variant="cyan">{item.rule_category.replace('_', ' ')}</Badge>
        <span className="evidence-card__rule-name">{item.rule_display_name}</span>
      </div>

      <div className="evidence-card__campaign">
        <span className="evidence-card__campaign-client">{item.client_name}</span>
        <Badge variant="neutral">{item.short_token}</Badge>
        <span className="evidence-card__campaign-name">{item.campaign_name}</span>
      </div>

      <p className="evidence-card__description">
        {item.evidence_payload.description}
      </p>

      {item.evidence_payload.link_url && (
        <a
          href={item.evidence_payload.link_url}
          target="_blank"
          rel="noopener noreferrer"
          className="evidence-card__link"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink size={12} /> {item.evidence_payload.link_url.replace(/^https?:\/\//, '')}
        </a>
      )}

      <div className="evidence-card__cta">
        <Button variant="primary" size="sm">Revisar agora</Button>
      </div>
    </Card>
  );
}

function ReviewModal({ item, onClose, onApprove, onReject }) {
  const [notes, setNotes] = useState('');

  return (
    <Modal
      open
      onClose={onClose}
      title={item.rule_display_name}
      subtitle={`${item.cs_name} · ${item.client_name} (${item.short_token})`}
      size="lg"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Voltar sem decidir</Button>
          <div style={{ flex: 1 }} />
          <Button variant="danger" icon={XCircle} onClick={() => onReject(notes)} disabled={!notes.trim()}>
            Rejeitar
          </Button>
          <Button variant="primary" icon={CheckCircle2} onClick={() => onApprove(notes)}>
            Aprovar
          </Button>
        </>
      }
    >
      <div className="review-modal">
        <div className="review-modal__amount-box">
          <div className="review-modal__amount-item">
            <span className="label">Pct da regra</span>
            <span className="mono review-modal__pct">{fmt.pct(item.bonus_pct)}</span>
          </div>
          <div className="review-modal__amount-divider" />
          <div className="review-modal__amount-item">
            <span className="label">Receita líquida</span>
            <span className="mono">{fmt.brl(item.revenue_net)}</span>
          </div>
          <div className="review-modal__amount-divider" />
          <div className="review-modal__amount-item">
            <span className="label">Bônus se aprovar</span>
            <span className="mono review-modal__earns">{fmt.brl(item.earns_brl)}</span>
          </div>
        </div>

        <div className="review-modal__section">
          <h4>O que o CS descreveu</h4>
          <p className="review-modal__description">{item.evidence_payload.description}</p>
        </div>

        {item.evidence_payload.link_url && (
          <div className="review-modal__section">
            <h4>Evidência</h4>
            <a
              href={item.evidence_payload.link_url}
              target="_blank"
              rel="noopener noreferrer"
              className="review-modal__link"
            >
              <ExternalLink size={14} /> Abrir link em nova aba
              <span className="review-modal__url">{item.evidence_payload.link_url}</span>
            </a>
          </div>
        )}

        {item.evidence_payload.notes && (
          <div className="review-modal__section">
            <h4>Observações do CS</h4>
            <p className="review-modal__description">{item.evidence_payload.notes}</p>
          </div>
        )}

        <Textarea
          label="Suas notas (obrigatório se rejeitar)"
          placeholder="Explique brevemente sua decisão. Em caso de rejeição, oriente o CS sobre o que precisa pra reenviar."
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />
      </div>
    </Modal>
  );
}
