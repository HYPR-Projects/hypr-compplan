import { useState, useMemo } from 'react';
import { AlertCircle, CheckCircle2, Filter, Save, Search, Sparkles } from 'lucide-react';
import AppShell from '../../components/layout/AppShell.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import { Input, Select } from '../../components/ui/Input.jsx';
import { fmt } from '../../lib/format.js';
import './Legacy.css';

// MOCK — substitui por GET /commplan/admin/legacy/pending
const MOCK_PENDING = [
  {
    short_token: 'CYTX53',
    client_name: 'CVC',
    campaign_name: 'Aniversário',
    cp_name: 'Pablo Souza',
    agency: 'CVC',
    industry: 'Travel',
    campaign_type: 'Performance',
    start_date: '2026-04-15',
    end_date: '2026-05-31',
    total_value: 850000,
    formats_str: 'Tap to Go, Tap to Scratch',
    sold_audiences: 'Interesse em viagens, Famílias com crianças, Renda alta',
    cpm_amount: 12.50,
    cpcv_amount: 0.08,
    total_display_impressions: 6200000,
    total_video_completions: 2400000,
  },
  {
    short_token: 'P4LW2W',
    client_name: 'PEPSICO',
    campaign_name: 'Quaker Inverno',
    cp_name: 'Karolina Siqueira',
    agency: 'AlmapBBDO',
    industry: 'CPG',
    campaign_type: 'Awareness',
    start_date: '2026-04-04',
    end_date: '2026-05-31',
    total_value: 1200000,
    formats_str: 'P-DOOH, Survey, Tap to Calendar',
    sold_audiences: 'Mães, Compradores frequentes, Lifestyle saudável',
    cpm_amount: 18.20,
    cpcv_amount: 0.12,
    total_display_impressions: 8900000,
    total_video_completions: 3600000,
  },
  {
    short_token: 'PYG08F',
    client_name: 'GENERAL MOTORS',
    campaign_name: 'Varejo 2026',
    cp_name: 'Danilo Pereira',
    agency: 'McCann',
    industry: 'Auto',
    campaign_type: 'Performance',
    start_date: '2026-04-04',
    end_date: '2026-05-31',
    total_value: 980000,
    formats_str: 'Tap to Go, Footfall',
    sold_audiences: 'Compradores de carro, Renda média-alta',
    cpm_amount: 14.80,
    cpcv_amount: 0.09,
    total_display_impressions: 5600000,
    total_video_completions: 2100000,
  },
  {
    short_token: 'TEDFTI',
    client_name: 'C&A',
    campaign_name: 'Dia das Mães',
    cp_name: 'Camila Tenório',
    agency: 'Wieden+Kennedy',
    industry: 'Fashion',
    campaign_type: 'Branding',
    start_date: '2026-04-20',
    end_date: '2026-05-10',
    total_value: 620000,
    formats_str: 'Tap to Carousel, Tap to Slide',
    sold_audiences: 'Mães, Mulheres 25-44, Fashion lovers',
    cpm_amount: 16.40,
    cpcv_amount: 0.11,
    total_display_impressions: 4100000,
    total_video_completions: 1800000,
  },
];

const CS_OPTIONS = [
  { value: '', label: 'Selecionar CS...' },
  { value: 'beatriz.severine@hypr.mobi', label: 'Beatriz Severine' },
  { value: 'isaac.lobo@hypr.mobi', label: 'Isaac Lobo' },
  { value: 'mariana.lewinski@hypr.mobi', label: 'Mariana Lewinski' },
  { value: 'thiago.nascimento@hypr.mobi', label: 'Thiago Nascimento' },
  { value: 'joao.buzolin@hypr.mobi', label: 'João Buzolin' },
  { value: 'joao.armelin@hypr.mobi', label: 'João Armelin' },
];

// Catálogo de features (28 — vide seeds.sql)
const FEATURES_TIER_1 = [
  'P-DOOH', 'Tap to Go', 'Tap To Scratch', 'Tap To Slide',
  'Tap To Carousel', 'Tap To Chat', 'Tap To Hotspot', 'Survey', 'Footfall',
];
const FEATURES_TIER_2 = [
  'Weather', 'Topics', 'Click to Calendar', 'Downloaded Apps', 'Purchase Context',
  'Attention Ad', 'Video Survey', 'Globoplay', 'TwitchTV', 'DisneyPlus',
  'Activision', 'Blizzard', 'SamsungTV', 'PlutoTV', 'Roku', 'Spotify',
];
const FEATURES_TIER_3 = ['CTV', 'TV Sync', 'HYPR Pass'];

const PRODUCTS = ['RMN Físico', 'RMN Digital', 'O2O', 'OOH'];

