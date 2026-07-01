import { useEffect, useState, useMemo } from 'react';
import { Search, AlertCircle, CheckCircle2 } from 'lucide-react';
import AppShell from '../../components/layout/AppShell.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Input } from '../../components/ui/Input.jsx';
import QuarterSelect from '../../components/ui/QuarterSelect.jsx';
import { fmt } from '../../lib/format.js';
import { useQuarter } from '../../lib/useQuarter.js';
import { endpoints } from '../../lib/api.js';
import './Pending.css';

export default function AdminPending() {
  const { quarter, setQuarter, quarterOptions } = useQuarter();
  const [items, setItems] = useState([]);
  const [team, setTeam] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [savingTokens, setSavingTokens] = useState(new Set()); // tokens em assigning
  const [feedback, setFeedback] = useState(null); // {token, ok, msg}

  async function load() {
    try {
      setLoading(true);
      setError(null);
      const [pending, teamData] = await Promise.all([
        endpoints.adminPending(quarter),
        endpoints.adminTeam(),
      ]);
      setItems(pending.items || []);
      setTeam(teamData.items || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [quarter]);

  async function handleAssign(token, csEmail) {
    if (!csEmail) return;
    setSavingTokens(prev => new Set(prev).add(token));
    setFeedback(null);
    try {
      await endpoints.adminAssignPending(token, csEmail);
      // Remove da lista (otimista)
      setItems(prev => prev.filter(i => i.short_token !== token));
      setFeedback({ token, ok: true, msg: `Atribuída a ${csEmail}` });
      // Esconde feedback após 3s
      setTimeout(() => setFeedback(null), 3000);
    } catch (e) {
      setFeedback({ token, ok: false, msg: e.message });
    } finally {
      setSavingTokens(prev => {
        const n = new Set(prev);
        n.delete(token);
        return n;
      });
    }
  }

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return items;
    return items.filter(c =>
      (c.client_name || '').toLowerCase().includes(t) ||
      (c.campaign_name || '').toLowerCase().includes(t) ||
      (c.cp_name || '').toLowerCase().includes(t) ||
      (c.short_token || '').toLowerCase().includes(t)
    );
  }, [items, search]);

  const totalBruto = filtered.reduce((s, c) => s + (Number(c.bruto) || 0), 0);
  const totalLiquido = filtered.reduce((s, c) => s + (Number(c.liquido) || 0), 0);

  if (error) {
    return (
      <AppShell pendingCount={items.length}>
        <Card>
          <h2 className="page-title">Erro ao carregar pendentes</h2>
          <p className="card__subtitle">{error}</p>
        </Card>
      </AppShell>
    );
  }

  return (
    <AppShell pendingCount={items.length}>
      <header className="page-header fade-up">
        <div>
          <h1 className="page-title">Campanhas pendentes</h1>
          <div className="page-subtitle">
            <QuarterSelect value={quarter} options={quarterOptions} onChange={setQuarter} />
            <span className="page-subtitle__sep">·</span>
            <span>{filtered.length} de {items.length} pendentes</span>
            <span className="page-subtitle__sep">·</span>
            <span>{fmt.brlCompact(totalBruto)} bruto</span>
            <span className="page-subtitle__sep">·</span>
            <span>{fmt.brlCompact(totalLiquido)} líquido</span>
          </div>
        </div>
      </header>

      <Card className="pending-help fade-up" style={{ marginBottom: 'var(--space-4)' }}>
        <div className="pending-help__content">
          <AlertCircle size={18} className="pending-help__icon" />
          <div>
            <strong>Campanhas legadas sem CS atribuído.</strong>
            <p className="card__subtitle">
              Selecione um CS pra cada uma — assim que atribuir, a campanha some daqui e aparece em <strong>Campanhas</strong>, contando no bônus do CS.
            </p>
          </div>
        </div>
      </Card>

      <section style={{ marginBottom: 'var(--space-4)' }}>
        <Input
          icon={Search}
          placeholder="Buscar por cliente, campanha, salesman ou token..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </section>

      {loading && <div className="empty-state">Carregando…</div>}

      {!loading && filtered.length === 0 && (
        <Card>
          <p className="card__subtitle">
            {items.length === 0
              ? `🎉 Nenhuma campanha pendente no ${quarter}. Todas as legacies têm CS atribuído!`
              : 'Nenhuma campanha encontrada com essa busca.'}
          </p>
        </Card>
      )}

      {!loading && filtered.length > 0 && (
        <div className="pending-table">
          <div className="pending-table__head">
            <span>Cliente / Campanha</span>
            <span>Período</span>
            <span style={{ textAlign: 'right' }}>Bruto</span>
            <span>Atribuir CS</span>
          </div>

          {filtered.map((c, i) => (
            <PendingRow
              key={c.short_token}
              campaign={c}
              team={team}
              saving={savingTokens.has(c.short_token)}
              feedback={feedback?.token === c.short_token ? feedback : null}
              onAssign={(csEmail) => handleAssign(c.short_token, csEmail)}
              i={i}
            />
          ))}
        </div>
      )}
    </AppShell>
  );
}

function PendingRow({ campaign, team, saving, feedback, onAssign, i }) {
  const [selected, setSelected] = useState('');

  return (
    <div className="pending-table__row stagger" style={{ '--i': Math.min(i, 20) }}>
      <div className="pending-table__cell-main">
        <div className="pending-table__client">
          <span>{campaign.client_name}</span>
          <Badge variant="neutral">{campaign.short_token}</Badge>
          <Badge variant="neutral">Legacy</Badge>
        </div>
        <div className="pending-table__campaign">{campaign.campaign_name}</div>
        <div className="pending-table__meta">
          {campaign.cp_name && <>{campaign.cp_name} · </>}
          {campaign.agency || '—'}
        </div>
      </div>

      <div className="pending-table__period">
        {fmt.dateRange(campaign.start_date, campaign.end_date)}
      </div>

      <div className="mono pending-table__num">{fmt.brl(campaign.bruto)}</div>

      <div className="pending-table__assign">
        <select
          className="pending-select"
          value={selected}
          onChange={(e) => setSelected(e.target.value)}
          disabled={saving}
        >
          <option value="">Selecione um CS…</option>
          {team.map(cs => (
            <option key={cs.email} value={cs.email}>{cs.name}</option>
          ))}
        </select>
        <button
          className="pending-assign-btn"
          onClick={() => onAssign(selected)}
          disabled={!selected || saving}
        >
          {saving ? 'Salvando…' : 'Atribuir'}
        </button>
        {feedback && (
          <div className={`pending-feedback pending-feedback--${feedback.ok ? 'ok' : 'err'}`}>
            {feedback.ok ? <CheckCircle2 size={12} /> : <AlertCircle size={12} />}
            <span>{feedback.msg}</span>
          </div>
        )}
      </div>
    </div>
  );
}
