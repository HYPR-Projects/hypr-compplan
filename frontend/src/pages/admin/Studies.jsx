import { useState, useEffect } from 'react';
import { Plus, Edit3, BookOpen, User, Info } from 'lucide-react';
import AppShell from '../../components/layout/AppShell.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import { Input, Textarea } from '../../components/ui/Input.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { endpoints, auth } from '../../lib/api.js';
import './Studies.css';

const VERSION = '2026';

export default function StudiesPage() {
  // Aba acessível por todos autenticados; mas só admin vê controles de escrita.
  const isAdmin = auth.getUser()?.role === 'admin';

  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState(null);

  function reload() {
    setError(null);
    endpoints.listStudies(VERSION)
      .then(d => setList(d.items || []))
      .catch(e => setError(e.message));
  }

  useEffect(() => { reload(); }, []);

  async function handleSave(body, editingId) {
    if (editingId) {
      await endpoints.updateStudy(editingId, body);
    } else {
      await endpoints.createStudy({ ...body, version_id: VERSION });
    }
    setShowAdd(false);
    setEditing(null);
    reload();
  }

  return (
    <AppShell>
      <header className="admin-page-header fade-up">
        <div>
          <h1 className="page-title">
            <BookOpen size={20} style={{ verticalAlign: 'middle', marginRight: 8 }} />
            Estudos
          </h1>
          <div className="page-subtitle">
            Catálogo de estudos sazonais. Quando um CP marca um estudo no checklist do Command,
            <strong> 0,30%</strong> da líquida da campanha vai pro <strong>autor do estudo</strong>.
          </div>
        </div>
        <Button onClick={() => setShowAdd(true)} icon={Plus}>
          Cadastrar estudo
        </Button>
      </header>

      <Card variant="info" className="studies-info fade-up">
        <div className="studies-info__icon">
          <Info size={18} />
        </div>
        <div>
          <strong>Como funciona</strong>
          <p>
            O <code>ID do estudo</code> é o que o CP vai ver no dropdown do Command quando
            preencher o checklist. Quando a campanha for atribuída a um estudo aqui,
            o autor recebe automaticamente o bônus de 0,30% sobre a líquida da campanha
            (independente de quem é o CS dono).
          </p>
          <p className="studies-info__note">
            <strong>Regra:</strong> 1 estudo por campanha. Se uma campanha tiver múltiplos estudos
            marcados, vale apenas o primeiro.
          </p>
        </div>
      </Card>

      {error && (
        <Card variant="warn"><strong>Erro:</strong> {error}</Card>
      )}

      {!list ? (
        <div className="empty-state">Carregando…</div>
      ) : list.length === 0 ? (
        <Card>
          <p className="card__subtitle">
            Nenhum estudo cadastrado. Clique em <strong>Cadastrar estudo</strong> pra começar.
          </p>
        </Card>
      ) : (
        <>
          <div className="cs-month-group__header">
            <span>Catálogo {VERSION}</span>
            <span className="cs-month-group__count">{list.length} estudos</span>
          </div>
          <div className="studies-grid">
            {list.map((s, i) => (
              <div
                key={s.id}
                className="study-card stagger"
                style={{
                  '--i': Math.min(i, 20),
                  cursor: isAdmin ? 'pointer' : 'default',
                }}
                onClick={isAdmin ? () => setEditing(s) : undefined}
              >
                <div className={`study-card__stripe is-${s.status || 'planned'}`}></div>
                <div className="study-card__main">
                  <div className="study-card__title-row">
                    <span className="study-card__title">{s.display_name}</span>
                    {s.status === 'completed' && <Badge variant="green">Publicado</Badge>}
                    {s.status === 'planned' && <Badge variant="neutral">Planejado</Badge>}
                    {s.status === 'archived' && <Badge variant="neutral">Arquivado</Badge>}
                  </div>
                  <div className="study-card__meta">
                    <code>{s.id}</code>
                  </div>
                  <div className="study-card__author">
                    <User size={12} /> Autor: <strong>{s.author_name || s.author_email || '—'}</strong>
                  </div>
                  {s.usage_count > 0 && (
                    <div className="study-card__usage">
                      Usado em <strong>{s.usage_count}</strong> {s.usage_count === 1 ? 'campanha' : 'campanhas'} este quarter
                    </div>
                  )}
                </div>
                {isAdmin && <Edit3 size={16} className="study-card__edit" />}
              </div>
            ))}
          </div>
        </>
      )}

      {(showAdd || editing) && (
        <StudyModal
          study={editing}
          onClose={() => { setShowAdd(false); setEditing(null); }}
          onSave={handleSave}
        />
      )}
    </AppShell>
  );
}

