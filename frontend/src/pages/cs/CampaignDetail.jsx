import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle2, XCircle, Clock, AlertCircle,
  Edit3, ExternalLink, Plus, Sparkles, Lock,
} from 'lucide-react';
import AppShell from '../../components/layout/AppShell.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Badge, StatusDot } from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import EvidenceModal from './EvidenceModal.jsx';
import { fmt } from '../../lib/format.js';
import { MOCK_CAMPAIGNS } from '../../lib/mockData.js';
import './CampaignDetail.css';

const CATEGORY_LABELS = {
  pre_campaign:  'Pré Campanha',
  setup:         'Setup',
  optimization:  'Otimização',
  account_mgmt:  'Account Management',
  extras:        'Extras',
  onboarding:    'Onboarding',
};

const CATEGORY_MAX_PCT = {
  pre_campaign:  0.0135,
  setup:         0.0230,
  optimization:  0.0030,
  account_mgmt:  0.0120,
  extras:        0.0055,
  onboarding:    0.0025,
};

export default function CampaignDetail() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(null);

  const campaign = MOCK_CAMPAIGNS.find(c => c.short_token === token) || MOCK_CAMPAIGNS[0];
  const rules = campaign.rule_results || [];

  // Agrupa por categoria
  const byCategory = rules.reduce((acc, r) => {
    (acc[r.category] = acc[r.category] || []).push(r);
    return acc;
  }, {});

  const earned = rules.filter(r => r.earned).length;
  const total = rules.length;
  const pending = rules.filter(r => r.breakdown?.evidence_status === 'not_claimed' || r.breakdown?.evidence_status === 'pending_review').length;

  return (
    <AppShell>
      <button className="back-link fade-up" onClick={() => navigate(-1)}>
        <ArrowLeft size={14} /> Voltar
      </button>

      <header className="page-header campaign-detail__header">
        <div className="fade-up">
          <div className="campaign-detail__breadcrumb">
            <Badge variant="neutral">{campaign.short_token}</Badge>
            {campaign.is_abs && <Badge variant="cyan">ABS</Badge>}
            <span className="page-subtitle__sep">·</span>
            <span>{fmt.dateRange(campaign.campaign_start_date, campaign.campaign_end_date)}</span>
          </div>
          <h1 className="page-title campaign-detail__title">
            <span className="campaign-detail__client">{campaign.client_name}</span>
            <span className="campaign-detail__campaign">{campaign.campaign_name}</span>
          </h1>
        </div>

        <div className="campaign-detail__hero fade-up" style={{ '--i': 1 }}>
          <div className="campaign-detail__hero-item">
            <span className="label">Receita líquida</span>
            <span className="campaign-detail__hero-value mono">{fmt.brl(campaign.revenue_net)}</span>
            <span className="campaign-detail__hero-meta">
              {fmt.brl(campaign.revenue_gross)} bruto × 0.8347
            </span>
          </div>
          <div className="campaign-detail__hero-divider" />
          <div className="campaign-detail__hero-item">
            <span className="label">Pct atingido</span>
            <span className="campaign-detail__hero-value mono campaign-detail__hero-value--cyan">
              {fmt.pct(campaign.cs_total_pct)}
            </span>
            <span className="campaign-detail__hero-meta">
              {earned} de {total} regras
            </span>
          </div>
          <div className="campaign-detail__hero-divider" />
          <div className="campaign-detail__hero-item">
            <span className="label">Bônus desta campanha</span>
            <span className="campaign-detail__hero-value mono campaign-detail__hero-value--strong">
              {fmt.brl(campaign.cs_bonus_amount)}
            </span>
            <span className="campaign-detail__hero-meta">
              R$ {fmt.num(Math.round(campaign.revenue_net))} × {fmt.pct(campaign.cs_total_pct)}
            </span>
          </div>
        </div>
      </header>

      {pending > 0 && (
        <Card className="campaign-detail__alert fade-up" accent="yellow" style={{ '--i': 2 }}>
          <div className="campaign-detail__alert-icon">
            <Sparkles size={20} />
          </div>
          <div className="campaign-detail__alert-text">
            <strong>{pending} evidência{pending > 1 ? 's' : ''} pendente{pending > 1 ? 's' : ''}</strong>
            <p>Submeta as evidências pra que essas regras sejam contabilizadas no cálculo do bônus.</p>
          </div>
        </Card>
      )}

      {/* ─── Categorias e regras ────────────────────────────────────── */}
      {Object.entries(byCategory).map(([cat, items], idx) => (
        <CategoryBlock
          key={cat}
          category={cat}
          rules={items}
          revenueNet={campaign.revenue_net}
          onEdit={(rule) => setEditing({ rule, campaign })}
          i={idx}
        />
      ))}

      {editing && (
        <EvidenceModal
          rule={editing.rule}
          campaign={editing.campaign}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            // TODO: refetch campaign
          }}
        />
      )}
    </AppShell>
  );
}

