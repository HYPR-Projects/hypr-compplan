import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, CheckCircle2, Save, AlertCircle,
} from 'lucide-react';
import AppShell from '../../components/layout/AppShell.jsx';
import { Card } from '../../components/ui/Card.jsx';
import { Badge } from '../../components/ui/Badge.jsx';
import Button from '../../components/ui/Button.jsx';
import { fmt } from '../../lib/format.js';
import { endpoints } from '../../lib/api.js';
import './CampaignDetail.css';

export default function CsCampaignDetail() {
  const { token } = useParams();
  const navigate = useNavigate();
  const [campaign, setCampaign] = useState(null);
  const [features, setFeatures] = useState({ tier1: [], tier2: [], tier3: [] });
  const [studies, setStudies] = useState([]);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState(null);

  // Form state
  const [form, setForm] = useState({
    features: [],
    products: [],
    studies_used: [],
    audiences_count: '',
    had_cs_meeting: false,
    notes: '',
  });

  async function load() {
    try {
      setError(null);
      const [c, feat, std] = await Promise.all([
        endpoints.meCampaign(token),
        endpoints.meFeaturesCatalog(),
        endpoints.meStudiesCatalog(),
      ]);
      setCampaign(c);
      setFeatures(feat.catalog || { tier1: [], tier2: [], tier3: [] });
      setStudies(std.items || []);

      // Inicializa form com valores atuais
      setForm({
        features: Array.isArray(c.features) ? c.features : [],
        products: Array.isArray(c.products) ? c.products : [],
        studies_used: Array.isArray(c.studies_used) ? c.studies_used : [],
        audiences_count: c.audiences_count ?? '',
        had_cs_meeting: !!c.had_cs_meeting,
        notes: c.notes || '',
      });
    } catch (e) {
      setError(e.message);
    }
  }

  useEffect(() => { load(); }, [token]);

  function toggleArrayValue(field, value) {
    setForm(prev => ({
      ...prev,
      [field]: prev[field].includes(value)
        ? prev[field].filter(v => v !== value)
        : [...prev[field], value],
    }));
  }

  async function handleSave(markReviewed = true) {
    try {
      setSaving(true);
      setError(null);
      await endpoints.meSaveCampaign(token, {
        features: form.features,
        products: form.products,
        studies_used: form.studies_used,
        audiences_count: form.audiences_count === '' ? null : Number(form.audiences_count),
        had_cs_meeting: form.had_cs_meeting,
        notes: form.notes || null,
        reviewed: markReviewed,
      });
      setSavedAt(new Date());
      // Recarrega pra refletir status
      await load();
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

      {/* ── KPIs read-only ───────────────────────────────────────── */}
      <section className="kpi-row">
        <Card className="kpi kpi--hero">
          <div className="kpi__label label">Investimento bruto</div>
          <div className="kpi__value mono kpi__value--cyan">
            {fmt.brl(campaign.bruto)}
          </div>
          <div className="kpi__hero-breakdown">
            <span className="mono">{fmt.brl(campaign.liquido)} líquido</span>
            <span className="page-subtitle__sep">·</span>
            <span>imposto {(campaign.tax_rate * 100).toFixed(2)}%</span>
          </div>
        </Card>
      </section>

      {/* ── Read-only: dados do checklist ─────────────────────────── */}
      <Card className="fade-up" style={{ '--i': 1, marginBottom: 'var(--space-4)' }}>
        <header className="card__header">
          <h3 className="card__title">Dados do checklist</h3>
          <p className="card__subtitle">Vindos do Command/checklist — não editáveis</p>
        </header>

        <div className="ro-grid">
          {campaign.cp_name && (
            <div className="ro-field">
              <span className="label">Salesman</span>
              <span>{campaign.cp_name}</span>
            </div>
          )}
          {campaign.agency && (
            <div className="ro-field">
              <span className="label">Agência</span>
              <span>{campaign.agency}</span>
            </div>
          )}
          {campaign.industry && (
            <div className="ro-field">
              <span className="label">Setor</span>
              <span>{campaign.industry}</span>
            </div>
          )}
          {Array.isArray(campaign.formats) && campaign.formats.length > 0 && (
            <div className="ro-field ro-field--wide">
              <span className="label">Formatos contratados</span>
              <div className="ro-tags">
                {campaign.formats.map(f => <Badge key={f} variant="neutral">{f}</Badge>)}
              </div>
            </div>
          )}
          {campaign.audiences && (
            <div className="ro-field ro-field--wide">
              <span className="label">Audiências contratadas</span>
              <span className="ro-text-block">{campaign.audiences}</span>
            </div>
          )}
        </div>
      </Card>

      {/* ── Form: double-check do CS ──────────────────────────────── */}
      <Card className="fade-up" style={{ '--i': 2, marginBottom: 'var(--space-4)' }}>
        <header className="card__header">
          <h3 className="card__title">Double-check do CS</h3>
          <p className="card__subtitle">
            Confirme ou corrija os campos abaixo. Se já vieram preenchidos do checklist, só revise.
          </p>
        </header>

        <div className="form-grid">
          {/* ── Produtos ── */}
          <div className="form-field form-field--wide">
            <label className="form-label">Produtos utilizados</label>
            <p className="form-help">
              {form.products.length === 0
                ? 'Nenhum produto registrado — adicione clicando abaixo.'
                : `${form.products.length} produto(s) registrado(s).`}
            </p>
            <div className="ro-tags">
              {form.products.length === 0 ? (
                <span className="form-empty">—</span>
              ) : (
                form.products.map(p => (
                  <Badge key={p} variant="cyan">{p}</Badge>
                ))
              )}
            </div>
          </div>

          {/* ── Features 3 tiers ── */}
          <div className="form-field form-field--wide">
            <label className="form-label">Features utilizadas</label>
            <p className="form-help">Marque as features usadas nesta campanha (organizadas por tier).</p>

            {['tier1', 'tier2', 'tier3'].map((tier, idx) => (
              <div key={tier} className="features-tier">
                <span className="features-tier__label">Tier {idx + 1}</span>
                <div className="features-tier__list">
                  {(features[tier] || []).map(f => (
                    <label key={f} className={`feature-chip ${form.features.includes(f) ? 'feature-chip--on' : ''}`}>
                      <input
                        type="checkbox"
                        checked={form.features.includes(f)}
                        onChange={() => toggleArrayValue('features', f)}
                      />
                      <span>{f}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {/* ── Audiences count ── */}
          <div className="form-field">
            <label className="form-label" htmlFor="audCount">Quantas audiências foram usadas?</label>
            <input
              id="audCount"
              type="number"
              min="0"
              className="form-input"
              value={form.audiences_count}
              onChange={(e) => setForm({ ...form, audiences_count: e.target.value })}
              placeholder="0"
            />
          </div>

          {/* ── Reunião CS ── */}
          <div className="form-field">
            <label className="form-label">Houve reunião com cliente?</label>
            <div className="toggle-row">
              <button
                type="button"
                className={`toggle-btn ${!form.had_cs_meeting ? 'toggle-btn--active' : ''}`}
                onClick={() => setForm({ ...form, had_cs_meeting: false })}
              >
                Não
              </button>
              <button
                type="button"
                className={`toggle-btn ${form.had_cs_meeting ? 'toggle-btn--active' : ''}`}
                onClick={() => setForm({ ...form, had_cs_meeting: true })}
              >
                Sim
              </button>
            </div>
          </div>

          {/* ── Estudos ── */}
          <div className="form-field form-field--wide">
            <label className="form-label">Estudos usados</label>
            <p className="form-help">
              {studies.length === 0
                ? 'Nenhum estudo cadastrado no catálogo.'
                : 'Marque os estudos relevantes desta campanha.'}
            </p>
            <div className="features-tier__list">
              {studies.map(s => (
                <label
                  key={s.id}
                  className={`feature-chip ${form.studies_used.includes(s.id) ? 'feature-chip--on' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={form.studies_used.includes(s.id)}
                    onChange={() => toggleArrayValue('studies_used', s.id)}
                  />
                  <span>{s.display_name}</span>
                </label>
              ))}
            </div>
          </div>

          {/* ── Observações ── */}
          <div className="form-field form-field--wide">
            <label className="form-label" htmlFor="notes">Observações</label>
            <textarea
              id="notes"
              className="form-input form-textarea"
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Anotações livres sobre esta campanha…"
            />
          </div>
        </div>

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
      </Card>
    </AppShell>
  );
}
