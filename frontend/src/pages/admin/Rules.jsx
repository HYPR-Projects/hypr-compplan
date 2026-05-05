import { useState } from 'react';
import { Edit3, Save, AlertCircle, Lock } from 'lucide-react';
import AppShell from '../../components/layout/AppShell.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Badge, Tabs } from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { fmt } from '../../lib/format.js';
import './Rules.css';

// Mock — em prod: endpoints.listRules('2026')
const MOCK_RULES = [
  { id: 'pre_camp_audiencias_2026', display_name: 'Audiências', category: 'pre_campaign', bonus_pct: 0.0015, condition_kind: 'manual_claim', active: true, display_order: 10 },
  { id: 'pre_camp_rmn_fisico_2026', display_name: 'RMN Físico (inédito)', category: 'pre_campaign', bonus_pct: 0.0025, condition_kind: 'manual_claim', cap_group: 'pre_camp_features', active: true, display_order: 20 },
  { id: 'pre_camp_feature_1st_2026', display_name: '1ª feature', category: 'pre_campaign', bonus_pct: 0.0020, condition_kind: 'manual_claim', cap_group: 'pre_camp_features', active: true, display_order: 30 },
  { id: 'setup_media_o2o_2026', display_name: 'O2O', category: 'setup', bonus_pct: 0.0045, condition_kind: 'bool_field_true', exclusion_group: 'setup_o2o_ooh', active: true, display_order: 10 },
  { id: 'setup_media_ooh_2026', display_name: 'OOH', category: 'setup', bonus_pct: 0.0045, condition_kind: 'bool_field_true', exclusion_group: 'setup_o2o_ooh', active: true, display_order: 20 },
  { id: 'setup_rmn_digital_2026', display_name: 'RMN Digital', category: 'setup', bonus_pct: 0.0015, condition_kind: 'field_present', active: true, display_order: 30 },
  { id: 'opt_media_2026', display_name: 'Otimização: Display ou Video', category: 'optimization', bonus_pct: 0.0030, condition_kind: 'media_optimization', active: true, display_order: 10 },
  { id: 'am_loom_2026', display_name: 'Loom (post-mortem)', category: 'account_mgmt', bonus_pct: 0.0010, condition_kind: 'external_field_present', active: true, display_order: 30 },
];

const CATEGORY_LABELS = {
  pre_campaign: 'Pré Campanha',
  setup: 'Setup',
  optimization: 'Otimização',
  account_mgmt: 'Account Management',
  extras: 'Extras',
  onboarding: 'Onboarding',
};

export default function AdminRules() {
  const [rules, setRules] = useState(MOCK_RULES);
  const [filter, setFilter] = useState('all');
  const [editing, setEditing] = useState(null);

  const filtered = filter === 'all' ? rules : rules.filter(r => r.category === filter);

  const handleSave = (updated) => {
    setRules(rs => rs.map(r => r.id === updated.id ? { ...r, ...updated } : r));
    setEditing(null);
  };

  return (
    <AppShell>
      <header className="page-header fade-up">
        <div>
          <h1 className="page-title">Regras de bônus</h1>
          <div className="page-subtitle">
            <span>Versão 2026 · {rules.length} regras configuradas</span>
            <span className="page-subtitle__sep">·</span>
            <span style={{ color: 'var(--text-tertiary)' }}>
              Mudanças estruturais (novas categorias, novos avaliadores) precisam de uma nova versão
            </span>
          </div>
        </div>
      </header>

      <div className="fade-up" style={{ marginBottom: 'var(--space-6)' }}>
        <Tabs
          value={filter}
          onChange={setFilter}
          items={[
            { value: 'all', label: 'Todas', count: rules.length },
            ...Object.entries(CATEGORY_LABELS).map(([k, v]) => ({
              value: k, label: v, count: rules.filter(r => r.category === k).length,
            })),
          ]}
        />
      </div>

      <div className="rules-table fade-up" style={{ '--i': 1 }}>
        <div className="rules-table__head">
          <span>Regra</span>
          <span>Categoria</span>
          <span>Tipo</span>
          <span style={{ textAlign: 'right' }}>Pct</span>
          <span></span>
        </div>
        {filtered.map((r, i) => (
          <div key={r.id} className="rules-row stagger" style={{ '--i': i }}>
            <div>
              <div className="rules-row__name">{r.display_name}</div>
              <div className="rules-row__id">{r.id}</div>
            </div>
            <div>
              <Badge variant="neutral">{CATEGORY_LABELS[r.category]}</Badge>
            </div>
            <div className="rules-row__kind">
              <Badge variant={r.condition_kind === 'manual_claim' ? 'yellow' : 'green'}>
                {r.condition_kind === 'manual_claim' ? 'Manual' : 'Automática'}
              </Badge>
              {r.cap_group && <Badge variant="cyan">cap: {r.cap_group}</Badge>}
              {r.exclusion_group && <Badge variant="red">excl: {r.exclusion_group}</Badge>}
            </div>
            <div className="rules-row__pct mono">{fmt.pct(r.bonus_pct)}</div>
            <div>
              <button className="rules-row__edit" onClick={() => setEditing(r)}>
                <Edit3 size={13} /> Editar
              </button>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <RuleEditModal
          rule={editing}
          onClose={() => setEditing(null)}
          onSave={handleSave}
        />
      )}
    </AppShell>
  );
}

function RuleEditModal({ rule, onClose, onSave }) {
  const [form, setForm] = useState({
    display_name: rule.display_name,
    bonus_pct: (rule.bonus_pct * 100).toFixed(2),
    active: rule.active,
  });
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    await new Promise(r => setTimeout(r, 300));
    onSave({
      ...rule,
      display_name: form.display_name,
      bonus_pct: Number(form.bonus_pct) / 100,
      active: form.active,
    });
    setSaving(false);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={rule.display_name}
      subtitle={rule.id}
      size="md"
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button variant="primary" icon={Save} onClick={handleSave} loading={saving}>
            Salvar
          </Button>
        </>
      }
    >
      <div className="rule-form">
        <Card accent="yellow" className="rule-form__warn">
          <div className="rule-form__warn-icon"><AlertCircle size={16} /></div>
          <div>
            <strong>Edição segura (Path B)</strong>
            <p>Você pode editar nome, percentual e ativação. Para mudanças estruturais
            (novo tipo de avaliação, novo cap, etc.) crie uma nova versão.</p>
          </div>
        </Card>

        <Input
          label="Nome de exibição"
          value={form.display_name}
          onChange={(e) => setForm({ ...form, display_name: e.target.value })}
        />

        <Input
          label="Bônus (% sobre receita líquida)"
          type="number"
          step="0.01"
          value={form.bonus_pct}
          onChange={(e) => setForm({ ...form, bonus_pct: e.target.value })}
          suffix="%"
          hint={`Ex: 0.30 = 0.30% (R$ ${fmt.num(Math.round(709495 * (Number(form.bonus_pct) / 100)))} numa campanha de R$ 850k bruto)`}
        />

        <div className="rule-form__locked">
          <Lock size={13} />
          <span>
            <strong>Categoria:</strong> {rule.category}<br />
            <strong>Tipo de avaliação:</strong> {rule.condition_kind}<br />
            {rule.cap_group && <><strong>Cap group:</strong> {rule.cap_group}</>}
          </span>
        </div>

        <label className="rule-form__toggle">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(e) => setForm({ ...form, active: e.target.checked })}
          />
          <span>Regra ativa</span>
        </label>
      </div>
    </Modal>
  );
}
