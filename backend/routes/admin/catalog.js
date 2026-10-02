/**
 * routes/admin/catalog.js — tela "Etapas & regras" (catálogo 2026-Q4).
 *
 *   GET  /commplan/admin/catalog          catálogo efetivo + o do código + ajustes
 *   PUT  /commplan/admin/catalog/item     { category, item_id, label?, pct?, active?, card_what?, card_obs? }
 *   POST /commplan/admin/catalog/item     { category, label, pct, card_what?, card_obs? }  (item manual novo)
 *
 * Só vale para a versão 2026-Q4. Q3 e anteriores não mudam. Regras
 * automáticas (de onde vem cada dado) continuam no código.
 */

import { Router } from 'express';
import { authRequired, adminRequired } from '../../middleware/auth.js';
import { logAudit } from '../../lib/audit.js';
import { COMPPLAN_CATALOG_2026Q4, getCatalog, VERSION_2026_Q4 } from '../../engine/compplan-catalog.js';
import { listCatalogOverrides, saveCatalogOverride, refreshCatalogOverridesIfStale } from '../../data/catalog-overrides.js';

export const router = Router();
router.use(authRequired, adminRequired);

const slim = (catalog) => Object.fromEntries(Object.entries(catalog).map(([k, c]) => [k, {
  label: c.label,
  items: c.items.map(i => ({ id: i.id, label: i.label, pct: i.pct, source: i.source, card: i.card || null, custom: !!i.custom })),
}]));

router.get('/', async (req, res) => {
  try {
    await refreshCatalogOverridesIfStale(true);
    const overrides = await listCatalogOverrides();
    res.json({
      version: VERSION_2026_Q4,
      effective: slim(getCatalog(VERSION_2026_Q4)),
      base: slim(COMPPLAN_CATALOG_2026Q4),
      overrides: overrides.map(o => ({ ...o, updated_at: o.updated_at?.value || o.updated_at })),
    });
  } catch (e) {
    console.error('admin catalog:', e);
    res.status(500).json({ error: 'Falha ao carregar o catálogo' });
  }
});

function cleanPct(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0 || n > 0.05) throw new Error('% inválido (use fração: 0,20% = 0.002)');
  return n;
}

router.put('/item', async (req, res) => {
  try {
    const { category, item_id, label, pct, active, card_what, card_obs } = req.body || {};
    if (!category || !item_id || !COMPPLAN_CATALOG_2026Q4[category]) {
      return res.status(400).json({ error: 'category e item_id obrigatórios' });
    }
    const row = {
      category, item_id,
      label: label ? String(label).slice(0, 200) : null,
      pct: cleanPct(pct),
      active: typeof active === 'boolean' ? active : null,
      card_what: card_what ? String(card_what).slice(0, 1000) : null,
      card_obs: card_obs ? String(card_obs).slice(0, 1000) : null,
      is_new: String(item_id).startsWith('custom_'),
    };
    await saveCatalogOverride(row, req.user.email);
    await logAudit({ entityType: 'catalog_2026q4', entityId: item_id, action: 'update', changedBy: req.user.email, after: row }).catch(() => {});
    res.json({ ok: true, effective: slim(getCatalog(VERSION_2026_Q4)) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

router.post('/item', async (req, res) => {
  try {
    const { category, label, pct, card_what, card_obs } = req.body || {};
    if (!category || !COMPPLAN_CATALOG_2026Q4[category] || !label) {
      return res.status(400).json({ error: 'category e label obrigatórios' });
    }
    const slug = String(label).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
      .replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
    const row = {
      category,
      item_id: `custom_${slug}_${Date.now().toString(36)}`,
      label: String(label).slice(0, 200),
      pct: cleanPct(pct) ?? 0,
      active: true,
      card_what: card_what ? String(card_what).slice(0, 1000) : null,
      card_obs: card_obs ? String(card_obs).slice(0, 1000) : null,
      is_new: true,
    };
    await saveCatalogOverride(row, req.user.email);
    await logAudit({ entityType: 'catalog_2026q4', entityId: row.item_id, action: 'create', changedBy: req.user.email, after: row }).catch(() => {});
    res.json({ ok: true, item_id: row.item_id, effective: slim(getCatalog(VERSION_2026_Q4)) });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});
