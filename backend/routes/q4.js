/**
 * routes/q4.js — integrações da versão 2026-Q4 na tela da campanha.
 *
 *   GET    /commplan/me/campaign/:token/decks?q=     decks do cliente (HYPR Library / Audience Discovery)
 *   POST   /commplan/me/campaign/:token/pre-deck      { deck_id } escolhe o deck e detecta as features ofertadas
 *   DELETE /commplan/me/campaign/:token/pre-deck
 *   POST   /commplan/me/campaign/:token/pv-meeting    { access_token, event_id, calendar_id? } vincula a reunião
 *   DELETE /commplan/me/campaign/:token/pv-meeting
 *
 * O deck e a reunião são lidos pelo servidor (Library no BigQuery; Google
 * Calendar com o token do próprio CS, usado uma vez e descartado) e gravados
 * como snapshot em manual_checks — o navegador não consegue forjá-los.
 */

import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { query, tableRef } from '../lib/bigquery.js';
import { logAudit } from '../lib/audit.js';
import { resolveStageAssignees } from '../engine/compplan-engine.js';
import { resolveCatalogVersion, VERSION_2026_Q4, detectDeckFeatures2026Q4 } from '../engine/compplan-catalog.js';
import { readManualChecks, patchManualChecks } from '../lib/manual-checks.js';

export const router = Router();
router.use(authRequired);

// Índice da Library: taxonomia (hyprops_app.library_decks_*) com fallback
// para os nomes antigos (biblioteca.decks_*).
const LIBRARY_PREFIXES = (process.env.LIBRARY_TABLE_PREFIXES ||
  'site-hypr.hyprops_app.library_decks_,site-hypr.biblioteca.decks_').split(',').map(s => s.trim()).filter(Boolean);

