import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle2, AlertCircle, Save, Info,
  ChevronDown, ChevronRight, Sparkles, Zap, Eye, Link2, AlertTriangle,
  MessageSquare, Shield, Copy, BookOpen, X, Download, FileSpreadsheet, UserPlus,
} from 'lucide-react';
import AppShell from '../../components/layout/AppShell.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import { fmt } from '../../lib/format.js';
import { endpoints, auth } from '../../lib/api.js';
import {
  CATEGORY_ORDER, STAGE_EXEMPT_ITEMS, RoField, RoTags,
  isEffectivelyEarned, formatMetricInfo, recomputeLocally, ReplicateModal,
} from './campaignShared.jsx';
import CampaignDetailQ4 from './CampaignDetailQ4.jsx';
import './CampaignDetail.css';

export default function CsCampaignDetail() {
  const { token, csEmail: impersonateEmail } = useParams();
  const navigate = useNavigate();
  const user = auth.getUser();
  const isAdmin = user?.role === 'admin';
  const [campaign, setCampaign] = useState(null);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);
  const [savedAs, setSavedAs] = useState(null);  // 'draft' | 'reviewed'
  const [manualChecks, setManualChecks] = useState({});
  const [expandedCategories, setExpandedCategories] = useState(new Set(CATEGORY_ORDER));
  const [showReplicateModal, setShowReplicateModal] = useState(false);
  const [teamList, setTeamList] = useState([]);
  const [studiesCatalog, setStudiesCatalog] = useState([]);

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

  /**
   * Recarrega a campanha sem perder o que o CS marcou e ainda não salvou —
   * só atualiza o que veio do servidor (deck da pré-campanha, reunião de
   * pós-venda e o link do deck). Usado pelas integrações da tela 2026-Q4.
   */
  async function reloadKeepingEdits() {
    const c = await endpoints.meCampaign(token, opts);
    setCampaign(c);
    const srv = c.manual_checks || {};
    setManualChecks(prev => {
      const next = { ...prev };
      for (const k of ['__pre_deck', '__pv_meeting', 'am_pv_meeting']) {
        if (k in srv) next[k] = srv[k]; else delete next[k];
      }
      const ev = { ...(prev.__evidence || {}) };
      if (srv.__evidence?.pre_campaign) ev.pre_campaign = srv.__evidence.pre_campaign;
      next.__evidence = ev;
      return next;
    });
  }

  // Carrega lista do time (pra mostrar nome de pre_assignee + admin atribuir estudo)
  useEffect(() => {
    endpoints.adminTeam()
      .then(d => setTeamList(d.items || []))
      .catch(() => setTeamList([]));
    if (isAdmin) {
      endpoints.meStudiesCatalog()
        .then(d => setStudiesCatalog(d.items || []))
        .catch(() => setStudiesCatalog([]));
    }
  }, [isAdmin]);

  async function handleAssignStudy({ study_id, cs_email }) {
    try {
      await endpoints.assignStudy(token, cs_email, study_id, opts);
      await load();
    } catch (e) {
      alert(`Erro ao atribuir estudo: ${e.message}`);
    }
  }

  /** Define o CS responsável por uma etapa (null = volta pro dono). */
  async function handleAssignStage(stage, csEmail) {
    try {
      setError(null);
      await endpoints.meAssignStage(token, stage, csEmail || null, opts);
      await load();
    } catch (e) {
      setError(`Erro ao atribuir etapa: ${e.message}`);
    }
  }

  useEffect(() => { load(); }, [token, impersonateEmail]);

  function toggleCheck(itemId) {
    setManualChecks(prev => ({
      ...prev,
      [itemId]: !prev[itemId],
    }));
  }

  function setEvidence(itemId, value) {
    setManualChecks(prev => {
      const evidence = { ...(prev.__evidence || {}) };
      if (!value || value.trim() === '') {
        delete evidence[itemId];
      } else {
        evidence[itemId] = value.trim();
      }
      return { ...prev, __evidence: evidence };
    });
  }

  /** Admin force earned/clear de um item. earned = true | false | null (clear) */
  async function handleAdminOverride(itemId, earned, reason) {
    try {
      await endpoints.adminOverrideItem(token, { item_id: itemId, earned, reason });
      await load(); // recarrega tudo
    } catch (e) {
      setError(`Erro ao forçar override: ${e.message}`);
    }
  }

  /** Admin force setup auto | valid | invalid */
  async function handleSetupForce(forceMode, reason) {
    try {
      await endpoints.adminOverrideItem(token, { force_setup: forceMode, reason });
      await load();
    } catch (e) {
      setError(`Erro ao forçar setup: ${e.message}`);
    }
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
      setSavedAs(markReviewed ? 'reviewed' : 'draft');
      // reviewed = null quando quem salvou é só responsável por etapa (não mexe na revisão)
      setCampaign(prev => prev ? { ...prev, breakdown: result.breakdown, reviewed: result.reviewed ?? prev.reviewed } : prev);
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
  // 2026-Q4 com métricas do Report Center ligadas: a otimização usa os números do RC
  const breakdown = recomputeLocally(campaign.breakdown, manualChecks, campaign.breakdown?.opt_metrics_used || campaign.metrics, effectiveIsAbs);

  // Responsáveis por etapa (ausente = dono)
  const viewerEmail = (user?.email || '').toLowerCase();
  const ownerEmail = (campaign.cs_email || '').toLowerCase();
  // Na impersonação o admin "é" o CS impersonado pro cálculo; na UI segue admin.
  const isOwner = viewerEmail === ownerEmail;
  const stageAssignees = campaign.stage_assignees || {};
  const viewerAssignedStages = campaign.viewer_assigned_stages || [];
  // Só responsável por etapa(s): vê e edita apenas essas etapas
  const onlyAssignedStages = !isAdmin && !isOwner && viewerAssignedStages.length > 0;
  const canAssignStages = isAdmin || isOwner;
  const nameForEmail = (email) => {
    const e = (email || '').toLowerCase();
    if (!e) return null;
    const member = (teamList || []).find(t => (t.email || '').toLowerCase() === e);
    return member?.name || email;
  };

  // Campanhas da versão 2026-Q4 (início a partir de 01/10/2026) usam a tela
  // nova; Q3 e anteriores seguem nesta tela, com as etapas da versão 2026.
  if (breakdown?.version === '2026-Q4') {
    return (
      <CampaignDetailQ4
        campaign={campaign}
        breakdown={breakdown}
        manualChecks={manualChecks}
        setManualChecks={setManualChecks}
        toggleCheck={toggleCheck}
        setEvidence={setEvidence}
        handleAdminOverride={handleAdminOverride}
        handleSetupForce={handleSetupForce}
        handleAssignStage={handleAssignStage}
        handleAssignStudy={handleAssignStudy}
        handleSave={handleSave}
        saving={saving}
        savedAt={savedAt}
        savedAs={savedAs}
        error={error}
        isAdmin={isAdmin}
        onlyAssignedStages={onlyAssignedStages}
        viewerAssignedStages={viewerAssignedStages}
        stageAssignees={stageAssignees}
        canAssignStages={canAssignStages}
        nameForEmail={nameForEmail}
        teamList={teamList}
        studiesCatalog={studiesCatalog}
        effectiveIsAbs={effectiveIsAbs}
        impersonateEmail={impersonateEmail}
        backUrl={backUrl}
        token={token}
        opts={opts}
        load={load}
        navigate={navigate}
        ownerEmail={ownerEmail}
        reloadKeepingEdits={reloadKeepingEdits}
        viewerEmail={viewerEmail}
      />
    );
  }

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
            {CATEGORY_ORDER.filter(st => stageAssignees[st]).map(st => (
              <Badge key={st} variant={viewerAssignedStages.includes(st) ? 'cyan' : 'yellow'}>
                {breakdown.by_category[st]?.label || st}: {nameForEmail(stageAssignees[st])}
              </Badge>
            ))}
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
        {isAdmin && (
          <>
            <Button
              variant="ghost"
              icon={FileSpreadsheet}
              onClick={() => endpoints.adminExportCampaign(campaign.short_token, 'xlsx').catch(e => alert(`Falha no export: ${e.message}`))}
              title="Exporta esta campanha pra Excel (2 abas)"
            >
              Excel
            </Button>
            <Button
              variant="ghost"
              icon={Download}
              onClick={() => endpoints.adminExportCampaign(campaign.short_token, 'csv').catch(e => alert(`Falha no export: ${e.message}`))}
              title="Exporta esta campanha pra CSV (zipado)"
            >
              CSV
            </Button>
          </>
        )}
        <Button
          variant="ghost"
          icon={Copy}
          onClick={() => setShowReplicateModal(true)}
        >
          Replicar checkup
        </Button>
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

      {/* Quando o viewer é APENAS responsável por etapa(s) (não é dono nem admin),
          mostra só os blocos dessas etapas. */}
      {onlyAssignedStages && (
        <div className="cs-only-pre-banner">
          <Info size={14} />
          <span>
            Você é responsável por{' '}
            <strong>{viewerAssignedStages.map(st => breakdown.by_category[st]?.label || st).join(', ')}</strong>{' '}
            nesta campanha (dono: <strong>{campaign.cs_name || campaign.cs_email}</strong>).
            O bônus dessas etapas vai pra você — o resto da campanha não é editável por você.
          </span>
        </div>
      )}
      {(onlyAssignedStages ? CATEGORY_ORDER.filter(st => viewerAssignedStages.includes(st)) : CATEGORY_ORDER).map(catKey => {
        const cat = breakdown.by_category[catKey];
        if (!cat) return null;
        const assigneeEmail = (stageAssignees[catKey] || '').toLowerCase();
        const stageInfo = {
          assigneeEmail,
          assigneeName: nameForEmail(assigneeEmail),
          // Etapa com outro responsável (do ponto de vista do CS em foco)
          assignedToOther: !!cat.assigned_to_other,
          // Admin continua podendo editar tudo
          locked: !!cat.assigned_to_other && !isAdmin,
          canAssign: canAssignStages,
          ownerEmail,
          ownerName: campaign.cs_name || campaign.cs_email,
        };
        return (
          <CategoryBlock
            key={catKey}
            catKey={catKey}
            cat={cat}
            expanded={expandedCategories.has(catKey)}
            onToggleExpand={() => toggleCategory(catKey)}
            manualChecks={manualChecks}
            onCheck={toggleCheck}
            onEvidenceChange={setEvidence}
            metrics={campaign.metrics}
            isABS={effectiveIsAbs}
            onAbsChange={(newAbs) => setManualChecks(prev => ({ ...prev, __is_abs: newAbs }))}
            isVideoOnly={(() => {
              // Detecta campanha exclusivamente de vídeo (sem display, sem OOH).
              // Em campanhas só de vídeo, o toggle Com ABS / Sem ABS NÃO aparece
              // — porque o item de otimização é opt_video (Tech Cost / VTR), não display.
              const fmts = Array.isArray(campaign.formats) ? campaign.formats : [];
              const hasVideo = fmts.some(f => /video/i.test(f));
              const hasDisplay = fmts.some(f => /display/i.test(f));
              const hasOoh = fmts.some(f => /ooh/i.test(f));
              return hasVideo && !hasDisplay && !hasOoh;
            })()}
            isAdmin={isAdmin}
            onAdminOverride={handleAdminOverride}
            onSetupForce={handleSetupForce}
            teamList={teamList}
            studiesCatalog={studiesCatalog}
            currentStudyAssignee={campaign.study_assignee_email || null}
            currentStudyId={campaign.study_id_override || null}
            onAssignStudy={handleAssignStudy}
            stageInfo={stageInfo}
            onAssignStage={handleAssignStage}
          />
        );
      })}

      {error && (
        <div className="form-error">
          <AlertCircle size={14} /> {error}
        </div>
      )}

      {savedAt && (
        <div className={`form-success ${savedAs === 'draft' ? 'form-success--draft' : ''}`}>
          <CheckCircle2 size={14} />
          {savedAs === 'draft'
            ? `Rascunho salvo às ${savedAt.toLocaleTimeString('pt-BR')}`
            : `Revisão salva às ${savedAt.toLocaleTimeString('pt-BR')}`}
        </div>
      )}

      {/* Caixa de decisão do admin sobre o pedido de análise.
          Aparece quando admin aprovou/recusou. Cor varia por decisão. */}
      {campaign.review_decision && (
        <div className={`cs-review-decision cs-review-decision--${campaign.review_decision}`}>
          <div className="cs-review-decision__header">
            {campaign.review_decision === 'approved'
              ? <CheckCircle2 size={18} />
              : <X size={18} />}
            <strong>
              Análise {campaign.review_decision === 'approved' ? 'aprovada' : 'recusada'} pelo admin
            </strong>
          </div>
          <div className="cs-review-decision__comment">
            {campaign.review_decision_comment || '—'}
          </div>
          <div className="cs-review-decision__meta">
            {campaign.review_decision_by} · {fmt.date(campaign.review_decision_at)}
            {campaign.review_decision_seen_at && (
              <> · <CheckCircle2 size={11} /> Visto em {fmt.date(campaign.review_decision_seen_at)}</>
            )}
          </div>
        </div>
      )}

      {/* Caixa de problema sinalizado pelo admin via Auditoria.
          Aparece se admin marcou status=issue na campanha. */}
      {campaign.audit_mark && campaign.audit_mark.status === 'issue' && (
        <div className="cs-review-decision cs-review-decision--rejected">
          <div className="cs-review-decision__header">
            <AlertTriangle size={18} />
            <strong>Admin sinalizou um problema</strong>
          </div>
          {campaign.audit_mark.notes && (
            <div className="cs-review-decision__comment">
              {campaign.audit_mark.notes}
            </div>
          )}
          <div className="cs-review-decision__meta">
            {campaign.audit_mark.by} · {fmt.date(campaign.audit_mark.at)}
          </div>
        </div>
      )}

      {/* Bloco de observação CS - pedido de análise (só dono/admin) */}
      {!onlyAssignedStages && (
      <Card className="cs-notes-block">
        <div className="cs-notes-block__header">
          <MessageSquare size={16} />
          <div>
            <div className="cs-notes-block__title">Observações / Pedido de análise</div>
            <div className="cs-notes-block__sub">
              Use este campo se algo precisa de atenção do admin. Apenas admins veem.
            </div>
          </div>
        </div>
        <textarea
          className="cs-notes-block__textarea"
          rows={3}
          placeholder="Ex: campanha entregou as impressões pactuadas mas a base não reflete. Solicito revisão para considerar setup válido."
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
          <div className="cs-notes-block__pending">
            <AlertTriangle size={12} /> Pendente revisão do admin
          </div>
        )}
        {campaign.admin_overrides_by && (
          <div className="cs-notes-block__reviewed">
            <CheckCircle2 size={12} /> Revisado por {campaign.admin_overrides_by}
            {campaign.admin_overrides_at && ` · ${fmt.date(campaign.admin_overrides_at)}`}
          </div>
        )}
      </Card>
      )}

      <div className="form-actions">
        {onlyAssignedStages ? (
          <Button variant="primary" icon={Save} onClick={() => handleSave(false)} loading={saving}>
            Salvar minhas etapas
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={() => handleSave(false)} disabled={saving}>
              Salvar rascunho
            </Button>
            <Button variant="primary" icon={Save} onClick={() => handleSave(true)} loading={saving}>
              {campaign.reviewed ? 'Atualizar revisão' : 'Confirmar revisão'}
            </Button>
          </>
        )}
      </div>

      {showReplicateModal && (
        <ReplicateModal
          token={token}
          opts={opts}
          campaign={campaign}
          onClose={() => setShowReplicateModal(false)}
          onSuccess={() => {
            setShowReplicateModal(false);
            load();
          }}
        />
      )}
    </AppShell>
  );
}

