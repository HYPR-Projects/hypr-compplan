import { useState } from 'react';
import { Plus, Trash2, Shield } from 'lucide-react';
import AppShell from '../../components/layout/AppShell.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import { Input, Textarea } from '../../components/ui/Input.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import './Team.css';
import './AbsClients.css';

// Mock — em prod: endpoints.listAbsClients()
const MOCK_ABS = [
  { id: 'abs_colgate',     advertiser_id: '12345', client_name: 'Colgate',         notes: 'Acordo desde 2024' },
  { id: 'abs_mondelez',    advertiser_id: '12346', client_name: 'Mondelez',        notes: '' },
  { id: 'abs_boticario',   advertiser_id: '12347', client_name: 'Boticário',       notes: '' },
  { id: 'abs_santander',   advertiser_id: '12348', client_name: 'Santander',       notes: '' },
  { id: 'abs_diageo',      advertiser_id: '12349', client_name: 'Diageo',          notes: '' },
  { id: 'abs_kraft',       advertiser_id: '12350', client_name: 'Kraft-Heinz',     notes: '' },
  { id: 'abs_mercedes',    advertiser_id: '12351', client_name: 'Mercedes',        notes: '' },
  { id: 'abs_reckitt',     advertiser_id: '12352', client_name: 'Reckitt',         notes: '' },
  { id: 'abs_amazon_ws',   advertiser_id: '12353', client_name: 'Amazon (WS)',     notes: 'Conta Web Services' },
  { id: 'abs_amazon_xcm',  advertiser_id: '12354', client_name: 'Amazon (XCM)',    notes: '' },
  { id: 'abs_unilever',    advertiser_id: '12355', client_name: 'Unilever',        notes: '' },
  { id: 'abs_uber',        advertiser_id: '12356', client_name: 'Uber',            notes: '' },
  { id: 'abs_jde',         advertiser_id: '51004515', client_name: 'JDE',          notes: 'advertiser_id placeholder' },
  { id: 'abs_kenvue',      advertiser_id: '51004516', client_name: 'Kenvue',       notes: 'advertiser_id placeholder' },
  { id: 'abs_pepsico',     advertiser_id: '12359', client_name: 'PepsiCo',         notes: '' },
];

export default function AdminAbsClients() {
  const [items, setItems] = useState(MOCK_ABS);
  const [adding, setAdding] = useState(false);

  return (
    <AppShell>
      <header className="page-header fade-up">
        <div>
          <h1 className="page-title">Clientes ABS</h1>
          <div className="page-subtitle">
            <span>{items.length} clientes com acordo ABS</span>
            <span className="page-subtitle__sep">·</span>
            <span style={{ color: 'var(--text-tertiary)' }}>
              ABS afeta thresholds de otimização (eCPM mais flexível, CTR mais flexível)
            </span>
          </div>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>
          Adicionar cliente ABS
        </Button>
      </header>

      <Card className="fade-up" style={{ '--i': 1 }}>
        <div className="abs-table">
          <div className="abs-table__head">
            <span>Cliente</span>
            <span>Advertiser ID</span>
            <span>Notas</span>
            <span></span>
          </div>
          {items.map((it, i) => (
            <div key={it.id} className="abs-row stagger" style={{ '--i': i }}>
              <div className="abs-row__client">
                <Shield size={14} style={{ color: 'var(--brand)' }} />
                {it.client_name}
              </div>
              <div className="mono abs-row__id">{it.advertiser_id}</div>
              <div className="abs-row__notes">{it.notes || <span className="abs-row__notes-empty">—</span>}</div>
              <div>
                <button
                  className="abs-row__delete"
                  onClick={() => {
                    if (confirm(`Remover ${it.client_name} dos clientes ABS?`)) {
                      setItems(its => its.filter(x => x.id !== it.id));
                    }
                  }}
                  title="Remover"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </Card>

      {adding && (
        <AbsModal
          onClose={() => setAdding(false)}
          onSave={(data) => {
            setItems(its => [...its, { ...data, id: `abs_${Date.now()}` }]);
            setAdding(false);
          }}
        />
      )}
    </AppShell>
  );
}

function AbsModal({ onClose, onSave }) {
  const [form, setForm] = useState({ client_name: '', advertiser_id: '', notes: '' });
  return (
    <Modal
      open
      onClose={onClose}
      title="Adicionar cliente ABS"
      subtitle="O advertiser_id é o ID do cliente no Command/HYPR Sales Center"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={() => onSave(form)} disabled={!form.client_name || !form.advertiser_id}>
            Adicionar
          </Button>
        </>
      }
    >
      <div className="member-form">
        <Input label="Nome do cliente" value={form.client_name} onChange={(e) => setForm({ ...form, client_name: e.target.value })} />
        <Input label="Advertiser ID" value={form.advertiser_id} onChange={(e) => setForm({ ...form, advertiser_id: e.target.value })} hint="Numérico — bate com hypr_sales_center.advertisers.id" />
        <Textarea label="Notas (opcional)" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} rows={2} />
      </div>
    </Modal>
  );
}
