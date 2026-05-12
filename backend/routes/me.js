/**
 * routes/me.js — endpoints do portal CS.
 *
 * NOTA: NÃO assume que commplan_checklists view foi atualizada com 'reviewed'.
 * Em vez disso, faz LEFT JOIN com commplan_command_overrides + commplan_legacy_assignments
 * direto no backend.
 */

import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { query, tableRef } from '../lib/bigquery.js';
import { parseQuarter } from '../engine/quarter-resolver.js';

export const router = Router();
router.use(authRequired);

const TAX_RATE = 0.1653;
const NET_FACTOR = 1 - TAX_RATE;

const FEATURES_CATALOG = {
  tier1: [
    'PDOOH', 'Survey', 'Tap to Go', 'Tap to Chat',
    'Tap to Max', 'Tap to Carousel', 'Tap to Scratch',
    'Tap to Map', 'Tap to Experience',
    'Purchase Context', 'HYPR Signals',
  ],
  tier2: [
    'Spotify', 'Seat', 'Map Intelligence', 'Downloaded apps',
    'Click to Calendar', 'Carbon Neutral', 'Attention Ad',
  ],
  tier3: [
    'TV Sync', 'HYPR Pass', 'Brand Query', 'Topics',
    'Weather', 'Twitch TV',
  ],
};

router.get('/features-catalog', (req, res) => {
  res.json({ catalog: FEATURES_CATALOG });
});

router.get('/studies-catalog', async (req, res) => {
  try {
    const items = await query(
      `SELECT id, display_name, status
       FROM ${tableRef('commplan_studies_catalog')}
       WHERE active = TRUE
       ORDER BY display_name`
    );
    res.json({ items });
  } catch (err) {
    console.error('GET /me/studies-catalog error:', err);
    res.json({ items: [] });
  }
});

