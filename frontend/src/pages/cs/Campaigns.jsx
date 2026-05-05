import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Filter, ArrowRight, AlertCircle } from 'lucide-react';
import AppShell from '../../components/layout/AppShell.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Badge, StatusDot, Tabs } from '../../components/ui/Badge.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { fmt, currentQuarter } from '../../lib/format.js';
import { MOCK_CAMPAIGNS } from '../../lib/mockData.js';

export default function CsCampaigns() {
  const navigate = useNavigate();
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const all = MOCK_CAMPAIGNS;
  const filtered = all.filter((c) => {
    if (filter === 'pending' && (c.has_pending_evidences || 0) === 0) return false;
    if (filter === 'abs' && !c.is_abs) return false;
    if (search) {
      const s = search.toLowerCase();
      return c.client_name.toLowerCase().includes(s)
        || c.campaign_name.toLowerCase().includes(s)
        || c.short_token.toLowerCase().includes(s);
    }
    return true;
  });

  const totalPending = all.reduce((s, c) => s + (c.has_pending_evidences || 0), 0);

  return (
    <AppShell pendingEvidences={totalPending}>
      <header className="page-header">
        <div className="fade-up">
          <h1 className="page-title">Suas campanhas</h1>
          <div className="page-subtitle">
            <span className="page-subtitle__highlight">{currentQuarter()}</span>
            <span className="page-subtitle__sep">·</span>
            <span>{all.length} campanhas</span>
            {totalPending > 0 && (
              <>
                <span className="page-subtitle__sep">·</span>
                <span style={{ color: 'var(--status-yellow)' }}>
                  {totalPending} evidência{totalPending > 1 ? 's' : ''} pendente{totalPending > 1 ? 's' : ''}
                </span>
              </>
            )}
          </div>
        </div>
      </header>

      <div className="fade-up" style={{ display: 'flex', gap: 'var(--space-4)', alignItems: 'center', marginBottom: 'var(--space-6)', flexWrap: 'wrap' }}>
        <Tabs
          value={filter}
          onChange={setFilter}
          items={[
            { value: 'all',     label: 'Todas',         count: all.length },
            { value: 'pending', label: 'Com pendências', count: all.filter(c => c.has_pending_evidences).length },
            { value: 'abs',     label: 'Clientes ABS',   count: all.filter(c => c.is_abs).length },
          ]}
        />
        <div style={{ flex: 1, maxWidth: 360 }}>
          <Input
            placeholder="Buscar cliente, campanha ou token…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            prefix={<Search size={14} />}
          />
        </div>
      </div>

      <div className="campaign-list fade-up" style={{ '--i': 1 }}>
        {filtered.length === 0 && (
          <Card>
            <p style={{ textAlign: 'center', color: 'var(--text-tertiary)', padding: 'var(--space-8)' }}>
              Nenhuma campanha encontrada com esses filtros.
            </p>
          </Card>
        )}
        {filtered.map((c, i) => (
          <CampaignFullRow
            key={c.short_token}
            campaign={c}
            onClick={() => navigate(`/campanhas/${c.short_token}`)}
            i={i}
          />
        ))}
      </div>
    </AppShell>
  );
}

function CampaignFullRow({ campaign, onClick, i }) {
  const pending = campaign.has_pending_evidences || 0;
  return (
    <div className="campaign-row stagger" style={{ '--i': i }} onClick={onClick}>
      <div className="campaign-row__indicator">
        <StatusDot
          status={pending > 0 ? 'yellow' : 'green'}
          size="md"
          pulse={pending > 0}
        />
      </div>

      <div className="campaign-row__main">
        <div className="campaign-row__title-row">
          <span className="campaign-row__client">{campaign.client_name}</span>
          <Badge variant="neutral">{campaign.short_token}</Badge>
          {campaign.is_abs && <Badge variant="cyan">ABS</Badge>}
        </div>
        <div className="campaign-row__name">{campaign.campaign_name}</div>
        <div className="campaign-row__meta">
          {fmt.dateRange(campaign.campaign_start_date, campaign.campaign_end_date)}
          <span className="page-subtitle__sep">·</span>
          {fmt.brl(campaign.revenue_gross)} bruto
        </div>
      </div>

      <div className="campaign-row__pct">
        <span className="label">Pct</span>
        <span className="campaign-row__pct-value mono">{fmt.pct(campaign.cs_total_pct)}</span>
      </div>

      <div className="campaign-row__bonus">
        <span className="label">Bônus</span>
        <span className="campaign-row__bonus-value mono">{fmt.brl(campaign.cs_bonus_amount)}</span>
      </div>

      <div className="campaign-row__cta">
        {pending > 0 && (
          <Badge variant="yellow">
            <AlertCircle size={11} />
            {pending} pendente{pending > 1 ? 's' : ''}
          </Badge>
        )}
        <ArrowRight size={16} className="campaign-row__arrow" />
      </div>
    </div>
  );
}
