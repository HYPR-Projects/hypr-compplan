import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  RefreshCw, CheckCircle2, DollarSign, ChevronRight,
} from 'lucide-react';
import AppShell from '../../components/layout/AppShell.jsx';
import { Card, KpiCard } from '../../components/ui/Card.jsx';
import { Badge, StatusDot } from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Avatar from '../../components/ui/Avatar.jsx';
import { Select } from '../../components/ui/Input.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { fmt, currentQuarter, recentQuarters } from '../../lib/format.js';
import { endpoints } from '../../lib/api.js';
import './Quarter.css';

/**
 * Workflow:
 *   draft → (admin "Aprovar") → approved → (admin "Marcar como pago") → paid
 * Admin pode "Recalcular" a qualquer momento (a partir de evidências aprovadas).
 */
export default function AdminQuarter() {
  const navigate = useNavigate();
  const [selectedQuarter, setSelectedQuarter] = useState(currentQuarter());
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [computing, setComputing] = useState(false);
  const [confirmAction, setConfirmAction] = useState(null);

  async function load() {
    try {
      setError(null);
      const d = await endpoints.adminQuarter(selectedQuarter);
      setData(d);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
  }, [selectedQuarter]);

  const handleCompute = async () => {
    try {
      setComputing(true);
      await endpoints.computeQuarter(selectedQuarter);
      await load();
    } catch (e) {
      alert(`Erro ao recalcular: ${e.message}`);
    } finally {
      setComputing(false);
    }
  };

  const handleConfirm = async () => {
    try {
      const { kind, summary } = confirmAction;
      if (kind === 'approve') {
        await endpoints.approveQuarter(summary.quarter, summary.cs_email);
      } else if (kind === 'mark_paid') {
        await endpoints.markPaidQuarter(summary.quarter, summary.cs_email);
      }
      setConfirmAction(null);
      await load();
    } catch (e) {
      alert(`Erro: ${e.message}`);
    }
  };

  if (error) {
    return (
      <AppShell>
        <Card>
          <h2 className="page-title">Erro ao carregar quarter</h2>
          <p className="card__subtitle">{error}</p>
        </Card>
      </AppShell>
    );
  }

  const summaries = data?.items || [];
  const totalGross = summaries.reduce((s, x) => s + (Number(x.bonus_gross_brl) || 0), 0);
  const totalNet = summaries.reduce((s, x) => s + (Number(x.bonus_net_brl) || 0), 0);
  const approved = summaries.filter(s => s.status === 'approved' || s.status === 'paid').length;

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
        <KpiCard label="Bônus bruto total" value={fmt.brlCompact(totalGross)} />
        <KpiCard label="Bônus líquido total" value={fmt.brlCompact(totalNet)} status="cyan" />
        <KpiCard label="Aprovados" value={approved} status="green" />
        <KpiCard label="CSs no quarter" value={summaries.length} />
      </section>

      <section className="fade-up" style={{ '--i': 4 }}>
        <header className="section-header">
          <h2 className="section-title">Resumo por CS</h2>
        </header>

        {!data && (
          <div className="empty-state">Carregando…</div>
        )}

        {data && summaries.length === 0 && (
          <Card>
            <p className="card__subtitle">
              Nenhum cálculo ainda pra <strong>{selectedQuarter}</strong>. Clique em <strong>Recalcular tudo</strong> pra rodar o cálculo de bônus.
            </p>
          </Card>
        )}

        {summaries.length > 0 && (
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
                summary={{ ...s, quarter: selectedQuarter }}
                i={i}
                onApprove={() => setConfirmAction({ kind: 'approve', summary: { ...s, quarter: selectedQuarter } })}
                onMarkPaid={() => setConfirmAction({ kind: 'mark_paid', summary: { ...s, quarter: selectedQuarter } })}
                onView={() => navigate(`/admin/cs/${encodeURIComponent(s.cs_email)}/${selectedQuarter}`)}
              />
            ))}
          </div>
        )}
      </section>

      {confirmAction && (
        <ConfirmModal action={confirmAction} onClose={() => setConfirmAction(null)} onConfirm={handleConfirm} />
      )}
    </AppShell>
  );
}

function QuarterRow({ summary, onApprove, onMarkPaid, onView, i }) {
  const status = summary.status || 'draft';
  return (
    <div className="quarter-row stagger" style={{ '--i': i }}>
      <div>
        <StatusDot
          status={
            status === 'paid' ? 'green'
            : status === 'approved' ? 'cyan'
            : 'gray'
          }
          size="sm"
        />
      </div>

      <div className="quarter-row__cs">
        <Avatar name={summary.cs_name || summary.cs_email} size="sm" />
        <div className="quarter-row__cs-name">{summary.cs_name || summary.cs_email}</div>
      </div>

      <div>
        <Badge variant={
          status === 'paid' ? 'green'
          : status === 'approved' ? 'cyan'
          : status === 'pending_approval' ? 'yellow'
          : 'neutral'
        }>
          {status === 'paid' ? 'Pago'
            : status === 'approved' ? 'Aprovado'
            : status === 'pending_approval' ? 'Aguardando'
            : 'Em rascunho'}
        </Badge>
      </div>

      <div className="mono quarter-row__num">{summary.campaigns_count || 0}</div>
      <div className="mono quarter-row__num">{fmt.brl(Number(summary.bonus_gross_brl) || 0)}</div>
      <div className="mono quarter-row__num quarter-row__num--dim">
        −{fmt.brl(Number(summary.salary_deduction_brl) || 0)}
      </div>
      <div className="mono quarter-row__num quarter-row__num--cyan">
        {fmt.brl(Number(summary.bonus_net_brl) || 0)}
      </div>

      <div className="quarter-row__actions">
        {status === 'draft' && (
          <Button variant="secondary" size="sm" onClick={onApprove}>Aprovar</Button>
        )}
        {status === 'approved' && (
          <Button variant="primary" size="sm" onClick={onMarkPaid}>
            <DollarSign size={14} /> Pagar
          </Button>
        )}
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
        <strong>{fmt.brl(Number(action.summary.bonus_net_brl) || 0)}</strong> para{' '}
        <strong>{action.summary.cs_name || action.summary.cs_email}</strong> referente a {action.summary.quarter}.
      </p>
      <p style={{ marginTop: 'var(--space-3)', color: 'var(--text-tertiary)', fontSize: 'var(--text-sm)' }}>
        {isApprove
          ? 'Após aprovar, o snapshot fica imutável até nova recalculada.'
          : 'Após marcar como pago, todos os claims do quarter ficam congelados.'}
      </p>
    </Modal>
  );
}
