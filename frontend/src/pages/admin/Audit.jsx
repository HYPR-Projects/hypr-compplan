import { useState } from 'react';
import { Search, Filter, Calendar } from 'lucide-react';
import AppShell from '../../components/layout/AppShell.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import Avatar from '../../components/ui/Avatar.jsx';
import { Input, Select } from '../../components/ui/Input.jsx';
import { fmt } from '../../lib/format.js';

const MOCK_AUDIT = [
  { id: '1', actor_email: 'matheus.machado@hypr.mobi', action: 'evidence.approve',     subject_kind: 'evidence', subject_id: 'ev_001', notes: 'CYTX53 — Audiências aprovada (R$ 1.064)', created_at: '2026-04-25T10:34:00Z' },
  { id: '2', actor_email: 'mateus.lambranho@hypr.mobi', action: 'rule.update',         subject_kind: 'rule',     subject_id: 'pre_camp_audiencias_2026', notes: 'Pct ajustado: 0.0010 → 0.0015', created_at: '2026-04-24T18:12:00Z' },
  { id: '3', actor_email: 'matheus.machado@hypr.mobi', action: 'cs_config.update',     subject_kind: 'cs_config', subject_id: 'joao.buzolin@hypr.mobi', notes: 'Salário: R$ 11.000 → R$ 12.000', created_at: '2026-04-23T15:00:00Z' },
  { id: '4', actor_email: 'matheus.machado@hypr.mobi', action: 'quarter.compute',      subject_kind: 'quarter',   subject_id: 'Q1-2026', notes: 'Recalculados 6 CSs', created_at: '2026-04-22T08:45:00Z' },
  { id: '5', actor_email: 'mateus.lambranho@hypr.mobi', action: 'evidence.reject',     subject_kind: 'evidence', subject_id: 'ev_005', notes: 'P4LW2W — Visão analytics rejeitada: "faltou cohorte"', created_at: '2026-04-21T14:20:00Z' },
  { id: '6', actor_email: 'matheus.machado@hypr.mobi', action: 'mentorship.create',    subject_kind: 'mentorship', subject_id: 'mt_001', notes: 'Thiago → Isaac', created_at: '2026-04-20T11:00:00Z' },
];

const ACTION_VARIANTS = {
  'evidence.approve':  'green',
  'evidence.reject':   'red',
  'rule.update':       'yellow',
  'cs_config.update':  'cyan',
  'quarter.compute':   'cyan',
  'quarter.approve':   'green',
  'quarter.mark_paid': 'green',
  'mentorship.create': 'cyan',
  'mentorship.end':    'neutral',
};

export default function AdminAudit() {
  const [items, setItems] = useState(MOCK_AUDIT);
  const [search, setSearch] = useState('');
  const [actionFilter, setActionFilter] = useState('all');

  const filtered = items.filter((it) => {
    if (actionFilter !== 'all' && !it.action.startsWith(actionFilter)) return false;
    if (search) {
      const s = search.toLowerCase();
      return it.actor_email.toLowerCase().includes(s)
        || it.subject_id.toLowerCase().includes(s)
        || (it.notes || '').toLowerCase().includes(s);
    }
    return true;
  });

  return (
    <AppShell>
      <header className="page-header fade-up">
        <div>
          <h1 className="page-title">Auditoria</h1>
          <div className="page-subtitle">
            <span>Trilha completa de ações administrativas</span>
            <span className="page-subtitle__sep">·</span>
            <span style={{ color: 'var(--text-tertiary)' }}>Imutável · não editável</span>
          </div>
        </div>
      </header>

      <div className="fade-up" style={{ display: 'flex', gap: 'var(--space-3)', marginBottom: 'var(--space-6)', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240, maxWidth: 400 }}>
          <Input
            placeholder="Buscar por usuário, ID ou nota…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            prefix={<Search size={14} />}
          />
        </div>
        <div style={{ minWidth: 180 }}>
          <Select value={actionFilter} onChange={(e) => setActionFilter(e.target.value)}>
            <option value="all">Todas as ações</option>
            <option value="evidence">Evidências</option>
            <option value="rule">Regras</option>
            <option value="cs_config">Salários</option>
            <option value="quarter">Quarters</option>
            <option value="mentorship">Mentorias</option>
          </Select>
        </div>
      </div>

      <Card className="fade-up" style={{ '--i': 1, padding: 0 }}>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {filtered.map((it, i) => (
            <div
              key={it.id}
              className="audit-row stagger"
              style={{ '--i': i }}
            >
              <Avatar email={it.actor_email} size="sm" />
              <div className="audit-row__main">
                <div className="audit-row__line">
                  <strong>{it.actor_email.split('@')[0]}</strong>
                  <Badge variant={ACTION_VARIANTS[it.action] || 'neutral'}>{it.action}</Badge>
                  <span className="audit-row__subject mono">{it.subject_id}</span>
                </div>
                {it.notes && <div className="audit-row__notes">{it.notes}</div>}
              </div>
              <div className="audit-row__time">
                {fmt.date(it.created_at)}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <style>{`
        .audit-row {
          display: grid;
          grid-template-columns: auto 1fr auto;
          align-items: center;
          gap: var(--space-4);
          padding: var(--space-3) var(--space-5);
          border-bottom: 1px solid var(--border-subtle);
          transition: background var(--duration) var(--ease-out);
        }
        .audit-row:last-child { border-bottom: none; }
        .audit-row:hover { background: var(--bg-elevated); }
        .audit-row__line {
          display: flex;
          align-items: center;
          gap: var(--space-2);
          flex-wrap: wrap;
          font-size: var(--text-sm);
          color: var(--text-secondary);
        }
        .audit-row__line strong { color: var(--text-primary); }
        .audit-row__subject { font-size: var(--text-xs); color: var(--text-tertiary); }
        .audit-row__notes {
          font-size: var(--text-xs);
          color: var(--text-tertiary);
          margin-top: 2px;
          font-family: var(--font-mono);
        }
        .audit-row__time {
          font-size: var(--text-xs);
          color: var(--text-tertiary);
          font-family: var(--font-mono);
          white-space: nowrap;
        }
      `}</style>
    </AppShell>
  );
}
