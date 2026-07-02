import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Shield, ChevronRight, ChevronDown, ExternalLink, AlertTriangle,
  Check, X, RotateCcw, Search, Clock, CircleX, Download, FileSpreadsheet,
  LayoutList, Table2, ArrowUp, ArrowDown, ArrowUpDown, MoreVertical, Plus,
} from 'lucide-react';
import AppShell from '../../components/layout/AppShell.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { Input, Textarea } from '../../components/ui/Input.jsx';
import QuarterSelect from '../../components/ui/QuarterSelect.jsx';
import { AUDIT_MATRIX_CATEGORIES, AUDIT_MATRIX_ITEMS } from '../../lib/auditMatrix.js';
import { fmt } from '../../lib/format.js';
import { useQuarter } from '../../lib/useQuarter.js';
import { endpoints } from '../../lib/api.js';
import './Audit.css';

const GROUPS_META = [
  { key: 'setup_anulado',         label: 'Setup anulado por over > 50%', color: 'red'   },
  { key: 'otimizacao_fora_meta',  label: 'Otimização fora da meta',      color: 'amber' },
  { key: 'evidencia_faltando',    label: 'Evidência faltando',           color: 'amber' },
  { key: 'admin_flagged_issue',   label: 'Sinalizadas com problema',     color: 'red'   },
  { key: 'all_ok',                label: 'OK em tudo',                   color: 'green' },
];

