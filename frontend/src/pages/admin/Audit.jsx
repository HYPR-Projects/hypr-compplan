import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield, ChevronRight, ChevronDown, ExternalLink, AlertTriangle,
  Check, X, RotateCcw, Search, Clock, CircleX, Download, FileSpreadsheet,
} from 'lucide-react';
import AppShell from '../../components/layout/AppShell.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { Input, Textarea } from '../../components/ui/Input.jsx';
import { fmt, currentQuarter } from '../../lib/format.js';
import { endpoints } from '../../lib/api.js';
import './Audit.css';

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

const GROUPS_META = [
  { key: 'setup_anulado',         label: 'Setup anulado por over > 50%', color: 'red'   },
  { key: 'otimizacao_fora_meta',  label: 'Otimização fora da meta',      color: 'amber' },
  { key: 'evidencia_faltando',    label: 'Evidência faltando',           color: 'amber' },
  { key: 'admin_flagged_issue',   label: 'Sinalizadas com problema',     color: 'red'   },
  { key: 'all_ok',                label: 'OK em tudo',                   color: 'green' },
];

export default function AuditPage() {
  const navigate = useNavigate();
  const [quarter, setQuarter] = useState(currentQuarter());
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [expandedTokens, setExpandedTokens] = useState(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState(new Set(['all_ok'])); // OK colapsado por padrão
  const [issueModalToken, setIssueModalToken] = useState(null);
  const [busyToken, setBusyToken] = useState(null);

  const quarterOptions = useMemo(() => buildQuarterOptions(), []);

  useEffect(() => {
    setError(null);
    setData(null);
    endpoints.adminAudit(quarter)
      .then(d => {
        setData(d);
        // Expande automaticamente o primeiro item de cada grupo (exceto all_ok)
        const auto = new Set();
        for (const g of GROUPS_META) {
          if (g.key === 'all_ok') continue;
          const first = d.groups?.[g.key]?.[0];
          if (first) auto.add(first.short_token);
        }
        setExpandedTokens(auto);
      })
      .catch(e => setError(e.message));
  }, [quarter]);

  function toggleExpand(token) {
    setExpandedTokens(prev => {
      const next = new Set(prev);
      if (next.has(token)) next.delete(token);
      else next.add(token);
      return next;
    });
  }

  function toggleGroup(key) {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  async function markOk(token) {
    setBusyToken(token);
    try {
      await endpoints.adminAuditMark(token, 'ok', '');
      // Refetch — mais simples que mover na árvore
      const fresh = await endpoints.adminAudit(quarter);
      setData(fresh);
    } catch (e) {
      setError(`Falha ao marcar OK: ${e.message}`);
    } finally {
      setBusyToken(null);
    }
  }

  async function markIssue(token, notes) {
    setBusyToken(token);
    try {
      await endpoints.adminAuditMark(token, 'issue', notes);
      const fresh = await endpoints.adminAudit(quarter);
      setData(fresh);
      setIssueModalToken(null);
    } catch (e) {
      setError(`Falha ao sinalizar: ${e.message}`);
    } finally {
      setBusyToken(null);
    }
  }

  async function clearMark(token) {
    setBusyToken(token);
    try {
      await endpoints.adminAuditMark(token, null, '');
      const fresh = await endpoints.adminAudit(quarter);
      setData(fresh);
    } catch (e) {
      setError(`Falha ao desfazer: ${e.message}`);
    } finally {
      setBusyToken(null);
    }
  }

  // Aplica search filter sobre todos os grupos
  const filteredGroups = useMemo(() => {
    if (!data) return null;
    if (!search.trim()) return data.groups;
    const q = search.trim().toLowerCase();
    const filtered = {};
    for (const g of GROUPS_META) {
      filtered[g.key] = (data.groups[g.key] || []).filter(c =>
        (c.client_name || '').toLowerCase().includes(q)
        || (c.campaign_name || '').toLowerCase().includes(q)
        || (c.cs_email || '').toLowerCase().includes(q)
        || (c.cs_name || '').toLowerCase().includes(q)
        || (c.short_token || '').toLowerCase().includes(q)
      );
    }
    return filtered;
  }, [data, search]);

  if (error) {
    return (
      <AppShell>
        <Card variant="warn"><strong>Erro:</strong> {error}</Card>
      </AppShell>
    );
  }

  if (!data) {
    return (
      <AppShell>
        <div className="empty-state">Carregando…</div>
      </AppShell>
    );
  }

  const { totals } = data;

  return (
    <AppShell>
      <header className="admin-page-header fade-up">
        <div>
          <h1 className="page-title">
            <Shield size={20} style={{ verticalAlign: 'middle', marginRight: 8 }} />
            Auditoria · {quarter}
          </h1>
          <div className="page-subtitle">
            <strong>{totals.total}</strong> campanhas finalizadas
            {totals.with_issue > 0 && (
              <>
                {' · '}
                <span className="text-warn"><strong>{totals.with_issue}</strong> precisam atenção</span>
              </>
            )}
            {totals.ok_marked > 0 && (
              <>{' · '}<strong>{totals.ok_marked}</strong> OK</>
            )}
          </div>
        </div>
        <div className="audit-toolbar">
          <select
            className="audit-quarter-select"
            value={quarter}
            onChange={(e) => setQuarter(e.target.value)}
          >
            {quarterOptions.map(q => <option key={q} value={q}>{q}</option>)}
          </select>
          <Input
            icon={Search}
            placeholder="Buscar CS, cliente..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: 220 }}
          />
          <Button
            variant="ghost"
            icon={FileSpreadsheet}
            onClick={() => endpoints.adminExportAudit(quarter, 'xlsx').catch(e => setError(`Falha no export: ${e.message}`))}
            title="Baixa 1 arquivo XLSX com 2 abas (Resumo + Detalhe)"
          >
            Excel
          </Button>
          <Button
            variant="ghost"
            icon={Download}
            onClick={() => endpoints.adminExportAudit(quarter, 'csv').catch(e => setError(`Falha no export: ${e.message}`))}
            title="Baixa ZIP com 2 CSVs (resumo + detalhe)"
          >
            CSV
          </Button>
        </div>
      </header>

      {totals.total === 0 && (
        <Card>
          <p className="card__subtitle">
            Nenhuma campanha finalizada nesse quarter. 🎉
          </p>
        </Card>
      )}

      {totals.total > 0 && (
        <div className="audit-groups">
          {GROUPS_META.map(g => {
            const items = filteredGroups[g.key] || [];
            if (items.length === 0) return null;
            const isCollapsed = collapsedGroups.has(g.key);

            return (
              <div key={g.key} className={`audit-group audit-group--${g.color}`}>
                <button
                  type="button"
                  className="audit-group__header"
                  onClick={() => toggleGroup(g.key)}
                  aria-expanded={!isCollapsed}
                >
                  {isCollapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
                  <span className="audit-group__label">{g.label}</span>
                  <span className="audit-group__count">{items.length} {items.length === 1 ? 'campanha' : 'campanhas'}</span>
                </button>

                {!isCollapsed && (
                  <div className="audit-group__body">
                    {items.map(c => (
                      <AuditCampaignRow
                        key={c.short_token}
                        campaign={c}
                        expanded={expandedTokens.has(c.short_token)}
                        onToggle={() => toggleExpand(c.short_token)}
                        onOpenDetail={() => navigate(`/admin/cs/${encodeURIComponent(c.cs_email)}/campanha/${c.short_token}`)}
                        onMarkOk={() => markOk(c.short_token)}
                        onMarkIssue={() => setIssueModalToken(c.short_token)}
                        onClearMark={() => clearMark(c.short_token)}
                        busy={busyToken === c.short_token}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {issueModalToken && (
        <IssueModal
          token={issueModalToken}
          onCancel={() => setIssueModalToken(null)}
          onConfirm={(notes) => markIssue(issueModalToken, notes)}
          busy={busyToken === issueModalToken}
        />
      )}
    </AppShell>
  );
}

// ─────────────────────────────────────────────────────────────────────
// Sub-componentes
// ─────────────────────────────────────────────────────────────────────

function AuditCampaignRow({ campaign: c, expanded, onToggle, onOpenDetail, onMarkOk, onMarkIssue, onClearMark, busy }) {
  const setupBad = c.setup.status === 'invalid';
  const optBad = !c.optimization.ok;
  const evBad = !c.evidences.ok;
  const isMarked = !!c.audit_mark;

  // Quando colapsada: mostra resumo compacto
  if (!expanded) {
    return (
      <div className={`audit-row ${isMarked ? `audit-row--${c.audit_mark.status}` : ''}`}>
        <button type="button" className="audit-row__toggle" onClick={onToggle} aria-label="Expandir">
          <ChevronRight size={14} />
        </button>
        <div className="audit-row__main" onClick={onToggle}>
          <div className="audit-row__title">
            <strong>{c.client_name}</strong>
            <span className="audit-row__campaign">{c.campaign_name}</span>
          </div>
          <div className="audit-row__meta">
            {c.short_token} · {c.cs_name || c.cs_email} · {fmt.dateRange(c.start_date, c.end_date)}
          </div>
        </div>
        <div className="audit-row__summary">
          <StatusChip label="Setup" ok={!setupBad} value={setupBad ? `Over ${Math.round(c.setup.over_pct)}%` : null} />
          <StatusChip label="Otim." ok={!optBad} value={`${c.optimization.earned}/${c.optimization.total}`} />
          <StatusChip label="Evid." ok={!evBad} value={c.evidences.total > 0 ? `${c.evidences.filled}/${c.evidences.total}` : '—'} />
        </div>
      </div>
    );
  }

  // Expandida: card detalhado
  return (
    <div className={`audit-card ${isMarked ? `audit-card--${c.audit_mark.status}` : ''}`}>
      <div className="audit-card__head">
        <button type="button" className="audit-row__toggle" onClick={onToggle} aria-label="Recolher">
          <ChevronDown size={14} />
        </button>
        <div className="audit-card__title">
          <strong>{c.client_name}</strong>
          <span className="audit-card__campaign">{c.campaign_name}</span>
        </div>
        <div className="audit-card__meta">
          {c.short_token} · {c.cs_name || c.cs_email} · {fmt.dateRange(c.start_date, c.end_date)}
          {c.review_decision && (
            <Badge variant={c.review_decision === 'approved' ? 'green' : 'red'} style={{ marginLeft: 8 }}>
              Pedido {c.review_decision === 'approved' ? 'aprovado' : 'recusado'}
            </Badge>
          )}
        </div>
      </div>

      {/* 3 cards: Setup, Otimização, Evidências */}
      <div className="audit-card__stats">
        <StatBlock title="Setup" ok={!setupBad}>
          {setupBad ? (
            <>
              <div className="stat-block__value"><X size={14} /> Anulado</div>
              <div className="stat-block__sub">
                Display: {fmt.numCompact(c.setup.display_viewable)} entregues / {fmt.numCompact(c.setup.display_contracted)} contratados
                <br />Over: <strong>{c.setup.over_pct.toFixed(1)}%</strong>
              </div>
            </>
          ) : c.setup.status === 'pending' ? (
            <>
              <div className="stat-block__value"><Clock size={14} /> Em andamento</div>
              <div className="stat-block__sub">Over atual: {c.setup.over_pct.toFixed(1)}%</div>
            </>
          ) : (
            <>
              <div className="stat-block__value"><Check size={14} /> Válido</div>
              <div className="stat-block__sub">Over: {c.setup.over_pct.toFixed(1)}% (≤ 50%)</div>
            </>
          )}
        </StatBlock>

        <StatBlock title="Otimização" ok={!optBad}>
          <div className="stat-block__value">
            {optBad ? <AlertTriangle size={14} /> : <Check size={14} />}
            {c.optimization.total === 0 ? '—' : `${c.optimization.earned}/${c.optimization.total} earned`}
          </div>
          <div className="stat-block__sub">
            {c.optimization.details.length === 0 && 'Sem otimizações aplicáveis'}
            {c.optimization.details.map(d => (
              <div key={d.id}>
                {d.earned ? <Check size={10} /> : <X size={10} />} {d.label}
                {d.reason && !d.earned && <span className="stat-block__reason"> · {d.reason}</span>}
              </div>
            ))}
          </div>
        </StatBlock>

        <StatBlock title="Evidências" ok={!evBad}>
          <div className="stat-block__value">
            {evBad ? <AlertTriangle size={14} /> : <Check size={14} />}
            {c.evidences.total === 0 ? '—' : `${c.evidences.filled}/${c.evidences.total}`}
          </div>
          <div className="stat-block__sub">
            {c.evidences.total === 0 && 'Sem items que precisam link'}
            {c.evidences.missing.length > 0 && (
              <div className="evid-missing">
                Faltando: {c.evidences.missing.map(m => m.label).join(', ')}
              </div>
            )}
          </div>
        </StatBlock>
      </div>

      {/* Lista de links */}
      {c.evidences.items.length > 0 && (
        <div className="audit-card__links">
          <div className="audit-card__links-label">Links anexados pelo CS</div>
          <div className="audit-card__links-list">
            {c.evidences.items.map(it => (
              <a
                key={it.id}
                href={normalizeUrl(it.url)}
                target="_blank"
                rel="noopener noreferrer"
                className="audit-link"
              >
                <ExternalLink size={12} /> <span className="audit-link__label">{it.label}</span>
                <span className="audit-link__url">{shortUrl(it.url)}</span>
              </a>
            ))}
            {c.evidences.missing.map(m => (
              <div key={m.id} className="audit-link audit-link--missing">
                <CircleX size={12} /> <span className="audit-link__label">{m.label}</span>
                <span className="audit-link__url">sem link</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Notas de auditoria (se já marcou) */}
      {c.audit_mark && (
        <div className={`audit-card__mark audit-card__mark--${c.audit_mark.status}`}>
          {c.audit_mark.status === 'ok' ? (
            <>
              <Check size={14} /> Marcada OK por {c.audit_mark.by} · {fmt.date(c.audit_mark.at)}
            </>
          ) : (
            <>
              <AlertTriangle size={14} /> Sinalizada por {c.audit_mark.by} · {fmt.date(c.audit_mark.at)}
              {c.audit_mark.notes && (
                <div className="audit-card__mark-notes">"{c.audit_mark.notes}"</div>
              )}
            </>
          )}
        </div>
      )}

      {/* Ações */}
      <div className="audit-card__actions">
        <Button variant="ghost" onClick={onOpenDetail}>Abrir campanha completa</Button>
        {isMarked ? (
          <Button variant="ghost" icon={RotateCcw} onClick={onClearMark} disabled={busy}>
            Desfazer marcação
          </Button>
        ) : (
          <>
            <button
              type="button"
              className="audit-card__action-btn audit-card__action-btn--issue"
              onClick={onMarkIssue}
              disabled={busy}
            >
              <AlertTriangle size={14} /> Marcar problema
            </button>
            <button
              type="button"
              className="audit-card__action-btn audit-card__action-btn--ok"
              onClick={onMarkOk}
              disabled={busy}
            >
              <Check size={14} /> Marcar OK
            </button>
          </>
        )}
      </div>
    </div>
  );
}

function StatusChip({ label, ok, value }) {
  return (
    <span className={`status-chip ${ok ? 'status-chip--ok' : 'status-chip--bad'}`}>
      <span className="status-chip__label">{label}</span>
      {ok ? <Check size={11} /> : <X size={11} />}
      {value && <span className="status-chip__value">{value}</span>}
    </span>
  );
}

function StatBlock({ title, ok, children }) {
  return (
    <div className={`stat-block ${ok ? 'stat-block--ok' : 'stat-block--bad'}`}>
      <div className="stat-block__title">{title}</div>
      {children}
    </div>
  );
}

function IssueModal({ token, onCancel, onConfirm, busy }) {
  const [notes, setNotes] = useState('');
  const canSubmit = notes.trim().length >= 5 && !busy;

  return (
    <Modal open onClose={onCancel} title="Sinalizar problema na campanha">
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
          O CS dono dessa campanha vai ver essa observação no painel dele e na página da campanha.
          A marcação não muda o cálculo de bônus — é só pra apontar algo que precisa de atenção.
        </p>

        <div>
          <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
            Descrição do problema <span style={{ color: 'var(--accent-red)' }}>*</span>
          </label>
          <Textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={5}
            placeholder="Ex: Loom faltando link, favor adicionar."
            autoFocus
          />
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
            {notes.trim().length < 5 ? 'Mínimo 5 caracteres' : `${notes.trim().length} caracteres`}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
          <Button variant="ghost" onClick={onCancel} disabled={busy}>Cancelar</Button>
          <Button
            onClick={() => onConfirm(notes.trim())}
            disabled={!canSubmit}
            style={{ background: 'var(--accent-red, #f43f5e)', borderColor: 'var(--accent-red, #f43f5e)', color: 'white' }}
          >
            {busy ? 'Salvando…' : 'Sinalizar e notificar CS'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

// Helpers
function normalizeUrl(url) {
  if (!url) return '#';
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

function shortUrl(url) {
  if (!url) return '';
  return url.replace(/^https?:\/\/(www\.)?/, '').substring(0, 50) + (url.length > 50 ? '…' : '');
}
