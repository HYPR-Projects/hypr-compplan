import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, Clock, AlertCircle, Plus } from 'lucide-react';
import AppShell from '../../components/layout/AppShell.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import EvidenceModal from './EvidenceModal.jsx';
import { fmt, currentQuarter } from '../../lib/format.js';
import { endpoints } from '../../lib/api.js';
import './CampaignDetail.css';

const CATEGORY_LABELS = {
  pre_campaign:  'Pré Campanha',
  setup:         'Setup',
  optimization:  'Otimização',
  account_mgmt:  'Account Management',
  extras:        'Extras',
  onboarding:    'Onboarding',
};

export default function CampaignDetail() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null);

  async function load() {
    try {
      setError(null);
      // Busca todas as campanhas do quarter e filtra pelo token
      // (não temos endpoint específico /me/campaign/:token, então re-uso o /campaigns/:q)
      const data = await endpoints.meCampaigns(currentQuarter());
      const campaigns = Array.isArray(data) ? data : (data.campaigns || data.items || []);
      const found = campaigns.find(c => c.short_token === token);
      if (!found) throw new Error('Campanha não encontrada');
      setCampaign(found);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => { load(); }, [token]);

  if (error) {
    return (
      <AppShell>
        <button className="back-link" onClick={() => navigate(-1)}>
          <ArrowLeft size={14} /> Voltar
        </button>
        <Card>
          <h2 className="page-title">Erro</h2>
          <p className="card__subtitle">{error}</p>
        </Card>
      </AppShell>
    );
  }

  if (!campaign) {
    return (
      <AppShell>
        <button className="back-link" onClick={() => navigate(-1)}>
          <ArrowLeft size={14} /> Voltar
        </button>
        <div className="empty-state">Carregando…</div>
      </AppShell>
    );
  }

  const rules = campaign.rule_results || [];
  const byCategory = rules.reduce((acc, r) => {
    (acc[r.category] = acc[r.category] || []).push(r);
    return acc;
  }, {});

  const earned = rules.filter(r => r.earned).length;
  const total = rules.length;

  return (
    <AppShell>
      <button className="back-link fade-up" onClick={() => navigate(-1)}>
        <ArrowLeft size={14} /> Voltar
      </button>

      <header className="page-header campaign-detail__header">
        <div className="fade-up">
          <div className="campaign-detail__breadcrumb">
            <span>{campaign.client_name}</span>
            <span className="page-subtitle__sep">·</span>
            <Badge variant="neutral">{campaign.short_token}</Badge>
          </div>
          <h1 className="page-title">{campaign.campaign_name}</h1>
          <div className="page-subtitle">
            {fmt.dateRange(campaign.campaign_start_date, campaign.campaign_end_date)}
            <span className="page-subtitle__sep">·</span>
            <span>{fmt.brl(campaign.revenue_gross)} bruto</span>
            <span className="page-subtitle__sep">·</span>
            <span>{fmt.brl(campaign.revenue_net)} líquido</span>
          </div>
        </div>
      </header>

      <section className="kpi-row">
        <Card className="kpi">
          <div className="kpi__label label">Bônus na campanha</div>
          <div className="kpi__value mono kpi__value--cyan">
            {fmt.brl(Number(campaign.cs_bonus_amount) || 0)}
          </div>
          <div className="kpi__hero-breakdown">
            <span>{fmt.pct(campaign.cs_total_pct)} do líquido</span>
          </div>
        </Card>

        <Card className="kpi">
          <div className="kpi__label label">Regras atingidas</div>
          <div className="kpi__value mono">
            {earned}/{total}
          </div>
        </Card>

        <Card className="kpi">
          <div className="kpi__label label">Status</div>
          <div className="kpi__value">
            {campaign.is_abs ? <Badge variant="cyan">ABS</Badge> : <Badge variant="neutral">Padrão</Badge>}
          </div>
        </Card>
      </section>

      <section className="fade-up">
        <h2 className="section-title">Regras de bônus por categoria</h2>

        {Object.entries(byCategory).map(([cat, catRules]) => (
          <Card key={cat} style={{ marginBottom: 'var(--space-4)' }}>
            <header className="card__header">
              <h3 className="card__title">{CATEGORY_LABELS[cat] || cat}</h3>
            </header>
            <div className="rules-list">
              {catRules
                .sort((a, b) => (a.display_order || 99) - (b.display_order || 99))
                .map(r => (
                  <RuleRow key={r.rule_id} rule={r} onClaim={() => setEditing(r)} />
                ))}
            </div>
          </Card>
        ))}
      </section>

      {editing && (
        <EvidenceModal
          rule={editing}
          campaign={campaign}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); load(); }}
        />
      )}
    </AppShell>
  );
}

function RuleRow({ rule, onClaim }) {
  const status = rule.evidence_status || (rule.earned ? 'earned' : 'not_claimed');
  return (
    <div className="rule-row">
      <div className="rule-row__icon">
        {rule.earned ? (
          <CheckCircle2 size={18} className="rule-row__icon--earned" />
        ) : status === 'pending_review' ? (
          <Clock size={18} className="rule-row__icon--pending" />
        ) : (
          <AlertCircle size={18} className="rule-row__icon--blocked" />
        )}
      </div>

      <div className="rule-row__main">
        <div className="rule-row__name">{rule.display_name}</div>
        <div className="rule-row__meta">
          {fmt.pct(rule.bonus_pct_config)} do líquido
          {rule.reason && <> <span className="page-subtitle__sep">·</span> {rule.reason}</>}
        </div>
      </div>

      <div className="rule-row__bonus mono">
        {fmt.brl(Number(rule.bonus_amount) || 0)}
      </div>

      <div className="rule-row__cta">
        {rule.requires_evidence && !rule.earned && status !== 'pending_review' && (
          <Button variant="ghost" size="sm" icon={Plus} onClick={onClaim}>
            Reivindicar
          </Button>
        )}
        {status === 'pending_review' && <Badge variant="yellow">Em análise</Badge>}
        {rule.earned && <Badge variant="green">Aprovado</Badge>}
      </div>
    </div>
  );
}
