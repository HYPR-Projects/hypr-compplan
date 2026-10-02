/**
 * Preenchimentos — o que cada CS preencheu em cada campanha, de onde veio
 * cada item (automático × marcado pelo CS) e o status de validação.
 * Exporta CSV com o que estiver filtrado.
 */
import { useEffect, useMemo, useState } from 'react';
import { Download, AlertCircle, ExternalLink } from 'lucide-react';
import AppShell from '../../components/layout/AppShell.jsx';
import { Card } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import QuarterSelect from '../../components/ui/QuarterSelect.jsx';
import { useQuarter } from '../../lib/useQuarter.js';
import { endpoints } from '../../lib/api.js';
import { fmt } from '../../lib/format.js';
import './AdminQ4.css';

const STATUS = {
  confirmed: { label: 'Confirmado', tone: 'ok' },
  declared: { label: 'Declarado', tone: 'info' },
  divergent: { label: 'Divergente', tone: 'bad' },
  admin: { label: 'Admin', tone: 'info' },
};

export default function FillMatrixPage() {
  const { quarter, setQuarter, quarterOptions } = useQuarter();
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [cs, setCs] = useState('');
  const [stage, setStage] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    setData(null); setError(null);
    endpoints.adminFillMatrix(quarter).then(setData).catch(e => setError(e.message));
  }, [quarter]);

  const rows = useMemo(() => (data?.rows || []).filter(r =>
    (!cs || r.cs_email === cs)
    && (!stage || r.stage === stage)
    && (!status || (status === 'missing' ? r.missing_evidence : r.validation === status))
    && (!search || `${r.client_name} ${r.campaign_name} ${r.short_token} ${r.item_label}`.toLowerCase().includes(search.toLowerCase()))
  ), [data, cs, stage, status, search]);

  const stages = useMemo(() => [...new Map((data?.rows || []).map(r => [r.stage, r.stage_label])).entries()], [data]);

  function exportCsv() {
    const head = ['Versão', 'CS', 'Cliente', 'Campanha', 'Token', 'Início', 'Fim', 'Etapa', 'Item', '%', 'Valor (R$)',
      'Conquistado', 'Marcado pelo CS', 'Origem', 'Status', 'Motivo', 'Evidência', 'Falta evidência', 'Override admin', 'Última edição por', 'Última edição em'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = rows.map(r => [r.version, r.cs_name, r.client_name, r.campaign_name, r.short_token, r.start_date, r.end_date,
      r.stage_label, r.item_label, (r.pct * 100).toFixed(2).replace('.', ','), r.value_brl.toFixed(2).replace('.', ','),
      r.earned ? 'Sim' : 'Não', r.marked_by_cs ? 'Sim' : 'Não', r.source, STATUS[r.validation]?.label || '', r.validation_reason || '',
      r.evidence, r.missing_evidence ? 'Sim' : 'Não', r.admin_override ? `${r.admin_override.by}: ${r.admin_override.reason}` : '',
      r.last_edit_by || '', r.last_edit_at || ''].map(esc).join(';'));
    const blob = new Blob(['﻿' + [head.map(esc).join(';'), ...lines].join('\n')], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `preenchimentos-${quarter}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  return (
    <AppShell>
      <header className="aq-header fade-up">
        <div>
          <h1 className="page-title">Preenchimentos</h1>
          <div className="page-subtitle">O que cada CS preencheu em cada campanha, de onde veio e se está validado.</div>
        </div>
        <div className="aq-header__actions">
          <QuarterSelect value={quarter} options={quarterOptions} onChange={setQuarter} variant="pill" />
          <Button icon={Download} variant="ghost" onClick={exportCsv} disabled={!rows.length}>CSV</Button>
        </div>
      </header>

      {error && <div className="form-error"><AlertCircle size={14} /> {error}</div>}
      {!data && !error && <div className="empty-state">Carregando…</div>}

      {data && (
        <>
          <section className="aq-quality fade-up">
            {data.by_cs.map(c => {
              const total = c.confirmed + c.declared + c.divergent + c.admin;
              const auto = total ? Math.round((c.confirmed / total) * 100) : 0;
              return (
                <button key={c.cs_email} type="button" className={`aq-q ${cs === c.cs_email ? 'is-active' : ''}`}
                  onClick={() => setCs(cs === c.cs_email ? '' : c.cs_email)}>
                  <span className="aq-q__name">{c.cs_name}</span>
                  <span className="aq-q__big mono">{auto}%</span>
                  <span className="aq-muted">confirmados · {c.campaigns} campanhas</span>
                  <span className="aq-q__chips">
                    <span className="aq-st aq-st--info">{c.declared} declarados</span>
                    <span className="aq-st aq-st--bad">{c.divergent} divergentes</span>
                    <span className="aq-st aq-st--warn">{c.missing_evidence} sem evidência</span>
                  </span>
                </button>
              );
            })}
          </section>

          <Card className="fade-up">
            <div className="aq-filters">
              <input placeholder="Buscar cliente, campanha, token ou item…" value={search} onChange={e => setSearch(e.target.value)} />
              <select value={stage} onChange={e => setStage(e.target.value)}>
                <option value="">Todas as etapas</option>
                {stages.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <select value={status} onChange={e => setStatus(e.target.value)}>
                <option value="">Todos os status</option>
                <option value="confirmed">Confirmado</option>
                <option value="declared">Declarado</option>
                <option value="divergent">Divergente</option>
                <option value="admin">Admin</option>
                <option value="missing">Falta evidência</option>
              </select>
              <span className="aq-muted">{rows.length} linhas</span>
            </div>
            <div className="aq-grid-wrap">
              <table className="aq-grid">
                <thead>
                  <tr><th>CS</th><th>Campanha</th><th>Etapa</th><th>Item</th><th>Origem</th><th>Status</th><th className="num">Valor</th><th>Evidência</th></tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={`${r.short_token}-${r.item_id}-${i}`}>
                      <td>{r.cs_name}</td>
                      <td>
                        <a href={`/admin/cs/${encodeURIComponent(r.cs_email)}/campanha/${r.short_token}`}>{r.client_name}</a>
                        <div className="aq-muted">{r.short_token}{r.version === '2026-Q4' ? ' · Q4/2026' : ''}</div>
                      </td>
                      <td>{r.stage_label}</td>
                      <td>{r.item_label}{r.validation_reason && <div className="aq-muted">{r.validation_reason}</div>}</td>
                      <td className="aq-muted">{r.source}{r.marked_by_cs ? ' · marcado' : ''}</td>
                      <td>
                        {r.validation && <span className={`aq-st aq-st--${STATUS[r.validation]?.tone}`}>{STATUS[r.validation]?.label}</span>}
                        {r.missing_evidence && <span className="aq-st aq-st--warn">sem evidência</span>}
                      </td>
                      <td className="num mono">{r.earned ? fmt.brl(r.value_brl) : '—'}</td>
                      <td>{r.evidence ? <a href={r.evidence} target="_blank" rel="noreferrer">abrir <ExternalLink size={10} /></a> : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </AppShell>
  );
}
