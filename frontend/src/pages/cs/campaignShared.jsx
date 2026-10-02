/**
 * Peças compartilhadas pelas telas de campanha (versão 2026 e 2026-Q4):
 * recálculo local do breakdown, métricas de Otimização e o modal de replicar.
 * Extraído de CampaignDetail.jsx sem mudança de comportamento.
 */
import { useEffect, useState } from 'react';
import { Info, Copy } from 'lucide-react';
import { Card } from '../../components/ui/Card.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { fmt } from '../../lib/format.js';
import { endpoints } from '../../lib/api.js';

export const CATEGORY_ORDER = ['pre_campaign', 'setup', 'optimization', 'account_mgmt', 'extras', 'onboarding'];
// Items que não seguem o responsável da etapa (ex_estudos vai pro autor do estudo)
export const STAGE_EXEMPT_ITEMS = new Set(['ex_estudos']);

export function RoField({ label, value }) {
  return (
    <div className="ro-field">
      <span className="label">{label}</span>
      <span>{value}</span>
    </div>
  );
}

export function RoTags({ label, items, variant = 'neutral' }) {
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

export function isEffectivelyEarned(item, manualChecks) {
  // Admin override tem prioridade absoluta sobre qualquer outra fonte.
  if (item.admin_override && typeof item.admin_override.earned === 'boolean') {
    return item.admin_override.earned;
  }
  if (item.source === 'manual') return !!manualChecks[item.id];
  if (item.source === 'semi_auto') {
    if (Object.prototype.hasOwnProperty.call(manualChecks, item.id)) {
      return !!manualChecks[item.id];
    }
    return !!(item.was_earned || item.earned);
  }
  return !!item.earned;
}

export function formatMetricInfo(item, metrics, isABS) {
  if (!metrics) {
    return 'Aguardando dados de performance (calcula automaticamente após campanha fechar).';
  }

  // Item de vídeo (campanhas só de vídeo) — mostra Tech Cost + VTR
  if (item.id === 'opt_video') {
    const vtr = Number(metrics.video_vtr_pct) || 0;
    const techCost = Number(metrics.video_tech_cost_pct) || 0;
    const starts = Number(metrics.video_starts) || 0;

    if (starts === 0) {
      return 'Aguardando dados de vídeo (sem starts registrados ainda).';
    }

    const techOK = techCost <= 3 ? '✓' : '✗';
    const vtrOK = vtr >= 85 ? '✓' : '✗';

    return `Tech Cost: ${techCost.toFixed(2)}% ${techOK} (limite 3%) · VTR: ${vtr.toFixed(1)}% ${vtrOK} (mín 85%)`;
  }

  // Items de display (opt_with_abs, opt_without_abs)
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

  // ⚡ Contratado vs entregue de display, cru — ajuda o CS a enxergar a conta
  // por trás do over% (ex.: checklist com bônus não lançado gera over% que
  // parece estouro mas na real é dado incompleto — ver SAKL4M/22-09-2026).
  const contratado = Number(metrics.display_contracted) || 0;
  const entregue = Number(metrics.display_viewable) || 0;
  const volInfo = contratado > 0
    ? ` · Contratado: ${contratado.toLocaleString('pt-BR')} · Entregue: ${entregue.toLocaleString('pt-BR')}`
    : '';

  return `Over: ${over.toFixed(1)}% ${overOK} (limite 25%) · eCPM: R$ ${ecpm.toFixed(2)} ${ecpmOK} (limite R$ ${ecpmLimit.toFixed(2)}) · CTR: ${ctr}% ${ctrOK} (mín ${ctrLimit}%)${volInfo}`;
}

// Recalcula localmente o subtotal pra dar feedback imediato sem chamar backend.
// Recomputa items manuais, semi_auto, E métricas (quando is_abs muda).
export function recomputeLocally(serverBreakdown, manualChecks, metrics, effectiveIsAbs) {
  if (!serverBreakdown) return null;

  const liquido = serverBreakdown.liquido;
  let totalPct = 0;

  // Detecta se é campanha só vídeo olhando se existe item opt_video no breakdown.
  // O backend só inclui opt_video se isVideoOnlyCampaign() retorna true.
  const optCat = serverBreakdown.by_category?.optimization;
  const isVideoOnly = !!(optCat?.items?.some(i => i.id === 'opt_video'));

  // Recalcula items de Otimização baseado no is_abs efetivo + tipo da campanha
  const optMetricEarned = computeOptimizationEarned(metrics, effectiveIsAbs, isVideoOnly);

  const newByCategory = {};
  for (const [catKey, cat] of Object.entries(serverBreakdown.by_category)) {
    const invalidated = !!cat.invalidated;
    // Etapa atribuída a outro CS: item pode estar conquistado, mas não conta aqui
    const stageBlocked = !!cat.assigned_to_other;
    const newItems = cat.items.map(item => {
      let wouldEarn;

      if (item.source === 'metrics') {
        // Admin override tem palavra final, mesmo em items de Otimização.
        // Se admin forçou true/false, ignora cálculo por métricas.
        if (item.admin_override && typeof item.admin_override.earned === 'boolean') {
          wouldEarn = item.admin_override.earned;
        } else {
          // Otimização: usa o cálculo local baseado no is_abs atual
          wouldEarn = optMetricEarned.has(item.id);
        }
      } else {
        wouldEarn = isEffectivelyEarned(item, manualChecks);
      }

      // Admin override do item tem prioridade sobre a anulação do setup.
      // Se o admin forçou explicitamente OK/Não naquele item, vale isso —
      // mesmo com o setup anulado por over > 50%.
      const hasItemOverride = item.admin_override && typeof item.admin_override.earned === 'boolean';
      let effectivelyEarned = hasItemOverride
        ? item.admin_override.earned
        : (wouldEarn && !invalidated);
      const itemStageBlocked = stageBlocked && !STAGE_EXEMPT_ITEMS.has(item.id);
      const assignedToOther = itemStageBlocked && effectivelyEarned;
      if (itemStageBlocked) effectivelyEarned = false;
      return {
        ...item,
        earned: effectivelyEarned,
        assigned_to_other: assignedToOther,
        was_earned: wouldEarn,
        invalidated: invalidated && wouldEarn && !hasItemOverride,
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
export function computeOptimizationEarned(metrics, isABS, isVideoOnly = false) {
  const earned = new Set();
  if (!metrics) return earned;

  // Campanha só de vídeo → avalia Tech Cost + VTR
  if (isVideoOnly) {
    const vtr = Number(metrics.video_vtr_pct) || 0;
    const techCost = Number(metrics.video_tech_cost_pct);
    const hasData = Number(metrics.video_starts) > 0 && (techCost !== null && techCost !== undefined);
    if (hasData && techCost <= 3 && vtr >= 85) {
      earned.add('opt_video');
    }
    return earned;
  }

  // Campanha com display
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

export function ReplicateModal({ token, opts, campaign, onClose, onSuccess }) {
  const [sources, setSources] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    endpoints.meReplicateSources(token, opts)
      .then(d => setSources(d.items || []))
      .catch(e => setErr(e.message));
  }, [token]);

  const filtered = (sources || []).filter(s => {
    const t = search.trim().toLowerCase();
    if (!t) return true;
    return (s.campaign_name || '').toLowerCase().includes(t) ||
           (s.short_token || '').toLowerCase().includes(t);
  });

  async function handleConfirm() {
    if (!selected) return;
    setLoading(true);
    setErr(null);
    try {
      await endpoints.meReplicateFrom(token, selected, opts);
      onSuccess();
    } catch (e) {
      setErr(e.message);
      setLoading(false);
    }
  }

  return (
    <Modal open={true} title={`Replicar checkup — ${campaign.client_name}`} onClose={onClose}>
      <div className="form-stack">
        <Card variant="info" style={{ padding: 'var(--space-3)' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <Info size={16} style={{ color: 'var(--accent-cyan)', marginTop: 2, flexShrink: 0 }} />
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
              Copia os itens manuais (<strong>Pré Campanha</strong>, <strong>Account Mgmt</strong>, <strong>Extras</strong>, <strong>Onboarding</strong>) de outra campanha do mesmo cliente.
              <br />
              <strong>Setup</strong> e <strong>Otimizações</strong> não são copiados — são automáticos por checklist e métricas.
              <br />
              <span style={{ color: 'var(--accent-yellow)' }}>⚠ Sobrescreve o que já estava nesta campanha.</span>
            </div>
          </div>
        </Card>

        {sources === null ? (
          <div className="empty-state" style={{ padding: 'var(--space-3)' }}>Carregando…</div>
        ) : sources.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--space-3)' }}>
            Nenhuma outra campanha de <strong>{campaign.client_name}</strong> disponível pra replicar.
          </div>
        ) : (
          <>
            <input
              type="text"
              className="cs-notes-block__textarea"
              style={{ minHeight: 'auto', padding: '8px 12px' }}
              placeholder="Buscar campanha…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="replicate-list">
              {filtered.map(s => (
                <label
                  key={s.short_token}
                  className={`replicate-option ${selected === s.short_token ? 'replicate-option--selected' : ''}`}
                >
                  <input
                    type="radio"
                    name="source"
                    value={s.short_token}
                    checked={selected === s.short_token}
                    onChange={() => setSelected(s.short_token)}
                  />
                  <div className="replicate-option__main">
                    <div className="replicate-option__title">
                      <strong>{s.campaign_name}</strong>
                      <Badge variant="neutral">{s.short_token}</Badge>
                      {s.is_legacy && <Badge variant="neutral">Legacy</Badge>}
                    </div>
                    <div className="replicate-option__meta">
                      {fmt.dateRange(s.start_date, s.end_date)}
                      <span className="page-subtitle__sep">·</span>
                      <strong>{s.n_filled}</strong> {s.n_filled === 1 ? 'item preenchido' : 'itens preenchidos'}
                    </div>
                  </div>
                </label>
              ))}
            </div>
          </>
        )}

        {err && <div className="form-error">{err}</div>}

        <div className="modal__footer">
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button
            variant="primary"
            icon={Copy}
            onClick={handleConfirm}
            disabled={!selected || loading}
          >
            {loading ? 'Replicando…' : 'Replicar checkup'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
