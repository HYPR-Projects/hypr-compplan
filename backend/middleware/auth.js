/**
 * middleware/auth.js — middlewares de autenticação e autorização.
 */

import { decodeAndVerifyJwt, extractBearerToken } from '../lib/auth.js';

/**
 * authRequired: verifica JWT válido. Anexa req.user = { email, role, admin }.
 * Responde 401 se faltar ou inválido.
 */
export function authRequired(req, res, next) {
  const token = extractBearerToken(req);
  if (!token) return res.status(401).json({ error: 'Authorization Bearer obrigatório' });

  const payload = decodeAndVerifyJwt(token);
  if (!payload) return res.status(401).json({ error: 'Token inválido ou expirado' });

  req.user = {
    email: (payload.sub || '').toLowerCase(),
    role: payload.role || (payload.admin ? 'admin' : 'cs'),
    admin: !!payload.admin,
  };
  next();
}

/**
 * adminRequired: precisa ser role='admin'. Use sempre depois de authRequired.
 */
export function adminRequired(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'autenticação necessária' });
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'acesso restrito a administradores' });
  }
  next();
}

/**
 * selfOrAdmin: permite acesso ao recurso se o user é admin OU é o próprio
 * dono (req.params.email === req.user.email). Útil pra rotas como
 * GET /commplan/me/quarter/:q.
 *
 * Caller deve setar req.targetEmail antes de invocar (ex: extraindo de params).
 */
export function selfOrAdmin(getTargetEmail) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'autenticação necessária' });
    if (req.user.role === 'admin') return next();
    const target = (getTargetEmail(req) || '').toLowerCase();
    if (target && target === req.user.email) return next();
    return res.status(403).json({ error: 'acesso restrito ao próprio CS ou admin' });
  };
}
