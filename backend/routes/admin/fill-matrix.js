/**
 * routes/admin/fill-matrix.js — "Preenchimentos": o que cada CS preencheu em
 * cada campanha, de onde veio cada item e se está validado.
 *
 *   GET /commplan/admin/fill-matrix/:q   (ex.: Q4-2026)
 *
 * Uma linha por (campanha × item) relevante: conquistado, marcado pelo CS ou
 * divergente. Resumo de qualidade por CS (confirmados × declarados ×
 * divergentes). Usa o mesmo cálculo do export de auditoria.
 */

import { Router } from 'express';
import { authRequired, adminRequired } from '../../middleware/auth.js';
import { fetchAuditCampaigns } from './export.js';

export const router = Router();
router.use(authRequired, adminRequired);

const SOURCE_LABEL = {
  manual: 'CS marca', semi_auto: 'Automático (editável)', auto: 'Automático',
  metrics: 'Métricas', calendar: 'Agenda Google',
};
const val = (v) => (v && typeof v === 'object' && 'value' in v ? v.value : v);

router.get('/:q', async (req, res) => {
  try {
    const campaigns = await fetchAuditCampaigns({ quarter: req.params.q, includeUnfinished: true });
    const rows = [];
    const byCs = {};

    for (const c of campaigns) {
      const bd = c.breakdown || {};
      const mc = c.manual_checks_parsed || {};
      const evidence = mc.__evidence || {};
      const csKey = (c.cs_email || '').toLowerCase();
      byCs[csKey] ||= { cs_email: csKey, cs_name: c.cs_name || csKey, campaigns: 0, confirmed: 0, declared: 0, divergent: 0, admin: 0, missing_evidence: 0 };
      byCs[csKey].campaigns += 1;

      for (const [catKey, cat] of Object.entries(bd.by_category || {})) {
        for (const it of cat.items || []) {
          const marked = mc[it.id] === true;
          if (!it.earned && !it.was_earned && !marked && it.validation !== 'divergent') continue;
          const ev = it.auto_evidence || evidence[it.id] || (cat.shared_evidence ? evidence[cat.shared_evidence.key] : '') || '';
          const missingEv = it.needs_evidence && (it.earned || marked) && !ev;
          const validation = it.validation || (it.earned ? 'confirmed' : null);
          if (validation && byCs[csKey][validation] !== undefined) byCs[csKey][validation] += 1;
          if (missingEv) byCs[csKey].missing_evidence += 1;
          rows.push({
            version: bd.version || '2026',
            cs_email: csKey,
            cs_name: c.cs_name || csKey,
            client_name: c.client_name,
            campaign_name: c.campaign_name,
            short_token: c.short_token,
            start_date: val(c.start_date),
            end_date: val(c.end_date),
            stage: catKey,
            stage_label: cat.label,
            item_id: it.id,
            item_label: it.label,
            pct: it.pct,
            value_brl: it.value_brl || 0,
            earned: !!it.earned,
            marked_by_cs: marked,
            source: SOURCE_LABEL[it.source] || it.source,
            validation,
            validation_reason: it.validation_reason || null,
            evidence: ev,
            missing_evidence: missingEv,
            admin_override: it.admin_override ? { by: it.admin_override.by, reason: it.admin_override.reason || '' } : null,
            last_edit_by: c.last_edit_by || null,
            last_edit_at: val(c.last_edit_at) || null,
          });
        }
      }
    }

    res.json({ quarter: req.params.q, rows, by_cs: Object.values(byCs) });
  } catch (e) {
    console.error('fill-matrix:', e);
    res.status(500).json({ error: e.message });
  }
});
