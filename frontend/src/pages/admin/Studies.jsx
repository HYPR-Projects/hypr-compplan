import { useState } from 'react';
import { Plus, Edit3, BookOpen, User } from 'lucide-react';
import AppShell from '../../components/layout/AppShell.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import Avatar from '../../components/ui/Avatar.jsx';
import { Input, Select } from '../../components/ui/Input.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { fmt } from '../../lib/format.js';
import './Team.css';
import './Studies.css';

// Mock — vem de endpoints.listStudies('2026')
const MOCK_STUDIES = [
  { id: 'st_dia_mulheres_2026',  display_name: 'Dia das Mulheres',  author_email: 'beatriz.severine@hypr.mobi',  author_name: 'Beatriz Severine',   status: 'completed', usage_count: 4 },
  { id: 'st_natal_2026',         display_name: 'Natal',             author_email: 'beatriz.severine@hypr.mobi',  author_name: 'Beatriz Severine',   status: 'planned',   usage_count: 0 },
  { id: 'st_pascoa_2026',        display_name: 'Páscoa',            author_email: 'isaac.lobo@hypr.mobi',        author_name: 'Isaac Lobo',         status: 'completed', usage_count: 5 },
  { id: 'st_dia_criancas_2026',  display_name: 'Dia das Crianças',  author_email: 'isaac.lobo@hypr.mobi',        author_name: 'Isaac Lobo',         status: 'planned',   usage_count: 0 },
  { id: 'st_copa_mundo_2026',    display_name: 'Copa do Mundo',     author_email: 'thiago.nascimento@hypr.mobi', author_name: 'Thiago Nascimento',  status: 'completed', usage_count: 12 },
  { id: 'st_verao_2026',         display_name: 'Verão / Férias',    author_email: 'thiago.nascimento@hypr.mobi', author_name: 'Thiago Nascimento',  status: 'planned',   usage_count: 0 },
  { id: 'st_carnaval_2026',      display_name: 'Carnaval',          author_email: 'thiago.nascimento@hypr.mobi', author_name: 'Thiago Nascimento',  status: 'planned',   usage_count: 0 },
  { id: 'st_dia_maes_2026',      display_name: 'Dia das Mães',      author_email: 'mariana.lewinski@hypr.mobi',  author_name: 'Mariana Lewinski',   status: 'completed', usage_count: 7 },
  { id: 'st_formula1_2026',      display_name: 'Fórmula 1',         author_email: 'mariana.lewinski@hypr.mobi',  author_name: 'Mariana Lewinski',   status: 'planned',   usage_count: 0 },
  { id: 'st_festivais_2026',     display_name: 'Festivais',         author_email: 'joao.buzolin@hypr.mobi',      author_name: 'João Buzolin',       status: 'completed', usage_count: 3 },
  { id: 'st_festa_junina_2026',  display_name: 'Festa Junina',      author_email: 'joao.buzolin@hypr.mobi',      author_name: 'João Buzolin',       status: 'completed', usage_count: 8 },
  { id: 'st_volta_aulas_2026',   display_name: 'Volta às Aulas',    author_email: 'joao.buzolin@hypr.mobi',      author_name: 'João Buzolin',       status: 'planned',   usage_count: 0 },
  { id: 'st_namorados_2026',     display_name: 'Dia dos Namorados', author_email: 'joao.armelin@hypr.mobi',      author_name: 'João Armelin',       status: 'completed', usage_count: 6 },
  { id: 'st_pais_2026',          display_name: 'Dia dos Pais',      author_email: 'joao.armelin@hypr.mobi',      author_name: 'João Armelin',       status: 'planned',   usage_count: 0 },
  { id: 'st_black_friday_2026',  display_name: 'Black Friday',      author_email: 'joao.armelin@hypr.mobi',      author_name: 'João Armelin',       status: 'planned',   usage_count: 0 },
];

