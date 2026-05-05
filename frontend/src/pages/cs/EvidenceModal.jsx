import { useState } from 'react';
import { Sparkles, Link2, FileText, MessageSquare, Save, Trash2 } from 'lucide-react';
import { Modal } from '../../components/ui/Modal.jsx';
import Button from '../../components/ui/Button.jsx';
import { Input, Textarea } from '../../components/ui/Input.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { fmt } from '../../lib/format.js';
import './EvidenceModal.css';

/**
 * Modal pra CS submeter / editar / deletar evidência manual.
 *
 * Layout: explica claramente
 *   - O que é a regra
 *   - Quanto vale (em pct e R$)
 *   - O que precisa enviar (campos do payload)
 *   - Status atual (claimed/approved/rejected/not_claimed)
 *
 * Se já foi enviada, mostra histórico (quem revisou, notas, etc.).
 */
export default function EvidenceModal({ rule, campaign, onClose, onSaved }) {
  const existing = rule.breakdown?.evidence_id ? rule.breakdown : null;
  const isEditing = !!existing;
  const status = existing?.evidence_status;

  const [description, setDescription] = useState(existing?.description || '');
  const [linkUrl, setLinkUrl] = useState(existing?.link_url || '');
  const [notes, setNotes] = useState(existing?.notes || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const earnsBrl = campaign.revenue_net * (rule.bonus_pct_config || rule.effective_pct);
  const pct = rule.bonus_pct_config || rule.effective_pct;

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const payload = { description, link_url: linkUrl, notes };
      // TODO: chamar endpoints.createEvidence ou updateEvidence
      console.log('TODO: save evidence', { rule_id: rule.rule_id, payload });
      await new Promise(r => setTimeout(r, 600));
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Tem certeza que quer remover esta evidência?')) return;
    setSaving(true);
    try {
      // TODO: endpoints.deleteEvidence(existing.evidence_id)
      console.log('TODO: delete evidence', existing?.evidence_id);
      await new Promise(r => setTimeout(r, 400));
      onSaved?.();
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="md"
      title={rule.display_name}
      subtitle={`${campaign.client_name} · ${campaign.campaign_name}`}
      footer={
        <div className="evidence-modal__footer">
          {isEditing && status !== 'paid' && (
            <Button variant="danger" size="md" icon={Trash2} onClick={handleDelete} disabled={saving}>
              Remover
            </Button>
          )}
          <div style={{ flex: 1 }} />
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon={Save} onClick={handleSave} loading={saving}>
            {isEditing ? 'Salvar alterações' : 'Submeter evidência'}
          </Button>
        </div>
      }
    >
      <div className="evidence-modal">
        {/* Resumo da regra */}
        <div className="evidence-modal__summary">
          <div className="evidence-modal__summary-item">
            <span className="label">Vale</span>
            <span className="evidence-modal__pct mono">{fmt.pct(pct)}</span>
          </div>
          <div className="evidence-modal__summary-divider" />
          <div className="evidence-modal__summary-item">
            <span className="label">Equivalente em R$</span>
            <span className="evidence-modal__brl mono">{fmt.brl(earnsBrl)}</span>
          </div>
          <div className="evidence-modal__summary-divider" />
          <div className="evidence-modal__summary-item">
            <span className="label">Status</span>
            <StatusBadge status={status || 'not_claimed'} />
          </div>
        </div>

        {/* Histórico de revisão (se houver) */}
        {existing && status !== 'not_claimed' && (
          <div className="evidence-modal__history">
            {status === 'pending_review' && (
              <div className="evidence-modal__history-item">
                <Sparkles size={14} />
                <span>Aguardando revisão do admin</span>
              </div>
            )}
            {status === 'approved' && existing.reviewed_by && (
              <div className="evidence-modal__history-item evidence-modal__history-item--success">
                <Sparkles size={14} />
                <span>
                  Aprovada por <strong>{existing.reviewed_by}</strong>
                  {existing.reviewed_at && <> em {fmt.date(existing.reviewed_at)}</>}
                </span>
              </div>
            )}
            {status === 'rejected' && (
              <div className="evidence-modal__history-item evidence-modal__history-item--fail">
                <Sparkles size={14} />
                <span>
                  Rejeitada por <strong>{existing.reviewed_by}</strong>
                  {existing.review_notes && <>: "{existing.review_notes}"</>}
                </span>
              </div>
            )}
            <div className="evidence-modal__history-tip">
              Você pode editar e re-submeter — o status volta pra "Aguardando revisão".
            </div>
          </div>
        )}

        {/* Formulário */}
        <div className="evidence-modal__form">
          <Textarea
            label="Descrição do que foi feito"
            placeholder="Ex: Fizemos a apresentação do bench da Boticário com cases dos Q3 e Q4 de 2025, mostrando como o cliente cresceu 23% após adoção das features Tier 1..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            hint="Seja específico — o admin precisa entender contexto pra aprovar."
          />

          <Input
            label="Link de evidência"
            placeholder="https://docs.google.com/... ou https://drive.google.com/..."
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            prefix={<Link2 size={14} />}
            hint="Doc, slide, drive, gravação — qualquer link público dentro do workspace HYPR."
          />

          <Input
            label="Observações adicionais (opcional)"
            placeholder="Algo que o admin precisa saber..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />

          {error && (
            <div className="evidence-modal__error">⚠ {error}</div>
          )}
        </div>
      </div>
    </Modal>
  );
}

function StatusBadge({ status }) {
  const map = {
    not_claimed:    { variant: 'neutral', label: 'Não enviada' },
    claimed:        { variant: 'yellow',  label: 'Aguardando' },
    pending_review: { variant: 'yellow',  label: 'Aguardando' },
    approved:       { variant: 'green',   label: 'Aprovada' },
    rejected:       { variant: 'red',     label: 'Rejeitada' },
  };
  const cfg = map[status] || map.not_claimed;
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}
