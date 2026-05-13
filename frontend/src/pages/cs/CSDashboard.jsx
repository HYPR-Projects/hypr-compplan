import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Search, ArrowRight, ArrowLeft, Eye, Calendar, Users, List, Filter,
  CheckCircle2, Clock,
} from 'lucide-react';
import AppShell from '../../components/layout/AppShell.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { fmt, currentQuarter } from '../../lib/format.js';
import { auth, endpoints } from '../../lib/api.js';
import './CSDashboard.css';

const MONTHS_PT = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const MONTHS_FULL = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];

export default function CsDashboard() {
  const navigate = useNavigate();
  const params = useParams();
  const user = auth.getUser();
  const quarter = currentQuarter();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [tab, setTab] = useState('por_mes'); // por_mes | por_cliente | lista
  const [statusFilter, setStatusFilter] = useState('todas'); // todas | revisadas | pendentes
  const [monthFilter, setMonthFilter] = useState('todos'); // todos | "2026-05" | ...

  const impersonateEmail = params.csEmail || null;

  useEffect(() => {
    let cancelled = false;
    const opts = impersonateEmail ? { as: impersonateEmail } : {};
    endpoints.meDashboard(quarter, opts)
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [quarter, impersonateEmail]);

  const items = data?.items || [];

  // Agrupa campanhas por mês (start_date) e filtra por busca + status
  const grouped = useMemo(() => {
    const t = search.trim().toLowerCase();
    let filtered = items.filter(c => {
      if (statusFilter === 'revisadas' && !c.reviewed) return false;
      if (statusFilter === 'pendentes' && c.reviewed) return false;
      if (!t) return true;
      return (
        (c.client_name || '').toLowerCase().includes(t) ||
        (c.campaign_name || '').toLowerCase().includes(t) ||
        (c.short_token || '').toLowerCase().includes(t)
      );
    });

    // Agrupa por mês
    const byMonth = {};
    for (const c of filtered) {
      const monthKey = (c.start_date || '').slice(0, 7); // "2026-05"
      if (!monthKey) continue;
      byMonth[monthKey] = byMonth[monthKey] || [];
      byMonth[monthKey].push(c);
    }

    // Ordena meses (mais recente primeiro)
    const sortedMonths = Object.keys(byMonth).sort((a, b) => b.localeCompare(a));

    if (monthFilter !== 'todos') {
      return { months: [monthFilter], byMonth };
    }
    return { months: sortedMonths, byMonth };
  }, [items, search, statusFilter, monthFilter]);

  // Lista de meses pros chips de filtro
  const monthChips = useMemo(() => {
    const months = new Set();
    for (const c of items) {
      const monthKey = (c.start_date || '').slice(0, 7);
      if (monthKey) months.add(monthKey);
    }
    return [...months].sort((a, b) => b.localeCompare(a));
  }, [items]);

  function getCampaignUrl(token) {
    return impersonateEmail
      ? `/admin/cs/${encodeURIComponent(impersonateEmail)}/campanha/${token}`
      : `/cs/campanha/${token}`;
  }

  if (error) {
    return (
      <AppShell pendingCount={data?.kpis?.n_pending || 0}>
        {impersonateEmail && <ImpersonationBanner emailOrName={impersonateEmail} onBack={() => navigate('/admin')} />}
        <Card>
          <h2 className="page-title">Erro ao carregar painel</h2>
          <p className="card__subtitle">{error}</p>
        </Card>
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell>
        {impersonateEmail && <ImpersonationBanner emailOrName={impersonateEmail} onBack={() => navigate('/admin')} />}
        <div className="empty-state">Carregando…</div>
      </AppShell>
    );
  }

  const { kpis } = data;
  const displayName = impersonateEmail
    ? (data.cs_name || data.cs_email || impersonateEmail)
    : (user?.name || user?.email || 'CS');
  const firstName = displayName.split(' ')[0].split('.')[0];

  // KPI values
  const bonusBruto = kpis.bonus_total || 0;
  const fixoQuarter = kpis.floor_quarter || 0;
  const bonusLiquido = Math.max(0, bonusBruto - fixoQuarter);
  const hitFloor = bonusBruto >= fixoQuarter && fixoQuarter > 0;

  return (
    <AppShell pendingCount={kpis.n_pending}>
      {data.impersonating && (
        <ImpersonationBanner
          emailOrName={data.cs_name || data.cs_email}
          onBack={() => navigate('/admin')}
        />
      )}

      {/* Header */}
      <header className="cs-page-header fade-up">
        <div>
          <h1 className="page-title">
            {impersonateEmail ? `Painel de ${displayName}` : `Painel ${firstName}`}
          </h1>
          <div className="page-subtitle">
            <strong>{kpis.n_camp}</strong> campanhas
            <span className="page-subtitle__sep">·</span>
            <strong>{kpis.n_reviewed}</strong> revisadas
            {kpis.n_pending > 0 && (
              <>
                <span className="page-subtitle__sep">·</span>
                <span className="text-warn">{kpis.n_pending} pendentes</span>
              </>
            )}
            <span className="page-subtitle__sep">·</span>
            {quarter}
          </div>
        </div>
      </header>

      {/* 3 KPIs grandes (estilo Report Center) */}
      <section className="kpi-row-big stagger">
        <KpiBig
          label="Bônus bruto"
          value={fmt.brl(bonusBruto)}
          sub={`${(kpis.n_camp || 0)} campanhas`}
          variant="neutral"
        />
        <KpiBig
          label="Salário fixo"
          value={fmt.brl(fixoQuarter)}
          sub={kpis.monthly_salary ? `2 × ${fmt.brl(kpis.monthly_salary)}/mês` : 'Não definido'}
          variant="neutral"
        />
        <KpiBig
          label="Bônus líquido"
          value={fmt.brl(bonusLiquido)}
          sub={hitFloor ? '✓ Piso atingido' : `Faltam ${fmt.brl(fixoQuarter - bonusBruto)} pra piso`}
          variant={hitFloor ? 'green' : 'warn'}
        />
      </section>

      {/* Tabs */}
      <div className="cs-tabs fade-up">
        <button
          className={`cs-tab ${tab === 'por_mes' ? 'cs-tab--active' : ''}`}
          onClick={() => setTab('por_mes')}
        >
          <Calendar size={14} /> Por mês
        </button>
        <button
          className={`cs-tab ${tab === 'por_cliente' ? 'cs-tab--active' : ''}`}
          onClick={() => setTab('por_cliente')}
        >
          <Users size={14} /> Por cliente
        </button>
        <button
          className={`cs-tab ${tab === 'lista' ? 'cs-tab--active' : ''}`}
          onClick={() => setTab('lista')}
        >
          <List size={14} /> Lista
        </button>
      </div>

      {/* Search + filters */}
      <div className="cs-toolbar fade-up">
        <div className="cs-toolbar__search">
          <Input
            icon={Search}
            placeholder="Buscar cliente, campanha ou token…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="cs-toolbar__filters">
          <select
            className="cs-select"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="todas">Todas</option>
            <option value="revisadas">Revisadas</option>
            <option value="pendentes">Pendentes</option>
          </select>
        </div>
      </div>

      {/* Month chips */}
      {tab === 'por_mes' && monthChips.length > 0 && (
        <div className="month-chips fade-up">
          <button
            className={`month-chip ${monthFilter === 'todos' ? 'month-chip--active' : ''}`}
            onClick={() => setMonthFilter('todos')}
          >
            Todos <span className="month-chip__count">{items.length}</span>
          </button>
          {monthChips.map(mKey => {
            const [y, m] = mKey.split('-');
            const monthLabel = `${MONTHS_PT[Number(m) - 1]} ${y.slice(-2)}`;
            const count = items.filter(c => (c.start_date || '').startsWith(mKey)).length;
            return (
              <button
                key={mKey}
                className={`month-chip ${monthFilter === mKey ? 'month-chip--active' : ''}`}
                onClick={() => setMonthFilter(mKey)}
              >
                {monthLabel} <span className="month-chip__count">{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Lista agrupada */}
      {grouped.months.length === 0 ? (
        <Card>
          <p className="card__subtitle">
            {items.length === 0
              ? `${impersonateEmail ? `${firstName} não tem campanhas` : 'Você não tem campanhas atribuídas'} no ${quarter}.`
              : 'Nenhuma campanha encontrada com esses filtros.'}
          </p>
        </Card>
      ) : (
        <div className="cs-months">
          {grouped.months.map(mKey => {
            const monthItems = grouped.byMonth[mKey] || [];
            const [y, m] = mKey.split('-');
            const monthFull = `${MONTHS_FULL[Number(m) - 1]} DE ${y}`;
            return (
              <div key={mKey} className="cs-month-group fade-up">
                <div className="cs-month-group__header">
                  <span>{monthFull}</span>
                  <span className="cs-month-group__count">{monthItems.length} campanhas</span>
                </div>
                <div className="cs-campaign-list">
                  {monthItems.map((c, i) => (
                    <CampaignRowNew
                      key={c.short_token}
                      campaign={c}
                      onClick={() => navigate(getCampaignUrl(c.short_token))}
                      i={i}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}

function KpiBig({ label, value, sub, variant }) {
  return (
    <div className={`kpi-big kpi-big--${variant || 'neutral'}`}>
      <div className="kpi-big__label">{label}</div>
      <div className="kpi-big__value mono">{value}</div>
      {sub && <div className="kpi-big__sub">{sub}</div>}
    </div>
  );
}

function ImpersonationBanner({ emailOrName, onBack }) {
  return (
    <div className="impersonation-banner">
      <Eye size={16} />
      <span>
        <strong>Visualizando como {emailOrName}.</strong> Edições serão registradas em seu nome.
      </span>
      <button className="impersonation-banner__back" onClick={onBack}>
        <ArrowLeft size={14} /> Voltar pra visão admin
      </button>
    </div>
  );
}

function CampaignRowNew({ campaign, onClick, i }) {
  const reviewed = campaign.reviewed;
  return (
    <div
      className="cs-campaign-card stagger"
      style={{ '--i': Math.min(i, 20) }}
      onClick={onClick}
    >
      {/* Indicator stripe */}
      <div className={`cs-campaign-card__stripe ${reviewed ? 'is-green' : 'is-warn'}`}></div>

      <div className="cs-campaign-card__main">
        <div className="cs-campaign-card__title-row">
          <span className="cs-campaign-card__client">{campaign.client_name}</span>
          <Badge variant="neutral">{campaign.short_token}</Badge>
          {campaign.is_legacy && <Badge variant="neutral">Legacy</Badge>}
        </div>
        <div className="cs-campaign-card__campaign">{campaign.campaign_name}</div>
        <div className="cs-campaign-card__meta">
          {fmt.dateRange(campaign.start_date, campaign.end_date)}
          {campaign.agency && <> · {campaign.agency}</>}
        </div>
      </div>

      <div className="cs-campaign-card__metric">
        <span className="label">Bruto</span>
        <span className="mono">{fmt.brl(campaign.bruto)}</span>
      </div>

      <div className="cs-campaign-card__metric">
        <span className="label">Bônus</span>
        <span className="mono cs-campaign-card__metric--cyan">
          {fmt.brl(campaign.bonus_brl || 0)}
        </span>
      </div>

      <div className="cs-campaign-card__cta">
        {reviewed ? (
          <Badge variant="green"><CheckCircle2 size={12} /> Revisada</Badge>
        ) : (
          <Badge variant="yellow"><Clock size={12} /> Revisar</Badge>
        )}
        <button className="cs-campaign-card__btn">Ver campanha <ArrowRight size={14} /></button>
      </div>
    </div>
  );
}