// ── GET /me/dashboard/:q ───────────────────────────────────────────────
router.get('/dashboard/:q', async (req, res) => {
  try {
    const csEmail = (req.user?.email || '').toLowerCase();
    if (!csEmail) return res.status(401).json({ error: 'sem email no token' });

    const quarter = req.params.q;
    const { startDate, endDate } = parseQuarter(quarter);

    // Faz LEFT JOIN com overrides (command) e assignments (legacy) pra calcular `reviewed`
    const items = await query(
      `SELECT
         c.short_token,
         c.client_name,
         c.campaign_name,
         c.cp_name,
         c.agency,
         c.start_date,
         c.end_date,
         c.is_legacy,
         IFNULL(c.total_value, 0) AS bruto,
         CASE
           WHEN c.is_legacy = TRUE THEN
             CASE
               WHEN la.updated_at IS NOT NULL AND la.updated_at > la.attributed_at THEN TRUE
               ELSE FALSE
             END
           ELSE IFNULL(o.reviewed, FALSE)
         END AS reviewed,
         CASE
           WHEN c.is_legacy = TRUE THEN la.updated_at
           ELSE o.reviewed_at
         END AS reviewed_at
       FROM ${tableRef('commplan_checklists')} c
       LEFT JOIN ${tableRef('commplan_command_overrides')} o
         ON c.short_token = o.short_token
       LEFT JOIN ${tableRef('commplan_legacy_assignments')} la
         ON c.short_token = la.short_token
       WHERE LOWER(c.cs_email) = @cs
         AND c.start_date >= @s AND c.start_date <= @e
       ORDER BY reviewed ASC, c.start_date DESC`,
      { cs: csEmail, s: startDate, e: endDate }
    );

    const nCamp = items.length;
    const nReviewed = items.filter(r => r.reviewed === true).length;
    const bruto = items.reduce((sum, r) => sum + (Number(r.bruto) || 0), 0);

    res.json({
      quarter,
      cs_email: csEmail,
      kpis: {
        n_camp: nCamp,
        n_reviewed: nReviewed,
        n_pending: nCamp - nReviewed,
        bruto_total: bruto,
        liquido_total: bruto * NET_FACTOR,
        tax_rate: TAX_RATE,
      },
      items: items.map(r => {
        const b = Number(r.bruto) || 0;
        return {
          short_token: r.short_token,
          client_name: r.client_name,
          campaign_name: r.campaign_name,
          cp_name: r.cp_name,
          agency: r.agency,
          start_date: r.start_date?.value || r.start_date,
          end_date: r.end_date?.value || r.end_date,
          is_legacy: !!r.is_legacy,
          reviewed: !!r.reviewed,
          reviewed_at: r.reviewed_at?.value || r.reviewed_at,
          bruto: b,
          liquido: b * NET_FACTOR,
        };
      }),
    });
  } catch (err) {
    console.error('GET /me/dashboard error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /me/campaign/:token ────────────────────────────────────────────
router.get('/campaign/:token', async (req, res) => {
  try {
    const csEmail = (req.user?.email || '').toLowerCase();
    const isAdmin = req.user?.role === 'admin';
    const { token } = req.params;

    // Busca campanha da view + overrides + assignment
    const [row] = await query(
      `SELECT
         c.*,
         o.features_override,
         o.products_override,
         o.audiences_count    AS o_audiences_count,
         o.had_cs_meeting     AS o_had_meeting,
         o.studies_used       AS o_studies,
         o.notes              AS o_notes,
         o.reviewed,
         o.reviewed_at,
         la.audiences_count   AS la_audiences_count,
         la.notes             AS la_notes,
         la.updated_at        AS la_updated_at,
         la.attributed_at     AS la_attributed_at
       FROM ${tableRef('commplan_checklists')} c
       LEFT JOIN ${tableRef('commplan_command_overrides')} o
         ON c.short_token = o.short_token
       LEFT JOIN ${tableRef('commplan_legacy_assignments')} la
         ON c.short_token = la.short_token
       WHERE c.short_token = @t
       LIMIT 1`,
      { t: token }
    );

    if (!row) {
      return res.status(404).json({ error: `Campanha ${token} não encontrada` });
    }

    if (!isAdmin && (row.cs_email || '').toLowerCase() !== csEmail) {
      return res.status(403).json({ error: 'Sem permissão pra ver essa campanha' });
    }

    const bruto = Number(row.total_value) || 0;
    const isLegacy = !!row.is_legacy;

    // Resolve campos editáveis: override > checklist
    const features = (isLegacy ? (row.features || []) : (row.features_override || row.features || []));
    const products = (isLegacy ? (row.products || []) : (row.products_override || row.products || []));
    const studies = (isLegacy ? (row.studies_used || []) : (row.o_studies || row.studies_used || []));
    const audCount = isLegacy ? row.la_audiences_count : row.o_audiences_count;
    const hadMeeting = isLegacy ? row.had_cs_meeting : (row.o_had_meeting ?? row.had_cs_meeting);
    const notes = isLegacy ? row.la_notes : row.o_notes;

    // Reviewed status
    let reviewed = false;
    let reviewedAt = null;
    if (isLegacy) {
      reviewed = !!(row.la_updated_at && row.la_attributed_at && row.la_updated_at > row.la_attributed_at);
      reviewedAt = row.la_updated_at?.value || row.la_updated_at;
    } else {
      reviewed = !!row.reviewed;
      reviewedAt = row.reviewed_at?.value || row.reviewed_at;
    }

    res.json({
      short_token: row.short_token,
      is_legacy: isLegacy,
      reviewed,
      reviewed_at: reviewedAt,

      client_name: row.client_name,
      campaign_name: row.campaign_name,
      cp_name: row.cp_name,
      agency: row.agency,
      industry: row.industry,
      cs_email: row.cs_email,
      cs_name: row.cs_name,
      start_date: row.start_date?.value || row.start_date,
      end_date: row.end_date?.value || row.end_date,
      bruto,
      liquido: bruto * NET_FACTOR,
      tax_rate: TAX_RATE,
      formats: row.formats || [],
      audiences: row.audiences,

      features,
      products,
      studies_used: studies,
      had_cs_meeting: hadMeeting,
      audiences_count: audCount,
      notes,
    });
  } catch (err) {
    console.error('GET /me/campaign error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── PUT /me/campaign/:token ────────────────────────────────────────────
router.put('/campaign/:token', async (req, res) => {
  try {
    const csEmail = (req.user?.email || '').toLowerCase();
    const isAdmin = req.user?.role === 'admin';
    const { token } = req.params;
    const body = req.body || {};

    const [campaign] = await query(
      `SELECT short_token, cs_email, is_legacy
       FROM ${tableRef('commplan_checklists')}
       WHERE short_token = @t LIMIT 1`,
      { t: token }
    );

    if (!campaign) {
      return res.status(404).json({ error: `Campanha ${token} não encontrada` });
    }

    if (!isAdmin && (campaign.cs_email || '').toLowerCase() !== csEmail) {
      return res.status(403).json({ error: 'Sem permissão pra editar essa campanha' });
    }

    const features = Array.isArray(body.features) ? body.features : [];
    const products = Array.isArray(body.products) ? body.products : [];
    const studies = Array.isArray(body.studies_used) ? body.studies_used : [];
    const audCount = body.audiences_count != null ? Number(body.audiences_count) : null;
    const hadMeeting = typeof body.had_cs_meeting === 'boolean' ? body.had_cs_meeting : null;
    const notes = body.notes || null;
    const reviewed = body.reviewed !== false;

    if (campaign.is_legacy) {
      await query(
        `UPDATE ${tableRef('commplan_legacy_assignments')}
         SET features_manual = @features,
             products_manual = @products,
             studies_used = @studies,
             audiences_count = @audCount,
             had_cs_meeting = @hadMeeting,
             notes = @notes,
             updated_by = @csEmail,
             updated_at = CURRENT_TIMESTAMP()
         WHERE short_token = @token`,
        { features, products, studies, audCount, hadMeeting, notes, csEmail, token }
      );
    } else {
      await query(
        `MERGE ${tableRef('commplan_command_overrides')} T
         USING (SELECT @token AS short_token) S
         ON T.short_token = S.short_token
         WHEN MATCHED THEN UPDATE SET
           features_override = @features,
           products_override = @products,
           studies_used = @studies,
           audiences_count = @audCount,
           had_cs_meeting = @hadMeeting,
           notes = @notes,
           reviewed = @reviewed,
           reviewed_at = CURRENT_TIMESTAMP(),
           updated_at = CURRENT_TIMESTAMP(),
           updated_by = @csEmail
         WHEN NOT MATCHED THEN INSERT
           (short_token, cs_email, features_override, products_override,
            studies_used, audiences_count, had_cs_meeting, notes,
            reviewed, reviewed_at, created_at, updated_at, updated_by)
         VALUES
           (@token, @csEmail, @features, @products,
            @studies, @audCount, @hadMeeting, @notes,
            @reviewed, CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP(), CURRENT_TIMESTAMP(), @csEmail)`,
        { token, csEmail, features, products, studies, audCount, hadMeeting, notes, reviewed }
      );
    }

    res.json({ ok: true, reviewed });
  } catch (err) {
    console.error('PUT /me/campaign error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ── GET /me/history ────────────────────────────────────────────────────
router.get('/history', async (req, res) => {
  try {
    const csEmail = (req.user?.email || '').toLowerCase();
    if (!csEmail) return res.status(401).json({ error: 'sem email' });

    const items = await query(
      `SELECT
         CONCAT('Q', CAST(EXTRACT(QUARTER FROM start_date) AS STRING), '-',
                CAST(EXTRACT(YEAR FROM start_date) AS STRING))  AS quarter,
         EXTRACT(YEAR FROM start_date) AS year,
         EXTRACT(QUARTER FROM start_date) AS qnum,
         COUNT(*) AS n_camp,
         IFNULL(SUM(total_value), 0) AS bruto
       FROM ${tableRef('commplan_checklists')}
       WHERE LOWER(cs_email) = @cs
       GROUP BY year, qnum, quarter
       ORDER BY year DESC, qnum DESC`,
      { cs: csEmail }
    );

    res.json({
      items: items.map(r => {
        const b = Number(r.bruto) || 0;
        return {
          quarter: r.quarter,
          year: r.year,
          qnum: r.qnum,
          n_camp: r.n_camp || 0,
          bruto: b,
          liquido: b * NET_FACTOR,
        };
      }),
    });
  } catch (err) {
    console.error('GET /me/history error:', err);
    res.status(500).json({ error: err.message });
  }
});
