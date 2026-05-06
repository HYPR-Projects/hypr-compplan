import { useEffect, useState } from 'react';
import { Plus, Edit3, ShieldCheck } from 'lucide-react';
import AppShell from '../../components/layout/AppShell.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Avatar from '../../components/ui/Avatar.jsx';
import { Input, Select } from '../../components/ui/Input.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { fmt } from '../../lib/format.js';
import { endpoints } from '../../lib/api.js';
import './Team.css';

export default function AdminTeam() {
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const data = await endpoints.listMembers();
      // O backend retorna { items: [...] } ou direto o array — normalizamos
      const items = Array.isArray(data) ? data : (data.items || []);
      setTeam(items);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  async function handleSave(data) {
    try {
      if (creating) {
        await endpoints.createMember(data);
      } else {
        await endpoints.updateMember(editing.email, data);
      }
      setCreating(false);
      setEditing(null);
      await load();
    } catch (e) {
      throw e;
    }
  }

  if (error) {
    return (
      <AppShell>
        <Card>
          <h2 className="page-title">Erro ao carregar time</h2>
          <p className="card__subtitle">{error}</p>
        </Card>
      </AppShell>
    );
  }

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

      {loading && <div className="empty-state">Carregando time…</div>}

      {!loading && (
        <>
          <section className="team-section fade-up" style={{ '--i': 1 }}>
            <h2 className="section-title">Customer Success</h2>
            <p className="section-help">
              Salários atualizados aqui têm efeito a partir do próximo quarter.
              Mudanças retroativas ficam no histórico (close-and-insert) — bônus já calculados não recompõem.
            </p>

            <div className="team-grid">
              {css.length === 0 ? (
                <Card><p className="card__subtitle">Nenhum CS cadastrado.</p></Card>
              ) : css.map((m, i) => (
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
        </>
      )}

      {(creating || editing) && (
        <MemberModal
          member={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSave={handleSave}
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
        <Avatar name={member.name || member.email} size="lg" />
        <div className="member-card__info">
          <div className="member-card__name">
            {member.name || member.email}
            {isAdmin && <Badge variant="cyan"><ShieldCheck size={11} /> Admin</Badge>}
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
              {member.fixed_salary_brl ? fmt.brl(member.fixed_salary_brl) : 'Não definido'}
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
    fixed_salary_brl: member?.fixed_salary_brl || '',
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
      if (form.role === 'cs' && !form.fixed_salary_brl) {
        throw new Error('CS precisa ter salário fixo definido');
      }
      const today = new Date().toISOString().slice(0, 10);
      const body = {
        email: form.email.toLowerCase(),
        name: form.name,
        role: form.role,
      };
      if (form.role === 'cs') {
        body.fixed_salary_brl = Number(form.fixed_salary_brl);
        body.effective_from = today;
      }
      await onSave(body);
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
      title={isNew ? 'Adicionar pessoa ao time' : `Editar ${member.name || member.email}`}
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
            value={form.fixed_salary_brl}
            onChange={(e) => setForm({ ...form, fixed_salary_brl: e.target.value })}
            prefix="R$"
            hint="Esse valor é descontado em 2× do bônus bruto trimestral. Mudanças aqui só afetam quarters futuros."
          />
        )}

        {error && <div className="member-form__error">⚠ {error}</div>}
      </div>
    </Modal>
  );
}
