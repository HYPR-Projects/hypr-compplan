/**
 * Etapas & regras — admin ajusta o catálogo da versão 2026-Q4 sem deploy:
 * nome, %, ativo e texto do card ("o que configura" / obs.) de cada item, e
 * cria itens novos marcados pelo CS. Regras automáticas (de onde vem cada
 * dado) continuam no código. Q3 e anteriores não mudam.
 */
import { useEffect, useState } from 'react';
import { Plus, Save, Info, AlertCircle, CheckCircle2, EyeOff } from 'lucide-react';
import AppShell from '../../components/layout/AppShell.jsx';
import { Card } from '../../components/ui/Card.jsx';
import Button from '../../components/ui/Button.jsx';
import { endpoints } from '../../lib/api.js';
import './AdminQ4.css';

const STAGES = ['pre_campaign', 'setup', 'optimization', 'account_mgmt', 'extras', 'onboarding'];
const SOURCE = { manual: 'CS marca', semi_auto: 'Automático (editável)', auto: 'Automático', metrics: 'Métricas', calendar: 'Agenda Google' };
const toPct = (frac) => (frac == null ? '' : String(Math.round(frac * 100 * 1000) / 1000).replace('.', ','));
const fromPct = (txt) => {
  const n = Number(String(txt).replace(',', '.'));
  return Number.isFinite(n) ? n / 100 : null;
};

export default function CatalogPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [savedMsg, setSavedMsg] = useState(null);

  async function load() {
    try { setError(null); setData(await endpoints.adminCatalog()); }
    catch (e) { setError(e.message); }
  }
  useEffect(() => { load(); }, []);

  async function save(body) {
    setError(null); setSavedMsg(null);
    try {
      await endpoints.adminCatalogUpdate(body);
      await load();
      setSavedMsg('Salvo. Vale para todas as campanhas da versão Q4/2026 em até 1 minuto.');
    } catch (e) { setError(e.message); }
  }

  async function create(body) {
    setError(null); setSavedMsg(null);
    try {
      await endpoints.adminCatalogCreate(body);
      await load();
      setSavedMsg('Item criado.');
    } catch (e) { setError(e.message); }
  }

  const disabledIds = new Set((data?.overrides || []).filter(o => o.active === false).map(o => o.item_id));

  return (
    <AppShell>
      <header className="aq-header fade-up">
        <div>
          <h1 className="page-title">Etapas &amp; regras</h1>
          <div className="page-subtitle">Catálogo da versão <strong>Q4/2026</strong> (campanhas com início a partir de 01/10/2026). Q3 e anteriores não mudam.</div>
        </div>
      </header>

      <Card className="aq-info fade-up">
        <Info size={16} />
        <div>
          Aqui você muda <strong>nome, %, texto do card e se o item está ativo</strong>, e cria itens novos que o CS marca.
          De onde vem cada dado automático (checklist, Report Center, deck, agenda) continua definido no código.
          Toda mudança fica na auditoria.
        </div>
      </Card>

      {error && <div className="form-error"><AlertCircle size={14} /> {error}</div>}
      {savedMsg && <div className="form-success"><CheckCircle2 size={14} /> {savedMsg}</div>}
      {!data && !error && <div className="empty-state">Carregando…</div>}

      {data && STAGES.map(st => {
        const eff = data.effective[st];
        const base = data.base[st];
        if (!base) return null;
        const items = [
          ...eff.items,
          ...base.items.filter(b => !eff.items.some(e => e.id === b.id)).map(b => ({ ...b, _disabled: true })),
        ];
        return (
          <Card key={st} className="aq-stage fade-up">
            <h2 className="aq-stage__title">{eff.label}</h2>
            <div className="aq-table">
              <div className="aq-row aq-row--head">
                <span>Item</span><span>%</span><span>Origem</span><span>O que configura / Obs.</span><span />
              </div>
              {items.map(it => (
                <CatalogRow key={it.id} stage={st} item={it} disabled={it._disabled || disabledIds.has(it.id)} onSave={save} />
              ))}
            </div>
            <NewItemRow stage={st} onCreate={create} />
          </Card>
        );
      })}
    </AppShell>
  );
}

function CatalogRow({ stage, item, disabled, onSave }) {
  const [label, setLabel] = useState(item.label);
  const [pct, setPct] = useState(toPct(item.pct));
  const [what, setWhat] = useState(item.card?.what || '');
  const [obs, setObs] = useState(item.card?.obs || '');
  const dirty = label !== item.label || pct !== toPct(item.pct) || what !== (item.card?.what || '') || obs !== (item.card?.obs || '');

  return (
    <div className={`aq-row ${disabled ? 'aq-row--off' : ''}`}>
      <span>
        <input value={label} onChange={e => setLabel(e.target.value)} />
        {item.custom && <span className="aq-tag">novo</span>}
        {disabled && <span className="aq-tag aq-tag--off"><EyeOff size={10} /> desativado</span>}
      </span>
      <span><input className="aq-pct" value={pct} onChange={e => setPct(e.target.value)} inputMode="decimal" />%</span>
      <span className="aq-muted">{SOURCE[item.source] || item.source}</span>
      <span className="aq-card">
        <textarea rows={2} placeholder="O que configura" value={what} onChange={e => setWhat(e.target.value)} />
        <textarea rows={1} placeholder="Obs." value={obs} onChange={e => setObs(e.target.value)} />
      </span>
      <span className="aq-actions">
        <Button size="sm" variant={dirty ? 'primary' : 'ghost'} icon={Save} disabled={!dirty}
          onClick={() => onSave({ category: stage, item_id: item.id, label, pct: fromPct(pct), card_what: what, card_obs: obs })}>
          Salvar
        </Button>
        <Button size="sm" variant="ghost"
          onClick={() => onSave({ category: stage, item_id: item.id, active: !!disabled })}>
          {disabled ? 'Reativar' : 'Desativar'}
        </Button>
      </span>
    </div>
  );
}

function NewItemRow({ stage, onCreate }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [pct, setPct] = useState('');
  const [what, setWhat] = useState('');
  if (!open) {
    return <button type="button" className="aq-add" onClick={() => setOpen(true)}><Plus size={14} /> Novo item nesta etapa</button>;
  }
  return (
    <div className="aq-row aq-row--new">
      <span><input placeholder="Nome do item" value={label} onChange={e => setLabel(e.target.value)} /></span>
      <span><input className="aq-pct" placeholder="0,10" value={pct} onChange={e => setPct(e.target.value)} />%</span>
      <span className="aq-muted">CS marca</span>
      <span className="aq-card"><textarea rows={2} placeholder="O que configura" value={what} onChange={e => setWhat(e.target.value)} /></span>
      <span className="aq-actions">
        <Button size="sm" icon={Plus} disabled={!label.trim()}
          onClick={async () => { await onCreate({ category: stage, label, pct: fromPct(pct), card_what: what }); setOpen(false); setLabel(''); setPct(''); setWhat(''); }}>
          Criar
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
      </span>
    </div>
  );
}
