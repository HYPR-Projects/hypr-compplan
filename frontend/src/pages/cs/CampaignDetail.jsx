import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle2, AlertCircle, Save, Info,
  ChevronDown, ChevronRight, Sparkles, Zap, Eye, Link2, AlertTriangle,
  MessageSquare, Shield, Copy, BookOpen, X,
} from 'lucide-react';
import AppShell from '../../components/layout/AppShell.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import { Modal } from '../../components/ui/Modal.jsx';
import { fmt } from '../../lib/format.js';
import { endpoints, auth } from '../../lib/api.js';
import './CampaignDetail.css';

const CATEGORY_ORDER = ['pre_campaign', 'setup', 'optimization', 'account_mgmt', 'extras', 'onboarding'];

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
            {campaign.pre_campaign_assignee_email && (
              <Badge variant={campaign.viewer_is_pre_assignee ? 'cyan' : 'yellow'}>
                Pré: {campaign.pre_campaign_assignee_email}
              </Badge>
            )}
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

      {/* Quando o viewer é APENAS pre_assignee (não é dono nem admin),
          mostra só o bloco de Pré Campanha. */}
      {(() => {
        const viewerEmail = (user?.email || '').toLowerCase();
        const ownerEmail = (campaign.cs_email || '').toLowerCase();
        const isOwner = viewerEmail === ownerEmail;
        const onlyPreCampaign = !isAdmin && !isOwner && campaign.viewer_is_pre_assignee;

        const categoriesToShow = onlyPreCampaign
          ? ['pre_campaign']
          : CATEGORY_ORDER;

        // Info pra bloquear o bloco Pré Campanha do DONO quando atribuída a outro CS.
        const assigneeEmail = (campaign.pre_campaign_assignee_email || '').toLowerCase();
        const assigneeIsOther = !!assigneeEmail && assigneeEmail !== viewerEmail;
        let assigneeName = null;
        if (assigneeIsOther) {
          const member = (teamList || []).find(t => (t.email || '').toLowerCase() === assigneeEmail);
          assigneeName = member?.name || null;
        }
        const preAssigneeInfo = {
          assigneeIsOther,
          assigneeName,
          assigneeEmail,
        };

        return (
          <>
            {onlyPreCampaign && (
              <div className="cs-only-pre-banner">
                <Info size={14} />
                <span>
                  Você foi atribuído à <strong>Pré Campanha</strong> desta campanha
                  (dono: <strong>{campaign.cs_name || campaign.cs_email}</strong>).
                  Só você pode preencher esta seção — o resto da campanha não é editável por você.
                </span>
              </div>
            )}
            {categoriesToShow.map(catKey => {
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
                  preAssigneeInfo={preAssigneeInfo}
                />
              );
            })}
          </>
        );
      })()}

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

      {/* Bloco de observação CS - pedido de análise */}
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

      <div className="form-actions">
        <Button variant="ghost" onClick={() => handleSave(false)} disabled={saving}>
          Salvar rascunho
        </Button>
        <Button variant="primary" icon={Save} onClick={() => handleSave(true)} loading={saving}>
          {campaign.reviewed ? 'Atualizar revisão' : 'Confirmar revisão'}
        </Button>
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

function CategoryBlock({ catKey, cat, expanded, onToggleExpand, manualChecks, onCheck, onEvidenceChange, metrics, isABS, onAbsChange, isVideoOnly, isAdmin, onAdminOverride, onSetupForce, teamList, studiesCatalog, currentStudyAssignee, currentStudyId, onAssignStudy, preAssigneeInfo }) {
  const earnedCount = cat.items.filter(i => isEffectivelyEarned(i, manualChecks)).length;
  const isOptimization = catKey === 'optimization';

  // Bloqueio de Pré Campanha quando atribuída a outro CS (do ponto de vista do dono).
  // Não bloqueia o admin (que pode ver/editar tudo).
  const preAssignedElsewhere = catKey === 'pre_campaign'
    && preAssigneeInfo?.assigneeIsOther === true;

  // Shared evidence: link único da categoria. Aparece quando há item marcado.
  const evidenceMap = manualChecks.__evidence || {};
  const sharedEv = cat.shared_evidence;
  const sharedKey = sharedEv?.key || null;
  const sharedLink = sharedKey ? (evidenceMap[sharedKey] || '') : '';
  const hasAnyEarned = earnedCount > 0;
  const showSharedEvidence = !!sharedEv && hasAnyEarned && !cat.invalidated;
  const sharedMissing = showSharedEvidence && !sharedLink.trim();

  return (
    <Card className={`category-block fade-up ${preAssignedElsewhere ? 'category-block--locked' : ''}`} style={{ marginBottom: 'var(--space-3)' }}>
      <button className="category-block__header" onClick={onToggleExpand}>
        <div className="category-block__title">
          {expanded ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          <span>{cat.label}</span>
          <Badge variant={cat.invalidated ? 'red' : (preAssignedElsewhere ? 'neutral' : 'neutral')}>
            {cat.invalidated
              ? `0/${cat.items.length} (anulado)`
              : cat.setup_pending
                ? `${earnedCount}/${cat.items.length} (em andamento)`
                : preAssignedElsewhere
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
          {preAssignedElsewhere && (
            <div className="category-block__pre-assigned-banner">
              <Info size={14} />
              <span>
                Pré Campanha atribuída a{' '}
                <strong>{preAssigneeInfo.assigneeName || preAssigneeInfo.assigneeEmail}</strong>.
                Apenas este CS pode preencher os items desta seção. O bônus de Pré não conta pra você nesta campanha.
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
          {isOptimization && onAbsChange && !isVideoOnly && (
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
              locked={preAssignedElsewhere}
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

function ItemRow({ item, manualChecks, onCheck, onEvidenceChange, metrics, isABS, invalidated, isAdmin, onAdminOverride, teamList, studiesCatalog, currentStudyAssignee, currentStudyId, onAssignStudy, locked }) {
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
        {item.pre_assigned_to_other && !locked && (
          <div className="item-row__pre-assigned-note">
            <Info size={12} /> Pré Campanha atribuída a outro CS — bônus não vai pra você
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

function formatMetricInfo(item, metrics, isABS) {
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
function computeOptimizationEarned(metrics, isABS, isVideoOnly = false) {
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

function ReplicateModal({ token, opts, campaign, onClose, onSuccess }) {
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
