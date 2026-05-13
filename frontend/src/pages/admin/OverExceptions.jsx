import { useState, useEffect } from 'react';
import { Plus, Trash2, Shield, Info, AlertCircle } from 'lucide-react';
import AppShell from '../../components/layout/AppShell.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import { Input, Textarea } from '../../components/ui/Input.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { endpoints } from '../../lib/api.js';
import { fmt } from '../../lib/format.js';
import './OverExceptions.css';

export default function OverExceptionsPage() {
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [toDelete, setToDelete] = useState(null);

  function reload() {
    setError(null);
    endpoints.listOverExceptions()
      .then(d => setList(d.items || []))
      .catch(e => setError(e.message));
  }

  useEffect(() => { reload(); }, []);

  async function handleAdd(form) {
    await endpoints.addOverException({
      client_name: form.client_name,
      notes: form.notes || null,
    });
    setShowAdd(false);
    reload();
  }

  async function handleDelete(clientName) {
    try {
      await endpoints.removeOverException(clientName);
      setToDelete(null);
      reload();
    } catch (e) {
      setError(e.message);
    }
  }

  return (
    <AppShell>
      <header className="admin-page-header fade-up">
        <div>
          <h1 className="page-title">Exceções de OVER</h1>
          <div className="page-subtitle">
            Clientes que calculam <strong>OVER</strong> usando impressões totais (em vez de viewable).
            Aplicável a todas as campanhas do cliente.
          </div>
        </div>
        <Button onClick={() => setShowAdd(true)} icon={Plus}>
          Adicionar cliente
        </Button>
      </header>

      <Card variant="info" className="fade-up over-exc-info">
        <div className="over-exc-info__icon">
          <Info size={18} />
        </div>
        <div>
          <div className="over-exc-info__title">Como funciona</div>
          <p>
            Para os clientes listados aqui, o <strong>numerador</strong> do cálculo
            de OVER usa <code>impressions</code> em vez de <code>viewable_impressions</code>.
            Match é case-insensitive com o <code>client_name</code> do checklist.
          </p>
          <div className="over-exc-info__formula">
            OVER = (impressões totais / contratado − 1) × 100
          </div>
          <p className="over-exc-info__note">
            <strong>Tudo o mais continua igual:</strong> eCPM, CTR, limites (Com ABS / Sem ABS),
            invalidação de setup &mdash; nenhum desses é afetado. Esta é apenas uma exceção pontual
            no cálculo de OVER.
          </p>
        </div>
      </Card>

      {error && (
        <Card variant="warn" className="over-exc-error">
          <AlertCircle size={16} />
          <strong>Erro:</strong> {error}
        </Card>
      )}

      {!list ? (
        <div className="empty-state">Carregando…</div>
      ) : list.length === 0 ? (
        <Card>
          <p className="card__subtitle">
            Nenhum cliente cadastrado. Clique em <strong>Adicionar cliente</strong> pra começar.
          </p>
        </Card>
      ) : (
        <>
          <div className="cs-month-group__header">
            <span>Clientes cadastrados</span>
            <span className="cs-month-group__count">{list.length} {list.length === 1 ? 'cliente' : 'clientes'}</span>
          </div>
          <div className="over-exc-grid">
            {list.map((c, i) => (
              <div key={c.client_name} className="over-exc-card stagger" style={{ '--i': Math.min(i, 20) }}>
                <div className="over-exc-card__main">
                  <div className="over-exc-card__title">
                    <Shield size={14} />
                    {c.client_name}
                  </div>
                  {c.notes && <div className="over-exc-card__notes">{c.notes}</div>}
                  {c.added_by && (
                    <div className="over-exc-card__meta">
                      Adicionado por {c.added_by}
                      {c.added_at && ` · ${fmt.date(c.added_at)}`}
                    </div>
                  )}
                </div>
                <button
                  className="over-exc-card__delete"
                  onClick={() => setToDelete(c)}
                  title="Remover"
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      {showAdd && (
        <AddModal onClose={() => setShowAdd(false)} onSave={handleAdd} />
      )}

      {toDelete && (
        <Modal
          title="Remover exceção?"
          onClose={() => setToDelete(null)}
        >
          <p>
            Tem certeza que quer remover <strong>{toDelete.client_name}</strong>?
            As campanhas desse cliente voltam a calcular OVER usando viewable_impressions.
          </p>
          <div className="modal__footer">
            <Button variant="ghost" onClick={() => setToDelete(null)}>Cancelar</Button>
            <Button variant="danger" onClick={() => handleDelete(toDelete.client_name)}>
              Remover
            </Button>
          </div>
        </Modal>
      )}
    </AppShell>
  );
}

function AddModal({ onClose, onSave }) {
  const [form, setForm] = useState({ client_name: '', notes: '' });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  async function handleSubmit() {
    if (!form.client_name.trim()) {
      setErr('Nome do cliente é obrigatório');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      await onSave(form);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal title="Adicionar exceção de OVER" onClose={onClose}>
      <div className="form-stack">
        <div>
          <label className="form-label">
            Nome do cliente *
            <small className="form-label__hint">
              Deve bater (case-insensitive) com o <code>client_name</code> dos checklists.
              Ex: <code>Pepsico</code>, <code>Amazon</code>.
            </small>
          </label>
          <Input
            placeholder="Pepsico"
            value={form.client_name}
            onChange={(e) => setForm({ ...form, client_name: e.target.value })}
          />
        </div>

        <div>
          <label className="form-label">Notas (opcional)</label>
          <Textarea
            rows={3}
            placeholder="Cliente avalia entrega por impressões totais (regra contratual)"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>

        {err && <div className="form-error">{err}</div>}

        <div className="modal__footer">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Salvando…' : 'Adicionar'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
