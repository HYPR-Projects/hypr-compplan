import { useEffect, useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, Search, CheckCircle2, AlertTriangle, Users } from 'lucide-react';
import AppShell from '../../components/layout/AppShell.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Input } from '../../components/ui/Input.jsx';
import Avatar from '../../components/ui/Avatar.jsx';
import { fmt, currentQuarter } from '../../lib/format.js';
import { endpoints } from '../../lib/api.js';
import './Overview.css';

// Quarter selector — atual + 3 anteriores
function buildQuarterOptions() {
  const now = new Date();
  const y = now.getFullYear();
  const q = Math.floor(now.getMonth() / 3) + 1;
  const opts = [];
  for (let i = 0; i < 4; i++) {
    let qi = q - i;
    let yi = y;
    while (qi <= 0) { qi += 4; yi -= 1; }
    opts.push(`Q${qi}-${yi}`);
  }
  return opts;
}

export default function AdminOverview() {
  const navigate = useNavigate();
  const [quarter, setQuarter] = useState(currentQuarter());
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [pendingEvidences, setPendingEvidences] = useState(0);

  const quarterOptions = useMemo(() => buildQuarterOptions(), []);

  useEffect(() => {
    let cancelled = false;
    setData(null);
    endpoints.adminOverview(quarter)
      .then(d => { if (!cancelled) setData(d); })
      .catch(e => { if (!cancelled) setError(e.message); });
    return () => { cancelled = true; };
  }, [quarter]);

  const byCs = data?.by_cs || [];
  const filteredCs = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return byCs;
    return byCs.filter(c =>
      (c.cs_name || '').toLowerCase().includes(t) ||
      (c.cs_email || '').toLowerCase().includes(t)
    );
  }, [byCs, search]);

  if (error) {
    return (
      <AppShell pendingEvidences={pendingEvidences} pendingCount={data?.kpis?.n_pending || 0}>
        <Card>
          <h2 className="page-title">Erro ao carregar visão geral</h2>
          <p className="card__subtitle">{error}</p>
        </Card>
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell pendingEvidences={pendingEvidences}>
        <div className="empty-state">Carregando…</div>
      </AppShell>
    );
  }

  const { kpis } = data;

  return (
    <AppShell pendingEvidences={pendingEvidences} pendingCount={kpis.n_pending}>
      {/* Header */}
      <header className="admin-page-header fade-up">
        <div>
          <h1 className="page-title">Visão geral</h1>
          <div className="page-subtitle">
            {quarter}
            <span className="page-subtitle__sep">·</span>
            <strong>{kpis.n_cs}</strong> CSs ativos
            <span className="page-subtitle__sep">·</span>
            <strong>{kpis.n_camp}</strong> campanhas atribuídas
            {kpis.n_pending > 0 && (
              <>
                <span className="page-subtitle__sep">·</span>
                <span className="text-warn">{kpis.n_pending} pendentes</span>
              </>
            )}
          </div>
        </div>

        <div className="admin-page-header__filters">
          <select
            className="cs-select"
            value={quarter}
            onChange={(e) => setQuarter(e.target.value)}
          >
            {quarterOptions.map(q => (
              <option key={q} value={q}>{q}</option>
            ))}
          </select>
        </div>
      </header>

      {/* 4 KPIs grandes */}
      <section className="kpi-row-big stagger">
        <KpiBig
          label="Investimento bruto"
          value={fmt.brl(kpis.bruto_total)}
          sub={`${quarter}`}
          variant="neutral"
        />
        <KpiBig
          label="Bônus bruto total"
          value={fmt.brl(kpis.bonus_bruto_total || 0)}
          sub="Acumulado por CSs"
          variant="neutral"
        />
        <KpiBig
          label="Fixo total Q"
          value={fmt.brl(kpis.fixo_total || 0)}
          sub={`${kpis.n_cs} CSs × 2 meses`}
          variant="neutral"
        />
        <KpiBig
          label="Bônus líquido total"
          value={fmt.brl(kpis.bonus_liquido_total || 0)}
          sub="A pagar aos CSs"
          variant={kpis.bonus_liquido_total > 0 ? 'green' : 'neutral'}
        />
      </section>

      {/* Toolbar */}
      <div className="cs-toolbar fade-up">
        <div className="cs-toolbar__search">
          <Input
            icon={Search}
            placeholder="Buscar CS…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {/* Pendentes legacy alert (se houver) */}
      {kpis.n_pending > 0 && (
        <Card variant="warn" interactive onClick={() => navigate('/admin/pendentes')} className="fade-up admin-pending-alert">
          <div className="admin-pending-alert__content">
            <AlertTriangle size={20} />
            <div className="admin-pending-alert__text">
              <strong>{kpis.n_pending} campanhas legadas sem CS atribuído</strong>
              <div className="card__subtitle">
                {fmt.brlCompact(kpis.pending_bruto)} bruto · {fmt.brlCompact(kpis.pending_liquido)} líquido
                — atribua um CS pra entrarem no cálculo
              </div>
            </div>
            <ArrowRight size={18} />
          </div>
        </Card>
      )}

      {/* Section title */}
      <div className="cs-month-group__header" style={{ marginTop: 'var(--space-4)' }}>
        <span>Ranking por CS</span>
        <span className="cs-month-group__count">{filteredCs.length} CSs</span>
      </div>

      {filteredCs.length === 0 ? (
        <Card>
          <p className="card__subtitle">Nenhum CS encontrado.</p>
        </Card>
      ) : (
        <div className="admin-cs-grid">
          {filteredCs.map((cs, i) => (
            <CsCard key={cs.cs_email} cs={cs} i={i} onClick={() => navigate(`/admin/cs/${encodeURIComponent(cs.cs_email)}`)} />
          ))}
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

function CsCard({ cs, i, onClick }) {
  const hitFloor = cs.hit_floor;
  const fixoBrl = cs.fixo_quarter || 0;
  const bonusLiquido = cs.bonus_liquido || 0;
  const monthly = cs.monthly_salary || 0;
  const hasPositive = bonusLiquido > 0;

  return (
    <div
      className={`admin-cs-card stagger ${hasPositive ? 'has-positive-bonus' : ''}`}
      style={{ '--i': Math.min(i, 20) }}
      onClick={onClick}
    >
      <div className="admin-cs-card__header">
        <Avatar
          name={cs.cs_name}
          email={cs.cs_email}
          photoUrl={cs.photo_url}
          size="lg"
        />
        <div className="admin-cs-card__identity">
          <div className="admin-cs-card__name">{cs.cs_name || cs.cs_email}</div>
          <div className="admin-cs-card__email">{cs.cs_email}</div>
        </div>
        <ArrowRight size={18} className="admin-cs-card__arrow" />
      </div>

      <div className="admin-cs-card__stats">
        <div className="admin-cs-card__stat">
          <span className="label">Campanhas</span>
          <span className="mono">{cs.n_camp} <span className="admin-cs-card__sub">· {cs.n_reviewed} revisadas</span></span>
        </div>
        <div className="admin-cs-card__stat">
          <span className="label">Budget gerenciado</span>
          <span className="mono">{fmt.brl(cs.bruto)}</span>
        </div>
      </div>

      <div className="admin-cs-card__bonus-row">
        <div className="admin-cs-card__bonus-block">
          <span className="label">Bônus bruto</span>
          <span className="mono">{fmt.brl(cs.bonus_bruto)}</span>
        </div>
        <div className="admin-cs-card__bonus-block">
          <span className="label">Fixo (2× {monthly ? fmt.brl(monthly) : '—'})</span>
          <span className="mono">{fmt.brl(fixoBrl)}</span>
        </div>
        <div className="admin-cs-card__bonus-block admin-cs-card__bonus-block--final">
          <span className="label">Bônus líquido</span>
          <span className={`mono ${hasPositive ? 'admin-cs-card__positive' : 'admin-cs-card__warn'}`}>
            {fmt.brl(bonusLiquido)}
          </span>
        </div>
      </div>

      <div className="admin-cs-card__footer">
        {hitFloor ? (
          <Badge variant="green"><CheckCircle2 size={12} /> Atingiu piso</Badge>
        ) : fixoBrl > 0 ? (
          <Badge variant="yellow"><AlertTriangle size={12} /> Abaixo do piso · Recebe {fmt.brl(fixoBrl)} fixo</Badge>
        ) : (
          <Badge variant="neutral"><Users size={12} /> Salário não definido</Badge>
        )}
      </div>
    </div>
  );
}