export default function AdminStudies() {
  const [studies, setStudies] = useState(MOCK_STUDIES);
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState(null);

  const completed = studies.filter(s => s.status === 'completed');
  const planned = studies.filter(s => s.status === 'planned');

  return (
    <AppShell>
      <header className="page-header fade-up">
        <div>
          <h1 className="page-title">Catálogo de estudos</h1>
          <div className="page-subtitle">
            <span>{studies.length} estudos · {completed.length} prontos · {planned.length} planejados</span>
            <span className="page-subtitle__sep">·</span>
            <span style={{ color: 'var(--text-tertiary)' }}>Autor recebe 0.30% por uso</span>
          </div>
        </div>
        <Button variant="primary" icon={Plus} onClick={() => setCreating(true)}>
          Novo estudo
        </Button>
      </header>

      <section className="fade-up" style={{ marginBottom: 'var(--space-8)' }}>
        <div className="section-header">
          <h2 className="section-title">Estudos prontos ({completed.length})</h2>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>
            Disponíveis para Campaign Planners selecionarem
          </span>
        </div>
        <div className="studies-grid">
          {completed.map((s, i) => (
            <StudyCard key={s.id} study={s} onEdit={() => setEditing(s)} i={i} />
          ))}
        </div>
      </section>

      <section className="fade-up" style={{ '--i': 1 }}>
        <div className="section-header">
          <h2 className="section-title">Planejados ({planned.length})</h2>
          <span style={{ fontSize: 'var(--text-sm)', color: 'var(--text-tertiary)' }}>
            Em desenvolvimento — não aparecem para CPs ainda
          </span>
        </div>
        <div className="studies-grid">
          {planned.map((s, i) => (
            <StudyCard key={s.id} study={s} onEdit={() => setEditing(s)} i={i} />
          ))}
        </div>
      </section>

      {(creating || editing) && (
        <StudyModal
          study={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSave={(data) => {
            if (creating) {
              setStudies(s => [...s, { ...data, id: `st_${Date.now()}`, usage_count: 0 }]);
            } else {
              setStudies(s => s.map(x => x.id === editing.id ? { ...x, ...data } : x));
            }
            setCreating(false);
            setEditing(null);
          }}
        />
      )}
    </AppShell>
  );
}

function StudyCard({ study, onEdit, i }) {
  return (
    <div className="member-card stagger" style={{ '--i': i }}>
      <div className="member-card__main">
        <div style={{
          width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--brand-soft)', color: 'var(--brand)',
          borderRadius: 'var(--radius)',
        }}>
          <BookOpen size={18} />
        </div>
        <div className="member-card__info">
          <div className="member-card__name">
            {study.display_name}
            <Badge variant={study.status === 'completed' ? 'green' : 'yellow'}>
              {study.status === 'completed' ? 'Pronto' : 'Planejado'}
            </Badge>
          </div>
          <div className="member-card__email">
            <User size={11} style={{ display: 'inline', marginRight: 4, verticalAlign: -1 }} />
            {study.author_name}
          </div>
        </div>
        <button className="member-card__edit" onClick={onEdit} title="Editar">
          <Edit3 size={14} />
        </button>
      </div>

      <div className="member-card__metrics" style={{ gridTemplateColumns: '1fr 1fr' }}>
        <div className="member-card__metric">
          <span className="label">Usado em</span>
          <span className="member-card__metric-value mono">
            {study.usage_count}× campanha{study.usage_count !== 1 ? 's' : ''}
          </span>
        </div>
        <div className="member-card__metric">
          <span className="label">Bônus gerado</span>
          <span className="member-card__metric-value mono member-card__metric-value--cyan">
            {fmt.brlCompact(study.usage_count * 580000 * 0.0030)}
          </span>
        </div>
      </div>
    </div>
  );
}

function StudyModal({ study, onClose, onSave }) {
  const isNew = !study;
  const [form, setForm] = useState({
    display_name: study?.display_name || '',
    author_email: study?.author_email || '',
    author_name: study?.author_name || '',
    status: study?.status || 'planned',
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 300));
    onSave(form);
    setSaving(false);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={isNew ? 'Novo estudo' : `Editar ${study.display_name}`}
      subtitle="Estudos sazonais alimentam o catálogo no checklist do Command"
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" onClick={handleSave} loading={saving}>
            {isNew ? 'Criar estudo' : 'Salvar'}
          </Button>
        </>
      }
    >
      <div className="member-form">
        <Input
          label="Nome do estudo"
          placeholder="Ex: Dia das Mulheres, Carnaval, Festa Junina…"
          value={form.display_name}
          onChange={(e) => setForm({ ...form, display_name: e.target.value })}
        />

        <Select
          label="Autor (CS responsável)"
          value={form.author_email}
          onChange={(e) => {
            const opts = [
              { email: 'beatriz.severine@hypr.mobi', name: 'Beatriz Severine' },
              { email: 'isaac.lobo@hypr.mobi', name: 'Isaac Lobo' },
              { email: 'mariana.lewinski@hypr.mobi', name: 'Mariana Lewinski' },
              { email: 'thiago.nascimento@hypr.mobi', name: 'Thiago Nascimento' },
              { email: 'joao.buzolin@hypr.mobi', name: 'João Buzolin' },
              { email: 'joao.armelin@hypr.mobi', name: 'João Armelin' },
            ];
            const found = opts.find(o => o.email === e.target.value);
            setForm({ ...form, author_email: e.target.value, author_name: found?.name || '' });
          }}
        >
          <option value="">Selecione um CS</option>
          <option value="beatriz.severine@hypr.mobi">Beatriz Severine</option>
          <option value="isaac.lobo@hypr.mobi">Isaac Lobo</option>
          <option value="mariana.lewinski@hypr.mobi">Mariana Lewinski</option>
          <option value="thiago.nascimento@hypr.mobi">Thiago Nascimento</option>
          <option value="joao.buzolin@hypr.mobi">João Buzolin</option>
          <option value="joao.armelin@hypr.mobi">João Armelin</option>
        </Select>

        <Select
          label="Status"
          value={form.status}
          onChange={(e) => setForm({ ...form, status: e.target.value })}
          hint="Apenas 'Pronto' aparece para CPs no Command"
        >
          <option value="planned">Planejado (em desenvolvimento)</option>
          <option value="completed">Pronto (disponível para uso)</option>
        </Select>
      </div>
    </Modal>
  );
}
