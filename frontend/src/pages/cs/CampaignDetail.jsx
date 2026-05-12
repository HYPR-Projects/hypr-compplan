import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle2, AlertCircle, Save, Info,
  ChevronDown, ChevronRight, Sparkles, Zap, Eye,
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
  const { token, csEmail: impersonateEmail } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [manualChecks, setManualChecks] = useState({});
  const [expandedCategories, setExpandedCategories] = useState(new Set(CATEGORY_ORDER));

  // Helpers de impersonação
  const opts = impersonateEmail ? { as: impersonateEmail } : {};
  const backUrl = impersonateEmail
    ? `/admin/cs/${encodeURIComponent(impersonateEmail)}`
    : '/cs';

  async function load() {
    try {
      setError(null);
      const c = await endpoints.meCampaign(token, opts);
      setCampaign(c);
      setManualChecks(c.manual_checks || {});
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => { load(); }, [token, impersonateEmail]);

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
      }, opts);
      setSavedAt(new Date());
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

  // is_abs efetivo: prioriza override do CS
  const effectiveIsAbs = Object.prototype.hasOwnProperty.call(manualChecks, '__is_abs')
    ? !!manualChecks.__is_abs
    : !!campaign.is_abs;

  // Re-calcula localmente: aplica manualChecks atual em cima dos earned automáticos
  // E também recalcula Otimização quando is_abs muda (Para feedback imediato sem esperar o backend)
  const breakdown = recomputeLocally(campaign.breakdown, manualChecks, campaign.metrics, effectiveIsAbs);

  return (
    <AppShell>
      {impersonateEmail && (
        <div className="impersonation-banner">
          <Eye size={16} />
          <span>
            Visualizando campanha de <strong>{campaign.cs_name || campaign.cs_email}</strong>. Edições serão registradas em seu nome.
          </span>
          <button className="impersonation-banner__back" onClick={() => navigate(backUrl)}>
            <ArrowLeft size={14} /> Voltar
          </button>
        </div>
      )}

      <button className="back-link fade-up" onClick={() => navigate(backUrl)}>
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
          {campaign.last_edit_by && (
            <div className="page-subtitle" style={{ marginTop: 6, fontSize: 'var(--text-xs)', color: 'var(--text-tertiary)' }}>
              Última edição: {campaign.last_edit_by}
              {campaign.last_edit_at && <> · {new Date(campaign.last_edit_at).toLocaleString('pt-BR')}</>}
            </div>
          )}
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
            isABS={effectiveIsAbs}
            onAbsChange={(newAbs) => setManualChecks(prev => ({ ...prev, __is_abs: newAbs }))}
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

function CategoryBlock({ catKey, cat, expanded, onToggleExpand, manualChecks, onCheck, metrics, isABS, onAbsChange }) {
  const earnedCount = cat.items.filter(i => isEffectivelyEarned(i, manualChecks)).length;
  const isOptimization = catKey === 'optimization';

  return (
    <Card className="category-block fade-up" style={{ marginBottom: 'var(--space-3)' }}>
      <button className="category-block__header" onClick={onToggleExpand}>
        <div className="category-block__title">
          {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          <span>{cat.label}</span>
          <Badge variant={cat.invalidated ? 'red' : 'neutral'}>
            {cat.invalidated ? `0/${cat.items.length} (anulado)` : `${earnedCount}/${cat.items.length}`}
          </Badge>
        </div>
        <div className="category-block__total">
          <span className="mono">{(cat.subtotal_pct * 100).toFixed(2)}%</span>
          <span className="mono category-block__brl">{fmt.brl(cat.subtotal_brl)}</span>
        </div>
      </button>

      {expanded && (
        <div className="category-block__items">
          {cat.invalidated && cat.invalidation_reason && (
            <div className="category-block__invalidation">
              <AlertCircle size={16} />
              <span>{cat.invalidation_reason}</span>
            </div>
          )}
          {isOptimization && onAbsChange && (
            <div className="abs-toggle">
              <div className="abs-toggle__label">
                <span>Esta campanha é</span>
              </div>
              <div className="abs-toggle__buttons">
                <button
                  type="button"
                  className={`abs-toggle__btn ${isABS ? 'abs-toggle__btn--active' : ''}`}
                  onClick={() => onAbsChange(true)}
                >
                  Com ABS
                </button>
                <button
                  type="button"
                  className={`abs-toggle__btn ${!isABS ? 'abs-toggle__btn--active' : ''}`}
                  onClick={() => onAbsChange(false)}
                >
                  Sem ABS
                </button>
              </div>
              <div className="abs-toggle__hint">
                {isABS
                  ? 'Limites: eCPM ≤ R$ 1,50 · CTR ≥ 0,5%'
                  : 'Limites: eCPM ≤ R$ 0,70 · CTR ≥ 0,7%'}
              </div>
            </div>
          )}
          {cat.items.map(item => (
            <ItemRow
              key={item.id}
              item={item}
              manualChecks={manualChecks}
              onCheck={onCheck}
              metrics={metrics}
              isABS={isABS}
              invalidated={cat.invalidated}
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

function ItemRow({ item, manualChecks, onCheck, metrics, isABS, invalidated }) {
  const isManual = item.source === 'manual';
  const isSemiAuto = item.source === 'semi_auto';
  const isAuto = item.source === 'auto';
  const isMetric = item.source === 'metrics';

  // Determina se está "checado" no UI:
  // - manual: depende do manualChecks
  // - semi_auto: usa o que veio do server (item.earned) OU override do CS
  // - auto/metric: usa item.earned do server
  let isChecked;
  if (isManual) {
    isChecked = !!manualChecks[item.id];
  } else if (isSemiAuto) {
    // Se CS já interagiu (chave presente), usa esse valor.
    // Senão usa o earned do server (que reflete o inferido).
    isChecked = Object.prototype.hasOwnProperty.call(manualChecks, item.id)
      ? !!manualChecks[item.id]
      : item.was_earned || item.earned;
  } else {
    isChecked = item.earned;
  }

  const editable = isManual || isSemiAuto;
  const metricInfo = isMetric ? formatMetricInfo(item, metrics, isABS) : null;

  return (
    <div className={`item-row ${item.earned ? 'item-row--earned' : ''} ${invalidated && item.was_earned ? 'item-row--invalidated' : ''}`}>
      <div className="item-row__check">
        {editable ? (
          <input
            type="checkbox"
            checked={isChecked}
            onChange={() => onCheck(item.id)}
            className="item-row__checkbox"
            disabled={invalidated}
          />
        ) : item.earned ? (
          <CheckCircle2 size={18} className="item-row__icon item-row__icon--earned" />
        ) : (
          <div className="item-row__icon item-row__icon--empty" />
        )}
      </div>

      <div className="item-row__content">
        <div className="item-row__label">
          {item.label}
          {isAuto && <span className="item-row__badge item-row__badge--auto"><Zap size={10} /> Auto</span>}
          {isSemiAuto && <span className="item-row__badge item-row__badge--semi"><Zap size={10} /> Semi auto</span>}
          {isMetric && <span className="item-row__badge item-row__badge--metric"><Sparkles size={10} /> Métrica</span>}
        </div>
        {item.help && <div className="item-row__help">{item.help}</div>}
        {metricInfo && <div className="item-row__help item-row__help--metric">{metricInfo}</div>}
      </div>

      <div className="item-row__values">
        <span className={`mono item-row__pct ${invalidated && item.was_earned ? 'item-row__pct--strike' : ''}`}>
          {(item.pct * 100).toFixed(2)}%
        </span>
        {item.earned && <span className="mono item-row__brl">{fmt.brl(item.value_brl)}</span>}
        {invalidated && item.was_earned && (
          <span className="mono item-row__brl item-row__brl--strike">
            ~{fmt.brl(item.pct * (item.value_brl || 0))}~
          </span>
        )}
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
  if (item.source === 'manual') return !!manualChecks[item.id];
  if (item.source === 'semi_auto') {
    if (Object.prototype.hasOwnProperty.call(manualChecks, item.id)) {
      return !!manualChecks[item.id];
    }
    return !!(item.was_earned || item.earned);
  }
  return !!item.earned;
}

function formatMetricInfo(item, metrics, isABS) {
  if (!metrics) {
    return 'Aguardando dados de performance (calcula automaticamente após campanha fechar).';
  }
  const over = Number(metrics.over_percent) || 0;
  const ecpm = Number(metrics.ecpm) || 0;
  const ctr = (Number(metrics.ctr) * 100).toFixed(2);

  // Limites são intrínsecos a cada item (não dependem do toggle)
  const isItemABS = item.id === 'opt_with_abs';
  const ecpmLimit = isItemABS ? 1.50 : 0.70;
  const ctrLimit = isItemABS ? 0.5 : 0.7;

  const overOK = over <= 25 ? '✓' : '✗';
  const ecpmOK = ecpm > 0 && ecpm <= ecpmLimit ? '✓' : '✗';
  const ctrOK = Number(ctr) >= ctrLimit ? '✓' : '✗';

  return `Over: ${over.toFixed(1)}% ${overOK} (limite 25%) · eCPM: R$ ${ecpm.toFixed(2)} ${ecpmOK} (limite R$ ${ecpmLimit.toFixed(2)}) · CTR: ${ctr}% ${ctrOK} (mín ${ctrLimit}%)`;
}

// Recalcula localmente o subtotal pra dar feedback imediato sem chamar backend.
// Recomputa items manuais, semi_auto, E métricas (quando is_abs muda).
function recomputeLocally(serverBreakdown, manualChecks, metrics, effectiveIsAbs) {
  if (!serverBreakdown) return null;

  const liquido = serverBreakdown.liquido;
  let totalPct = 0;

  // Recalcula items de Otimização baseado no is_abs efetivo
  const optMetricEarned = computeOptimizationEarned(metrics, effectiveIsAbs);

  const newByCategory = {};
  for (const [catKey, cat] of Object.entries(serverBreakdown.by_category)) {
    const invalidated = !!cat.invalidated;
    const newItems = cat.items.map(item => {
      let wouldEarn;

      if (item.source === 'metrics') {
        // Otimização: usa o cálculo local baseado no is_abs atual
        wouldEarn = optMetricEarned.has(item.id);
      } else {
        wouldEarn = isEffectivelyEarned(item, manualChecks);
      }

      const effectivelyEarned = wouldEarn && !invalidated;
      return {
        ...item,
        earned: effectivelyEarned,
        was_earned: wouldEarn,
        invalidated: invalidated && wouldEarn,
        value_brl: effectivelyEarned ? liquido * item.pct : 0,
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

// Espelho local da função do backend pra Otimizações
function computeOptimizationEarned(metrics, isABS) {
  const earned = new Set();
  if (!metrics) return earned;

  const over = Number(metrics.over_percent) || 0;
  const ecpm = Number(metrics.ecpm) || 0;
  const ctr = Number(metrics.ctr) || 0;

  if (isABS) {
    if (over <= 25 && ecpm > 0 && ecpm <= 1.50 && ctr >= 0.005) {
      earned.add('opt_with_abs');
    }
  } else {
    if (over <= 25 && ecpm > 0 && ecpm <= 0.70 && ctr >= 0.007) {
      earned.add('opt_without_abs');
    }
  }
  return earned;
}