const STUDIES = [
  { id: 'st_pascoa_2026', label: 'Páscoa' },
  { id: 'st_dia_maes_2026', label: 'Dia das Mães' },
  { id: 'st_dia_namorados_2026', label: 'Dia dos Namorados' },
  { id: 'st_festa_junina_2026', label: 'Festa Junina' },
  { id: 'st_dia_pais_2026', label: 'Dia dos Pais' },
];

export default function AdminLegacy() {
  const [pending, setPending] = useState(MOCK_PENDING);
  const [drafts, setDrafts] = useState({});       // {short_token: {...}}
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState('all'); // all|filled|empty
  const [saving, setSaving] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  // Filtragem
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return pending.filter(c => {
      if (q && !`${c.client_name} ${c.campaign_name} ${c.short_token}`.toLowerCase().includes(q)) {
        return false;
      }
      const draft = drafts[c.short_token];
      const isFilled = !!draft?.cs_email;
      if (filterStatus === 'filled' && !isFilled) return false;
      if (filterStatus === 'empty' && isFilled) return false;
      return true;
    });
  }, [pending, drafts, search, filterStatus]);

  const filledCount = Object.values(drafts).filter(d => d?.cs_email).length;
  const totalCount = pending.length;

  function updateDraft(token, patch) {
    setDrafts(prev => ({
      ...prev,
      [token]: { ...prev[token], ...patch },
    }));
  }

  function toggleArrayValue(token, field, value) {
    setDrafts(prev => {
      const current = prev[token]?.[field] || [];
      const next = current.includes(value)
        ? current.filter(v => v !== value)
        : [...current, value];
      return { ...prev, [token]: { ...prev[token], [field]: next } };
    });
  }

  async function handleSaveAll() {
    setSaving(true);
    const assignments = Object.entries(drafts)
      .filter(([_, d]) => d?.cs_email)
      .map(([short_token, d]) => ({ short_token, ...d }));

    // POST /commplan/admin/legacy/assign-batch
    // const result = await endpoints.legacyAssignBatch(assignments);
    await new Promise(r => setTimeout(r, 800)); // mock
    setSavedCount(assignments.length);

    // Remove os salvos da lista
    const savedTokens = new Set(assignments.map(a => a.short_token));
    setPending(prev => prev.filter(c => !savedTokens.has(c.short_token)));
    setDrafts({});
    setSaving(false);

    setTimeout(() => setSavedCount(0), 4000);
  }

  return (
    <AppShell>
      <header className="page-header fade-up">
        <div>
          <h1 className="page-title">Campanhas Legadas</h1>
          <div className="page-subtitle">
            <span>{totalCount} pendentes</span>
            {filledCount > 0 && (
              <>
                <span className="page-subtitle__sep">·</span>
                <span style={{ color: 'var(--status-green)' }}>{filledCount} preenchidas</span>
              </>
            )}
            <span className="page-subtitle__sep">·</span>
            <span style={{ color: 'var(--text-tertiary)' }}>Cutoff: 1 abr 2026</span>
          </div>
        </div>
        <div className="legacy__actions">
          <Button
            variant="primary"
            disabled={filledCount === 0 || saving}
            loading={saving}
            onClick={handleSaveAll}
          >
            <Save size={16} />
            {saving ? 'Salvando...' : `Salvar ${filledCount} ${filledCount === 1 ? 'atribuição' : 'atribuições'}`}
          </Button>
        </div>
      </header>

      {savedCount > 0 && (
        <Card className="legacy__success-banner fade-up" style={{ '--i': 0 }}>
          <CheckCircle2 size={20} />
          <span><strong>{savedCount}</strong> campanhas atribuídas. Aparecem agora nos dashboards dos CSs.</span>
        </Card>
      )}

      <Card className="legacy__info fade-up" style={{ '--i': 1 }}>
        <Sparkles size={18} />
        <div>
          <strong>Como funciona</strong>
          <p>
            Estas campanhas estão em <code>prod_assets.checklist_info</code> mas não migraram pro Command —
            faltam <code>cs_email</code>, features, products, etc. <strong>Atribua o CS</strong> (obrigatório)
            e, opcionalmente, preencha features/products/audiences pra calcular bônus completo.
            Campos vazios não contam, mas a campanha aparece no dashboard do CS atribuído.
          </p>
        </div>
      </Card>

      <Card className="legacy__filters fade-up" style={{ '--i': 2 }}>
        <Input
          prefix={<Search size={14} />}
          placeholder="Buscar por cliente, campanha ou short_token..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="legacy__filter-tabs">
          <button
            className={`legacy__filter-tab ${filterStatus === 'all' ? 'is-active' : ''}`}
            onClick={() => setFilterStatus('all')}
          >
            Todas <span className="legacy__filter-count">{totalCount}</span>
          </button>
          <button
            className={`legacy__filter-tab ${filterStatus === 'empty' ? 'is-active' : ''}`}
            onClick={() => setFilterStatus('empty')}
          >
            Pendentes <span className="legacy__filter-count">{totalCount - filledCount}</span>
          </button>
          <button
            className={`legacy__filter-tab ${filterStatus === 'filled' ? 'is-active' : ''}`}
            onClick={() => setFilterStatus('filled')}
          >
            Preenchidas <span className="legacy__filter-count">{filledCount}</span>
          </button>
        </div>
      </Card>

      {filtered.length === 0 ? (
        <Card className="legacy__empty fade-up" style={{ '--i': 3 }}>
          <CheckCircle2 size={48} style={{ color: 'var(--status-green)' }} />
          <h3>Tudo certo!</h3>
          <p>Não há campanhas legadas pendentes que correspondam ao filtro.</p>
        </Card>
      ) : (
        <div className="legacy__list">
          {filtered.map((c, i) => (
            <CampaignRow
              key={c.short_token}
              campaign={c}
              draft={drafts[c.short_token] || {}}
              onUpdate={(patch) => updateDraft(c.short_token, patch)}
              onToggleArray={(field, value) => toggleArrayValue(c.short_token, field, value)}
              style={{ '--i': i + 4 }}
            />
          ))}
        </div>
      )}
    </AppShell>
  );
}