function StudyModal({ study, onClose, onSave }) {
  const isEdit = !!study;
  const [form, setForm] = useState({
    id: study?.id || '',
    display_name: study?.display_name || '',
    author_email: study?.author_email || '',
    status: study?.status || 'planned',
    link: study?.link || '',
    notes: study?.notes || '',
  });
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  async function handleSubmit() {
    if (!form.display_name.trim()) {
      setErr('Nome do estudo é obrigatório');
      return;
    }
    if (!isEdit && !form.id.trim()) {
      setErr('ID do estudo é obrigatório');
      return;
    }
    if (!form.author_email.trim()) {
      setErr('Email do autor é obrigatório');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const body = {
        display_name: form.display_name.trim(),
        author_email: form.author_email.trim().toLowerCase(),
        status: form.status,
        link: form.link.trim() || null,
        notes: form.notes.trim() || null,
      };
      if (!isEdit) body.id = form.id.trim();
      await onSave(body, isEdit ? study.id : null);
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={true} title={isEdit ? `Editar: ${study.display_name}` : 'Cadastrar estudo'} onClose={onClose}>
      <div className="form-stack">
        {!isEdit && (
          <div>
            <label className="form-label">
              ID do estudo *
              <small className="form-label__hint">
                ID único que o CP vê no Command. Use snake_case, ex: <code>st_black_friday_2026</code>
              </small>
            </label>
            <Input
              placeholder="st_black_friday_2026"
              value={form.id}
              onChange={(e) => setForm({ ...form, id: e.target.value })}
            />
          </div>
        )}

        <div>
          <label className="form-label">
            Nome de exibição *
            <small className="form-label__hint">Aparece no dropdown do Command e nos relatórios</small>
          </label>
          <Input
            placeholder="Black Friday 2026"
            value={form.display_name}
            onChange={(e) => setForm({ ...form, display_name: e.target.value })}
          />
        </div>

        <div>
          <label className="form-label">
            Email do autor *
            <small className="form-label__hint">
              Pessoa que recebe os 0,30% de bônus por campanha que usar o estudo
            </small>
          </label>
          <Input
            placeholder="beatriz.severine@hypr.mobi"
            value={form.author_email}
            onChange={(e) => setForm({ ...form, author_email: e.target.value })}
          />
        </div>

        <div>
          <label className="form-label">Status</label>
          <select
            className="cs-select"
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
            style={{ width: '100%' }}
          >
            <option value="planned">Planejado</option>
            <option value="completed">Publicado</option>
            <option value="archived">Arquivado</option>
          </select>
        </div>

        <div>
          <label className="form-label">Link do estudo (opcional)</label>
          <Input
            placeholder="https://drive.google.com/..."
            value={form.link}
            onChange={(e) => setForm({ ...form, link: e.target.value })}
          />
        </div>

        <div>
          <label className="form-label">Notas (opcional)</label>
          <Textarea
            rows={2}
            placeholder="Co-autor: Mariana"
            value={form.notes}
            onChange={(e) => setForm({ ...form, notes: e.target.value })}
          />
        </div>

        {err && <div className="form-error">{err}</div>}

        <div className="modal__footer">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={saving}>
            {saving ? 'Salvando…' : (isEdit ? 'Salvar' : 'Cadastrar')}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
