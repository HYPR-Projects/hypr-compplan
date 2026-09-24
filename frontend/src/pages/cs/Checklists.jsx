import { useEffect, useMemo, useState } from 'react';
import {
  Search, Radio, CalendarClock, CircleCheck, ExternalLink, X,
} from 'lucide-react';
import AppShell from '../../components/layout/AppShell.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import { Input } from '../../components/ui/Input.jsx';
import { Modal, Skeleton } from '../../components/ui/Modal.jsx';
import { fmt } from '../../lib/format.js';
import { auth, endpoints } from '../../lib/api.js';
import './Checklists.css';

const MONTHS_FULL = ['JANEIRO', 'FEVEREIRO', 'MARÇO', 'ABRIL', 'MAIO', 'JUNHO', 'JULHO', 'AGOSTO', 'SETEMBRO', 'OUTUBRO', 'NOVEMBRO', 'DEZEMBRO'];

// Mesma régua de status do Force (app/components/ChecklistsBoard.tsx):
// futura = agendada, passada = encerrada, resto = no ar.
function statusDe(row, hoje) {
  if (row.start_date && row.start_date > hoje) return 'agendada';
  if (row.end_date && row.end_date < hoje) return 'encerrada';
  return 'ativa';
}

const STATUS_META = {
  ativa:     { label: 'No ar',     variant: 'green',  icon: Radio },
  agendada:  { label: 'Agendada',  variant: 'cyan',    icon: CalendarClock },
  encerrada: { label: 'Encerrada', variant: 'neutral', icon: CircleCheck },
};

function monthKeyOf(dateStr) {
  if (!dateStr) return '0000-00';
  return String(dateStr).slice(0, 7);
}

