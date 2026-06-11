/**
 * routes/admin/audit.js — endpoint de auditoria de campanhas.
 *
 * Lista campanhas FINALIZADAS (end_date < hoje) com status agregado de
 * 3 dimensões que importam pro admin:
 *   1. SETUP    — válido / anulado por over / pendente
 *   2. OTIMIZ.  — quantas otimizações earned / total aplicável
 *   3. EVID.    — quantas evidências com link / total que precisam de link
 *
 * Endpoints:
 *   GET  /commplan/admin/audit/:q             → lista agrupada por status
 *   PUT  /commplan/admin/audit/:token/mark    → marca OK ou problema
 *
 * Body do PUT:
 *   { status: 'ok' | 'issue' | null, notes?: string }
 *   - status=null limpa marcação
 *   - status='issue' exige notes (mín 5 chars)
 *
 * Persiste em manual_checks:
 *   __audit_status         'ok' | 'issue' | null
 *   __audit_at             ISO timestamp
 *   __audit_by             email do admin
 *   __audit_notes          texto livre (quando status='issue')
 */

import { Router } from 'express';
import { authRequired, adminRequired } from '../../middleware/auth.js';
import { query, tableRef } from '../../lib/bigquery.js';
import { parseQuarter } from '../../engine/quarter-resolver.js';
import { computeBonus } from '../../engine/compplan-engine.js';
import { COMPPLAN_CATALOG } from '../../engine/compplan-catalog.js';
import { resolveStudiesInfo } from '../../lib/bonus-calc.js';
import { isOverException } from '../../data/over-exceptions.js';
import { logAudit } from '../../lib/audit.js';

export const router = Router();
router.use(authRequired, adminRequired);

/**
 * GET /admin/audit/:q
 *
 * Retorna:
 *   {
 *     quarter, period: { start, end },
 *     totals: { total, with_issue, ok_marked, pending },
 *     groups: {
 *       setup_anulado: [campaign...],
 *       otimizacao_fora_meta: [campaign...],
 *       evidencia_faltando: [campaign...],
 *       admin_flagged_issue: [campaign...],
 *       all_ok: [campaign...]
 *     }
 *   }
 *
 * Onde cada campaign tem dados de status agregado pronto pra UI:
 *   {
 *     short_token, client_name, campaign_name, cs_email, cs_name,
 *     start_date, end_date, is_legacy,
 *     setup: { status: 'valid'|'invalid'|'pending', over_pct, reason },
 *     optimization: { earned: N, total: N, ok: bool, details: [...] },
 *     evidences: { filled: N, total: N, ok: bool, items: [{id, label, url}], missing: [{id, label}] },
 *     audit_mark: { status, at, by, notes } | null,
 *     review_decision: 'approved' | 'rejected' | null  // se admin já aprovou/recusou pedido
 *   }
 */