export default function AuditPage() {
  const navigate = useNavigate();
  const { quarter, setQuarter, quarterOptions } = useQuarter();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [expandedTokens, setExpandedTokens] = useState(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState(new Set(['all_ok'])); // OK colapsado por padrão
  const [issueModalToken, setIssueModalToken] = useState(null);
  const [busyToken, setBusyToken] = useState(null);
  const [viewMode, setViewMode] = useState('grouped'); // grouped | table

  const reload = () => {
    setError(null);
    endpoints.adminAudit(quarter)
      .then(d => {
        setData(d);
        const auto = new Set();
        for (const g of GROUPS_META) {
          if (g.key === 'all_ok') continue;
          const first = d.groups?.[g.key]?.[0];
          if (first) auto.add(first.short_token);
        }
        setExpandedTokens(auto);
      })
      .catch(e => setError(e.message));
  };

  useEffect(() => {
    setData(null);
    reload();
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
          <div className="audit-view-toggle">
            <button
              type="button"
              className={viewMode === 'grouped' ? 'is-active' : ''}
              onClick={() => setViewMode('grouped')}
              title="Visão agrupada por urgência"
            >
              <LayoutList size={14} /> Agrupada
            </button>
            <button
              type="button"
              className={viewMode === 'table' ? 'is-active' : ''}
              onClick={() => setViewMode('table')}
              title="Visão em tabela"
            >
              <Table2 size={14} /> Tabela
            </button>
          </div>
          <QuarterSelect
            value={quarter}
            options={quarterOptions}
            onChange={setQuarter}
            variant="pill"
          />
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

      {totals.total > 0 && viewMode === 'table' && (
        <AuditTable
          groups={filteredGroups}
          onReload={reload}
          onOpenDetail={(c) => navigate(`/admin/cs/${encodeURIComponent(c.cs_email)}/campanha/${c.short_token}`)}
        />
      )}

      {totals.total > 0 && viewMode === 'grouped' && (
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

function AuditTable({ groups, onReload, onOpenDetail }) {
  // Sort: coluna + direção. Default: bônus (comp) desc.
  const [sortKey, setSortKey] = useState('comp');
  const [sortDir, setSortDir] = useState('desc');
  // Filtro de status: 'all' | 'attention' | 'ok'
  const [statusFilter, setStatusFilter] = useState('all');
  // Modal: { token, campaignName, action: 'exclude'|'include', scope: 'item'|'cat', itemIds: [], label }
  const [actionModal, setActionModal] = useState(null);
  const [actionReason, setActionReason] = useState('');
  const [actionBusy, setActionBusy] = useState(false);

  // ── EXCLUIR (força earned=false) ──
  const askExcludeItem = (c, itemId, label) => {
    setActionReason('');
    setActionModal({ token: c.short_token, campaignName: c.campaign_name, action: 'exclude', scope: 'item', itemIds: [itemId], label });
  };
  const askExcludeCat = (c, catKey, catLabel) => {
    const ids = (AUDIT_MATRIX_CATEGORIES.find(x => x.key === catKey)?.items || [])
      .map(it => it.id)
      .filter(id => (c.items_map?.[id]?.value_brl || 0) > 0);
    if (ids.length === 0) return;
    setActionReason('');
    setActionModal({ token: c.short_token, campaignName: c.campaign_name, action: 'exclude', scope: 'cat', itemIds: ids, label: catLabel });
  };

  // ── INCLUIR (força earned=true) ──
  const askIncludeItem = (c, itemId, label) => {
    setActionReason('');
    setActionModal({ token: c.short_token, campaignName: c.campaign_name, action: 'include', scope: 'item', itemIds: [itemId], label });
  };
  const askIncludeCat = (c, catKey, catLabel) => {
    // Inclui os itens da etapa que hoje NÃO têm valor (— vazios)
    const ids = (AUDIT_MATRIX_CATEGORIES.find(x => x.key === catKey)?.items || [])
      .map(it => it.id)
      .filter(id => (c.items_map?.[id]?.value_brl || 0) === 0);
    if (ids.length === 0) return;
    setActionReason('');
    setActionModal({ token: c.short_token, campaignName: c.campaign_name, action: 'include', scope: 'cat', itemIds: ids, label: catLabel });
  };

  // Reverte 1 item (remove override → volta ao estado natural)
  const revertItem = async (c, itemId) => {
    try {
      await endpoints.adminOverrideItem(c.short_token, { item_id: itemId, earned: null });
      onReload?.();
    } catch (e) { alert(`Falha ao reverter: ${e.message}`); }
  };

  // Confirma ação (exclude → earned=false / include → earned=true), com motivo
  const confirmAction = async () => {
    if (!actionModal) return;
    if (!actionReason.trim()) { alert('Informe o motivo.'); return; }
    setActionBusy(true);
    const earnedVal = actionModal.action === 'include';
    try {
      for (const id of actionModal.itemIds) {
        await endpoints.adminOverrideItem(actionModal.token, {
          item_id: id, earned: earnedVal, reason: actionReason.trim(),
        });
      }
      setActionModal(null);
      setActionReason('');
      onReload?.();
    } catch (e) {
      alert(`Falha: ${e.message}`);
    } finally {
      setActionBusy(false);
    }
  };

  // Colunas fixas (resumo). As colunas de item vêm de AUDIT_MATRIX_ITEMS.
  const BASE_COLUMNS = [
    { key: 'campaign', label: 'Campanha', type: 'text', get: c => c.campaign_name || '' },
    { key: 'client', label: 'Anunciante', type: 'text', get: c => c.client_name || '' },
    { key: 'cs', label: 'CS', type: 'text', get: c => c.cs_name || c.cs_email || '' },
    { key: 'start', label: 'Início', type: 'text', get: c => c.start_date || '' },
    { key: 'end', label: 'Fim', type: 'text', get: c => c.end_date || '' },
    { key: 'valor', label: 'Valor', type: 'num', get: c => c.total_value || 0 },
    { key: 'liquido', label: 'Líquido', type: 'num', get: c => c.liquido || 0 },
    { key: 'score', label: 'Score', type: 'num', get: c => c.total_pct || 0 },
    { key: 'comp', label: 'Comp', type: 'num', get: c => c.total_brl || 0 },
  ];

  // Offsets left das 5 colunas congeladas (px acumulado): campanha, anunciante, cs, início, fim
  const STICKY_LEFT = [0, 180, 320, 470, 560];
  const STICKY_COUNT = 5;

  // Accessor pra valor de um item (matriz)
  const itemValue = (c, itemId) => (c.items_map?.[itemId]?.value_brl || 0);

  // Achata TODOS os grupos numa lista única, marcando o status de cada uma.
  // all_ok → 'ok'; qualquer outro grupo → 'attention'.
  const allCampaigns = [];
  const seen = new Set();
  for (const key of Object.keys(groups)) {
    const status = key === 'all_ok' ? 'ok' : 'attention';
    for (const c of groups[key] || []) {
      if (seen.has(c.short_token)) continue;
      seen.add(c.short_token);
      allCampaigns.push({ ...c, __status: status });
    }
  }

  // Contadores por status (pra mostrar nos botões do filtro)
  const countAll = allCampaigns.length;
  const countOk = allCampaigns.filter(c => c.__status === 'ok').length;
  const countAttention = countAll - countOk;

  // Aplica o filtro de status
  const visibleCampaigns = statusFilter === 'all'
    ? allCampaigns
    : allCampaigns.filter(c => c.__status === statusFilter);

  // Ordena conforme sortKey/sortDir. sortKey pode ser base col ou 'item:<id>'.
  let getVal, sortType;
  if (sortKey.startsWith('item:')) {
    const itemId = sortKey.slice(5);
    getVal = c => itemValue(c, itemId);
    sortType = 'num';
  } else {
    const col = BASE_COLUMNS.find(x => x.key === sortKey) || BASE_COLUMNS[6];
    getVal = col.get;
    sortType = col.type;
  }
  visibleCampaigns.sort((a, b) => {
    const va = getVal(a), vb = getVal(b);
    let cmp;
    if (sortType === 'text') cmp = String(va).localeCompare(String(vb), 'pt-BR', { sensitivity: 'base' });
    else cmp = (Number(va) || 0) - (Number(vb) || 0);
    return sortDir === 'asc' ? cmp : -cmp;
  });

  const onSort = (key) => {
    if (key === sortKey) setSortDir(prev => (prev === 'desc' ? 'asc' : 'desc'));
    else { setSortKey(key); setSortDir('desc'); }
  };

  const SortIcon = ({ colKey }) => {
    if (colKey !== sortKey) return <ArrowUpDown size={11} className="audit-th__sort-icon" />;
    return sortDir === 'desc'
      ? <ArrowDown size={11} className="audit-th__sort-icon is-active" />
      : <ArrowUp size={11} className="audit-th__sort-icon is-active" />;
  };

  return (
    <div className="audit-matrix-wrap fade-up">
      <div className="audit-matrix__toolbar">
        <div className="audit-matrix__status-filter">
          <button
            type="button"
            className={statusFilter === 'all' ? 'is-active' : ''}
            onClick={() => setStatusFilter('all')}
          >
            Todas <span className="audit-matrix__filter-count">{countAll}</span>
          </button>
          <button
            type="button"
            className={statusFilter === 'attention' ? 'is-active' : ''}
            onClick={() => setStatusFilter('attention')}
          >
            Precisam atenção <span className="audit-matrix__filter-count">{countAttention}</span>
          </button>
          <button
            type="button"
            className={statusFilter === 'ok' ? 'is-active' : ''}
            onClick={() => setStatusFilter('ok')}
          >
            OK <span className="audit-matrix__filter-count">{countOk}</span>
          </button>
        </div>
        <div className="audit-matrix__count">
          {visibleCampaigns.length} {visibleCampaigns.length === 1 ? 'campanha' : 'campanhas'} · role para o lado →
        </div>
      </div>
      {visibleCampaigns.length === 0 ? (
        <div className="audit-matrix__empty">Nenhuma campanha neste filtro.</div>
      ) : (
      <table className="audit-matrix">
        <thead>
          {/* Linha 1: grupos de categoria */}
          <tr className="audit-matrix__group-row">
            <th className="audit-matrix__sticky-head" colSpan={5} style={{ left: 0 }}></th>
            <th colSpan={4}></th>
            {AUDIT_MATRIX_CATEGORIES.map(cat => (
              <th
                key={cat.key}
                className={`audit-matrix__group audit-matrix__group--${cat.key}`}
                colSpan={cat.items.length}
              >
                {cat.label}
              </th>
            ))}
            <th></th>
          </tr>
          {/* Linha 2: colunas base + itens */}
          <tr>
            {BASE_COLUMNS.map((col, i) => (
              <th
                key={col.key}
                className={`audit-th ${col.type === 'num' ? 'num' : ''} ${col.key === sortKey ? 'is-sorted' : ''} ${i < STICKY_COUNT ? 'audit-matrix__sticky-col-head' : ''}`}
                style={i < STICKY_COUNT ? { left: `${STICKY_LEFT[i]}px` } : undefined}
                onClick={() => onSort(col.key)}
              >
                <span className="audit-th__inner">{col.label}<SortIcon colKey={col.key} /></span>
              </th>
            ))}
            {AUDIT_MATRIX_ITEMS.map(it => (
              <th
                key={it.id}
                className={`audit-th num audit-matrix__item-head audit-matrix__item-head--${it.catKey} ${sortKey === `item:${it.id}` ? 'is-sorted' : ''}`}
                onClick={() => onSort(`item:${it.id}`)}
                title={it.label}
              >
                <span className="audit-th__inner">{it.label}<SortIcon colKey={`item:${it.id}`} /></span>
              </th>
            ))}
            <th className="audit-matrix__open-head"></th>
          </tr>
        </thead>
        <tbody>
          {visibleCampaigns.map(c => {
            // Itens forçados por admin
            const excludedIds = new Set(
              (c.admin_overrides || [])
                .filter(o => o.kind === 'item' && o.forced === 'not_earned')
                .map(o => o.item_id)
            );
            const forcedInIds = new Set(
              (c.admin_overrides || [])
                .filter(o => o.kind === 'item' && o.forced === 'earned')
                .map(o => o.item_id)
            );
            return (
            <tr key={c.short_token} className="audit-matrix__row">
              <td className="audit-matrix__camp audit-matrix__sticky-col" style={{ left: 0 }}>
                <span className="audit-matrix__camp-name">{c.campaign_name}</span>
                <span className="audit-matrix__token">
                  {c.short_token}
                  {c.admin_overrides && c.admin_overrides.length > 0 && (
                    <span
                      className="audit-table__override-badge"
                      title={c.admin_overrides.map(o => `${o.label}: ${o.forced}${o.reason ? ` — ${o.reason}` : ''} (${o.by || '?'})`).join('\n')}
                    >⚡ {c.admin_overrides.length}</span>
                  )}
                </span>
              </td>
              <td className="audit-matrix__sticky-col audit-matrix__client" style={{ left: '180px' }}>{c.client_name}</td>
              <td className="audit-matrix__sticky-col audit-matrix__cs" style={{ left: '320px' }}>{c.cs_name || c.cs_email}</td>
              <td className="audit-matrix__sticky-col audit-matrix__date" style={{ left: '470px' }}>{fmt.dateShort(c.start_date)}</td>
              <td className="audit-matrix__sticky-col audit-matrix__date audit-matrix__date--last" style={{ left: '560px' }}>{fmt.dateShort(c.end_date)}</td>
              <td className="num">{fmt.brlCompact(c.total_value)}</td>
              <td className="num">{fmt.brlCompact(c.liquido)}</td>
              <td className="num">{((c.total_pct || 0) * 100).toFixed(2)}%</td>
              <td className="num audit-matrix__comp">{fmt.brl(c.total_brl)}</td>
              {AUDIT_MATRIX_ITEMS.map(it => {
                const cell = c.items_map?.[it.id];
                const val = cell?.value_brl || 0;
                const url = cell?.url || null;
                const isExcluded = excludedIds.has(it.id);

                // Item excluído: mostra riscado + botão reverter
                if (isExcluded) {
                  return (
                    <td key={it.id} className="num audit-matrix__cell audit-matrix__cell--excluded">
                      <span className="audit-matrix__excluded-mark" title="Excluído do compp">excluído</span>
                      <button
                        type="button"
                        className="audit-matrix__revert-btn"
                        onClick={() => revertItem(c, it.id)}
                        title="Reverter (voltar a contar)"
                      >
                        <RotateCcw size={11} />
                      </button>
                    </td>
                  );
                }

                if (!val) {
                  // Célula vazia: botão + pra INCLUIR (forçar earned)
                  return (
                    <td key={it.id} className="num audit-matrix__cell audit-matrix__cell--empty">
                      <span className="audit-matrix__cell-inner">
                        <span className="audit-matrix__dash">—</span>
                        <button
                          type="button"
                          className="audit-matrix__include-btn"
                          onClick={() => askIncludeItem(c, it.id, it.label)}
                          title={`Incluir "${it.label}" no compp deste CS`}
                        >
                          <Plus size={11} />
                        </button>
                      </span>
                    </td>
                  );
                }

                const isForcedIn = forcedInIds.has(it.id);
                return (
                  <td key={it.id} className={`num audit-matrix__cell ${isForcedIn ? 'audit-matrix__cell--forced-in' : ''}`}>
                    <span className="audit-matrix__cell-inner">
                      {isForcedIn && <span className="audit-matrix__forced-mark" title="Incluído manualmente pelo admin">＋</span>}
                      {url ? (
                        <a
                          href={normalizeUrl(url)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="audit-matrix__cell-link"
                          title="Abrir evidência"
                        >
                          {fmt.brlCompact(val)} <ExternalLink size={10} />
                        </a>
                      ) : (
                        <span>{fmt.brlCompact(val)}</span>
                      )}
                      {isForcedIn ? (
                        <button
                          type="button"
                          className="audit-matrix__revert-btn"
                          onClick={() => revertItem(c, it.id)}
                          title="Reverter inclusão (voltar ao natural)"
                        >
                          <RotateCcw size={11} />
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="audit-matrix__exclude-btn"
                          onClick={() => askExcludeItem(c, it.id, it.label)}
                          title={`Excluir "${it.label}" do compp deste CS`}
                        >
                          <X size={11} />
                        </button>
                      )}
                    </span>
                  </td>
                );
              })}
              <td className="num audit-matrix__open-cell">
                <div className="audit-matrix__actions">
                  <CatActionMenu
                    campaign={c}
                    onExcludeCat={(catKey, catLabel) => askExcludeCat(c, catKey, catLabel)}
                    onIncludeCat={(catKey, catLabel) => askIncludeCat(c, catKey, catLabel)}
                  />
                  <button
                    type="button"
                    className="audit-table__open"
                    onClick={() => onOpenDetail(c)}
                    title="Abrir campanha"
                  >
                    <ExternalLink size={14} />
                  </button>
                </div>
              </td>
            </tr>
            );
          })}
        </tbody>
      </table>
      )}

      {actionModal && (() => {
        const isInclude = actionModal.action === 'include';
        return (
        <Modal open onClose={() => !actionBusy && setActionModal(null)} title={`${isInclude ? 'Incluir' : 'Excluir'} ${actionModal.scope === 'cat' ? 'etapa' : 'item'} ${isInclude ? 'no' : 'do'} compp`}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)' }}>
              Campanha <strong>{actionModal.campaignName}</strong> —{' '}
              {actionModal.scope === 'cat'
                ? <>vai {isInclude ? 'incluir' : 'excluir'} <strong>{actionModal.itemIds.length} {actionModal.itemIds.length === 1 ? 'item' : 'itens'}</strong> da etapa <strong>{actionModal.label}</strong>.</>
                : <>vai {isInclude ? 'incluir' : 'excluir'} <strong>{actionModal.label}</strong>.</>}
              {' '}O valor {isInclude ? 'é somado ao' : 'é descontado do'} total do CS e reflete em todos os menus. Dá pra reverter depois.
            </p>
            <div>
              <label style={{ display: 'block', fontSize: 12, color: 'var(--text-secondary)', marginBottom: 6 }}>
                Motivo <span style={{ color: 'var(--accent-red)' }}>*</span>
              </label>
              <Textarea
                value={actionReason}
                onChange={(e) => setActionReason(e.target.value)}
                rows={3}
                placeholder={isInclude
                  ? 'Ex: entrega comprovada fora do checklist, ajuste acordado com o CS.'
                  : 'Ex: entrega não comprovada, item não aplicável a esta campanha.'}
                autoFocus
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 8 }}>
              <Button variant="ghost" onClick={() => setActionModal(null)} disabled={actionBusy}>Cancelar</Button>
              <Button
                onClick={confirmAction}
                disabled={actionBusy || !actionReason.trim()}
                style={isInclude
                  ? { background: 'var(--accent-teal, #0d9488)', borderColor: 'var(--accent-teal, #0d9488)', color: 'white' }
                  : { background: 'var(--accent-red, #f43f5e)', borderColor: 'var(--accent-red, #f43f5e)', color: 'white' }}
              >
                {actionBusy ? (isInclude ? 'Incluindo…' : 'Excluindo…') : (isInclude ? 'Incluir no compp' : 'Excluir do compp')}
              </Button>
            </div>
          </div>
        </Modal>
        );
      })()}
    </div>
  );
}

/**
 * Menu de 3 pontinhos pra excluir/incluir etapa inteira de uma campanha.
 */
function CatActionMenu({ campaign: c, onExcludeCat, onIncludeCat }) {
  const [open, setOpen] = useState(false);
  // Etapas com pelo menos 1 item earned (podem ser excluídas)
  const catsExcludable = AUDIT_MATRIX_CATEGORIES.filter(cat =>
    cat.items.some(it => (c.items_map?.[it.id]?.value_brl || 0) > 0)
  );
  // Etapas com pelo menos 1 item vazio (podem ter itens incluídos)
  const catsIncludable = AUDIT_MATRIX_CATEGORIES.filter(cat =>
    cat.items.some(it => (c.items_map?.[it.id]?.value_brl || 0) === 0)
  );
  if (catsExcludable.length === 0 && catsIncludable.length === 0) return null;

  return (
    <div className="audit-matrix__menu-wrap">
      <button
        type="button"
        className="audit-matrix__menu-btn"
        onClick={() => setOpen(o => !o)}
        title="Incluir / excluir etapa inteira"
      >
        <MoreVertical size={14} />
      </button>
      {open && (
        <>
          <div className="audit-matrix__menu-backdrop" onClick={() => setOpen(false)} />
          <div className="audit-matrix__menu">
            {catsExcludable.length > 0 && (
              <>
                <div className="audit-matrix__menu-head">Excluir etapa</div>
                {catsExcludable.map(cat => (
                  <button
                    key={`ex-${cat.key}`}
                    type="button"
                    className="audit-matrix__menu-item audit-matrix__menu-item--exclude"
                    onClick={() => { setOpen(false); onExcludeCat(cat.key, cat.label); }}
                  >
                    <X size={12} /> {cat.label}
                  </button>
                ))}
              </>
            )}
            {catsIncludable.length > 0 && (
              <>
                <div className="audit-matrix__menu-head">Incluir etapa</div>
                {catsIncludable.map(cat => (
                  <button
                    key={`in-${cat.key}`}
                    type="button"
                    className="audit-matrix__menu-item audit-matrix__menu-item--include"
                    onClick={() => { setOpen(false); onIncludeCat(cat.key, cat.label); }}
                  >
                    <Plus size={12} /> {cat.label}
                  </button>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}


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
          {c.optimization.total > 0 && (
            <div className="stat-block__metrics">
              Over: {c.optimization.over_pct != null ? `${c.optimization.over_pct.toFixed(1)}%` : '—'}
              {' · '}eCPM: {c.optimization.ecpm ? fmt.brl(c.optimization.ecpm) : '—'}
              {' · '}CTR: {c.optimization.ctr ? `${(c.optimization.ctr * 100).toFixed(2)}%` : '—'}
              {c.optimization.video_vtr_pct > 0 && (
                <> · VTR: {c.optimization.video_vtr_pct.toFixed(1)}%</>
              )}
            </div>
          )}
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

      {/* Overrides feitos por admin (com nota) */}
      {c.admin_overrides && c.admin_overrides.length > 0 && (
        <div className="audit-card__overrides">
          <div className="audit-card__overrides-label">
            <Shield size={12} /> Overrides admin
          </div>
          {c.admin_overrides.map((ov, i) => (
            <div key={i} className="audit-override">
              <span className="audit-override__badge">
                {ov.kind === 'setup'
                  ? (ov.forced === 'valid' ? 'Setup forçado válido' : 'Setup forçado anulado')
                  : `${ov.label}: forçado ${ov.forced === 'earned' ? 'OK' : 'Não'}`}
              </span>
              <span className="audit-override__meta">
                por {ov.by || '—'}{ov.at && ` · ${fmt.date(ov.at)}`}
              </span>
              {ov.reason && (
                <div className="audit-override__reason">"{ov.reason}"</div>
              )}
            </div>
          ))}
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