// ─── Linha individual de campanha ────────────────────────────────────────
function CampaignRow({ campaign: c, draft, onUpdate, onToggleArray, style }) {
  const [expanded, setExpanded] = useState(false);
  const isFilled = !!draft.cs_email;

  return (
    <Card
      className={`legacy-row stagger ${isFilled ? 'legacy-row--filled' : ''}`}
      style={style}
    >
      <div className="legacy-row__header">
        {/* IDENTIFICAÇÃO da campanha — sempre visível */}
        <div className="legacy-row__identity">
          <div className="legacy-row__client">{c.client_name}</div>
          <div className="legacy-row__campaign">{c.campaign_name}</div>
          <div className="legacy-row__token">
            <span className="legacy-row__token-label">PI</span>
            <code>{c.short_token}</code>
          </div>
        </div>

        {/* Metadados */}
        <div className="legacy-row__meta">
          <div className="legacy-row__meta-item">
            <span className="legacy-row__meta-label">Período</span>
            <span className="legacy-row__meta-value">
              {fmt.dateShort(c.start_date)} → {fmt.dateShort(c.end_date)}
            </span>
          </div>
          <div className="legacy-row__meta-item">
            <span className="legacy-row__meta-label">Investimento</span>
            <span className="legacy-row__meta-value mono">
              {fmt.brl(c.total_value)}
            </span>
          </div>
          <div className="legacy-row__meta-item">
            <span className="legacy-row__meta-label">CP / Agência</span>
            <span className="legacy-row__meta-value">{c.cp_name} · {c.agency}</span>
          </div>
        </div>

        {/* Status */}
        <div className="legacy-row__status">
          {isFilled ? (
            <Badge variant="success">
              <CheckCircle2 size={12} /> Pronta
            </Badge>
          ) : (
            <Badge variant="warning">
              <AlertCircle size={12} /> Pendente
            </Badge>
          )}
        </div>
      </div>

      {/* Atribuição obrigatória (CS) */}
      <div className="legacy-row__cs-row">
        <label className="legacy-row__field-label">CS responsável <span className="required">*</span></label>
        <Select
          value={draft.cs_email || ''}
          onChange={(e) => onUpdate({ cs_email: e.target.value })}
          options={CS_OPTIONS}
          aria-label="Atribuir CS"
        />
        <button
          type="button"
          className="legacy-row__expand-btn"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Ocultar' : 'Preencher mais'} {expanded ? '▴' : '▾'}
        </button>
      </div>

      {/* Campos manuais opcionais — colapsáveis */}
      {expanded && (
        <div className="legacy-row__manual-fields">
          <details className="legacy-row__hint" open>
            <summary>📋 Dados originais da campanha (pra te ajudar a preencher)</summary>
            <div className="legacy-row__hint-content">
              <div><strong>Indústria:</strong> {c.industry}</div>
              <div><strong>Tipo:</strong> {c.campaign_type}</div>
              <div><strong>Formatos:</strong> {c.formats_str}</div>
              <div><strong>Audiences (texto livre):</strong> {c.sold_audiences}</div>
              <div><strong>CPM/CPCV:</strong> {fmt.brl(c.cpm_amount)} / {fmt.brl(c.cpcv_amount)}</div>
              <div><strong>Display impressions:</strong> {fmt.num(c.total_display_impressions)}</div>
              <div><strong>Video completions:</strong> {fmt.num(c.total_video_completions)}</div>
            </div>
          </details>

          {/* Features (chips) */}
          <FieldGroup
            label="Features (Tier 1/2/3)"
            hint="Selecione as features que essa campanha realmente usou. Pesa em Setup."
          >
            <ChipGroup
              tier="Tier 1"
              options={FEATURES_TIER_1}
              selected={draft.features_manual || []}
              onToggle={(v) => onToggleArray('features_manual', v)}
            />
            <ChipGroup
              tier="Tier 2"
              options={FEATURES_TIER_2}
              selected={draft.features_manual || []}
              onToggle={(v) => onToggleArray('features_manual', v)}
            />
            <ChipGroup
              tier="Tier 3"
              options={FEATURES_TIER_3}
              selected={draft.features_manual || []}
              onToggle={(v) => onToggleArray('features_manual', v)}
            />
          </FieldGroup>

          {/* Products */}
          <FieldGroup
            label="Products"
            hint="Seleciona produtos pra contar RMN Físico/Digital em Pré-Campanha."
          >
            <ChipGroup
              options={PRODUCTS}
              selected={draft.products_manual || []}
              onToggle={(v) => onToggleArray('products_manual', v)}
            />
          </FieldGroup>

          {/* Audiences count */}
          <FieldGroup
            label="Quantidade de audiences"
            hint="Conta as audiences vendidas (geralmente entre 1-5). Pra Pré-Campanha."
          >
            <Input
              type="number"
              min={0}
              max={20}
              placeholder="Ex: 3"
              value={draft.audiences_count ?? ''}
              onChange={(e) => onUpdate({
                audiences_count: e.target.value === '' ? null : parseInt(e.target.value)
              })}
              style={{ maxWidth: 120 }}
            />
          </FieldGroup>

          {/* CS meeting */}
          <FieldGroup
            label="Houve reunião CS?"
            hint="Pra Pré-Campanha. Marca true se rolou kickoff/alinhamento."
          >
            <div className="legacy-row__bool-toggle">
              <button
                type="button"
                className={`legacy-row__toggle ${draft.had_cs_meeting === true ? 'is-active is-yes' : ''}`}
                onClick={() => onUpdate({ had_cs_meeting: true })}
              >
                Sim
              </button>
              <button
                type="button"
                className={`legacy-row__toggle ${draft.had_cs_meeting === false ? 'is-active is-no' : ''}`}
                onClick={() => onUpdate({ had_cs_meeting: false })}
              >
                Não
              </button>
              {draft.had_cs_meeting != null && (
                <button
                  type="button"
                  className="legacy-row__toggle-clear"
                  onClick={() => onUpdate({ had_cs_meeting: null })}
                >
                  Limpar
                </button>
              )}
            </div>
          </FieldGroup>

          {/* Studies */}
          <FieldGroup
            label="Estudos aplicados"
            hint="Selecione SE essa campanha usou algum estudo. Autor recebe 0.30%."
          >
            <ChipGroup
              options={STUDIES.map(s => s.label)}
              selected={(draft.studies_used || []).map(id => STUDIES.find(s => s.id === id)?.label).filter(Boolean)}
              onToggle={(label) => {
                const study = STUDIES.find(s => s.label === label);
                if (study) onToggleArray('studies_used', study.id);
              }}
            />
          </FieldGroup>

          {/* Notes */}
          <FieldGroup label="Observações" hint="Opcional — fica registrado no audit log.">
            <Input
              placeholder="Ex: Features inferidas pelo PI #ABC"
              value={draft.notes || ''}
              onChange={(e) => onUpdate({ notes: e.target.value })}
            />
          </FieldGroup>
        </div>
      )}
    </Card>
  );
}

function FieldGroup({ label, hint, children }) {
  return (
    <div className="legacy-row__field">
      <div className="legacy-row__field-header">
        <label className="legacy-row__field-label">{label}</label>
        {hint && <span className="legacy-row__field-hint">{hint}</span>}
      </div>
      {children}
    </div>
  );
}

function ChipGroup({ tier, options, selected, onToggle }) {
  return (
    <div className="legacy-chip-group">
      {tier && <span className="legacy-chip-tier">{tier}:</span>}
      <div className="legacy-chips">
        {options.map(opt => (
          <button
            key={opt}
            type="button"
            className={`legacy-chip ${selected.includes(opt) ? 'is-selected' : ''}`}
            onClick={() => onToggle(opt)}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}
