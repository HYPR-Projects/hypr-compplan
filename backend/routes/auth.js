/**
 * routes/auth.js — login/refresh.
 */

import { Router } from 'express';
import { verifyGoogleIdToken, issueJwt, extractBearerToken, decodeAndVerifyJwt } from '../lib/auth.js';
import { query, tableRef, sourceTableRef } from '../lib/bigquery.js';

export const router = Router();

/**
 * POST /auth/login
 * Headers: Authorization: Bearer <google_id_token>
 *
 * Resposta: { jwt, email, role }
 */
router.post('/login', async (req, res) => {
  const idToken = extractBearerToken(req);
  if (!idToken) return res.status(401).json({ error: 'Google id_token obrigatório no Authorization' });

  const verified = await verifyGoogleIdToken(idToken);
  if (!verified) {
    return res.status(401).json({ error: 'Google id_token inválido ou e-mail não é @hypr.mobi' });
  }

  const email = verified.email;

  // Determina o role consultando team_members
  // Padrão: se está em team_members com role='admin' → admin
  //         se cs_email aparece em pelo menos 1 checklist → cs
  //         senão → 403
  const teamRows = await query(
    `SELECT role, active FROM ${tableRef('compplan_team')}
     WHERE LOWER(email) = LOWER(@e) LIMIT 1`,
    { e: email }
  );

  let role = null;
  if (teamRows.length > 0 && teamRows[0].active !== false) {
    if (teamRows[0].role === 'admin') role = 'admin';
  }

  if (!role) {
    // Tenta CS: aparece como cs_email em algum checklist?
    const csRows = await query(
      `SELECT 1 FROM ${sourceTableRef('checklists')}
       WHERE LOWER(cs_email) = LOWER(@e) LIMIT 1`,
      { e: email }
    );
    if (csRows.length > 0) role = 'cs';
  }

  if (!role) {
    return res.status(403).json({
      error: 'Você não tem acesso ao Commplan. Fale com um administrador.',
    });
  }

  const jwt = issueJwt({ email, role });
  return res.json({ jwt, email, role });
});

/**
 * POST /auth/refresh
 * Headers: Authorization: Bearer <expired_or_valid_custom_jwt>
 *
 * Não recomendado em produção sem refresh token — mais seguro o frontend
 * fazer login Google de novo (silent OAuth). Endpoint serve só pra estender
 * sessão dentro do TTL.
 */
router.post('/refresh', (req, res) => {
  const token = extractBearerToken(req);
  if (!token) return res.status(401).json({ error: 'token obrigatório' });

  const payload = decodeAndVerifyJwt(token);
  if (!payload) return res.status(401).json({ error: 'token inválido ou expirado' });

  const newJwt = issueJwt({ email: payload.sub, role: payload.role });
  return res.json({ jwt: newJwt, email: payload.sub, role: payload.role });
});