router.get('/:q', async (req, res) => {
  try {
    const quarter = req.params.q;
    const qInfo = parseQuarter(quarter);
    if (!qInfo) return res.status(400).json({ error: `Quarter inválido: ${quarter}` });
    const { startDate, endDate } = qInfo;

    const todayStr = new Date().toISOString().slice(0, 10);
    // SÓ campanhas FINALIZADAS (end_date < hoje)
    const filterEnd = todayStr < endDate ? todayStr : endDate;

    // 1. Campanhas do quarter, FINALIZADAS, com manual_checks/admin_overrides
    const campaigns = await query(
      `SELECT
         c.short_token, c.client_name, c.campaign_name, c.cs_email, c.cs_name,
         c.cp_name, c.agency, c.start_date, c.end_date, c.is_legacy,
         c.total_value, c.features, c.products, c.formats, c.audiences,
         c.studies_used, c.pracas_type,
         c.o2o_display_impressions, c.bonus_o2o_display_impressions,
         c.ooh_display_impressions, c.bonus_ooh_display_impressions,
         IFNULL(o.manual_checks, la.manual_checks)     AS manual_checks,
         IFNULL(o.admin_overrides, la.admin_overrides) AS admin_overrides,
         IFNULL(o.pre_campaign_assignee_email, la.pre_campaign_assignee_email) AS pre_assignee,
         IFNULL(o.study_assignee_email, la.study_assignee_email)               AS study_assignee,
         IFNULL(o.study_id_override, la.study_id_override)                     AS study_id_override
       FROM ${tableRef('commplan_checklists')} c
       LEFT JOIN ${tableRef('commplan_command_overrides')}  o  ON c.short_token = o.short_token
       LEFT JOIN ${tableRef('commplan_legacy_assignments')} la ON c.short_token = la.short_token
       WHERE c.cs_email IS NOT NULL
         AND c.start_date >= @s AND c.start_date <= @e
         AND c.end_date < @today`,
      { s: startDate, e: filterEnd, today: todayStr }
    );

    if (campaigns.length === 0) {
      return res.json({
        quarter, period: { start: startDate, end: endDate },
        totals: { total: 0, with_issue: 0, ok_marked: 0, pending: 0 },
        groups: {
          setup_anulado: [], otimizacao_fora_meta: [], evidencia_faltando: [],
          admin_flagged_issue: [], all_ok: [],
        },
      });
    }

    const tokens = campaigns.map(c => c.short_token);

    // 2. Batch: métricas (display + video) — pra computeBonus + over check
    const metricsByToken = {};
    try {
      const [perfRows, contractedRows] = await Promise.all([
        query(
          `SELECT short_token,
             SUM(IF(LOWER(media_type) = 'display', impressions, 0))           AS display_imps,
             SUM(IF(LOWER(media_type) = 'display', viewable_impressions, 0))  AS display_viewable,
             SUM(IF(LOWER(media_type) = 'display', clicks, 0))                AS display_clicks,
             SUM(IF(LOWER(media_type) = 'display', total_cost, 0))            AS display_cost,
             SUM(IF(LOWER(media_type) = 'video',   video_starts, 0))            AS video_starts,
             SUM(IF(LOWER(media_type) = 'video',   video_view_100_complete, 0)) AS video_completions,
             SUM(IF(LOWER(media_type) = 'video',   total_cost, 0))              AS video_cost
           FROM \`site-hypr.prod_assets.unified_daily_performance_metrics\`
           WHERE short_token IN UNNEST(@toks)
             AND LOWER(IFNULL(line_name, '')) NOT LIKE '%survey%'
             AND LOWER(IFNULL(line_name, '')) NOT LIKE '%controle%'
             AND LOWER(IFNULL(line_name, '')) NOT LIKE '%exposto%'
           GROUP BY short_token`,
          { toks: tokens }, 'US'
        ),
        query(
          `SELECT short_token,
             IFNULL(o2o_display_impressions, 0) + IFNULL(bonus_o2o_display_impressions, 0)
             + IFNULL(ooh_display_impressions, 0) + IFNULL(bonus_ooh_display_impressions, 0)
             AS display_contracted
           FROM ${tableRef('commplan_checklists')}
           WHERE short_token IN UNNEST(@toks)`,
          { toks: tokens }
        ),
      ]);

      const contractedMap = {};
      for (const r of contractedRows) contractedMap[r.short_token] = Number(r.display_contracted) || 0;

      const clientByToken = {};
      for (const c of campaigns) clientByToken[c.short_token] = c.client_name;

      for (const r of perfRows) {
        const displayContracted = contractedMap[r.short_token] || 0;
        const displayImps = Number(r.display_imps) || 0;
        const displayViewable = Number(r.display_viewable) || 0;
        const displayClicks = Number(r.display_clicks) || 0;
        const displayCost = Number(r.display_cost) || 0;
        const videoStarts = Number(r.video_starts) || 0;
        const videoCompletions = Number(r.video_completions) || 0;
        const videoCost = Number(r.video_cost) || 0;

        const usesTotalImps = await isOverException(clientByToken[r.short_token]);
        const overNumerator = usesTotalImps ? displayImps : displayViewable;
        const totalValue = Number(campaigns.find(c => c.short_token === r.short_token)?.total_value) || 0;

        metricsByToken[r.short_token] = {
          ecpm: displayImps > 0 ? (displayCost / displayImps) * 1000 : 0,
          ctr: displayViewable > 0 ? displayClicks / displayViewable : 0,
          over_percent: displayContracted > 0 ? ((overNumerator / displayContracted) - 1) * 100 : 0,
          over_uses_total_imps: usesTotalImps,
          display_impressions: displayImps,
          display_viewable: displayViewable,
          display_clicks: displayClicks,
          display_cost: displayCost,
          display_contracted: displayContracted,
          video_starts: videoStarts,
          video_completions: videoCompletions,
          video_cost: videoCost,
          video_vtr_pct: videoStarts > 0 ? (videoCompletions / videoStarts) * 100 : 0,
          video_tech_cost_pct: totalValue > 0 ? (videoCost / totalValue) * 100 : 0,
        };
      }
    } catch (e) {
      console.warn('audit batch metrics:', e.message);
    }

    // 3. Estuda info (em paralelo)
    const studiesByToken = {};
    await Promise.all(campaigns.map(async (c) => {
      try {
        studiesByToken[c.short_token] = await resolveStudiesInfo(c, c.study_assignee, c.study_id_override);
      } catch (_) {
        studiesByToken[c.short_token] = [];
      }
    }));

    // 4. Processa cada campanha
    const enriched = campaigns.map(c => {
      let mc = {};
      let ao = {};
      try { mc = c.manual_checks ? JSON.parse(c.manual_checks) : {}; } catch (_) {}
      try { ao = c.admin_overrides ? JSON.parse(c.admin_overrides) : {}; } catch (_) {}

      const metrics = metricsByToken[c.short_token] || null;
      const studiesInfo = studiesByToken[c.short_token] || [];

      const breakdown = computeBonus(c, mc, metrics, ao, {
        preAssignee: c.pre_assignee || null,
        csOwner: c.cs_email,
        studiesInfo,
      });

      // ─── SETUP STATUS ────────────────────────────────────────────────
      const setupVal = breakdown.setup_validation || { invalidated: false, reason: null, pending: false };
      const overPct = metrics ? Number(metrics.over_percent) || 0 : 0;
      const setup = {
        status: setupVal.invalidated ? 'invalid' : (setupVal.pending ? 'pending' : 'valid'),
        over_pct: overPct,
        reason: setupVal.reason || null,
        display_viewable: metrics?.display_viewable || 0,
        display_contracted: metrics?.display_contracted || 0,
      };

      // ─── OTIMIZAÇÃO STATUS ────────────────────────────────────────────
      // Conta categoria 'optimization' do breakdown
      const optCat = breakdown.by_category?.optimization;
      let optEarned = 0;
      let optTotal = 0;
      const optDetails = [];
      if (optCat?.items) {
        for (const it of optCat.items) {
          if (!it.applicable) continue;
          optTotal += 1;
          if (it.earned) optEarned += 1;
          optDetails.push({
            id: it.id,
            label: it.label,
            earned: !!it.earned,
            reason: it.reason || null,
          });
        }
      }
      const optimization = {
        earned: optEarned,
        total: optTotal,
        ok: optTotal > 0 && optEarned === optTotal,
        details: optDetails,
        ecpm: metrics?.ecpm || 0,
        ctr: metrics?.ctr || 0,
        video_vtr_pct: metrics?.video_vtr_pct || 0,
        video_tech_cost_pct: metrics?.video_tech_cost_pct || 0,
      };

      // ─── EVIDÊNCIAS STATUS ────────────────────────────────────────────
      // Pra cada categoria do catalog, vê quais items earned precisam de link
      // shared_evidence: 1 link cobre todos earned daquela categoria
      // item-level needs_evidence: cada earned precisa do próprio link
      const evidenceMap = mc.__evidence || {};
      const evItems = [];      // items que tem link
      const evMissing = [];    // items que precisam mas falta link
      let evFilled = 0;
      let evTotal = 0;

      for (const [catKey, cat] of Object.entries(COMPPLAN_CATALOG)) {
        const catBreakdown = breakdown.by_category?.[catKey];
        if (!catBreakdown?.items) continue;

        // Tem shared_evidence? Se sim, 1 link cobre todos earned dessa categoria
        if (cat.shared_evidence) {
          const anyEarned = catBreakdown.items.some(i => i.earned);
          if (anyEarned) {
            evTotal += 1;
            const link = evidenceMap[cat.shared_evidence.key] || '';
            if (link) {
              evFilled += 1;
              evItems.push({ id: cat.shared_evidence.key, label: cat.shared_evidence.label, url: link });
            } else {
              evMissing.push({ id: cat.shared_evidence.key, label: cat.shared_evidence.label });
            }
          }
        }

        // Items individuais com needs_evidence
        for (const it of catBreakdown.items) {
          if (!it.earned || !it.needs_evidence) continue;
          evTotal += 1;
          const link = evidenceMap[it.id] || '';
          if (link) {
            evFilled += 1;
            evItems.push({ id: it.id, label: it.label, url: link });
          } else {
            evMissing.push({ id: it.id, label: it.label });
          }
        }
      }

      const evidences = {
        filled: evFilled,
        total: evTotal,
        ok: evTotal === 0 || evFilled === evTotal,
        items: evItems,
        missing: evMissing,
      };

      // ─── AUDIT MARK (já marcado por admin?) ────────────────────────────
      let auditMark = null;
      if (mc.__audit_status) {
        auditMark = {
          status: mc.__audit_status,
          at: mc.__audit_at || null,
          by: mc.__audit_by || null,
          notes: mc.__audit_notes || null,
        };
      }

      return {
        short_token: c.short_token,
        client_name: c.client_name,
        campaign_name: c.campaign_name,
        cs_email: c.cs_email,
        cs_name: c.cs_name,
        cp_name: c.cp_name,
        agency: c.agency,
        start_date: c.start_date?.value || c.start_date,
        end_date: c.end_date?.value || c.end_date,
        is_legacy: !!c.is_legacy,
        setup,
        optimization,
        evidences,
        audit_mark: auditMark,
        review_decision: mc.__review_decision || null,
      };
    });

    // 5. Agrupa por status
    // Lógica: se admin já marcou 'ok' → all_ok (some da lista). 'issue' → admin_flagged_issue.
    // Se sem marca: agrupa pelo problema (uma campanha pode ter múltiplos — vai pro mais grave).
    const groups = {
      setup_anulado: [],
      otimizacao_fora_meta: [],
      evidencia_faltando: [],
      admin_flagged_issue: [],
      all_ok: [],
    };

    for (const c of enriched) {
      if (c.audit_mark?.status === 'ok') {
        groups.all_ok.push(c);
        continue;
      }
      if (c.audit_mark?.status === 'issue') {
        groups.admin_flagged_issue.push(c);
        continue;
      }

      // Sem marca: aplica ordem de gravidade (mesma prioridade — primeiro que bater)
      if (c.setup.status === 'invalid') {
        groups.setup_anulado.push(c);
      } else if (!c.optimization.ok) {
        groups.otimizacao_fora_meta.push(c);
      } else if (!c.evidences.ok) {
        groups.evidencia_faltando.push(c);
      } else {
        groups.all_ok.push(c);
      }
    }

    // Dentro de cada grupo, ordena por data desc (mais recente primeiro)
    for (const k of Object.keys(groups)) {
      groups[k].sort((a, b) => (b.end_date || '').localeCompare(a.end_date || ''));
    }

    const totals = {
      total: enriched.length,
      with_issue: groups.setup_anulado.length + groups.otimizacao_fora_meta.length
                + groups.evidencia_faltando.length + groups.admin_flagged_issue.length,
      ok_marked: groups.all_ok.length,
      pending: enriched.filter(c => !c.audit_mark).length,
    };

    res.json({
      quarter,
      period: { start: startDate, end: endDate },
      totals,
      groups,
    });
  } catch (err) {
    console.error('GET /admin/audit/:q error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * PUT /admin/audit/:token/mark
 *
 * Body: { status: 'ok'|'issue'|null, notes?: string }
 *
 *  - status='ok'    → marca como OK (some da lista de pendentes)
 *  - status='issue' → marca como problema. notes obrigatório (>=5 chars)
 *  - status=null    → desfaz a marcação
 *
 *  Persiste em manual_checks.__audit_*.
 *  Notes (quando issue) aparece pro CS no painel dele e na página da campanha.
 */
router.put('/:token/mark', async (req, res) => {
  try {
    const { token } = req.params;
    const status = req.body?.status;
    const notes = (req.body?.notes || '').trim();
    const adminEmail = (req.user?.email || 'system').toLowerCase();

    // Validação
    if (status !== null && status !== 'ok' && status !== 'issue') {
      return res.status(400).json({ error: 'status deve ser "ok", "issue" ou null' });
    }
    if (status === 'issue' && notes.length < 5) {
      return res.status(400).json({ error: 'notes obrigatório (mínimo 5 caracteres) quando status="issue"' });
    }

    // Descobre tabela e checa que campanha existe + está finalizada
    const [meta] = await query(
      `SELECT is_legacy, end_date
       FROM ${tableRef('commplan_checklists')}
       WHERE short_token = @t LIMIT 1`,
      { t: token }
    );
    if (!meta) return res.status(404).json({ error: 'campanha não encontrada' });

    const tableName = meta.is_legacy ? 'commplan_legacy_assignments' : 'commplan_command_overrides';

    // Lê manual_checks atual — pode não existir registro ainda
    const [existing] = await query(
      `SELECT manual_checks FROM ${tableRef(tableName)}
       WHERE short_token = @t LIMIT 1`,
      { t: token }
    );

    let mc = {};
    if (existing) {
      try { mc = existing.manual_checks ? JSON.parse(existing.manual_checks) : {}; } catch (_) {}
    }

    // Aplica
    if (status === null) {
      delete mc.__audit_status;
      delete mc.__audit_at;
      delete mc.__audit_by;
      delete mc.__audit_notes;
    } else {
      mc.__audit_status = status;
      mc.__audit_at = new Date().toISOString();
      mc.__audit_by = adminEmail;
      if (status === 'issue') {
        mc.__audit_notes = notes;
      } else {
        delete mc.__audit_notes; // OK não tem notes
      }
    }

    // Upsert (override ou legacy)
    const mcJson = JSON.stringify(mc);
    if (existing) {
      await query(
        `UPDATE ${tableRef(tableName)}
         SET manual_checks = @mc, updated_at = CURRENT_TIMESTAMP(), updated_by = @by
         WHERE short_token = @t`,
        { t: token, by: adminEmail, mc: mcJson }
      );
    } else if (!meta.is_legacy) {
      // Cria registro novo no override (legacy precisa de CS atribuído antes, não posso inferir)
      await query(
        `INSERT INTO ${tableRef('commplan_command_overrides')}
           (short_token, manual_checks, admin_overrides, reviewed,
            created_at, updated_at, updated_by)
         VALUES (@t, @mc, '{}', FALSE, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP(), @by)`,
        { t: token, by: adminEmail, mc: mcJson }
      );
    } else {
      return res.status(400).json({ error: 'campanha legacy sem CS atribuído — atribua primeiro' });
    }

    await logAudit({
      entityType: 'audit_mark',
      entityId: token,
      action: status === null ? 'clear' : status,
      changedBy: adminEmail,
      after: { status, notes: status === 'issue' ? notes : null },
    });

    res.json({
      ok: true,
      short_token: token,
      audit_mark: status === null ? null : {
        status,
        at: mc.__audit_at,
        by: mc.__audit_by,
        notes: status === 'issue' ? notes : null,
      },
    });
  } catch (err) {
    console.error('PUT /admin/audit/:token/mark error:', err);
    res.status(500).json({ error: err.message });
  }
});