function CategoryBlock({ catKey, cat, expanded, onToggleExpand, manualChecks, onCheck, onEvidenceChange, metrics, isABS, onAbsChange, isVideoOnly, isAdmin, onAdminOverride, onSetupForce, teamList, studiesCatalog, currentStudyAssignee, currentStudyId, onAssignStudy, stageInfo, onAssignStage }) {
  const earnedCount = cat.items.filter(i => isEffectivelyEarned(i, manualChecks)).length;
  const isOptimization = catKey === 'optimization';

  // Etapa atribuída a outro CS (do ponto de vista de quem está olhando):
  // o bônus vai pro responsável. Trava edição, exceto pro admin.
  const assignedElsewhere = !!stageInfo?.assignedToOther;
  const locked = !!stageInfo?.locked;

  // Shared evidence: link único da categoria. Aparece quando há item marcado.
  const evidenceMap = manualChecks.__evidence || {};
  const sharedEv = cat.shared_evidence;
  const sharedKey = sharedEv?.key || null;
  const sharedLink = sharedKey ? (evidenceMap[sharedKey] || '') : '';
  const hasAnyEarned = earnedCount > 0;
  const showSharedEvidence = !!sharedEv && hasAnyEarned && !cat.invalidated;
  const sharedMissing = showSharedEvidence && !sharedLink.trim();

  return (
    <Card className={`category-block fade-up ${assignedElsewhere ? 'category-block--locked' : ''}`} style={{ marginBottom: 'var(--space-3)' }}>
      <button className="category-block__header" onClick={onToggleExpand}>
        <div className="category-block__title">
          {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          <span>{cat.label}</span>
          <Badge variant={cat.invalidated ? 'red' : 'neutral'}>
            {cat.invalidated
              ? `0/${cat.items.length} (anulado)`
              : cat.setup_pending
                ? `${earnedCount}/${cat.items.length} (em andamento)`
                : assignedElsewhere
                  ? 'atribuído'
                  : `${earnedCount}/${cat.items.length}`}
          </Badge>
        </div>
        <div className="category-block__total">
          <span className="mono">{(cat.subtotal_pct * 100).toFixed(2)}%</span>
          <span className="mono category-block__brl">{fmt.brl(cat.subtotal_brl)}</span>
        </div>
      </button>

      {expanded && (
        <div className="category-block__items">
          {stageInfo?.canAssign && onAssignStage && (
            <div className="category-block__stage-assign">
              <UserPlus size={14} />
              <label htmlFor={`stage-assign-${catKey}`}>Responsável por esta etapa:</label>
              <select
                id={`stage-assign-${catKey}`}
                value={stageInfo.assigneeEmail || ''}
                onChange={(e) => onAssignStage(catKey, e.target.value || null)}
              >
                <option value="">Dono da campanha ({stageInfo.ownerName})</option>
                {(teamList || [])
                  .filter(t => (t.email || '').toLowerCase() !== stageInfo.ownerEmail)
                  .map(t => (
                    <option key={t.email} value={(t.email || '').toLowerCase()}>
                      {t.name} ({t.email})
                    </option>
                  ))}
                {/* Responsável atual fora da lista do time (ex.: inativo) */}
                {stageInfo.assigneeEmail
                  && !(teamList || []).some(t => (t.email || '').toLowerCase() === stageInfo.assigneeEmail) && (
                  <option value={stageInfo.assigneeEmail}>{stageInfo.assigneeEmail}</option>
                )}
              </select>
            </div>
          )}
          {assignedElsewhere && (
            <div className="category-block__pre-assigned-banner">
              <Info size={14} />
              <span>
                {cat.label} atribuída a{' '}
                <strong>{stageInfo.assigneeName || stageInfo.assigneeEmail}</strong>.
                {locked ? ' Apenas este CS pode preencher os items desta seção.' : ''}
                {' '}O bônus desta etapa vai pra ele(a), não pro dono da campanha
                {catKey === 'extras' ? ' (Estudos continuam indo pro autor)' : ''}.
              </span>
            </div>
          )}
          {cat.setup_pending && (
            <div className="category-block__pending">
              <Info size={16} />
              <span>
                Setup em andamento: campanha ainda em curso (ou encerrada há menos de 1 dia).
                Under da entrega ainda não é considerado — o setup conta normalmente.
              </span>
            </div>
          )}
          {cat.invalidated && cat.invalidation_reason && (
            <div className="category-block__invalidation">
              <AlertCircle size={16} />
              <span>{cat.invalidation_reason}</span>
              {cat.setup_forced && cat.setup_force_meta && (
                <span className="category-block__setup-by">
                  · forçado por {cat.setup_force_meta.by}
                </span>
              )}
            </div>
          )}
          {catKey === 'setup' && isAdmin && onSetupForce && (
            <div className="category-block__setup-admin">
              <Shield size={14} />
              <span className="category-block__setup-admin-label">
                Override admin do Setup:
              </span>
              <div className="item-row__admin-actions">
                <button
                  className={`item-row__admin-btn ${cat.setup_forced && !cat.invalidated ? 'item-row__admin-btn--active-on' : ''}`}
                  onClick={() => {
                    const reason = window.prompt('Motivo (opcional):') || '';
                    onSetupForce('valid', reason);
                  }}
                >
                  ✓ Forçar válido
                </button>
                <button
                  className={`item-row__admin-btn ${cat.setup_forced && cat.invalidated ? 'item-row__admin-btn--active-off' : ''}`}
                  onClick={() => {
                    const reason = window.prompt('Motivo (opcional):') || '';
                    onSetupForce('invalid', reason);
                  }}
                >
                  ✗ Forçar anulado
                </button>
                {cat.setup_forced && (
                  <button
                    className="item-row__admin-btn"
                    onClick={() => onSetupForce('auto', '')}
                  >
                    Auto
                  </button>
                )}
              </div>
            </div>
          )}
          {isOptimization && onAbsChange && !isVideoOnly && !locked && (
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
          {isOptimization && isVideoOnly && (
            <div className="abs-toggle">
              <div className="abs-toggle__label">
                <span>Campanha exclusivamente de vídeo</span>
              </div>
              <div className="abs-toggle__hint">
                Limites: Tech Cost ≤ 3% · VTR ≥ 85%
              </div>
            </div>
          )}
          {showSharedEvidence && (
            <div className={`category-block__shared-evidence ${sharedMissing ? 'category-block__shared-evidence--warn' : ''}`}>
              <div className="shared-evidence__header">
                <Link2 size={14} />
                <span className="shared-evidence__label">{sharedEv.label}</span>
                {sharedMissing && (
                  <span className="item-row__badge item-row__badge--warn">
                    <AlertTriangle size={10} /> Recomendado
                  </span>
                )}
                {!sharedMissing && (
                  <span className="item-row__badge item-row__badge--ok">
                    <Link2 size={10} /> Com link
                  </span>
                )}
              </div>
              <div className="shared-evidence__input-row">
                <input
                  type="url"
                  className="item-row__evidence-input"
                  placeholder="Cole o link da evidência (Drive, Loom, doc)…"
                  value={sharedLink}
                  onChange={(e) => onEvidenceChange(sharedKey, e.target.value)}
                  disabled={locked}
                />
                {sharedLink && (
                  <a
                    href={sharedLink}
                    target="_blank"
                    rel="noreferrer"
                    className="item-row__evidence-open"
                  >
                    Abrir ↗
                  </a>
                )}
              </div>
              {sharedEv.help && (
                <div className="shared-evidence__help">{sharedEv.help}</div>
              )}
            </div>
          )}
          {cat.items.map(item => (
            <ItemRow
              key={item.id}
              item={item}
              manualChecks={manualChecks}
              onCheck={onCheck}
              onEvidenceChange={onEvidenceChange}
              metrics={metrics}
              isABS={isABS}
              invalidated={cat.invalidated}
              isAdmin={isAdmin}
              onAdminOverride={onAdminOverride}
              teamList={teamList}
              studiesCatalog={studiesCatalog}
              currentStudyAssignee={currentStudyAssignee}
              currentStudyId={currentStudyId}
              onAssignStudy={onAssignStudy}
              locked={locked && !STAGE_EXEMPT_ITEMS.has(item.id)}
              assignedElsewhere={assignedElsewhere && !STAGE_EXEMPT_ITEMS.has(item.id)}
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

function ItemRow({ item, manualChecks, onCheck, onEvidenceChange, metrics, isABS, invalidated, isAdmin, onAdminOverride, teamList, studiesCatalog, currentStudyAssignee, currentStudyId, onAssignStudy, locked, assignedElsewhere }) {
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
    isChecked = Object.prototype.hasOwnProperty.call(manualChecks, item.id)
      ? !!manualChecks[item.id]
      : item.was_earned || item.earned;
  } else {
    isChecked = item.earned;
  }

  const editable = isManual || isSemiAuto;
  const metricInfo = isMetric ? formatMetricInfo(item, metrics, isABS) : null;

  // Evidência: link salvo, e flag se precisa
  const evidenceMap = (manualChecks.__evidence || {});
  const evidenceLink = evidenceMap[item.id] || '';
  const needsEvidence = item.needs_evidence && isChecked && !invalidated;
  const hasEvidence = !!evidenceLink.trim();
  const showEvidenceWarn = needsEvidence && !hasEvidence;

  // Admin override status
  const adminOv = item.admin_override;
  const isAdminForced = !!adminOv;

  return (
    <div className={`item-row ${item.earned ? 'item-row--earned' : ''} ${invalidated && item.was_earned ? 'item-row--invalidated' : ''} ${isAdminForced ? 'item-row--admin-forced' : ''} ${locked ? 'item-row--locked' : ''}`}>
      <div className="item-row__check">
        {editable && !locked ? (
          <input
            type="checkbox"
            checked={isChecked}
            onChange={() => onCheck(item.id)}
            className="item-row__checkbox"
            disabled={invalidated || locked}
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
          {isAdminForced && (
            <span className="item-row__badge item-row__badge--admin">
              <Shield size={10} /> Override admin
            </span>
          )}
          {showEvidenceWarn && (
            <span className="item-row__badge item-row__badge--warn">
              <AlertTriangle size={10} /> Sem evidência
            </span>
          )}
          {hasEvidence && needsEvidence && (
            <span className="item-row__badge item-row__badge--ok">
              <Link2 size={10} /> Com link
            </span>
          )}
        </div>
        {item.help && <div className="item-row__help">{item.help}</div>}
        {metricInfo && <div className="item-row__help item-row__help--metric">{metricInfo}</div>}

        {item.studies_info && item.studies_info.length > 0 && (
          <div className="item-row__studies">
            {item.studies_info.map((s, idx) => (
              <div key={idx} className="item-row__study">
                <BookOpen size={12} />
                <span className="item-row__study-name">{s.name}</span>
                {(s.author_name || s.author_email) && (
                  <span className="item-row__study-author">
                    · <strong>{s.author_name || s.author_email}</strong>
                  </span>
                )}
                {s.assignee_overridden && (
                  <Badge variant="cyan">Atribuído por admin</Badge>
                )}
                {s.link && (
                  <a href={s.link} target="_blank" rel="noreferrer" className="item-row__study-link">
                    ↗
                  </a>
                )}
                {!s.found_in_catalog && (
                  <Badge variant="yellow">Não catalogado</Badge>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Admin: dropdowns pra atribuir estudo + CS (sempre visível no ex_estudos) */}
        {isAdmin && item.id === 'ex_estudos' && (
          <div className="item-row__study-assign">
            <label>
              <Shield size={11} /> Atribuição manual (admin):
            </label>
            <div className="item-row__study-assign-row">
              <select
                value={currentStudyId || ''}
                onChange={(e) => onAssignStudy?.({ study_id: e.target.value || null, cs_email: currentStudyAssignee })}
                title="Estudo do catálogo"
              >
                <option value="">— Estudo do catálogo —</option>
                {(studiesCatalog || []).map(s => (
                  <option key={s.id} value={s.id}>
                    {s.display_name} ({s.author_name || s.author_email})
                  </option>
                ))}
              </select>
              <select
                value={currentStudyAssignee || ''}
                onChange={(e) => onAssignStudy?.({ study_id: currentStudyId, cs_email: e.target.value || null })}
                title="CS que recebe o bônus"
              >
                <option value="">— CS que recebe (default: autor) —</option>
                {(teamList || []).map(t => (
                  <option key={t.email} value={t.email}>
                    {t.name} ({t.email})
                  </option>
                ))}
              </select>
              {(currentStudyAssignee || currentStudyId) && (
                <button
                  type="button"
                  className="item-row__study-clear"
                  onClick={() => onAssignStudy?.({ study_id: null, cs_email: null })}
                  title="Limpar atribuição manual"
                >
                  <X size={11} />
                </button>
              )}
            </div>
          </div>
        )}

        {item.detected_features && item.detected_features.length > 0 && (
          <div className="item-row__detected-features">
            <Sparkles size={12} />
            <span>
              <strong>Detectadas:</strong>{' '}
              {item.detected_features.map((f, idx) => (
                <span key={idx} className="item-row__feature-chip">{f}</span>
              ))}
            </span>
          </div>
        )}

        {item.tier_catalog && (
          <details className="item-row__tier-catalog">
            <summary>
              <Info size={11} /> Ver features que contam pra esse bônus
            </summary>
            <div className="item-row__tier-catalog-content">
              <div className="item-row__tier-group">
                <strong className="item-row__tier-label tier1">Tier 1:</strong>
                {item.tier_catalog.tier1.map((f, idx) => (
                  <span key={idx} className="item-row__feature-chip">{f}</span>
                ))}
              </div>
              <div className="item-row__tier-group">
                <strong className="item-row__tier-label tier2">Tier 2:</strong>
                {item.tier_catalog.tier2.map((f, idx) => (
                  <span key={idx} className="item-row__feature-chip">{f}</span>
                ))}
              </div>
              <div className="item-row__tier-group">
                <strong className="item-row__tier-label tier3">Tier 3:</strong>
                {item.tier_catalog.tier3.map((f, idx) => (
                  <span key={idx} className="item-row__feature-chip">{f}</span>
                ))}
              </div>
            </div>
          </details>
        )}

        {item.study_goes_to_other && item.studies_info && item.studies_info.length > 0 && (
          <div className="item-row__pre-assigned-note">
            <Info size={12} /> Bônus deste estudo vai pro autor, não pra você
          </div>
        )}
        {assignedElsewhere && !locked && isEffectivelyEarned(item, manualChecks) && (
          <div className="item-row__pre-assigned-note">
            <Info size={12} /> Etapa atribuída a outro CS — bônus não vai pro dono
          </div>
        )}

        {needsEvidence && (
          <div className="item-row__evidence">
            <Link2 size={12} className="item-row__evidence-icon" />
            <input
              type="url"
              className="item-row__evidence-input"
              placeholder={item.evidence_type === 'link_or_file'
                ? 'Cole o link da evidência (Loom, Drive, Imgur, etc)…'
                : 'Cole o link da evidência (Loom, Drive, etc)…'}
              value={evidenceLink}
              onChange={(e) => onEvidenceChange(item.id, e.target.value)}
              disabled={locked}
            />
            {evidenceLink && (
              <a
                href={evidenceLink}
                target="_blank"
                rel="noreferrer"
                className="item-row__evidence-open"
                title="Abrir em nova aba"
              >
                Abrir ↗
              </a>
            )}
          </div>
        )}

        {/* Admin override panel — visível só pra admin */}
        {isAdmin && onAdminOverride && (
          <div className="item-row__admin-override">
            <Shield size={12} />
            <span style={{ marginRight: 'auto' }}>
              {isAdminForced
                ? `Override por ${adminOv.by} · ${adminOv.reason || 'sem motivo'}`
                : 'Forçar resultado deste item:'}
            </span>
            <div className="item-row__admin-actions">
              <button
                className={`item-row__admin-btn ${adminOv?.earned === true ? 'item-row__admin-btn--active-on' : ''}`}
                onClick={() => {
                  const reason = window.prompt('Motivo (opcional):') || '';
                  onAdminOverride(item.id, true, reason);
                }}
                title="Forçar como conquistado"
              >
                ✓ OK
              </button>
              <button
                className={`item-row__admin-btn ${adminOv?.earned === false ? 'item-row__admin-btn--active-off' : ''}`}
                onClick={() => {
                  const reason = window.prompt('Motivo (opcional):') || '';
                  onAdminOverride(item.id, false, reason);
                }}
                title="Forçar como não-conquistado"
              >
                ✗ Não
              </button>
              {isAdminForced && (
                <button
                  className="item-row__admin-btn"
                  onClick={() => onAdminOverride(item.id, null)}
                  title="Voltar ao automático"
                >
                  Auto
                </button>
              )}
            </div>
          </div>
        )}
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

