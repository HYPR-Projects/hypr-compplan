import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Calendar, RefreshCw, CheckCircle2, DollarSign,
  AlertCircle, ChevronRight, Sparkles,
} from 'lucide-react';
import AppShell from '../../components/layout/AppShell.jsx';
import { Card, KpiCard } from '../../components/ui/Card.jsx';
import { Badge, StatusDot } from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Avatar from '../../components/ui/Avatar.jsx';
import { Select } from '../../components/ui/Input.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { fmt, currentQuarter, recentQuarters } from '../../lib/format.js';
import { MOCK_TEAM_OVERVIEW } from '../../lib/mockData.js';
import './Quarter.css';

/**
 * Workflow do quarter:
 *   draft → (admin "Aprovar todos") → pending_approval
 *        → (admin "Aprovar" cada CS individualmente) → approved
 *        → (admin "Marcar como pago") → paid
 *
 * Admin pode "Recalcular" a qualquer momento (recompute snapshot a partir dos
 * dados frescos do BQ + evidências aprovadas).
 */
export default function AdminQuarter() {
  const navigate = useNavigate();
  const [selectedQuarter, setSelectedQuarter] = useState(currentQuarter());
  const [computing, setComputing] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);

  // Mock — em prod vem de endpoints.adminQuarter(quarter)
  const summaries = MOCK_TEAM_OVERVIEW.map((cs) => ({
    cs_email: cs.email,
    cs_name: cs.name,
    quarter: selectedQuarter,
    status: cs.email === 'beatriz.severine@hypr.mobi' ? 'approved'
          : cs.email === 'isaac.lobo@hypr.mobi' ? 'pending_approval'
          : 'draft',
    bonus_gross_brl: cs.bonus_q1_brl,
    salary_deduction_brl: cs.current_salary * 2,
    bonus_net_brl: Math.max(0, cs.bonus_q1_brl - (cs.current_salary * 2)),
    campaigns_count: cs.campaigns_active,
    pending_claims: cs.pending_claims,
    last_computed_at: '2026-04-20T18:30:00Z',
  }));

  const totalGross = summaries.reduce((s, x) => s + x.bonus_gross_brl, 0);
  const totalNet = summaries.reduce((s, x) => s + x.bonus_net_brl, 0);
  const blocked = summaries.filter(s => s.pending_claims > 0).length;

  const handleCompute = async () => {
    setComputing(true);
    // TODO: endpoints.computeQuarter(selectedQuarter)
    await new Promise(r => setTimeout(r, 1200));
    setComputing(false);
  };

  return (
    <AppShell>
      <header className="page-header fade-up">
        <div>
          <h1 className="page-title">Gestão do quarter</h1>
          <div className="page-subtitle">
            <span>Compute · revise · aprove · libere pagamento</span>
          </div>
        </div>

        <div className="quarter__controls">
          <Select
            value={selectedQuarter}
            onChange={(e) => setSelectedQuarter(e.target.value)}
          >
            {recentQuarters(8).map((q) => <option key={q} value={q}>{q}</option>)}
          </Select>
          <Button variant="secondary" icon={RefreshCw} onClick={handleCompute} loading={computing}>
            Recalcular tudo
          </Button>
        </div>
      </header>

      <section className="kpi-row">
        <KpiCard
          label="Bônus bruto total"
          value={fmt.brlCompact(totalGross)}
        />
        <KpiCard
          label="Bônus líquido total"
          value={fmt.brlCompact(totalNet)}
          status="cyan"
        />
        <KpiCard
          label="Aprovados"
          value={summaries.filter(s => s.status === 'approved').length}
          status="green"
        />
        <KpiCard
          label="Bloqueios"
          value={blocked}
          status={blocked > 0 ? 'yellow' : 'green'}
        />
      </section>

      <section className="fade-up" style={{ '--i': 4 }}>
        <header className="section-header">
          <h2 className="section-title">Resumo por CS</h2>
          <span className="page-subtitle__sep" style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>
            Última recalculada: há 14 horas
          </span>
        </header>

        <div className="quarter-table">
          <div className="quarter-table__head">
            <span></span>
            <span>CS</span>
            <span>Status</span>
            <span style={{ textAlign: 'right' }}>Camp.</span>
            <span style={{ textAlign: 'right' }}>Bruto</span>
            <span style={{ textAlign: 'right' }}>Desconto</span>
            <span style={{ textAlign: 'right' }}>Líquido</span>
            <span></span>
          </div>

          {summaries.map((s, i) => (
            <QuarterRow
              key={s.cs_email}
              summary={s}
              i={i}
              onApprove={() => setConfirmAction({ kind: 'approve', summary: s })}
              onMarkPaid={() => setConfirmAction({ kind: 'mark_paid', summary: s })}
              onView={() => navigate(`/admin/cs/${encodeURIComponent(s.cs_email)}/${s.quarter}`)}
            />
          ))}
        </div>

        <div className="quarter__bulk">
          <p className="quarter__bulk-tip">
            Quando todos os claims forem revisados, você pode aprovar todos os CSs
            de uma vez. Após aprovados, eles ficam prontos pra liberação no RH.
          </p>
          <div className="quarter__bulk-actions">
            <Button variant="secondary" icon={CheckCircle2}>
              Aprovar todos elegíveis
            </Button>
            <Button variant="primary" icon={DollarSign}>
              Marcar quarter como pago
            </Button>
          </div>
        </div>
      </section>

      {confirmAction && (
        <ConfirmModal
          action={confirmAction}
          onClose={() => setConfirmAction(null)}
          onConfirm={() => {
            // TODO: endpoints.approveQuarter / markPaidQuarter
            setConfirmAction(null);
          }}
        />
      )}
    </AppShell>
  );
}