async function libraryQuery(build, params) {
  let lastErr = null;
  for (const prefix of LIBRARY_PREFIXES) {
    try { return await query(build(prefix), params); } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

const NORM = (col) => `LOWER(REGEXP_REPLACE(NORMALIZE(IFNULL(${col}, ''), NFD), r'\\pM', ''))`;
const normJs = (s) => String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Carrega a campanha e confere se o usuário pode mexer na etapa. */
async function loadForStage(req, res, stage) {
  const me = (req.user?.email || '').toLowerCase();
  const isAdmin = req.user?.role === 'admin';
  const [campaign] = await query(
    `SELECT short_token, cs_email, client_name, start_date, end_date, is_legacy
     FROM ${tableRef('commplan_checklists')} WHERE short_token = @t LIMIT 1`,
    { t: req.params.token }
  );
  if (!campaign) { res.status(404).json({ error: 'Campanha não encontrada' }); return null; }
  if (resolveCatalogVersion(campaign.start_date) !== VERSION_2026_Q4) {
    res.status(400).json({ error: 'Disponível só para campanhas da versão 2026-Q4' }); return null;
  }
  const current = await readManualChecks(campaign.short_token, !!campaign.is_legacy);
  const assignees = resolveStageAssignees(current.adminOverrides, current.preAssignee);
  const isOwner = (campaign.cs_email || '').toLowerCase() === me;
  const allowed = isAdmin || (assignees[stage] ? assignees[stage] === me : isOwner);
  if (!allowed) { res.status(403).json({ error: 'Sem permissão para esta etapa' }); return null; }
  return { campaign, me, isAdmin };
}

// ── Decks do cliente ─────────────────────────────────────────────────────
router.get('/campaign/:token/decks', async (req, res) => {
  try {
    const ctx = await loadForStage(req, res, 'pre_campaign');
    if (!ctx) return;
    const q = normJs(req.query.q || ctx.campaign.client_name);
    const terms = q.split(/\s+/).filter(t => t.length >= 2).slice(0, 4);
    if (terms.length === 0) return res.json({ items: [] });
    const where = terms.map((_, i) => `(${NORM('client')} LIKE @t${i} OR ${NORM('title')} LIKE @t${i})`).join(' AND ');
    const params = Object.fromEntries(terms.map((t, i) => [`t${i}`, `%${t}%`]));
    const rows = await libraryQuery(p => `
      SELECT deck_id, client, title, drive_url, created_time, modified_time, owner_name
      FROM \`${p}metadata\`
      WHERE ${where}
      ORDER BY modified_time DESC
      LIMIT 40`, params);
    res.json({
      items: rows.map(r => ({
        deck_id: r.deck_id, client: r.client, title: r.title, url: r.drive_url,
        created_time: r.created_time?.value || r.created_time || null,
        modified_time: r.modified_time?.value || r.modified_time || null,
        owner_name: r.owner_name || null,
      })),
    });
  } catch (e) {
    console.error('decks:', e);
    res.status(502).json({ error: 'Não foi possível consultar a HYPR Library agora.' });
  }
});

// ── Escolher o deck da pré-campanha ──────────────────────────────────────
router.post('/campaign/:token/pre-deck', async (req, res) => {
  try {
    const ctx = await loadForStage(req, res, 'pre_campaign');
    if (!ctx) return;
    const deckId = String(req.body?.deck_id || '').trim();
    if (!deckId) return res.status(400).json({ error: 'deck_id obrigatório' });

    const [meta] = await libraryQuery(p => `
      SELECT m.deck_id, m.client, m.title, m.drive_url, m.created_time, m.modified_time, c.full_text
      FROM \`${p}metadata\` m
      LEFT JOIN \`${p}content\` c ON c.deck_id = m.deck_id
      WHERE m.deck_id = @id LIMIT 1`, { id: deckId });
    if (!meta) return res.status(404).json({ error: 'Deck não encontrado no índice da Library' });

    const snapshot = {
      deck_id: meta.deck_id,
      client: meta.client,
      title: meta.title,
      url: meta.drive_url || `https://docs.google.com/presentation/d/${meta.deck_id}`,
      created_time: meta.created_time?.value || meta.created_time || null,
      modified_time: meta.modified_time?.value || meta.modified_time || null,
      offered_features: detectDeckFeatures2026Q4(`${meta.title || ''}\n${meta.full_text || ''}`),
      text_indexed: !!meta.full_text,
      linked_by: ctx.me,
      linked_at: new Date().toISOString(),
    };
    const mc = await patchManualChecks({
      shortToken: ctx.campaign.short_token, isLegacy: !!ctx.campaign.is_legacy,
      ownerEmail: ctx.campaign.cs_email, byEmail: ctx.me,
      mutate: (m) => ({ ...m, __pre_deck: snapshot, __evidence: { ...(m.__evidence || {}), pre_campaign: snapshot.url } }),
    });
    await logAudit({ entityType: 'campaign', entityId: ctx.campaign.short_token, action: 'link_pre_deck', changedBy: ctx.me, after: snapshot }).catch(() => {});
    res.json({ ok: true, pre_deck: mc.__pre_deck });
  } catch (e) {
    console.error('pre-deck:', e);
    res.status(500).json({ error: 'Falha ao vincular o deck.' });
  }
});

router.delete('/campaign/:token/pre-deck', async (req, res) => {
  try {
    const ctx = await loadForStage(req, res, 'pre_campaign');
    if (!ctx) return;
    await patchManualChecks({
      shortToken: ctx.campaign.short_token, isLegacy: !!ctx.campaign.is_legacy,
      ownerEmail: ctx.campaign.cs_email, byEmail: ctx.me,
      mutate: (m) => { const n = { ...m }; delete n.__pre_deck; return n; },
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('pre-deck delete:', e);
    res.status(500).json({ error: 'Falha ao desvincular o deck.' });
  }
});

// ── Reunião de pós-venda (Google Calendar) ──────────────────────────────
async function googleGet(url, accessToken) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!r.ok) throw Object.assign(new Error(`Google ${r.status}`), { status: r.status });
  return r.json();
}

router.post('/campaign/:token/pv-meeting', async (req, res) => {
  try {
    const ctx = await loadForStage(req, res, 'account_mgmt');
    if (!ctx) return;
    const { access_token: accessToken, event_id: eventId } = req.body || {};
    const calendarId = String(req.body?.calendar_id || 'primary');
    if (!accessToken || !eventId) return res.status(400).json({ error: 'access_token e event_id obrigatórios' });

    let tokenEmail = null;
    try {
      const info = await googleGet(`https://oauth2.googleapis.com/tokeninfo?access_token=${encodeURIComponent(accessToken)}`, accessToken);
      tokenEmail = (info.email || '').toLowerCase();
    } catch (_) { /* token sem escopo de e-mail: segue sem o dono */ }
    if (tokenEmail && !tokenEmail.endsWith('@hypr.mobi')) {
      return res.status(403).json({ error: 'Use a sua agenda @hypr.mobi.' });
    }

    let ev;
    try {
      ev = await googleGet(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
        accessToken
      );
    } catch (e) {
      return res.status(400).json({ error: e.status === 404 ? 'Evento não encontrado na agenda.' : 'Não foi possível ler o evento na agenda Google.' });
    }

    const attendees = Array.isArray(ev.attendees) ? ev.attendees : [];
    const external = attendees.filter(a => a.email && !a.resource && a.responseStatus !== 'declined'
      && !/@hypr\.mobi$/i.test(a.email));
    const meeting = {
      event_id: ev.id,
      calendar_id: calendarId,
      summary: ev.summary || '(sem título)',
      start: ev.start?.dateTime || ev.start?.date || null,
      end: ev.end?.dateTime || ev.end?.date || null,
      status: ev.status || null,
      html_link: ev.htmlLink || null,
      attendees_count: attendees.length,
      external_attendees: external.length,
      external_domains: [...new Set(external.map(a => a.email.split('@')[1].toLowerCase()))].slice(0, 10),
      owner_email: tokenEmail,
      linked_by: ctx.me,
      linked_at: new Date().toISOString(),
    };
    await patchManualChecks({
      shortToken: ctx.campaign.short_token, isLegacy: !!ctx.campaign.is_legacy,
      ownerEmail: ctx.campaign.cs_email, byEmail: ctx.me,
      mutate: (m) => ({ ...m, __pv_meeting: meeting, am_pv_meeting: true }),
    });
    await logAudit({ entityType: 'campaign', entityId: ctx.campaign.short_token, action: 'link_pv_meeting', changedBy: ctx.me, after: meeting }).catch(() => {});
    res.json({ ok: true, pv_meeting: meeting });
  } catch (e) {
    console.error('pv-meeting:', e);
    res.status(500).json({ error: 'Falha ao vincular a reunião.' });
  }
});

router.delete('/campaign/:token/pv-meeting', async (req, res) => {
  try {
    const ctx = await loadForStage(req, res, 'account_mgmt');
    if (!ctx) return;
    await patchManualChecks({
      shortToken: ctx.campaign.short_token, isLegacy: !!ctx.campaign.is_legacy,
      ownerEmail: ctx.campaign.cs_email, byEmail: ctx.me,
      mutate: (m) => { const n = { ...m }; delete n.__pv_meeting; delete n.am_pv_meeting; return n; },
    });
    res.json({ ok: true });
  } catch (e) {
    console.error('pv-meeting delete:', e);
    res.status(500).json({ error: 'Falha ao desvincular a reunião.' });
  }
});
