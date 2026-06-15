/**
 * routes/admin/studies.js — admin gerencia o catálogo de estudos.
 *
 * Endpoints:
 *   GET  /commplan/admin/studies?version=2026
 *   GET  /commplan/admin/studies/:id
 *   POST /commplan/admin/studies                 cria novo
 *   PUT  /commplan/admin/studies/:id             edita (autor, status, link, datas)
 *
 * Endpoint público (sem auth admin) pro Command consultar:
 *   GET  /commplan/studies/available?version=2026
 *   (mas esse fica em routes/studies.js, ver montagem em index.js)
 */

import { Router } from 'express';
import { authRequired, adminRequired } from '../../middleware/auth.js';
import { logAudit } from '../../lib/audit.js';
import {
  listStudies, getStudyByIdAdmin, createStudy, updateStudy,
} from '../../data/studies.js';
import { resolveVersion } from '../../lib/version-resolver.js';

export const router = Router();
// LEITURA TOTALMENTE ABERTA: GET / e GET /:id não exigem nem auth (catálogo público).
// Escrita (POST/PUT) protegida por authRequired + adminRequired localmente em cada rota.
//
// Justificativa: o catálogo de estudos não tem dado sensível — é só metadata
// (nome, autor, data, link). E precisa estar acessível a CSs sem fricção.

router.get('/', async (req, res) => {
  try {
    const versionId = req.query.version || await resolveVersion(new Date().toISOString().slice(0, 10));
    const items = await listStudies(versionId);
    res.json({ version_id: versionId, count: items.length, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const item = await getStudyByIdAdmin(req.params.id);
    if (!item) return res.status(404).json({ error: 'estudo não encontrado' });
    res.json(item);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/', authRequired, async (req, res) => {
  try {
    const { version_id, display_name, author_email, celebration_date,
            delivery_estimate, status, link_url, notes } = req.body;

    if (!version_id || !display_name || !author_email) {
      return res.status(400).json({
        error: 'version_id, display_name e author_email obrigatórios',
      });
    }

    const id = await createStudy({
      versionId: version_id,
      displayName: display_name,
      authorEmail: author_email,
      celebrationDate: celebration_date,
      deliveryEstimate: delivery_estimate,
      status: status || 'planejado',
      linkUrl: link_url,
      notes,
    });

    const created = await getStudyByIdAdmin(id);

    await logAudit({
      entityType: 'study',
      entityId: id,
      action: 'create',
      changedBy: req.user.email,
      after: created,
    });

    res.status(201).json({ ok: true, id, item: created });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.put('/:id', authRequired, adminRequired, async (req, res) => {
  try {
    const before = await getStudyByIdAdmin(req.params.id);
    if (!before) return res.status(404).json({ error: 'estudo não encontrado' });

    await updateStudy(req.params.id, req.body || {});
    const after = await getStudyByIdAdmin(req.params.id);

    await logAudit({
      entityType: 'study',
      entityId: req.params.id,
      action: 'update',
      changedBy: req.user.email,
      before,
      after,
    });

    res.json({ ok: true, item: after });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