function QuarterRow({ summary, onApprove, onMarkPaid, onView, i }) {
  const blocked = summary.pending_claims > 0;

  return (
    <div className="quarter-row stagger" style={{ '--i': i }}>
      <div>
        <StatusDot
          status={
            summary.status === 'paid' ? 'green'
            : summary.status === 'approved' ? 'cyan'
            : blocked ? 'yellow' : 'gray'
          }
          size="sm"
        />
      </div>

      <div className="quarter-row__cs">
        <Avatar name={summary.cs_name} size="sm" />
        <div className="quarter-row__cs-name">{summary.cs_name}</div>
      </div>

      <div>
        <Badge variant={
          summary.status === 'paid' ? 'green'
          : summary.status === 'approved' ? 'cyan'
          : summary.status === 'pending_approval' ? 'yellow'
          : 'neutral'
        }>
          {summary.status === 'paid' ? 'Pago'
            : summary.status === 'approved' ? 'Aprovado'
            : summary.status === 'pending_approval' ? 'Aguardando'
            : 'Em rascunho'}
        </Badge>
        {blocked && <Badge variant="red" className="quarter-row__blocked">{summary.pending_claims} blocks</Badge>}
      </div>

      <div className="mono quarter-row__num">{summary.campaigns_count}</div>
      <div className="mono quarter-row__num">{fmt.brl(summary.bonus_gross_brl)}</div>
      <div className="mono quarter-row__num quarter-row__num--dim">−{fmt.brl(summary.salary_deduction_brl)}</div>
      <div className="mono quarter-row__num quarter-row__num--cyan">{fmt.brl(summary.bonus_net_brl)}</div>

      <div className="quarter-row__actions">
        <button className="quarter-row__view" onClick={onView}>
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}

function ConfirmModal({ action, onClose, onConfirm }) {
  const isApprove = action.kind === 'approve';
  return (
    <Modal
      open
      onClose={onClose}
      title={isApprove ? 'Aprovar bônus' : 'Marcar como pago'}
      size="sm"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={onConfirm}>
            Confirmar {isApprove ? 'aprovação' : 'pagamento'}
          </Button>
        </>
      }
    >
      <p>
        Você está prestes a {isApprove ? 'aprovar o bônus' : 'marcar como pago'}{' '}
        <strong>{fmt.brl(action.summary.bonus_net_brl)}</strong> para{' '}
        <strong>{action.summary.cs_name}</strong> referente a {action.summary.quarter}.
      </p>
      <p style={{ marginTop: 'var(--space-3)', color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>
        {isApprove
          ? 'Após aprovar, o snapshot fica imutável até a próxima recalculada manual.'
          : 'Após marcar como pago, todos os claims do quarter ficam congelados — CS não consegue mais editar.'}
      </p>
    </Modal>
  );
}
