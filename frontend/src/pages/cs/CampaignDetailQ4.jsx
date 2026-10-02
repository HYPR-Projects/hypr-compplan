/**
 * Tela da campanha — versão 2026-Q4 do Compplan (campanhas com início a partir
 * de 01/10/2026). Campanhas do Q3 e anteriores continuam na tela antiga
 * (CampaignDetail.jsx) com as etapas de lá — o histórico não muda.
 *
 * Linguagem visual do Report Center: KPIs no topo, abas por etapa, selo de
 * origem em cada item ("Checklist", "Report Hub", "Você marca"), status por
 * item e "o que configura" sob demanda. Override do admin fica num menu do
 * item em vez de uma caixa em todos.
 *
 * Estado, salvar e recálculo local vêm do CampaignDetail (mesmas funções).
 */
import { useMemo, useState } from 'react';
import {
  ArrowLeft, CheckCircle2, AlertCircle, AlertTriangle, Save, Info, Eye, Link2,
  MessageSquare, Shield, Copy, BookOpen, X, Download, FileSpreadsheet, UserPlus,
  MoreHorizontal, ExternalLink, Sparkles, ChevronDown, ChevronUp, CircleDashed,
  Search, CalendarCheck, FileText, Unlink,
} from 'lucide-react';
import AppShell from '../../components/layout/AppShell.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import { fmt } from '../../lib/format.js';
import { endpoints } from '../../lib/api.js';
import { requestCalendarToken, listCalendarEvents } from '../../lib/googleCalendar.js';
import { Modal } from '../../components/ui/Modal.jsx';
import {
  CATEGORY_ORDER, STAGE_EXEMPT_ITEMS, RoField, RoTags,
  isEffectivelyEarned, formatMetricInfo, ReplicateModal,
} from './campaignShared.jsx';
import './CampaignDetailQ4.css';

const STAGE_SHORT = {
  pre_campaign: 'Pré-campanha',
  setup: 'Setup',
  optimization: 'Otimização',
  account_mgmt: 'Account',
  extras: 'Extras',
  onboarding: 'Onboarding',
};

const REPORT_URL = (token) => `https://report.hypr.mobi/report/${encodeURIComponent(token)}`;

const MA_PROOF = {
  linked:      { label: 'Peça vinculada',                    tone: 'ok' },
  not_linked:  { label: 'Falta vincular no Report Hub',      tone: 'warn' },
  no_template: { label: 'Sem peça na Platform — conta pelo checklist', tone: 'info' },
  unavailable: { label: 'Report Hub indisponível agora',     tone: 'warn' },
};

/** Origem do dado de cada item (selo ao lado do nome). */
function sourceOf(item, catKey) {
  if (item.source === 'metrics') return { label: 'Métricas da campanha', tone: 'metric' };
  if (item.source === 'auto') return { label: 'Automático', tone: 'auto' };
  if (item.source === 'calendar') return { label: 'Agenda Google', tone: 'auto' };
  if (item.source === 'semi_auto') {
    if (item.id.startsWith('setup_tier1')) return { label: 'Checklist + Report Hub', tone: 'auto' };
    if (item.id === 'am_loom' || item.id === 'am_reports') return { label: 'Report Center', tone: 'auto' };
    if (item.id.startsWith('pre_feat_')) return { label: 'Deck + checklist', tone: 'auto' };
    return { label: 'Checklist (Force)', tone: 'auto' };
  }
  if (catKey === 'pre_campaign') return { label: 'Você marca · deck', tone: 'manual' };
  return { label: 'Você marca', tone: 'manual' };
}

/** Itens que exigem ação do CS (painel "Precisa da sua ação"). */
function collectActions(breakdown, manualChecks, campaign) {
  const actions = [];
  const today = new Date().toISOString().slice(0, 10);
  for (const m of breakdown.max_attention || []) {
    if (m.proof === 'not_linked') {
      actions.push({ stage: 'setup', tone: 'warn', text: `Vincule a peça ${m.name} na aba Max Attention do Report Hub para contar como feature.`, link: true });
    } else if (m.proof === 'unavailable') {
      actions.push({ stage: 'setup', tone: 'warn', text: `Não foi possível consultar o Report Hub para ${m.name}. Recarregue a página mais tarde.` });
    }
  }
  const evidence = manualChecks.__evidence || {};
  for (const [catKey, cat] of Object.entries(breakdown.by_category || {})) {
    if (cat.assigned_to_other) continue;
    const anyChecked = cat.items.some(i => isEffectivelyEarned(i, manualChecks));
    if (catKey === 'pre_campaign') {
      if (anyChecked && !manualChecks.__pre_deck && !(evidence.pre_campaign || '').trim()) {
        actions.push({ stage: catKey, tone: 'warn', text: 'Escolha o deck da pré-campanha (pasta Audience Discovery) para comprovar os itens marcados.' });
      }
      if (breakdown.pre_deck?.after_start) {
        actions.push({ stage: catKey, tone: 'warn', text: 'O deck escolhido foi criado depois do início da campanha — as features da pré-campanha não contam.' });
      }
    } else if (cat.shared_evidence && anyChecked && !(evidence[cat.shared_evidence.key] || '').trim()) {
      actions.push({ stage: catKey, tone: 'warn', text: `${cat.shared_evidence.label}: cole o link que comprova os itens marcados.` });
    }
    if (catKey === 'account_mgmt' && !manualChecks.__pv_meeting && campaign?.end_date && campaign.end_date <= today) {
      actions.push({ stage: catKey, tone: 'info', text: 'Fez reunião de pós-venda? Vincule o evento da sua agenda para contar.' });
    }
    for (const it of cat.items) {
      if (it.needs_evidence && !it.auto_evidence && it.earned && !cat.invalidated && !(evidence[it.id] || '').trim()) {
        actions.push({ stage: catKey, tone: 'warn', text: `${it.label}: falta o link da evidência.` });
      }
    }
  }
  return actions;
}

