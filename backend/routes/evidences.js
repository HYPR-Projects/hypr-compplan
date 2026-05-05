/**
 * routes/evidences.js — CS submete evidências manuais.
 */

import { Router } from 'express';
import { authRequired } from '../middleware/auth.js';
import {
  createEvidence, updateEvidence, deleteEvidence, getEvidenceById,
} from '../data/evidences.js';
import { getChecklistByShortToken } from '../data/checklists.js';
import { getRuleById } from '../data/rules.js';

export const router = Router();
router.use(authRequired);

/**
 * POST /commplan/evidences
 * Body: { short_token, rule_id, evidence_payload }
 *
 * Validações:
 *   - rule existe e é manual ou hybrid
 *   - cs_email do checklist = req.user.email (CS só claima nas suas)
 */
router.post('/', async (req, res) => {
  try {
    const { short_token, rule_id, evidence_payload } = req.body;
    if (!short_token || !rule_id) {
      return res.status(400).json({ error: 'short_token e rule_id obrigatórios' });
    }

    const rule = await getRuleById(rule_id);
    if (!rule) return res.status(404).json({ error: 'regra não encontrada' });
    if (!['manual', 'hybrid'].includes(rule.evaluation_mode)) {
      return res.status(400).json({ error: 'esta regra é avaliada automaticamente — não aceita claim' });
    }

    const checklist = await getChecklistByShortToken(short_token);
    if (!checklist) return res.status(404).json({ error: 'campanha não encontrada' });

    // CS só claima na própria campanha (admin pode em qualquer)
    if (req.user.role !== 'admin') {
      const owner = (checklist.cs_email || '').toLowerCase();
      if (owner !== req.user.email) {
        return res.status(403).json({ error: 'esta campanha não é sua' });
      }
    }

    const id = await createEvidence({
      shortToken: short_token,
      csEmail: req.user.email,
      ruleId: rule_id,
      evidencePayload: evidence_payload || {},
    });
    res.status(201).json({ ok: true, id });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * PUT /commplan/evidences/:id
 * Body: { evidence_payload }
 *
 * CS edita seu próprio claim (status=claimed). Após review, congela.
 */
router.put('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const evid = await getEvidenceById(id);
    if (!evid) return res.status(404).json({ error: 'evidência não encontrada' });

    if (req.user.role !== 'admin' && evid.cs_email !== req.user.email) {
      return res.status(403).json({ error: 'evidência de outro CS' });
    }

    await updateEvidence({ id, evidencePayload: req.body.evidence_payload });
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

/**
 * DELETE /commplan/evidences/:id
 */
router.delete('/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const evid = await getEvidenceById(id);
    if (!evid) return res.status(404).json({ error: 'evidência não encontrada' });

    if (req.user.role !== 'admin' && evid.cs_email !== req.user.email) {
      return res.status(403).json({ error: 'evidência de outro CS' });
    }

    await deleteEvidence(id);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
