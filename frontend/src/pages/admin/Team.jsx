import { useState } from 'react';
import { Plus, Edit3, ShieldCheck, User, X } from 'lucide-react';
import AppShell from '../../components/layout/AppShell.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Avatar from '../../components/ui/Avatar.jsx';
import { Input, Select } from '../../components/ui/Input.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { fmt } from '../../lib/format.js';
import { MOCK_TEAM_OVERVIEW } from '../../lib/mockData.js';
import './Team.css';

export default function AdminTeam() {
  const [team, setTeam] = useState([
    ...MOCK_TEAM_OVERVIEW.map(c => ({ ...c, role: 'cs' })),
    { email: 'matheus.machado@hypr.mobi', name: 'Matheus Machado', role: 'admin', current_salary: null, active: true },
    { email: 'mateus.lambranho@hypr.mobi', name: 'Mateus Lambranho', role: 'admin', current_salary: null, active: true },
  ]);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);

  const css = team.filter(m => m.role === 'cs');
  const admins = team.filter(m => m.role === 'admin');

  return (
    <AppShell>
      <header className="page-header fade-up">
        <div>
          <h1 className="page-title">Time</h1>
          <div className="page-subtitle">
            <span>{css.length} CSs · {admins.length} admins · gestão de salários e roles</span>
          </div>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
          Adicionar pessoa
        </Button>
      </header>

      <section className="team-section fade-up" style={{ '--i': 1 }}>
        <h2 className="section-title">Customer Success</h2>
        <p className="section-help">
          Salários atualizados aqui têm efeito a partir do próximo quarter. Mudanças
          retroativas ficam no histórico (close-and-insert) — bônus já calculados não recompõem.
        </p>

        <div className="team-grid">
          {css.map((m, i) => (
            <MemberCard key={m.email} member={m} onEdit={() => setEditing(m)} i={i} />
          ))}
        </div>
      </section>

      <section className="team-section fade-up" style={{ '--i': 2 }}>
        <h2 className="section-title">Administradores</h2>
        <p className="section-help">
          Admins veem o painel global, aprovam evidências, fecham quarters e gerenciam regras.
        </p>

        <div className="team-grid">
          {admins.map((m, i) => (
            <MemberCard key={m.email} member={m} onEdit={() => setEditing(m)} i={i} />
          ))}
        </div>
      </section>

      {(creating || editing) && (
        <MemberModal
          member={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSave={(data) => {
            // TODO: endpoints.createMember / updateMember
            if (creating) {
              setTeam((t) => [...t, { ...data, active: true }]);
            } else {
              setTeam((t) => t.map(m => m.email === editing.email ? { ...m, ...data } : m));
            }
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </AppShell>
  );
}

function MemberCard({ member, onEdit, i }) {
  const isAdmin = member.role === 'admin';
  return (
    <div className="member-card stagger" style={{ '--i': i }}>
      <div className="member-card__main">
        <Avatar name={member.name} size="lg" />
        <div className="member-card__info">
          <div className="member-card__name">
            {member.name}
            {isAdmin ? <Badge variant="cyan"><ShieldCheck size={11} /> Admin</Badge> : null}
            {member.has_mentees && <Badge variant="green">Mentor</Badge>}
          </div>
          <div className="member-card__email">{member.email}</div>
        </div>
        <button className="member-card__edit" onClick={onEdit} title="Editar">
          <Edit3 size={14} />
        </button>
      </div>

      {!isAdmin && (
        <div className="member-card__metrics">
          <div className="member-card__metric">
            <span className="label">Salário fixo</span>
            <span className="member-card__metric-value mono">
              {member.current_salary ? fmt.brl(member.current_salary) : 'Não definido'}
            </span>
          </div>
          <div className="member-card__metric">
            <span className="label">Camp. ativas</span>
            <span className="member-card__metric-value mono">{member.campaigns_active || 0}</span>
          </div>
          <div className="member-card__metric">
            <span className="label">Bônus quarter</span>
            <span className="member-card__metric-value mono member-card__metric-value--cyan">
              {fmt.brl(member.bonus_q1_brl || 0)}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

function MemberModal({ member, onClose, onSave }) {
  const isNew = !member;
  const [form, setForm] = useState({
    email: member?.email || '',
    name: member?.name || '',
    role: member?.role || 'cs',
    current_salary: member?.current_salary || '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      if (!form.email.endsWith('@hypr.mobi')) {
        throw new Error('Email precisa ser do domínio @hypr.mobi');
      }
      if (form.role === 'cs' && !form.current_salary) {
        throw new Error('CS precisa ter salário fixo definido');
      }
      await new Promise(r => setTimeout(r, 400));
      onSave({
        email: form.email.toLowerCase(),
        name: form.name,
        role: form.role,
        current_salary: form.role === 'cs' ? Number(form.current_salary) : null,
      });
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
      title={isNew ? 'Adicionar pessoa ao time' : `Editar ${member.name}`}
      subtitle={isNew ? 'O acesso será criado automaticamente. SSO via Google.' : member.email}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={handleSave} loading={saving}>
            {isNew ? 'Criar pessoa' : 'Salvar alterações'}
          </Button>
        </>
      }
    >
      <div className="member-form">
        {isNew && (
          <Input
            label="Email"
            placeholder="primeiro.ultimo@hypr.mobi"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            hint="Domínio @hypr.mobi · será o ID único"
          />
        )}

        <Input
          label="Nome completo"
          placeholder="João Buzolin"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />

        <Select
          label="Função"
          value={form.role}
          onChange={(e) => setForm({ ...form, role: e.target.value })}
        >
          <option value="cs">Customer Success</option>
          <option value="admin">Administrador</option>
        </Select>

        {form.role === 'cs' && (
          <Input
            label="Salário fixo mensal"
            type="number"
            placeholder="12000"
            value={form.current_salary}
            onChange={(e) => setForm({ ...form, current_salary: e.target.value })}
            prefix="R$"
            hint="Esse valor é descontado em 2× do bônus bruto trimestral. Mudanças aqui só afetam quarters futuros."
          />
        )}

        {error && <div className="member-form__error">⚠ {error}</div>}
      </div>
    </Modal>
  );
}