export default function Checklists() {
  const user = auth.getUser();
  const isAdmin = user?.role === 'admin';

  const [scope, setScope] = useState(isAdmin ? 'team' : 'mine');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedToken, setSelectedToken] = useState(null);

  const hoje = new Date().toISOString().slice(0, 10);
  const ano = Number(hoje.slice(0, 4));

  useEffect(() => {
    setLoading(true);
    setError(null);
    endpoints.meChecklists({ scope, ano })
      .then(d => setRows(d.rows || []))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [scope, ano]);

  const withStatus = useMemo(
    () => rows.map(r => ({ ...r, _status: statusDe(r, hoje) })),
    [rows, hoje]
  );

  const counts = useMemo(() => ({
    todos: withStatus.length,
    ativa: withStatus.filter(r => r._status === 'ativa').length,
    agendada: withStatus.filter(r => r._status === 'agendada').length,
    encerrada: withStatus.filter(r => r._status === 'encerrada').length,
  }), [withStatus]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return withStatus.filter(r => {
      if (statusFilter !== 'todos' && r._status !== statusFilter) return false;
      if (!q) return true;
      return (
        (r.client_name || '').toLowerCase().includes(q) ||
        (r.campaign_name || '').toLowerCase().includes(q) ||
        (r.short_token || '').toLowerCase().includes(q)
      );
    });
  }, [withStatus, statusFilter, search]);

  const grouped = useMemo(() => {
    const byMonth = {};
    for (const r of filtered) {
      const k = monthKeyOf(r.start_date);
      byMonth[k] = byMonth[k] || [];
      byMonth[k].push(r);
    }
    const months = Object.keys(byMonth).sort((a, b) => b.localeCompare(a));
    return { months, byMonth };
  }, [filtered]);

  return (
    <AppShell>
      <header className="page-header fade-up">
        <div>
          <h1 className="page-title">Checklists</h1>
          <div className="page-subtitle">
            <span>Mesmos dados do checklist preenchido no Force — só leitura, pra conferir sem trocar de aba</span>
          </div>
        </div>
      </header>

      <div className="checklists-toolbar fade-up">
        <div className="checklists-tabs">
          <button
            className={`checklists-tab ${scope === 'mine' ? 'checklists-tab--active' : ''}`}
            onClick={() => setScope('mine')}
          >
            Meus checklists
          </button>
          <button
            className={`checklists-tab ${scope === 'team' ? 'checklists-tab--active' : ''}`}
            onClick={() => setScope('team')}
          >
            Todos
          </button>
        </div>

        <div className="checklists-filters">
          {[
            ['todos', `Todos (${counts.todos})`],
            ['ativa', `No ar (${counts.ativa})`],
            ['agendada', `Agendadas (${counts.agendada})`],
            ['encerrada', `Encerradas (${counts.encerrada})`],
          ].map(([key, label]) => (
            <button
              key={key}
              className={`checklists-filter-chip ${statusFilter === key ? 'is-active' : ''}`}
              onClick={() => setStatusFilter(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="checklists-search fade-up">
        <Search size={16} />
        <input
          placeholder="Buscar cliente, campanha ou token…"
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {error && (
        <Card>
          <h2 className="page-title">Erro ao carregar checklists</h2>
          <p className="card__subtitle">{error}</p>
        </Card>
      )}

      {loading && <div className="empty-state">Carregando…</div>}

      {!loading && !error && grouped.months.length === 0 && (
        <Card>
          <p className="card__subtitle">Nenhum checklist encontrado com esse filtro.</p>
        </Card>
      )}

      {!loading && !error && grouped.months.map(mKey => {
        const items = grouped.byMonth[mKey] || [];
        const [y, m] = mKey.split('-');
        const label = m === '00' ? 'SEM DATA' : `${MONTHS_FULL[Number(m) - 1]} DE ${y}`;
        return (
          <div key={mKey} className="checklists-month-group fade-up">
            <div className="checklists-month-group__header">
              <span>{label}</span>
              <span className="checklists-month-group__count">{items.length} checklists</span>
            </div>
            <div className="checklists-table">
              <div
                className="checklists-table__head"
                style={{ gridTemplateColumns: scope === 'team' ? '1.2fr 1.4fr 120px 130px 110px 100px' : '1.4fr 1.6fr 130px 110px 100px' }}
              >
                <span>Cliente</span>
                <span>Campanha</span>
                {scope === 'team' && <span>CS</span>}
                <span>Prazo</span>
                <span>Bruto</span>
                <span>Status</span>
              </div>
              {items.map(row => {
                const meta = STATUS_META[row._status];
                const Icon = meta.icon;
                return (
                  <div
                    key={row.short_token}
                    className="checklists-row"
                    style={{ gridTemplateColumns: scope === 'team' ? '1.2fr 1.4fr 120px 130px 110px 100px' : '1.4fr 1.6fr 130px 110px 100px' }}
                    onClick={() => setSelectedToken(row.short_token)}
                  >
                    <div className="checklists-row__client">
                      <span className="checklists-row__client-name">{row.client_name || '(sem cliente)'}</span>
                      <Badge variant="neutral">{row.short_token}</Badge>
                    </div>
                    <div className="checklists-row__campaign">{row.campaign_name || '—'}</div>
                    {scope === 'team' && (
                      <div className="checklists-row__cs">{row.cs_name || '—'}</div>
                    )}
                    <div className="checklists-row__prazo mono">
                      {fmt.dateRange(row.start_date, row.end_date)}
                    </div>
                    <div className="mono checklists-row__num">{fmt.brl(row.total_value)}</div>
                    <div className="checklists-row__status">
                      <Badge variant={meta.variant}><Icon size={12} /> {meta.label}</Badge>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}

      <ChecklistDetailModal
        token={selectedToken}
        onClose={() => setSelectedToken(null)}
      />
    </AppShell>
  );
}

function Field({ label, value }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="checklist-detail__field">
      <span className="checklist-detail__field-label">{label}</span>
      <span className="checklist-detail__field-value">{value}</span>
    </div>
  );
}

function arr(v) {
  if (!v) return null;
  if (Array.isArray(v)) return v.length ? v.join(', ') : null;
  return String(v);
}

function ChecklistDetailModal({ token, onClose }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!token) { setData(null); return; }
    setLoading(true);
    setError(null);
    endpoints.meChecklistDetail(token)
      .then(d => setData(d.checklist))
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  return (
    <Modal
      open={!!token}
      onClose={onClose}
      title={data ? `${data.client_name || token}` : token}
      subtitle={data?.campaign_name}
      size="lg"
    >
      {loading && (
        <div className="checklist-detail__loading">
          <Skeleton height={20} /><Skeleton height={20} /><Skeleton height={20} />
        </div>
      )}
      {error && <p className="card__subtitle">Não consegui carregar: {error}</p>}
      {data && !loading && (
        <div className="checklist-detail">
          <section className="checklist-detail__section">
            <h3>Comercial</h3>
            <div className="checklist-detail__grid">
              <Field label="Token" value={data.short_token} />
              <Field label="Indústria" value={data.industry} />
              <Field label="Tipo de campanha" value={data.campaign_type} />
              <Field label="Agência" value={data.agency} />
              <Field label="CS" value={data.cs_name} />
              <Field label="CP" value={data.cp_name} />
              <Field label="Prazo" value={fmt.dateRange(data.start_date, data.end_date)} />
              <Field label="Investimento" value={fmt.brl(data.total_value)} />
              <Field label="CPM negociado" value={data.cpm_amount != null ? `R$ ${Number(data.cpm_amount).toFixed(2)}` : null} />
              <Field label="CPCV negociado" value={data.cpcv_amount != null ? `R$ ${Number(data.cpcv_amount).toFixed(2)}` : null} />
            </div>
          </section>

          <section className="checklist-detail__section">
            <h3>Mídia</h3>
            <div className="checklist-detail__grid">
              <Field label="Formatos" value={arr(data.formats)} />
              <Field label="Produtos" value={arr(data.products)} />
              <Field label="Marketplaces" value={arr(data.marketplaces)} />
              <Field label="Audiências" value={data.audiences} />
              <Field label="Features" value={arr(data.features)} />
            </div>
          </section>

          <section className="checklist-detail__section">
            <h3>Volumetria</h3>
            <div className="checklist-detail__table">
              <div className="checklist-detail__table-head">
                <span>Produto</span><span>Display</span><span>Vídeo</span>
                <span>Bônus display</span><span>Bônus vídeo</span>
              </div>
              <div className="checklist-detail__table-row">
                <span>O2O</span>
                <span>{fmt.num(data.o2o_display_impressions)}</span>
                <span>{fmt.num(data.o2o_video_completions)}</span>
                <span>{fmt.num(data.bonus_o2o_display_impressions)}</span>
                <span>{fmt.num(data.bonus_o2o_video_completions)}</span>
              </div>
              <div className="checklist-detail__table-row">
                <span>OOH</span>
                <span>{fmt.num(data.ooh_display_impressions)}</span>
                <span>{fmt.num(data.ooh_video_completions)}</span>
                <span>{fmt.num(data.bonus_ooh_display_impressions)}</span>
                <span>{fmt.num(data.bonus_ooh_video_completions)}</span>
              </div>
            </div>
          </section>

          {arr(data.studies_used) && (
            <section className="checklist-detail__section">
              <h3>Estudos usados</h3>
              <p>{arr(data.studies_used)}</p>
            </section>
          )}

          {(data.ooh_link || data.pecas_link || data.proposta_link || data.pi_link) && (
            <section className="checklist-detail__section">
              <h3>Links</h3>
              <div className="checklist-detail__links">
                {data.proposta_link && <a href={data.proposta_link} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Proposta</a>}
                {data.pi_link && <a href={data.pi_link} target="_blank" rel="noreferrer"><ExternalLink size={13} /> PI</a>}
                {data.pecas_link && <a href={data.pecas_link} target="_blank" rel="noreferrer"><ExternalLink size={13} /> Peças</a>}
                {data.ooh_link && <a href={data.ooh_link} target="_blank" rel="noreferrer"><ExternalLink size={13} /> OOH</a>}
              </div>
            </section>
          )}

          {data.notes && (
            <section className="checklist-detail__section">
              <h3>Notas</h3>
              <p>{data.notes}</p>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}
