/**
 * routes/studies-public.js — endpoint consumido pelo HYPR Command.
 *
 * O frontend do Command (criação de PI) chama isso pra popular o
 * dropdown "Estudos Disponíveis" na seção 4 do checklist.
 *
 * Auth: somente JWT válido (qualquer role — CS ou admin). Sem admin
 * required porque o CP é quem usa, e CP atualmente loga via Command
 * com o mesmo padrão Google OAuth.
 *
 * Se o Command não tiver login Google ainda, removemos o authRequired
 * daqui — mas deixar protegido é mais seguro pra evitar enumeration.
 */

import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import { listAvailableStudies } from '../data/studies.js';
import { resolveVersion } from '../lib/version-resolver.js';

export const router = Router();

/**
 * GET /commplan/studies/available?version=2026
 *
 * Retorna estudos com status='feito' (já entregues) da versão ativa.
 * Retorna apenas campos necessários pro frontend renderizar:
 *   { id, display_name, author_email, celebration_date, link_url }
 */
router.get('/available', authRequired, async (req, res) => {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const versionId = req.query.version || await resolveVersion(today);
    const items = await listAvailableStudies(versionId);
    res.json({ version_id: versionId, count: items.length, items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
