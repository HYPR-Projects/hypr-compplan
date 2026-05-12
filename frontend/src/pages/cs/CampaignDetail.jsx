import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle2, AlertCircle, Save, Info,
  ChevronDown, ChevronRight, Sparkles, Zap,
} from 'lucide-react';
import AppShell from '../../components/layout/AppShell.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import { fmt } from '../../lib/format.js';
import { endpoints } from '../../lib/api.js';
import './CampaignDetail.css';

const CATEGORY_ORDER = ['pre_campaign', 'setup', 'optimization', 'account_mgmt', 'extras', 'onboarding'];

export default function CsCampaignDetail() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [manualChecks, setManualChecks] = useState({});
  const [expandedCategories, setExpandedCategories] = useState(new Set(CATEGORY_ORDER));

  async function load() {
    try {
      setError(null);
      const c = await endpoints.meCampaign(token);
      setCampaign(c);
      setManualChecks(c.manual_checks || {});
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => { load(); }, [token]);

  function toggleCheck(itemId) {
    setManualChecks(prev => ({
      ...prev,
      [itemId]: !prev[itemId],
    }));
  }

  function toggleCategory(catKey) {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(catKey)) next.delete(catKey); else next.add(catKey);
      return next;
    });
  }

  async function handleSave(markReviewed = true) {
    try {
      setSaving(true);
      setError(null);
      const result = await endpoints.meSaveCampaign(token, {
        manual_checks: manualChecks,
        reviewed: markReviewed,
      });
      setSavedAt(new Date());
      // Atualiza breakdown com novo retorno
      setCampaign(prev => prev ? { ...prev, breakdown: result.breakdown, reviewed: result.reviewed } : prev);
    } catch (e) {
      setError(`Erro ao salvar: ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  if (error && !campaign) {
    return (
      <AppShell>
        <button className="back-link" onClick={() => navigate(-1)}>
          <ArrowLeft size={14} /> Voltar
        </button>
        <Card>
          <h2 className="page-title">Erro</h2>
          <p className="card__subtitle">{error}</p>
        </Card>
      </AppShell>
    );
  }

  if (!campaign) {
    return (
      <AppShell>
        <button className="back-link" onClick={() => navigate(-1)}>
          <ArrowLeft size={14} /> Voltar
        </button>
        <div className="empty-state">Carregando…</div>
      </AppShell>
    );
  }

  // Re-calcula localmente: aplica manualChecks atual em cima dos earned automáticos
  // (Para feedback imediato sem esperar o backend)
  const breakdown = recomputeLocally(campaign.breakdown, manualChecks);

  return (
    <AppShell>
      <button className="back-link fade-up" onClick={() => navigate('/cs')}>
        <ArrowLeft size={14} /> Voltar ao painel
      </button>

      <header className="page-header campaign-detail__header fade-up">
        <div>
          <div className="campaign-detail__breadcrumb">
            <span>{campaign.client_name}</span>
            <span className="page-subtitle__sep">·</span>
            <Badge variant="neutral">{campaign.short_token}</Badge>
            {campaign.is_legacy && <Badge variant="neutral">Legacy</Badge>}
            {campaign.reviewed && <Badge variant="green">Revisada</Badge>}
          </div>
          <h1 className="page-title">{campaign.campaign_name}</h1>
          <div className="page-subtitle">
            {fmt.dateRange(campaign.start_date, campaign.end_date)}
            {campaign.agency && <> · {campaign.agency}</>}
            {campaign.cp_name && <> · CP: {campaign.cp_name}</>}
          </div>
        </div>
      </header>

      {/* ── HERO: bônus total ─────────────────────────────────────── */}
      <section className="bonus-hero fade-up">
        <div className="bonus-hero__main">
          <div className="bonus-hero__label">Bônus desta campanha</div>
          <div className="bonus-hero__value mono">{fmt.brl(breakdown.total_brl)}</div>
          <div className="bonus-hero__subtitle">
            {(breakdown.total_pct * 100).toFixed(2)}% do líquido ({fmt.brl(campaign.liquido)})
          </div>
        </div>
        <div className="bonus-hero__divider"></div>
        <div className="bonus-hero__stats">
          <div className="bonus-hero__stat">
            <span className="label">Bruto da campanha</span>
            <span className="mono">{fmt.brl(campaign.bruto)}</span>
          </div>
          <div className="bonus-hero__stat">
            <span className="label">Imposto</span>
            <span className="mono">{(campaign.tax_rate * 100).toFixed(2)}%</span>
          </div>
          <div className="bonus-hero__stat">
            <span className="label">Líquido</span>
            <span className="mono">{fmt.brl(campaign.liquido)}</span>
          </div>
        </div>
      </section>

      {/* ── Dados read-only (do checklist) ──────────────────────────── */}
      <Card className="fade-up" style={{ '--i': 1, marginBottom: 'var(--space-4)' }}>
        <header className="card__header">
          <h3 className="card__title">Dados do checklist</h3>
          <p className="card__subtitle">Vindos do Command/checklist — não editáveis</p>
        </header>

        <div className="ro-grid">
          {campaign.cp_name && <RoField label="Salesman" value={campaign.cp_name} />}
          {campaign.agency && <RoField label="Agência" value={campaign.agency} />}
          {campaign.industry && <RoField label="Setor" value={campaign.industry} />}

          {Array.isArray(campaign.products) && campaign.products.length > 0 && (
            <RoTags label="Produtos" items={campaign.products} variant="cyan" />
          )}
          {Array.isArray(campaign.formats) && campaign.formats.length > 0 && (
            <RoTags label="Formatos" items={campaign.formats} />
          )}
          {Array.isArray(campaign.features) && campaign.features.length > 0 && (
            <RoTags label={`Features (${campaign.features.length})`} items={campaign.features} variant="cyan" />
          )}
          {Array.isArray(campaign.studies_used) && campaign.studies_used.length > 0 && (
            <RoTags label="Estudos usados" items={campaign.studies_used} />
          )}
          {campaign.audiences && (
            <div className="ro-field ro-field--wide">
              <span className="label">Audiências contratadas</span>
              <span className="ro-text-block">{campaign.audiences}</span>
            </div>
          )}
        </div>
      </Card>

      {/* ── Breakdown por categoria ──────────────────────────────── */}
      <h2 className="section-title fade-up" style={{ marginBottom: 'var(--space-3)' }}>
        Detalhamento do bônus
      </h2>

      {CATEGORY_ORDER.map(catKey => {
        const cat = breakdown.by_category[catKey];
        if (!cat) return null;
        return (
          <CategoryBlock
            key={catKey}
            catKey={catKey}
            cat={cat}
            expanded={expandedCategories.has(catKey)}
            onToggleExpand={() => toggleCategory(catKey)}
            manualChecks={manualChecks}
            onCheck={toggleCheck}
            metrics={campaign.metrics}
            isABS={campaign.is_abs}
          />
        );
      })}

      {error && (
        <div className="form-error">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {savedAt && (
        <div className="form-success">
          <CheckCircle2 size={14} /> Salvo às {savedAt.toLocaleTimeString('pt-BR')}
        </div>
      )}

      <div className="form-actions">
        <Button variant="ghost" onClick={() => handleSave(false)} disabled={saving}>
          Salvar rascunho
        </Button>
        <Button variant="primary" icon={Save} onClick={() => handleSave(true)} loading={saving}>
          {campaign.reviewed ? 'Atualizar revisão' : 'Confirmar revisão'}
        </Button>
      </div>
    </AppShell>
  );
}

function CategoryBlock({ catKey, cat, expanded, onToggleExpand, manualChecks, onCheck, metrics, isABS }) {
  const earnedCount = cat.items.filter(i => isEffectivelyEarned(i, manualChecks)).length;

  return (
    <Card className="category-block fade-up" style={{ marginBottom: 'var(--space-3)' }}>
      <button className="category-block__header" onClick={onToggleExpand}>
        <div className="category-block__title">
          {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          <span>{cat.label}</span>
          <Badge variant="neutral">{earnedCount}/{cat.items.length}</Badge>
        </div>
        <div className="category-block__total">
          <span className="mono">{(cat.subtotal_pct * 100).toFixed(2)}%</span>
          <span className="mono category-block__brl">{fmt.brl(cat.subtotal_brl)}</span>
        </div>
      </button>

      {expanded && (
        <div className="category-block__items">
          {cat.items.map(item => (
            <ItemRow
              key={item.id}
              item={item}
              manualChecks={manualChecks}
              onCheck={onCheck}
              metrics={metrics}
              isABS={isABS}
            />
          ))}
          {cat.notes && (
            <div className="category-block__notes">
              <Info size={12} /> {cat.notes}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function ItemRow({ item, manualChecks, onCheck, metrics, isABS }) {
  const earned = isEffectivelyEarned(item, manualChecks);
  const isManual = item.source === 'manual';
  const isAuto = item.source === 'auto';
  const isMetric = item.source === 'metrics';

  // Pra items de otimização: explica regra
  const metricInfo = isMetric ? formatMetricInfo(item, metrics, isABS) : null;

  return (
    <div className={`item-row ${earned ? 'item-row--earned' : ''}`}>
      <div className="item-row__check">
        {isManual ? (
          <input
            type="checkbox"
            checked={!!manualChecks[item.id]}
            onChange={() => onCheck(item.id)}
            className="item-row__checkbox"
          />
        ) : earned ? (
          <CheckCircle2 size={18} className="item-row__icon item-row__icon--earned" />
        ) : (
          <div className="item-row__icon item-row__icon--empty" />
        )}
      </div>

      <div className="item-row__content">
        <div className="item-row__label">
          {item.label}
          {isAuto && <span className="item-row__badge item-row__badge--auto"><Zap size={10} /> Auto</span>}
          {isMetric && <span className="item-row__badge item-row__badge--metric"><Sparkles size={10} /> Métrica</span>}
        </div>
        {item.help && <div className="item-row__help">{item.help}</div>}
        {metricInfo && <div className="item-row__help item-row__help--metric">{metricInfo}</div>}
      </div>

      <div className="item-row__values">
        <span className="mono item-row__pct">{(item.pct * 100).toFixed(2)}%</span>
        {earned && <span className="mono item-row__brl">{fmt.brl(item.value_brl)}</span>}
      </div>
    </div>
  );
}

function RoField({ label, value }) {
  return (
    <div className="ro-field">
      <span className="label">{label}</span>
      <span>{value}</span>
    </div>
  );
}

function RoTags({ label, items, variant = 'neutral' }) {
  return (
    <div className="ro-field ro-field--wide">
      <span className="label">{label}</span>
      <div className="ro-tags">
        {items.map((it, idx) => <Badge key={idx} variant={variant}>{it}</Badge>)}
      </div>
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────

function isEffectivelyEarned(item, manualChecks) {
  // Para items manuais, depende do checkbox local
  if (item.source === 'manual') return !!manualChecks[item.id];
  // Para auto e metrics, vem do server (campo earned)
  return !!item.earned;
}

function formatMetricInfo(item, metrics, isABS) {
  if (!metrics) {
    return 'Aguardando dados de performance (calcula automaticamente após campanha fechar).';
  }
  const over = Number(metrics.over_percent) || 0;
  const ecpm = Number(metrics.ecpm) || 0;
  const ctr = (Number(metrics.ctr) * 100).toFixed(2);

  // Status emoji por critério
  const overOK = over <= 25 ? '✓' : '✗';
  const ecpmLimit = isABS ? 1.50 : 0.70;
  const ecpmOK = ecpm > 0 && ecpm <= ecpmLimit ? '✓' : '✗';
  const ctrLimit = isABS ? 0.5 : 0.7;
  const ctrOK = Number(ctr) >= ctrLimit ? '✓' : '✗';

  return `Over: ${over.toFixed(1)}% ${overOK} (limite 25%) · eCPM: R$ ${ecpm.toFixed(2)} ${ecpmOK} (limite R$ ${ecpmLimit.toFixed(2)}) · CTR: ${ctr}% ${ctrOK} (mín ${ctrLimit}%)`;
}

// Recalcula localmente o subtotal pra dar feedback imediato sem chamar backend.
// Recomputa só o que muda com manual checks; o restante mantém do server.
function recomputeLocally(serverBreakdown, manualChecks) {
  if (!serverBreakdown) return null;

  const NET_FACTOR = 1 - (serverBreakdown.tax_rate || 0.1653);
  const liquido = serverBreakdown.liquido;
  let totalPct = 0;

  const newByCategory = {};
  for (const [catKey, cat] of Object.entries(serverBreakdown.by_category)) {
    const newItems = cat.items.map(item => {
      const earned = isEffectivelyEarned(item, manualChecks);
      return {
        ...item,
        earned,
        value_brl: earned ? liquido * item.pct : 0,
      };
    });
    const subtotalPct = newItems.filter(i => i.earned).reduce((s, i) => s + i.pct, 0);
    const subtotalBrl = newItems.filter(i => i.earned).reduce((s, i) => s + i.value_brl, 0);
    newByCategory[catKey] = { ...cat, items: newItems, subtotal_pct: subtotalPct, subtotal_brl: subtotalBrl };
    totalPct += subtotalPct;
  }

  return {
    ...serverBreakdown,
    by_category: newByCategory,
    total_pct: totalPct,
    total_brl: liquido * totalPct,
  };
}