export default function CampaignDetailQ4(props) {
  const {
    campaign, breakdown, manualChecks, setManualChecks, toggleCheck, setEvidence,
    handleAdminOverride, handleSetupForce, handleAssignStage, handleAssignStudy, handleSave,
    saving, savedAt, savedAs, error, isAdmin, onlyAssignedStages, viewerAssignedStages,
    stageAssignees, canAssignStages, nameForEmail, teamList, studiesCatalog, effectiveIsAbs,
    impersonateEmail, backUrl, token, opts, load, navigate, ownerEmail,
    reloadKeepingEdits, viewerEmail,
  } = props;

  const [showReplicateModal, setShowReplicateModal] = useState(false);
  const [showChecklist, setShowChecklist] = useState(false);

  const stages = (onlyAssignedStages
    ? CATEGORY_ORDER.filter(st => viewerAssignedStages.includes(st))
    : CATEGORY_ORDER
  ).filter(st => breakdown.by_category[st]);

  const [activeStage, setActiveStage] = useState(stages[0] || 'pre_campaign');
  const actions = useMemo(() => collectActions(breakdown, manualChecks, campaign), [breakdown, manualChecks, campaign]);

  const counts = useMemo(() => {
    let earned = 0, total = 0;
    for (const st of stages) {
      const cat = breakdown.by_category[st];
      total += cat.items.length;
      earned += cat.items.filter(i => i.earned).length;
    }
    return { earned, total };
  }, [breakdown, stages]);

  const cat = breakdown.by_category[activeStage];

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

      {/* ── Cabeçalho ─────────────────────────────────────────────── */}
      <header className="q4-header fade-up">
        <div className="q4-header__main">
          <div className="q4-header__crumbs">
            <span>{campaign.client_name}</span>
            <span className="q4-dot">·</span>
            <Badge variant="neutral">{campaign.short_token}</Badge>
            <span className="q4-version">Compplan Q4/2026</span>
            {campaign.is_legacy && <Badge variant="neutral">Legacy</Badge>}
            {campaign.reviewed && <Badge variant="green">Revisada</Badge>}
            {CATEGORY_ORDER.filter(st => stageAssignees[st]).map(st => (
              <Badge key={st} variant={viewerAssignedStages.includes(st) ? 'cyan' : 'yellow'}>
                {STAGE_SHORT[st]}: {nameForEmail(stageAssignees[st])}
              </Badge>
            ))}
          </div>
          <h1 className="q4-header__title">{campaign.campaign_name}</h1>
          <div className="q4-header__meta">
            {fmt.dateRange(campaign.start_date, campaign.end_date)}
            {campaign.agency && <> · {campaign.agency}</>}
            {campaign.cp_name && <> · CP: {campaign.cp_name}</>}
            {campaign.last_edit_by && (
              <> · Última edição: {campaign.last_edit_by}
                {campaign.last_edit_at && <> em {new Date(campaign.last_edit_at).toLocaleString('pt-BR')}</>}
              </>
            )}
          </div>
        </div>
        <div className="q4-header__actions">
          <a className="q4-link-btn" href={REPORT_URL(campaign.short_token)} target="_blank" rel="noreferrer">
            <ExternalLink size={14} /> Report Center
          </a>
          {isAdmin && (
            <>
              <Button variant="ghost" size="sm" icon={FileSpreadsheet}
                onClick={() => endpoints.adminExportCampaign(campaign.short_token, 'xlsx').catch(e => alert(`Falha no export: ${e.message}`))}>
                Excel
              </Button>
              <Button variant="ghost" size="sm" icon={Download}
                onClick={() => endpoints.adminExportCampaign(campaign.short_token, 'csv').catch(e => alert(`Falha no export: ${e.message}`))}>
                CSV
              </Button>
            </>
          )}
          <Button variant="ghost" size="sm" icon={Copy} onClick={() => setShowReplicateModal(true)}>
            Replicar checkup
          </Button>
        </div>
      </header>

      {/* ── KPIs ──────────────────────────────────────────────────── */}
      <section className="q4-kpis fade-up">
        <div className="q4-kpi q4-kpi--accent">
          <span className="q4-kpi__label">Bônus desta campanha</span>
          <span className="q4-kpi__value mono">{fmt.brl(breakdown.total_brl)}</span>
          <span className="q4-kpi__note">
            {(breakdown.total_pct * 100).toFixed(2)}% do líquido
            {breakdown.optimization_state?.state === 'live' && breakdown.by_category.optimization?.subtotal_pct > 0 && ' · otimização parcial'}
          </span>
        </div>
        <div className="q4-kpi">
          <span className="q4-kpi__label">Líquido da campanha</span>
          <span className="q4-kpi__value mono">{fmt.brl(campaign.liquido)}</span>
          <span className="q4-kpi__note">Bruto {fmt.brl(campaign.bruto)} · imposto {(campaign.tax_rate * 100).toFixed(2)}%</span>
        </div>
        <div className="q4-kpi">
          <span className="q4-kpi__label">Itens conquistados</span>
          <span className="q4-kpi__value mono">{counts.earned}<span className="q4-kpi__of">/{counts.total}</span></span>
          <span className="q4-kpi__note">nas etapas que você vê</span>
        </div>
        <div className={`q4-kpi ${actions.length ? 'q4-kpi--warn' : 'q4-kpi--ok'}`}>
          <span className="q4-kpi__label">Pendências</span>
          <span className="q4-kpi__value mono">{actions.length}</span>
          <span className="q4-kpi__note">{actions.length ? 'veja abaixo o que falta' : 'nada pendente'}</span>
        </div>
      </section>

      {/* ── Precisa da sua ação ───────────────────────────────────── */}
      {actions.length > 0 && (
        <section className="q4-actions fade-up">
          <div className="q4-actions__title"><AlertTriangle size={14} /> Precisa da sua ação</div>
          <ul>
            {actions.map((a, idx) => (
              <li key={idx}>
                <button type="button" className="q4-actions__stage" onClick={() => setActiveStage(a.stage)}>
                  {STAGE_SHORT[a.stage]}
                </button>
                <span>{a.text}</span>
                {a.link && (
                  <a href={REPORT_URL(campaign.short_token)} target="_blank" rel="noreferrer" className="q4-inline-link">
                    Abrir Report Hub <ExternalLink size={11} />
                  </a>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {onlyAssignedStages && (
        <div className="cs-only-pre-banner">
          <Info size={14} />
          <span>
            Você é responsável por{' '}
            <strong>{viewerAssignedStages.map(st => STAGE_SHORT[st] || st).join(', ')}</strong>{' '}
            nesta campanha (dono: <strong>{campaign.cs_name || campaign.cs_email}</strong>).
            O bônus dessas etapas vai pra você — o resto da campanha não é editável por você.
          </span>
        </div>
      )}

      {/* ── Abas por etapa ────────────────────────────────────────── */}
      <nav className="q4-tabs fade-up" role="tablist">
        {stages.map(st => {
          const c = breakdown.by_category[st];
          const earned = c.items.filter(i => i.earned).length;
          const pending = actions.some(a => a.stage === st);
          return (
            <button
              key={st}
              role="tab"
              aria-selected={activeStage === st}
              className={`q4-tab ${activeStage === st ? 'q4-tab--active' : ''}`}
              onClick={() => setActiveStage(st)}
            >
              <span className="q4-tab__label">
                {STAGE_SHORT[st]}
                {st === 'optimization' && breakdown.optimization_state?.state === 'live' && <span className="q4-livedot" title="Ao vivo" />}
                {pending && <span className="q4-tab__dot" title="Tem pendência" />}
              </span>
              <span className="q4-tab__meta mono">
                {c.invalidated ? 'anulado' : `${earned}/${c.items.length}`} · {(c.subtotal_pct * 100).toFixed(2)}%
              </span>
            </button>
          );
        })}
      </nav>

      {cat && (
        <StagePanel
          key={activeStage}
          catKey={activeStage}
          cat={cat}
          breakdown={breakdown}
          campaign={campaign}
          manualChecks={manualChecks}
          setManualChecks={setManualChecks}
          onCheck={toggleCheck}
          onEvidenceChange={setEvidence}
          isABS={effectiveIsAbs}
          isAdmin={isAdmin}
          onAdminOverride={handleAdminOverride}
          onSetupForce={handleSetupForce}
          teamList={teamList}
          studiesCatalog={studiesCatalog}
          onAssignStudy={handleAssignStudy}
          stageInfo={{
            assigneeEmail: (stageAssignees[activeStage] || '').toLowerCase(),
            assigneeName: nameForEmail(stageAssignees[activeStage]),
            assignedToOther: !!cat.assigned_to_other,
            locked: !!cat.assigned_to_other && !isAdmin,
            canAssign: canAssignStages,
            ownerEmail,
            ownerName: campaign.cs_name || campaign.cs_email,
          }}
          onAssignStage={handleAssignStage}
          token={token}
          opts={opts}
          reload={reloadKeepingEdits || load}
          viewerEmail={viewerEmail}
        />
      )}

      {/* ── Dados do checklist (recolhido) ────────────────────────── */}
      <Card className="q4-checklist fade-up">
        <button type="button" className="q4-checklist__toggle" onClick={() => setShowChecklist(v => !v)}>
          <span>
            <strong>Dados do checklist</strong>
            <span className="q4-muted"> · vindos do Force/Command, não editáveis</span>
          </span>
          {showChecklist ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
        {showChecklist && (
          <div className="ro-grid">
            {campaign.cp_name && <RoField label="Salesman" value={campaign.cp_name} />}
            {campaign.agency && <RoField label="Agência" value={campaign.agency} />}
            {campaign.industry && <RoField label="Setor" value={campaign.industry} />}
            {(breakdown.checklist_products || campaign.products)?.length > 0 && <RoTags label="Produtos" items={breakdown.checklist_products || campaign.products} variant="cyan" />}
            {campaign.formats?.length > 0 && <RoTags label="Formatos" items={campaign.formats} />}
            {(breakdown.checklist_features || campaign.features)?.length > 0 && <RoTags label={`Features (${(breakdown.checklist_features || campaign.features).length})`} items={breakdown.checklist_features || campaign.features} variant="cyan" />}
            {campaign.studies_used?.length > 0 && <RoTags label="Estudos usados" items={campaign.studies_used} />}
            {campaign.audiences && (
              <div className="ro-field ro-field--wide">
                <span className="label">Audiências contratadas</span>
                <span className="ro-text-block">{campaign.audiences}</span>
              </div>
            )}
          </div>
        )}
      </Card>

      {/* ── Decisões do admin ─────────────────────────────────────── */}
      {campaign.review_decision && (
        <div className={`cs-review-decision cs-review-decision--${campaign.review_decision}`}>
          <div className="cs-review-decision__header">
            {campaign.review_decision === 'approved' ? <CheckCircle2 size={18} /> : <X size={18} />}
            <strong>Análise {campaign.review_decision === 'approved' ? 'aprovada' : 'recusada'} pelo admin</strong>
          </div>
          <div className="cs-review-decision__comment">{campaign.review_decision_comment || '—'}</div>
          <div className="cs-review-decision__meta">
            {campaign.review_decision_by} · {fmt.date(campaign.review_decision_at)}
            {campaign.review_decision_seen_at && (
              <> · <CheckCircle2 size={11} /> Visto em {fmt.date(campaign.review_decision_seen_at)}</>
            )}
          </div>
        </div>
      )}
      {campaign.audit_mark && campaign.audit_mark.status === 'issue' && (
        <div className="cs-review-decision cs-review-decision--rejected">
          <div className="cs-review-decision__header">
            <AlertTriangle size={18} />
            <strong>Admin sinalizou um problema</strong>
          </div>
          {campaign.audit_mark.notes && <div className="cs-review-decision__comment">{campaign.audit_mark.notes}</div>}
          <div className="cs-review-decision__meta">{campaign.audit_mark.by} · {fmt.date(campaign.audit_mark.at)}</div>
        </div>
      )}

      {!onlyAssignedStages && (
        <Card className="cs-notes-block">
          <div className="cs-notes-block__header">
            <MessageSquare size={16} />
            <div>
              <div className="cs-notes-block__title">Observações / Pedido de análise</div>
              <div className="cs-notes-block__sub">Use este campo se algo precisa de atenção do admin. Apenas admins veem.</div>
            </div>
          </div>
          <textarea
            className="cs-notes-block__textarea"
            rows={3}
            placeholder="Ex: a peça Tap to Go foi vinculada no Report Hub hoje, favor recalcular."
            value={manualChecks.__review_notes || ''}
            onChange={(e) => setManualChecks(prev => ({ ...prev, __review_notes: e.target.value }))}
          />
          <label className="cs-notes-block__checkbox">
            <input
              type="checkbox"
              checked={!!manualChecks.__review_requested}
              onChange={(e) => setManualChecks(prev => ({ ...prev, __review_requested: e.target.checked }))}
            />
            <span>Solicitar análise do admin sobre esta campanha</span>
          </label>
          {manualChecks.__review_requested && !campaign.admin_overrides_by && (
            <div className="cs-notes-block__pending"><AlertTriangle size={12} /> Pendente revisão do admin</div>
          )}
          {campaign.admin_overrides_by && (
            <div className="cs-notes-block__reviewed">
              <CheckCircle2 size={12} /> Revisado por {campaign.admin_overrides_by}
              {campaign.admin_overrides_at && ` · ${fmt.date(campaign.admin_overrides_at)}`}
            </div>
          )}
        </Card>
      )}

      {/* ── Barra de salvar (fixa no rodapé) ──────────────────────── */}
      <div className="q4-savebar">
        <div className="q4-savebar__status">
          {error && <span className="q4-savebar__error"><AlertCircle size={14} /> {error}</span>}
          {!error && savedAt && (
            <span className="q4-savebar__ok">
              <CheckCircle2 size={14} />
              {savedAs === 'draft'
                ? `Rascunho salvo às ${savedAt.toLocaleTimeString('pt-BR')}`
                : `Revisão salva às ${savedAt.toLocaleTimeString('pt-BR')}`}
            </span>
          )}
          {!error && !savedAt && (
            <span className="q4-muted">Total: <strong className="mono">{fmt.brl(breakdown.total_brl)}</strong></span>
          )}
        </div>
        <div className="q4-savebar__buttons">
          {onlyAssignedStages ? (
            <Button variant="primary" icon={Save} onClick={() => handleSave(false)} loading={saving}>
              Salvar minhas etapas
            </Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => handleSave(false)} disabled={saving}>Salvar rascunho</Button>
              <Button variant="primary" icon={Save} onClick={() => handleSave(true)} loading={saving}>
                {campaign.reviewed ? 'Atualizar revisão' : 'Confirmar revisão'}
              </Button>
            </>
          )}
        </div>
      </div>

      {showReplicateModal && (
        <ReplicateModal
          token={token}
          opts={opts}
          campaign={campaign}
          onClose={() => setShowReplicateModal(false)}
          onSuccess={() => { setShowReplicateModal(false); load(); }}
        />
      )}
    </AppShell>
  );
}

// ─── Painel de uma etapa ─────────────────────────────────────────────

function StagePanel({
  catKey, cat, breakdown, campaign, manualChecks, setManualChecks, onCheck, onEvidenceChange,
  isABS, isAdmin, onAdminOverride, onSetupForce, teamList, studiesCatalog, onAssignStudy,
  stageInfo, onAssignStage, token, opts, reload, viewerEmail,
}) {
  const locked = !!stageInfo.locked;
  const assignedElsewhere = !!stageInfo.assignedToOther;
  const isVideoOnly = cat.items.some(i => i.id === 'opt_video');
  const evidenceMap = manualChecks.__evidence || {};
  const sharedEv = cat.shared_evidence;
  const sharedLink = sharedEv ? (evidenceMap[sharedEv.key] || '') : '';

  return (
    <Card className="q4-panel fade-up">
      <div className="q4-panel__head">
        <div>
          <h2 className="q4-panel__title">{cat.label}</h2>
          <div className="q4-panel__subtitle mono">
            {(cat.subtotal_pct * 100).toFixed(2)}% · {fmt.brl(cat.subtotal_brl)}
          </div>
        </div>
        {stageInfo.canAssign && onAssignStage && (
          <label className="q4-assign">
            <UserPlus size={14} />
            <span>Responsável</span>
            <select
              value={stageInfo.assigneeEmail || ''}
              onChange={(e) => onAssignStage(catKey, e.target.value || null)}
            >
              <option value="">Dono da campanha ({stageInfo.ownerName})</option>
              {(teamList || [])
                .filter(t => (t.email || '').toLowerCase() !== stageInfo.ownerEmail)
                .map(t => (
                  <option key={t.email} value={(t.email || '').toLowerCase()}>{t.name}</option>
                ))}
              {stageInfo.assigneeEmail
                && !(teamList || []).some(t => (t.email || '').toLowerCase() === stageInfo.assigneeEmail) && (
                <option value={stageInfo.assigneeEmail}>{stageInfo.assigneeEmail}</option>
              )}
            </select>
          </label>
        )}
      </div>

      {assignedElsewhere && (
        <div className="q4-note q4-note--info">
          <Info size={14} />
          <span>
            {cat.label} atribuída a <strong>{stageInfo.assigneeName || stageInfo.assigneeEmail}</strong>.
            {locked ? ' Apenas este CS pode preencher os items desta seção.' : ''} O bônus desta etapa vai pra ele(a)
            {catKey === 'extras' ? ' (Estudos continuam indo pro autor)' : ''}.
          </span>
        </div>
      )}
      {cat.setup_pending && (
        <div className="q4-note q4-note--info">
          <Info size={14} />
          <span>Setup em andamento: campanha ainda em curso (ou encerrada há menos de 1 dia). Under ainda não é considerado.</span>
        </div>
      )}
      {cat.invalidated && cat.invalidation_reason && (
        <div className="q4-note q4-note--bad">
          <AlertCircle size={14} />
          <span>
            {cat.invalidation_reason}
            {cat.setup_forced && cat.setup_force_meta && <> · forçado por {cat.setup_force_meta.by}</>}
          </span>
        </div>
      )}

      {catKey === 'setup' && isAdmin && onSetupForce && (
        <div className="q4-admin-strip">
          <Shield size={13} />
          <span>Admin · Setup:</span>
          <button className={`q4-chipbtn ${cat.setup_forced && !cat.invalidated ? 'q4-chipbtn--on' : ''}`}
            onClick={() => onSetupForce('valid', window.prompt('Motivo (opcional):') || '')}>Forçar válido</button>
          <button className={`q4-chipbtn ${cat.setup_forced && cat.invalidated ? 'q4-chipbtn--off' : ''}`}
            onClick={() => onSetupForce('invalid', window.prompt('Motivo (opcional):') || '')}>Forçar anulado</button>
          {cat.setup_forced && <button className="q4-chipbtn" onClick={() => onSetupForce('auto', '')}>Automático</button>}
        </div>
      )}

      {catKey === 'setup' && <MaxAttentionBox breakdown={breakdown} token={campaign.short_token} />}

      {catKey === 'optimization' && (
        <OptimizationBox
          state={breakdown.optimization_state}
          rc={breakdown.rc_metrics}
          source={breakdown.opt_metrics_source}
          metrics={breakdown.opt_metrics_used || campaign.metrics}
          isABS={isABS}
          isVideoOnly={isVideoOnly}
          locked={locked}
          onAbsChange={(v) => setManualChecks(prev => ({ ...prev, __is_abs: v }))}
        />
      )}

      {catKey === 'pre_campaign' && (
        <DeckPicker
          campaign={campaign}
          breakdown={breakdown}
          manualChecks={manualChecks}
          locked={locked}
          token={token}
          opts={opts}
          reload={reload}
          sharedLink={sharedLink}
          onEvidenceChange={onEvidenceChange}
          sharedKey={sharedEv?.key}
        />
      )}

      {catKey === 'account_mgmt' && (
        <PvMeetingBox
          campaign={campaign}
          meeting={manualChecks.__pv_meeting || breakdown.pv_meeting}
          item={cat.items.find(i => i.id === 'am_pv_meeting')}
          locked={locked}
          token={token}
          opts={opts}
          reload={reload}
          viewerEmail={viewerEmail}
        />
      )}

      {sharedEv && catKey !== 'pre_campaign' && (
        <div className={`q4-evidence ${!sharedLink.trim() && cat.items.some(i => isEffectivelyEarned(i, manualChecks)) ? 'q4-evidence--warn' : ''}`}>
          <div className="q4-evidence__label"><Link2 size={13} /> {sharedEv.label}</div>
          <div className="q4-evidence__row">
            <input
              type="url"
              placeholder="Cole o link do deck no Drive (pasta Audience Discovery)…"
              value={sharedLink}
              onChange={(e) => onEvidenceChange(sharedEv.key, e.target.value)}
              disabled={locked}
            />
            {sharedLink && <a href={sharedLink} target="_blank" rel="noreferrer">Abrir <ExternalLink size={11} /></a>}
          </div>
          {sharedEv.help && <div className="q4-muted q4-evidence__help">{sharedEv.help}</div>}
        </div>
      )}

      <div className="q4-items">
        {cat.items.map(item => (
          <ItemRowQ4
            key={item.id}
            item={item}
            catKey={catKey}
            optLive={breakdown.optimization_state?.state === 'live'}
            manualChecks={manualChecks}
            onCheck={onCheck}
            onEvidenceChange={onEvidenceChange}
            metrics={campaign.metrics}
            isABS={isABS}
            invalidated={cat.invalidated}
            isAdmin={isAdmin}
            onAdminOverride={onAdminOverride}
            teamList={teamList}
            studiesCatalog={studiesCatalog}
            currentStudyAssignee={campaign.study_assignee_email || null}
            currentStudyId={campaign.study_id_override || null}
            onAssignStudy={onAssignStudy}
            locked={locked && !STAGE_EXEMPT_ITEMS.has(item.id)}
            assignedElsewhere={assignedElsewhere && !STAGE_EXEMPT_ITEMS.has(item.id)}
          />
        ))}
      </div>

      {cat.notes && <div className="q4-muted q4-panel__notes"><Info size={12} /> {cat.notes}</div>}
    </Card>
  );
}

function MaxAttentionBox({ breakdown, token }) {
  const ma = breakdown.max_attention || [];
  const excluded = breakdown.excluded_features || [];
  if (ma.length === 0 && excluded.length === 0) return null;
  return (
    <div className="q4-ma">
      {ma.length > 0 && (
        <>
          <div className="q4-ma__head">
            <Sparkles size={14} />
            <strong>Max Attention</strong>
            <span className="q4-muted">cada formato com peça vinculada no Report Hub conta 1 feature do Tier 1</span>
          </div>
          <div className="q4-ma__list">
            {ma.map((m, idx) => {
              const p = MA_PROOF[m.proof] || MA_PROOF.not_linked;
              return (
                <div key={idx} className={`q4-ma__row q4-ma__row--${p.tone}`}>
                  {m.proven ? <CheckCircle2 size={14} /> : <CircleDashed size={14} />}
                  <span className="q4-ma__name">{m.name}</span>
                  <span className="q4-ma__proof">{p.label}</span>
                  {m.proof === 'not_linked' && (
                    <a href={REPORT_URL(token)} target="_blank" rel="noreferrer" className="q4-inline-link">
                      Vincular <ExternalLink size={11} />
                    </a>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
      {excluded.length > 0 && (
        <div className="q4-muted q4-ma__excluded">
          Não contam como feature: {excluded.join(', ')}
        </div>
      )}
    </div>
  );
}

const OPT_STATE = {
  not_started:   (d) => ({ tone: 'info', text: 'Campanha ainda não começou — a otimização é calculada com a entrega quando ela rodar.' }),
  awaiting_data: (d) => ({ tone: 'info', text: 'Campanha no ar, ainda sem entrega na base. Atualiza automaticamente todo dia.' }),
  live:          (d) => ({ tone: 'live', text: `Ao vivo: calculado com a entrega até hoje e atualizado todo dia. O resultado pode mudar e fecha em ${d ? fmt.date(d) : 'o dia seguinte ao fim'}.` }),
  final:         () => ({ tone: 'ok', text: 'Resultado final — a campanha já fechou.' }),
};

function OptimizationBox({ state, rc, source, metrics, isABS, isVideoOnly, locked, onAbsChange }) {
  const pctTxt = (v, d = 2) => (v === null || v === undefined ? '—' : `${Number(v).toFixed(d)}%`);
  const st = state && OPT_STATE[state.state] ? OPT_STATE[state.state](state.closes_on) : null;
  const tiles = [];
  if (metrics) {
    if (isVideoOnly) {
      const tc = Number(metrics.video_tech_cost_pct) || 0;
      const vtr = Number(metrics.video_vtr_pct) || 0;
      tiles.push({ label: 'Tech cost', value: `${tc.toFixed(2)}%`, limit: 'até 3%', ok: tc <= 3, rc: rc ? pctTxt(rc.tech_cost_pct) : null });
      tiles.push({ label: 'VTR', value: `${vtr.toFixed(1)}%`, limit: 'mín. 85%', ok: vtr >= 85, rc: rc ? pctTxt(rc.video_vtr_pct, 1) : null });
    } else {
      const over = Number(metrics.over_percent) || 0;
      const ecpm = Number(metrics.ecpm) || 0;
      const ctr = (Number(metrics.ctr) || 0) * 100;
      const ecpmLim = isABS ? 1.5 : 0.7;
      const ctrLim = isABS ? 0.5 : 0.7;
      tiles.push({ label: 'Over', value: `${over.toFixed(1)}%`, limit: 'até 25%', ok: over <= 25,
        rc: rc && rc.display_pacing !== null ? `pacing ${pctTxt(rc.display_pacing, 1)}` : null });
      tiles.push({ label: 'eCPM', value: fmt.brl(ecpm), limit: `até ${fmt.brl(ecpmLim)}`, ok: ecpm > 0 && ecpm <= ecpmLim,
        rc: rc && rc.display_ecpm !== null ? fmt.brl(rc.display_ecpm) : null });
      tiles.push({ label: 'CTR', value: `${ctr.toFixed(2)}%`, limit: `mín. ${ctrLim}%`, ok: ctr >= ctrLim,
        rc: rc ? pctTxt(rc.display_ctr_pct) : null });
    }
  }
  return (
    <div className="q4-opt">
      {st && (
        <div className={`q4-note q4-note--${st.tone === 'live' ? 'live' : 'info'}`}>
          {st.tone === 'live' ? <span className="q4-livedot" /> : <Info size={14} />}
          <span>{st.text}</span>
        </div>
      )}
      {!isVideoOnly && (
        <div className="q4-segment" role="group" aria-label="Campanha com ou sem ABS">
          <button type="button" className={isABS ? 'is-active' : ''} disabled={locked} onClick={() => onAbsChange(true)}>Com ABS</button>
          <button type="button" className={!isABS ? 'is-active' : ''} disabled={locked} onClick={() => onAbsChange(false)}>Sem ABS</button>
        </div>
      )}
      {isVideoOnly && <div className="q4-muted">Campanha exclusivamente de vídeo — avalia Tech cost e VTR.</div>}
      {source === 'rc' && <div className="q4-muted">Números do Report Center (mesma régua do painel). Over calculado pelo Compplan.</div>}
      {tiles.length > 0 ? (
        <div className="q4-opt__tiles">
          {tiles.map(t => (
            <div key={t.label} className={`q4-tile ${t.ok ? 'q4-tile--ok' : 'q4-tile--bad'}`}>
              <span className="q4-kpi__label">{t.label}</span>
              <span className="q4-tile__value mono">{t.value}</span>
              <span className="q4-tile__limit">{t.ok ? <CheckCircle2 size={12} /> : <X size={12} />} {t.limit}</span>
              {t.rc && source !== 'rc' && <span className="q4-tile__rc">Report Center: {t.rc}</span>}
            </div>
          ))}
        </div>
      ) : (!st && (
        <div className="q4-muted">Aguardando dados de performance — calcula automaticamente quando a campanha entregar.</div>
      ))}
    </div>
  );
}

// ─── Linha de item ───────────────────────────────────────────────────

function ItemRowQ4({
  item, catKey, optLive, manualChecks, onCheck, onEvidenceChange, metrics, isABS, invalidated, isAdmin,
  onAdminOverride, teamList, studiesCatalog, currentStudyAssignee, currentStudyId, onAssignStudy,
  locked, assignedElsewhere,
}) {
  const [showInfo, setShowInfo] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);

  const isManual = item.source === 'manual';
  const isSemiAuto = item.source === 'semi_auto';
  const editable = (isManual || isSemiAuto) && !locked;
  const checked = isEffectivelyEarned(item, manualChecks);
  const evidenceLink = (manualChecks.__evidence || {})[item.id] || '';
  // Só pede evidência do que está pagando (no pós-venda só o maior paga)
  const needsEvidence = item.needs_evidence && checked && (item.earned || item.assigned_to_other) && !invalidated;
  const missingEvidence = needsEvidence && !evidenceLink.trim();
  const src = sourceOf(item, catKey);
  const adminOv = item.admin_override;
  const hasInfo = !!(item.card?.what || item.card?.obs || item.help || item.tier_catalog);
  // Sem entrega ainda, o aviso do topo da Otimização já explica; não repete em cada item.
  const metricInfo = item.source === 'metrics' && metrics ? formatMetricInfo(item, metrics, isABS) : null;
  // Setup por tier: cada slot (1ª, 2ª, 3ª implementação) mostra a feature que ocupa aquela posição.
  const slotMatch = /^setup_tier\d_(\d)$/.exec(item.id);
  const slotFeature = slotMatch ? (item.detected_features || [])[Number(slotMatch[1]) - 1] || null : null;

  const VALIDATION = {
    confirmed: { label: 'Confirmado', tone: 'ok' },
    declared:  { label: 'Declarado', tone: 'info' },
    divergent: { label: 'Divergente', tone: 'bad' },
    admin:     { label: 'Admin', tone: 'info' },
  };
  let status = null;
  if (invalidated && item.was_earned) status = { label: 'Anulado', tone: 'bad' };
  else if (item.assigned_to_other) status = { label: 'Vai pro responsável', tone: 'info' };
  else if (missingEvidence) status = { label: 'Falta evidência', tone: 'warn' };
  else if (catKey === 'optimization' && item.earned && optLive) status = { label: 'Parcial · ao vivo', tone: 'warn' };
  else if (checked && item.validation && VALIDATION[item.validation]) status = VALIDATION[item.validation];
  else if (item.earned) status = { label: 'Conquistado', tone: 'ok' };

  return (
    <div className={`q4-item ${item.earned ? 'q4-item--earned' : ''} ${locked ? 'q4-item--locked' : ''}`}>
      <div className="q4-item__check">
        {editable ? (
          <input type="checkbox" checked={checked} onChange={() => onCheck(item.id)} disabled={invalidated} />
        ) : item.earned ? (
          <CheckCircle2 size={18} className="q4-item__icon--ok" />
        ) : (
          <span className="q4-item__icon--empty" />
        )}
      </div>

      <div className="q4-item__body">
        <div className="q4-item__line">
          <span className="q4-item__label">{item.label}</span>
          <span className={`q4-src q4-src--${src.tone}`}>{src.label}</span>
          {adminOv && <span className="q4-src q4-src--admin"><Shield size={10} /> Override admin</span>}
          {status && <span className={`q4-status q4-status--${status.tone}`}>{status.label}</span>}
          {hasInfo && (
            <button type="button" className="q4-iconbtn" onClick={() => setShowInfo(v => !v)} title="O que configura este item">
              <Info size={14} />
            </button>
          )}
          {isAdmin && onAdminOverride && (
            <button type="button" className={`q4-iconbtn ${adminOv ? 'q4-iconbtn--on' : ''}`} onClick={() => setShowAdmin(v => !v)} title="Ações do admin">
              <MoreHorizontal size={14} />
            </button>
          )}
        </div>

        {showInfo && (
          <div className="q4-card">
            {item.card?.what && <div><strong>O que configura:</strong> {item.card.what}</div>}
            {item.card?.obs && <div><strong>Obs.:</strong> {item.card.obs}</div>}
            {!item.card && item.help && <div>{item.help}</div>}
            {item.tier_catalog && (
              <div className="q4-card__tiers">
                {['tier1', 'tier2', 'tier3'].map(t => (
                  <div key={t}>
                    <strong>{t.replace('tier', 'Tier ')}:</strong>{' '}
                    {item.tier_catalog[t].map(f => <span key={f} className="q4-chip">{f}</span>)}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {metricInfo && <div className="q4-muted q4-item__metric">{metricInfo}</div>}
        {item.auto_evidence && (
          <div className="q4-item__metric">
            <a className="q4-inline-link" href={item.auto_evidence} target="_blank" rel="noreferrer">
              Link no Report Center <ExternalLink size={11} />
            </a>
          </div>
        )}
        {item.validation_reason && !item.earned && <div className="q4-muted q4-item__metric">{item.validation_reason}</div>}

        {slotFeature && (
          <div className="q4-item__features">
            <span className="q4-chip q4-chip--brand">{slotFeature}</span>
          </div>
        )}

        {item.studies_info?.length > 0 && (
          <div className="q4-item__studies">
            {item.studies_info.map((s, idx) => (
              <div key={idx} className="q4-muted">
                <BookOpen size={12} /> {s.name}
                {(s.author_name || s.author_email) && <> · <strong>{s.author_name || s.author_email}</strong></>}
                {s.link && <> · <a href={s.link} target="_blank" rel="noreferrer">abrir</a></>}
                {!s.found_in_catalog && <> · <Badge variant="yellow">Não catalogado</Badge></>}
              </div>
            ))}
          </div>
        )}
        {item.study_goes_to_other && item.studies_info?.length > 0 && (
          <div className="q4-muted"><Info size={12} /> Bônus deste estudo vai pro autor, não pra você</div>
        )}
        {assignedElsewhere && !locked && checked && (
          <div className="q4-muted"><Info size={12} /> Etapa atribuída a outro CS — bônus não vai pro dono</div>
        )}

        {isAdmin && item.id === 'ex_estudos' && (
          <div className="q4-admin-strip">
            <Shield size={12} />
            <select
              value={currentStudyId || ''}
              onChange={(e) => onAssignStudy?.({ study_id: e.target.value || null, cs_email: currentStudyAssignee })}
            >
              <option value="">— Estudo do catálogo —</option>
              {(studiesCatalog || []).map(s => (
                <option key={s.id} value={s.id}>{s.display_name} ({s.author_name || s.author_email})</option>
              ))}
            </select>
            <select
              value={currentStudyAssignee || ''}
              onChange={(e) => onAssignStudy?.({ study_id: currentStudyId, cs_email: e.target.value || null })}
            >
              <option value="">— CS que recebe (default: autor) —</option>
              {(teamList || []).map(t => <option key={t.email} value={t.email}>{t.name}</option>)}
            </select>
            {(currentStudyAssignee || currentStudyId) && (
              <button type="button" className="q4-chipbtn" onClick={() => onAssignStudy?.({ study_id: null, cs_email: null })}>Limpar</button>
            )}
          </div>
        )}

        {needsEvidence && (
          <div className={`q4-evidence q4-evidence--inline ${missingEvidence ? 'q4-evidence--warn' : ''}`}>
            <div className="q4-evidence__row">
              <Link2 size={12} />
              <input
                type="url"
                placeholder="Cole o link da evidência (Drive, Loom…)"
                value={evidenceLink}
                onChange={(e) => onEvidenceChange(item.id, e.target.value)}
                disabled={locked}
              />
              {evidenceLink && <a href={evidenceLink} target="_blank" rel="noreferrer">Abrir <ExternalLink size={11} /></a>}
            </div>
          </div>
        )}

        {showAdmin && isAdmin && onAdminOverride && (
          <div className="q4-admin-strip">
            <Shield size={12} />
            <span>{adminOv ? `Override por ${adminOv.by} · ${adminOv.reason || 'sem motivo'}` : 'Forçar resultado:'}</span>
            <button className={`q4-chipbtn ${adminOv?.earned === true ? 'q4-chipbtn--on' : ''}`}
              onClick={() => onAdminOverride(item.id, true, window.prompt('Motivo (opcional):') || '')}>Conquistado</button>
            <button className={`q4-chipbtn ${adminOv?.earned === false ? 'q4-chipbtn--off' : ''}`}
              onClick={() => onAdminOverride(item.id, false, window.prompt('Motivo (opcional):') || '')}>Não conquistado</button>
            {adminOv && <button className="q4-chipbtn" onClick={() => onAdminOverride(item.id, null)}>Automático</button>}
          </div>
        )}
      </div>

      <div className="q4-item__values">
        <span className={`mono q4-item__pct ${invalidated && item.was_earned ? 'is-strike' : ''}`}>{(item.pct * 100).toFixed(2)}%</span>
        {item.earned && <span className="mono q4-item__brl">{fmt.brl(item.value_brl)}</span>}
      </div>
    </div>
  );
}

// ─── Pré-campanha: deck do Audience Discovery ────────────────────────

function DeckPicker({ campaign, breakdown, manualChecks, locked, token, opts, reload, sharedLink, onEvidenceChange, sharedKey }) {
  const deck = manualChecks.__pre_deck || null;
  const info = breakdown.pre_deck || null;
  const [open, setOpen] = useState(!deck);
  const [q, setQ] = useState(campaign.client_name || '');
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [showLink, setShowLink] = useState(!!sharedLink && !deck);

  async function search(e) {
    e?.preventDefault();
    setBusy(true); setErr(null);
    try {
      const d = await endpoints.meDecks(token, q, opts);
      setItems(d.items || []);
    } catch (ex) { setErr(ex.message); setItems([]); }
    finally { setBusy(false); }
  }

  async function choose(deckId) {
    setBusy(true); setErr(null);
    try {
      await endpoints.meLinkDeck(token, deckId, opts);
      await reload();
      setOpen(false);
    } catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  }

  async function unlink() {
    if (!window.confirm('Remover o deck desta campanha?')) return;
    setBusy(true); setErr(null);
    try { await endpoints.meUnlinkDeck(token, opts); await reload(); setOpen(true); }
    catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  }

  const matched = new Set(info?.matched || []);

  return (
    <div className="q4-evidence q4-deck">
      <div className="q4-evidence__label"><FileText size={13} /> Deck da pré-campanha</div>

      {deck && (
        <div className="q4-deck__selected">
          <div className="q4-deck__title">
            <a href={deck.url} target="_blank" rel="noreferrer">{deck.title} <ExternalLink size={11} /></a>
            <span className="q4-muted">
              {deck.client}{deck.created_time && <> · criado em {fmt.date(deck.created_time)}</>}
            </span>
          </div>
          {info?.after_start && (
            <div className="q4-note q4-note--bad"><AlertTriangle size={13} /> Criado depois do início da campanha — as features da pré-campanha não contam.</div>
          )}
          <div className="q4-deck__features">
            <span className="q4-muted">Features no deck:</span>
            {(deck.offered_features || []).length === 0 && <span className="q4-muted">nenhuma encontrada{deck.text_indexed ? '' : ' (texto ainda não indexado pela Library)'}</span>}
            {(deck.offered_features || []).map(f => (
              <span key={f} className={`q4-chip ${matched.has(f) ? 'q4-chip--ok' : ''}`} title={matched.has(f) ? 'Ofertada e ativada' : 'Ofertada'}>{f}</span>
            ))}
          </div>
          {!locked && (
            <div className="q4-deck__actions">
              <button type="button" className="q4-chipbtn" onClick={() => setOpen(o => !o)}>Trocar deck</button>
              <button type="button" className="q4-chipbtn" onClick={unlink} disabled={busy}><Unlink size={11} /> Remover</button>
            </div>
          )}
        </div>
      )}

      {open && !locked && (
        <div className="q4-deck__search">
          <form className="q4-evidence__row" onSubmit={search}>
            <Search size={13} />
            <input type="text" value={q} onChange={e => setQ(e.target.value)} placeholder="Nome do cliente ou do deck" />
            <button type="submit" className="q4-chipbtn" disabled={busy}>{busy ? 'Buscando…' : 'Buscar'}</button>
          </form>
          {items && items.length === 0 && <div className="q4-muted">Nenhum deck encontrado na pasta Audience Discovery.</div>}
          {items && items.length > 0 && (
            <ul className="q4-deck__list">
              {items.map(d => (
                <li key={d.deck_id}>
                  <button type="button" onClick={() => choose(d.deck_id)} disabled={busy}>
                    <span className="q4-deck__item-title">{d.title}</span>
                    <span className="q4-muted">{d.client} · {d.modified_time ? `editado ${fmt.date(d.modified_time)}` : ''}{d.owner_name ? ` · ${d.owner_name}` : ''}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="q4-muted q4-evidence__help">
            Busca no índice da HYPR Library (pasta Audience Discovery, atualizado todo dia às 6h).{' '}
            <button type="button" className="q4-linkbtn" onClick={() => setShowLink(v => !v)}>Deck fora da pasta? Colar link</button>
          </div>
        </div>
      )}

      {showLink && !locked && sharedKey && (
        <div className="q4-evidence__row" style={{ marginTop: 8 }}>
          <Link2 size={12} />
          <input type="url" placeholder="Link do deck no Drive (conta como declarado)" value={sharedLink}
            onChange={(e) => onEvidenceChange(sharedKey, e.target.value)} />
          {sharedLink && <a href={sharedLink} target="_blank" rel="noreferrer">Abrir <ExternalLink size={11} /></a>}
        </div>
      )}
      {err && <div className="q4-note q4-note--bad"><AlertCircle size={13} /> {err}</div>}
    </div>
  );
}

// ─── Account: reunião de pós-venda pela agenda ───────────────────────

function addDays(dateStr, n) {
  const d = new Date(`${dateStr}T12:00:00`);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function PvMeetingBox({ campaign, meeting, item, locked, token, opts, reload, viewerEmail }) {
  const [events, setEvents] = useState(null);
  const [accessToken, setAccessToken] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const from = campaign.end_date ? addDays(campaign.end_date, -7) : null;
  const to = campaign.end_date ? addDays(campaign.end_date, 45) : null;

  async function openPicker() {
    setBusy(true); setErr(null);
    try {
      const tk = accessToken || await requestCalendarToken(viewerEmail);
      setAccessToken(tk);
      setEvents(await listCalendarEvents(tk, from, to));
    } catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  }

  async function choose(ev) {
    setBusy(true); setErr(null);
    try {
      await endpoints.meLinkPvMeeting(token, { access_token: accessToken, event_id: ev.id, calendar_id: 'primary' }, opts);
      setEvents(null);
      await reload();
    } catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  }

  async function unlink() {
    if (!window.confirm('Desvincular a reunião de pós-venda?')) return;
    setBusy(true); setErr(null);
    try { await endpoints.meUnlinkPvMeeting(token, opts); await reload(); }
    catch (ex) { setErr(ex.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="q4-evidence q4-pv">
      <div className="q4-evidence__label"><CalendarCheck size={13} /> Reunião de pós-venda</div>
      {meeting ? (
        <div className="q4-pv__linked">
          <div>
            <strong>{meeting.summary}</strong>{' '}
            <span className="q4-muted">
              · {meeting.start ? new Date(meeting.start).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: meeting.start.length > 10 ? 'short' : undefined }) : '—'}
              · {meeting.external_attendees} convidado(s) externo(s){meeting.external_domains?.length ? ` (${meeting.external_domains.join(', ')})` : ''}
            </span>
          </div>
          {item && !item.earned && item.validation_reason && <div className="q4-note q4-note--bad"><AlertTriangle size={13} /> {item.validation_reason}</div>}
          <div className="q4-deck__actions">
            {meeting.html_link && <a className="q4-inline-link" href={meeting.html_link} target="_blank" rel="noreferrer">Abrir na agenda <ExternalLink size={11} /></a>}
            {!locked && <button type="button" className="q4-chipbtn" onClick={unlink} disabled={busy}><Unlink size={11} /> Desvincular</button>}
          </div>
        </div>
      ) : (
        <div className="q4-muted">
          Só conta com o evento da sua agenda vinculado (entre {from ? fmt.date(from) : '—'} e {to ? fmt.date(to) : '—'}, com alguém de fora da HYPR).
        </div>
      )}
      {!locked && !meeting && (
        <div style={{ marginTop: 8 }}>
          <button type="button" className="q4-chipbtn q4-chipbtn--primary" onClick={openPicker} disabled={busy || !from}>
            {busy ? 'Abrindo agenda…' : 'Vincular reunião da agenda'}
          </button>
        </div>
      )}
      {err && <div className="q4-note q4-note--bad"><AlertCircle size={13} /> {err}</div>}

      {events && (
        <Modal open={true} title="Qual evento foi o pós-venda?" onClose={() => setEvents(null)}>
          <div className="q4-pv__events">
            {events.length === 0 && <div className="q4-muted">Nenhum evento na sua agenda entre {fmt.date(from)} e {fmt.date(to)}.</div>}
            {[...events].sort((a, b) => b.external - a.external).map(ev => (
              <button key={ev.id} type="button" className="q4-pv__event" onClick={() => choose(ev)} disabled={busy || ev.external === 0}>
                <span className="q4-pv__event-title">{ev.summary}</span>
                <span className="q4-muted">
                  {ev.start ? new Date(ev.start).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: ev.start.length > 10 ? 'short' : undefined }) : ''}
                  {' · '}{ev.external > 0 ? `${ev.external} externo(s): ${ev.domains.join(', ')}` : 'sem convidado externo'}
                </span>
              </button>
            ))}
          </div>
        </Modal>
      )}
    </div>
  );
}
