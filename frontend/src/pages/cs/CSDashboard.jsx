import { useEffect, useState, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  Search, ArrowRight, ArrowLeft, Eye, Calendar, Users, List, Filter,
  CheckCircle2, Clock, UserPlus, X, BookOpen, Shield,
} from 'lucide-react';
import AppShell from '../../components/layout/AppShell.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Input } from '../../components/ui/Input.jsx';
import Button from '../../components/ui/Button.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
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
  const [showAssignPreModal, setShowAssignPreModal] = useState(false);

  const impersonateEmail = params.csEmail || null;

  async function load() {
    const opts = impersonateEmail ? { as: impersonateEmail } : {};
    try {
      const d = await endpoints.meDashboard(quarter, opts);
      setData(d);
      setError(null);
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => {
    load();
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
            {kpis.score_pct != null && (
              <span
                className="cs-score-badge"
                title={`Média de % nas ${kpis.score_n_campaigns} campanhas finalizadas + revisadas`}
              >
                Score {quarter}: <strong>{kpis.score_pct.toFixed(2)}%</strong>
              </span>
            )}
          </div>
        </div>
        <Button variant="ghost" icon={UserPlus} onClick={() => setShowAssignPreModal(true)}>
          Atribuir Pré Campanha
        </Button>
      </header>

      {/* Floor override (admin impersonando) */}
      {data.impersonating && user?.role === 'admin' && (
        <FloorOverridePanel
          csEmail={impersonateEmail}
          quarter={quarter}
          currentMonthsOff={kpis.floor_override?.months_off || 0}
          monthlySalary={kpis.monthly_salary || 0}
          onChange={() => load()}
        />
      )}

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
          sub={(() => {
            const months = kpis.floor_months ?? 2;
            const salary = kpis.monthly_salary;
            if (!salary) return 'Não definido';
            if (months === 0) return '✓ Piso zerado por admin';
            if (months < 2) return `${months}× ${fmt.brl(salary)}/mês · admin tirou ${2 - months}m`;
            return `2 × ${fmt.brl(salary)}/mês`;
          })()}
          variant={kpis.floor_months !== undefined && kpis.floor_months < 2 ? 'green' : 'neutral'}
        />
        <KpiBig
          label="Bônus líquido"
          value={fmt.brl(bonusLiquido)}
          sub={hitFloor ? '✓ Piso atingido' : `Faltam ${fmt.brl(fixoQuarter - bonusBruto)} pra piso`}
          variant={hitFloor ? 'green' : 'warn'}
        />
      </section>

      {/* Admin-only: controle de override do piso */}
      {impersonateEmail && (
        <FloorOverrideControl
          csEmail={impersonateEmail}
          quarter={quarter}
          monthsWaived={2 - (kpis.floor_months ?? 2)}
          monthlySalary={kpis.monthly_salary || 0}
          onChange={() => load()}
        />
      )}

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

      {/* Pré Campanhas que este CS está cuidando em campanhas de outros */}
      {data.pre_assigned_items && data.pre_assigned_items.length > 0 && (
        <section className="cs-pre-assigned fade-up">
          <div className="cs-month-group__header">
            <span>
              <UserPlus size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              Pré Campanha em campanhas de outros CSs
            </span>
            <span className="cs-month-group__count">
              {fmt.brl(data.kpis.bonus_pre_assigned)} · {data.pre_assigned_items.length} {data.pre_assigned_items.length === 1 ? 'campanha' : 'campanhas'}
            </span>
          </div>
          <div className="cs-pre-assigned__list">
            {data.pre_assigned_items.map(pa => (
              <div key={pa.short_token} className="cs-pre-assigned__card" onClick={() => navigate(`/cs/campanha/${pa.short_token}`)}>
                <div className="cs-pre-assigned__main">
                  <div className="cs-pre-assigned__title">
                    <span className="cs-campaign-card__client">{pa.client_name}</span>
                    <Badge variant="neutral">{pa.short_token}</Badge>
                    {pa.is_legacy && <Badge variant="neutral">Legacy</Badge>}
                  </div>
                  <div className="cs-pre-assigned__campaign">{pa.campaign_name}</div>
                  <div className="cs-pre-assigned__meta">
                    Dono: <strong>{pa.owner_cs_name || pa.owner_cs_email}</strong>
                    <span className="page-subtitle__sep">·</span>
                    {fmt.dateRange(pa.start_date, pa.end_date)}
                  </div>
                </div>
                <div className="cs-pre-assigned__values">
                  <span className="mono cs-campaign-card__pct">{(pa.pre_subtotal_pct * 100).toFixed(2)}%</span>
                  <span className="mono cs-campaign-card__brl">{fmt.brl(pa.pre_subtotal_brl)}</span>
                </div>
                <ArrowRight size={16} className="cs-campaign-card__arrow" />
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Estudos usados em campanhas de outros CSs (autor recebe 0.30%) */}
      {data.study_authored_items && data.study_authored_items.length > 0 && (
        <section className="cs-pre-assigned fade-up">
          <div className="cs-month-group__header">
            <span>
              <BookOpen size={14} style={{ verticalAlign: 'middle', marginRight: 6 }} />
              Estudos seus usados em campanhas de outros CSs
            </span>
            <span className="cs-month-group__count">
              {fmt.brl(data.kpis.bonus_study_authored)} · {data.study_authored_items.length} {data.study_authored_items.length === 1 ? 'campanha' : 'campanhas'}
            </span>
          </div>
          <div className="cs-pre-assigned__list">
            {data.study_authored_items.map(sa => (
              <div key={sa.short_token} className="cs-study-authored__card" onClick={() => navigate(`/cs/campanha/${sa.short_token}`)}>
                <div className="cs-pre-assigned__main">
                  <div className="cs-pre-assigned__title">
                    <span className="cs-campaign-card__client">{sa.client_name}</span>
                    <Badge variant="neutral">{sa.short_token}</Badge>
                    {sa.is_legacy && <Badge variant="neutral">Legacy</Badge>}
                  </div>
                  <div className="cs-pre-assigned__campaign">{sa.campaign_name}</div>
                  <div className="cs-pre-assigned__meta">
                    Dono: <strong>{sa.owner_cs_name || sa.owner_cs_email}</strong>
                    <span className="page-subtitle__sep">·</span>
                    Estudo: <strong>{sa.study_name}</strong>
                    <span className="page-subtitle__sep">·</span>
                    {fmt.dateRange(sa.start_date, sa.end_date)}
                  </div>
                </div>
                <div className="cs-pre-assigned__values">
                  <span className="mono cs-campaign-card__pct">{(sa.study_bonus_pct * 100).toFixed(2)}%</span>
                  <span className="mono cs-campaign-card__brl">{fmt.brl(sa.study_bonus_brl)}</span>
                </div>
                <ArrowRight size={16} className="cs-campaign-card__arrow" />
              </div>
            ))}
          </div>
        </section>
      )}

      {showAssignPreModal && (
        <AssignPreModal
          onClose={() => setShowAssignPreModal(false)}
          onSuccess={() => { setShowAssignPreModal(false); load(); }}
          opts={impersonateEmail ? { as: impersonateEmail } : {}}
        />
      )}
    </AppShell>
  );
}

function FloorOverridePanel({ csEmail, quarter, currentMonthsOff, monthlySalary, onChange }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  async function setMonths(m) {
    setSaving(true);
    setError(null);
    try {
      await endpoints.setFloorOverride(csEmail, quarter, m);
      onChange?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  const newFixo = monthlySalary * Math.max(0, 2 - currentMonthsOff);
  const labelFor = (m) => {
    if (m === 0) return 'Piso normal (2 meses)';
    if (m === 1) return 'Tirar 1 mês';
    return 'Tirar 2 meses (zerar piso)';
  };

  return (
    <section className="floor-override-panel">
      <div className="floor-override-panel__header">
        <Shield size={14} />
        <strong>Override de piso (admin)</strong>
        <span className="floor-override-panel__current">
          Atual: {currentMonthsOff === 0 ? 'piso completo' :
                  currentMonthsOff === 1 ? '−1 mês' : '−2 meses (zerado)'}
          {' '}· Fixo do quarter: {fmt.brl(newFixo)}
        </span>
      </div>
      <div className="floor-override-panel__actions">
        {[0, 1, 2].map(m => (
          <button
            key={m}
            type="button"
            disabled={saving || m === currentMonthsOff}
            className={`floor-override-btn ${m === currentMonthsOff ? 'is-active' : ''}`}
            onClick={() => setMonths(m)}
          >
            {labelFor(m)}
          </button>
        ))}
      </div>
      {error && <div className="floor-override-panel__error">{error}</div>}
    </section>
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
          {campaign.review_requested && (
            <Badge variant="yellow">📋 Pedido de análise</Badge>
          )}
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

function AssignPreModal({ onClose, onSuccess, opts }) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);

  // Busca inicial (sem query)
  useEffect(() => {
    endpoints.mePreCampaignSearch('', opts)
      .then(d => setResults(d.items || []))
      .catch(e => setErr(e.message));
  }, []);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => {
      endpoints.mePreCampaignSearch(search.trim(), opts)
        .then(d => setResults(d.items || []))
        .catch(e => setErr(e.message));
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  async function handleConfirm() {
    if (!selected) return;
    setLoading(true);
    setErr(null);
    try {
      await endpoints.meAssignPre(selected.short_token, opts);
      onSuccess();
    } catch (e) {
      setErr(e.message);
      setLoading(false);
    }
  }

  return (
    <Modal open={true} title="Atribuir Pré Campanha em outra campanha" onClose={onClose} size="lg">
      <div className="form-stack">
        <Card variant="info" style={{ padding: 'var(--space-3)' }}>
          <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            Atribua a si mesmo a <strong>Pré Campanha</strong> de uma campanha de outro CS.
            Você recebe <strong>1,35%</strong> (max) sobre a líquida dessa campanha pelos itens
            de Pré que marcar.
          </div>
        </Card>

        <Input
          icon={Search}
          placeholder="Buscar por cliente, campanha, token ou CS…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        {results === null ? (
          <div className="empty-state" style={{ padding: 'var(--space-3)' }}>Buscando…</div>
        ) : results.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--space-3)' }}>
            Nenhuma campanha encontrada.
          </div>
        ) : (
          <div className="replicate-list">
            {results.map(c => (
              <label
                key={c.short_token}
                className={`replicate-option ${selected?.short_token === c.short_token ? 'replicate-option--selected' : ''}`}
              >
                <input
                  type="radio"
                  name="campaign"
                  value={c.short_token}
                  checked={selected?.short_token === c.short_token}
                  onChange={() => setSelected(c)}
                />
                <div className="replicate-option__main">
                  <div className="replicate-option__title">
                    <span className="cs-campaign-card__client">{c.client_name}</span>
                    <strong>{c.campaign_name}</strong>
                    <Badge variant="neutral">{c.short_token}</Badge>
                    {c.is_legacy && <Badge variant="neutral">Legacy</Badge>}
                    {c.pre_assignee && (
                      <Badge variant="yellow">Pré já atribuída</Badge>
                    )}
                  </div>
                  <div className="replicate-option__meta">
                    CS dono: <strong>{c.cs_name || c.cs_email}</strong>
                    <span className="page-subtitle__sep">·</span>
                    {fmt.dateRange(c.start_date, c.end_date)}
                    {c.pre_assignee && (
                      <>
                        <span className="page-subtitle__sep">·</span>
                        Pré atualmente com {c.pre_assignee}
                      </>
                    )}
                  </div>
                </div>
              </label>
            ))}
          </div>
        )}

        {err && <div className="form-error">{err}</div>}

        <div className="modal__footer">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            icon={UserPlus}
            onClick={handleConfirm}
            disabled={!selected || loading}
          >
            {loading ? 'Atribuindo…' : 'Atribuir Pré pra mim'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/**
 * FloorOverrideControl — Admin tira 1 ou 2 meses do piso do CS no quarter.
 * Apenas visível em modo impersonate (admin no painel do CS).
 */
function FloorOverrideControl({ csEmail, quarter, monthsWaived, monthlySalary, onChange }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  const setMonths = async (m) => {
    if (saving) return;
    setSaving(true); setError(null);
    try {
      await api.post(
        `/commplan/admin/cs-config/${encodeURIComponent(csEmail)}/floor-override`,
        { quarter, months_waived: m }
      );
      onChange?.();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="floor-override-control fade-up">
      <div className="floor-override-control__title">
        <Shield size={14} /> Override do piso (admin)
      </div>
      <div className="floor-override-control__body">
        <span className="floor-override-control__desc">
          Tirar meses do piso ({monthlySalary ? fmt.brl(monthlySalary) : 'R$ —'}/mês) no quarter {quarter}:
        </span>
        <div className="floor-override-control__buttons">
          <button
            className={`btn-toggle ${monthsWaived === 0 ? 'btn-toggle--active' : ''}`}
            onClick={() => setMonths(0)}
            disabled={saving}
          >
            Sem desconto (2 meses)
          </button>
          <button
            className={`btn-toggle ${monthsWaived === 1 ? 'btn-toggle--active' : ''}`}
            onClick={() => setMonths(1)}
            disabled={saving}
          >
            Tirar 1 mês
          </button>
          <button
            className={`btn-toggle ${monthsWaived === 2 ? 'btn-toggle--active' : ''}`}
            onClick={() => setMonths(2)}
            disabled={saving}
          >
            Tirar 2 meses (zerar)
          </button>
        </div>
      </div>
      {error && <div className="floor-override-control__error">⚠ {error}</div>}
    </section>
  );
}
