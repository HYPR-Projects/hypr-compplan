import { useState } from 'react';
import { Plus, Trash2, ArrowRight, Heart } from 'lucide-react';
import AppShell from '../../components/layout/AppShell.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Avatar from '../../components/ui/Avatar.jsx';
import { Select } from '../../components/ui/Input.jsx';
import { Modal, EmptyState } from '../../components/ui/Modal.jsx';
import { fmt } from '../../lib/format.js';
import './Team.css';

const MOCK_MENTORSHIPS = [
  {
    id: 'mt_001',
    mentor_email: 'thiago.nascimento@hypr.mobi', mentor_name: 'Thiago Nascimento',
    mentee_email: 'isaac.lobo@hypr.mobi',         mentee_name: 'Isaac Lobo',
    started_at: '2026-01-15', ended_at: null,
    bonus_pct: 0.0025,
  },
  {
    id: 'mt_002',
    mentor_email: 'beatriz.severine@hypr.mobi', mentor_name: 'Beatriz Severine',
    mentee_email: 'mariana.lewinski@hypr.mobi', mentee_name: 'Mariana Lewinski',
    started_at: '2025-10-01', ended_at: null,
    bonus_pct: 0.0025,
  },
];

export default function AdminMentorships() {
  const [items, setItems] = useState(MOCK_MENTORSHIPS);
  const [adding, setAdding] = useState(false);

  const active = items.filter(m => !m.ended_at);
  const ended = items.filter(m => m.ended_at);

  return (
    <AppShell>
      <header className="page-header fade-up">
        <div>
          <h1 className="page-title">Mentorias</h1>
          <div className="page-subtitle">
            <span>{active.length} mentoria{active.length !== 1 ? 's' : ''} ativa{active.length !== 1 ? 's' : ''}</span>
            <span className="page-subtitle__sep">·</span>
            <span style={{ color: 'var(--text-tertiary)' }}>
              Mentor recebe 0.25% sobre receita líquida do mentee enquanto ativa
            </span>
          </div>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => setAdding(true)}>
          Nova mentoria
        </Button>
      </header>

      {active.length === 0 ? (
        <Card>
          <EmptyState
            icon={Heart}
            title="Sem mentorias ativas"
            description="Crie a primeira mentoria emparelhando um mentor com um CS júnior."
          />
        </Card>
      ) : (
        <div className="mentorship-list fade-up">
          {active.map((m, i) => (
            <MentorshipRow
              key={m.id}
              mentorship={m}
              onEnd={() => {
                if (confirm(`Encerrar mentoria de ${m.mentor_name} → ${m.mentee_name}?`)) {
                  setItems(items => items.map(x => x.id === m.id ? { ...x, ended_at: new Date().toISOString() } : x));
                }
              }}
              i={i}
            />
          ))}
        </div>
      )}

      {ended.length > 0 && (
        <section className="fade-up" style={{ marginTop: 'var(--space-10)' }}>
          <h2 className="section-title" style={{ marginBottom: 'var(--space-3)' }}>Encerradas</h2>
          <div className="mentorship-list">
            {ended.map((m, i) => (
              <MentorshipRow key={m.id} mentorship={m} ended i={i} />
            ))}
          </div>
        </section>
      )}

      {adding && (
        <MentorshipModal
          onClose={() => setAdding(false)}
          onSave={(data) => {
            setItems(items => [...items, { ...data, id: `mt_${Date.now()}` }]);
            setAdding(false);
          }}
        />
      )}
    </AppShell>
  );
}

function MentorshipRow({ mentorship, onEnd, ended, i }) {
  return (
    <div className="member-card stagger" style={{ '--i': i, opacity: ended ? 0.5 : 1 }}>
      <div className="member-card__main" style={{ marginBottom: 0 }}>
        <Avatar name={mentorship.mentor_name} size="md" />
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
            <strong style={{ color: 'var(--text-primary)', fontSize: 'var(--text-sm)' }}>
              {mentorship.mentor_name}
            </strong>
            <Badge variant="cyan">Mentor</Badge>
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
            {mentorship.mentor_email}
          </div>
        </div>

        <ArrowRight size={16} style={{ color: 'var(--brand)' }} />

        <Avatar name={mentorship.mentee_name} size="md" />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 'var(--text-sm)', fontWeight: 500, color: 'var(--text-primary)' }}>
            {mentorship.mentee_name}
          </div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
            {mentorship.mentee_email}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
          <span className="label">Pct mentor</span>
          <span className="mono" style={{ fontSize: 'var(--text-md)', fontWeight: 600, color: 'var(--brand)' }}>
            {fmt.pct(mentorship.bonus_pct)}
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
          <span className="label">Início</span>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
            {fmt.date(mentorship.started_at)}
          </span>
        </div>

        {!ended && onEnd && (
          <button className="member-card__edit" onClick={onEnd} title="Encerrar mentoria">
            <Trash2 size={14} />
          </button>
        )}
      </div>
    </div>
  );
}

function MentorshipModal({ onClose, onSave }) {
  const [form, setForm] = useState({
    mentor_email: '', mentor_name: '',
    mentee_email: '', mentee_name: '',
    started_at: new Date().toISOString().slice(0, 10),
    bonus_pct: 0.0025,
    ended_at: null,
  });

  const cs = [
    { email: 'beatriz.severine@hypr.mobi', name: 'Beatriz Severine' },
    { email: 'isaac.lobo@hypr.mobi', name: 'Isaac Lobo' },
    { email: 'mariana.lewinski@hypr.mobi', name: 'Mariana Lewinski' },
    { email: 'thiago.nascimento@hypr.mobi', name: 'Thiago Nascimento' },
    { email: 'joao.buzolin@hypr.mobi', name: 'João Buzolin' },
    { email: 'joao.armelin@hypr.mobi', name: 'João Armelin' },
  ];

  return (
    <Modal
      open
      onClose={onClose}
      title="Nova mentoria"
      subtitle="Mentor recebe 0.25% sobre receita líquida do mentee até ser encerrada"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            onClick={() => onSave(form)}
            disabled={!form.mentor_email || !form.mentee_email || form.mentor_email === form.mentee_email}
          >
            Criar mentoria
          </Button>
        </>
      }
    >
      <div className="member-form">
        <Select
          label="Mentor"
          value={form.mentor_email}
          onChange={(e) => {
            const c = cs.find(x => x.email === e.target.value);
            setForm({ ...form, mentor_email: e.target.value, mentor_name: c?.name || '' });
          }}
        >
          <option value="">Selecione</option>
          {cs.map((c) => <option key={c.email} value={c.email}>{c.name}</option>)}
        </Select>

        <Select
          label="Mentee"
          value={form.mentee_email}
          onChange={(e) => {
            const c = cs.find(x => x.email === e.target.value);
            setForm({ ...form, mentee_email: e.target.value, mentee_name: c?.name || '' });
          }}
        >
          <option value="">Selecione</option>
          {cs.filter(c => c.email !== form.mentor_email).map((c) => <option key={c.email} value={c.email}>{c.name}</option>)}
        </Select>
      </div>
    </Modal>
  );
}