function CategoryBlock({ category, rules, revenueNet, onEdit, i }) {
  const earnedSum = rules.reduce((s, r) => s + (r.effective_pct || 0), 0);
  const maxPct = CATEGORY_MAX_PCT[category] || 0;
  const fillPct = maxPct > 0 ? (earnedSum / maxPct) * 100 : 0;
  const earnedBonus = revenueNet * earnedSum;

  return (
    <section className="category-block fade-up" style={{ '--i': i + 3 }}>
      <header className="category-block__header">
        <div>
          <h2 className="category-block__title">{CATEGORY_LABELS[category]}</h2>
          <div className="category-block__progress">
            <div className="category-block__progress-track">
              <div
                className="category-block__progress-fill"
                style={{ width: `${Math.min(100, fillPct)}%` }}
              />
            </div>
            <span className="category-block__progress-label mono">
              {fmt.pct(earnedSum)} <span className="category-block__progress-max">/ {fmt.pct(maxPct)}</span>
            </span>
          </div>
        </div>
        <div className="category-block__sum">
          <span className="label">Bônus na categoria</span>
          <span className="category-block__sum-value mono">{fmt.brl(earnedBonus)}</span>
        </div>
      </header>

      <div className="rule-list">
        {rules.map((rule, idx) => (
          <RuleRow key={rule.rule_id} rule={rule} onEdit={() => onEdit(rule)} i={idx} />
        ))}
      </div>
    </section>
  );
}

function RuleRow({ rule, onEdit, i }) {
  const status = getRuleStatus(rule);
  const isEditable = status !== 'auto_earned' && status !== 'auto_not_earned';

  return (
    <div className={`rule-row rule-row--${status} stagger`} style={{ '--i': i }}>
      <div className="rule-row__icon">
        {status === 'earned' && <CheckCircle2 size={16} />}
        {status === 'auto_earned' && <CheckCircle2 size={16} />}
        {status === 'pending_review' && <Clock size={16} />}
        {status === 'rejected' && <XCircle size={16} />}
        {status === 'not_claimed' && <AlertCircle size={16} />}
        {status === 'auto_not_earned' && <XCircle size={16} />}
      </div>

      <div className="rule-row__body">
        <div className="rule-row__name">{rule.display_name}</div>
        <div className="rule-row__detail">
          <RuleStatusLabel status={status} rule={rule} />
        </div>
      </div>

      <div className="rule-row__pct mono">
        {rule.earned ? `+${fmt.pct(rule.effective_pct)}` : '—'}
      </div>

      <div className="rule-row__action">
        {isEditable && (
          <button className="rule-row__edit" onClick={onEdit}>
            {status === 'not_claimed' ? (
              <><Plus size={13} /> Submeter</>
            ) : (
              <><Edit3 size={13} /> Editar</>
            )}
          </button>
        )}
        {!isEditable && (
          <span className="rule-row__locked" title="Avaliada automaticamente">
            <Lock size={11} /> Auto
          </span>
        )}
      </div>
    </div>
  );
}

function RuleStatusLabel({ status, rule }) {
  if (status === 'auto_earned') {
    if (rule.breakdown?.evaluated_as) {
      const b = rule.breakdown;
      return (
        <span className="rule-row__metrics">
          <span>{b.evaluated_as.toUpperCase()}</span>
          <span className="page-subtitle__sep">·</span>
          {b.is_abs && <Badge variant="cyan">ABS</Badge>}
          {b.over && <span>over: <span className="mono">{b.over.value}%</span> {b.over.ok && '✓'}</span>}
          {b.ecpm && <span>eCPM: <span className="mono">R$ {b.ecpm.value.toFixed(2)}</span> {b.ecpm.ok && '✓'}</span>}
          {b.ctr && <span>CTR: <span className="mono">{b.ctr.value}%</span> {b.ctr.ok && '✓'}</span>}
        </span>
      );
    }
    if (rule.breakdown?.matched_feature) {
      return <span>Feature aplicada: <strong>{rule.breakdown.matched_feature}</strong></span>;
    }
    return 'Avaliação automática · concedido';
  }
  if (status === 'auto_not_earned') return 'Avaliação automática · não atingiu critério';
  if (status === 'earned') return <span className="rule-row__metrics-success">Evidência aprovada</span>;
  if (status === 'pending_review') return 'Aguardando revisão do admin';
  if (status === 'rejected') return <span className="rule-row__metrics-fail">Evidência rejeitada · clique em editar pra reenviar</span>;
  if (status === 'not_claimed') return 'Aguardando você submeter evidência';
  return '';
}

function getRuleStatus(rule) {
  if (rule.breakdown?.evidence_status) {
    if (rule.breakdown.evidence_status === 'approved') return 'earned';
    if (rule.breakdown.evidence_status === 'pending_review') return 'pending_review';
    if (rule.breakdown.evidence_status === 'rejected') return 'rejected';
    if (rule.breakdown.evidence_status === 'not_claimed') return 'not_claimed';
  }
  if (rule.earned) return 'auto_earned';
  return 'auto_not_earned';
}
