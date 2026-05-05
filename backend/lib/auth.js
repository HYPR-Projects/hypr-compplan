/**
 * lib/auth.js — autenticação do Commplan
 *
 * Port direto do auth.py do Report Center (Python) pra Node, mantendo
 * compatibilidade BINÁRIA do JWT — mesmo JWT_SECRET = SSO entre Report
 * Center e Commplan.
 *
 * Fluxo
 * -----
 * 1. Frontend faz Google OAuth, recebe id_token (JWT do Google, ~1h).
 * 2. Frontend manda POST /auth/login com Authorization: Bearer <google_id_token>
 * 3. issueAdminToken:
 *    a. valida id_token via tokeninfo do Google
 *    b. confere @hypr.mobi
 *    c. consulta team_members.role pra decidir 'admin' vs 'cs'
 *    d. emite JWT custom HS256 (TTL 30min) com claim de role
 * 4. Requests subsequentes vão com Authorization: Bearer <jwt>
 * 5. Middleware verifica via decodeAndVerifyJwt
 *
 * Implementação HMAC-SHA256 com stdlib (crypto) — sem dependência externa,
 * mantém o package size pequeno e cold-start rápido.
 */

import crypto from 'crypto';
import https from 'https';

const JWT_SECRET = process.env.JWT_SECRET || '';
const JWT_TTL_SECONDS = 30 * 60;            // 30 min — mesmo do Report Center
const JWT_ISSUER = 'hypr-report-hub';        // mesmo issuer = JWT vale nos dois sistemas
const ADMIN_EMAIL_DOMAIN = '@hypr.mobi';

// ─── Base64url helpers ─────────────────────────────────────────────────────
function b64urlEncode(buf) {
  return Buffer.from(buf).toString('base64')
    .replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function b64urlDecode(str) {
  const pad = str.length % 4 === 0 ? '' : '='.repeat(4 - str.length % 4);
  const b64 = (str + pad).replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(b64, 'base64');
}

// ─── HS256 ────────────────────────────────────────────────────────────────
function signHs256(secret, msg) {
  return crypto.createHmac('sha256', secret).update(msg).digest();
}

function encodeJwt(payload, secret) {
  const header = { alg: 'HS256', typ: 'JWT' };
  const h = b64urlEncode(JSON.stringify(header));
  const p = b64urlEncode(JSON.stringify(payload));
  const sig = signHs256(secret, `${h}.${p}`);
  return `${h}.${p}.${b64urlEncode(sig)}`;
}

/**
 * Verifica assinatura, issuer e expiração. Retorna payload ou null.
 * Usa timingSafeEqual pra mitigar timing attack na comparação.
 */
export function decodeAndVerifyJwt(token, secret = JWT_SECRET) {
  if (!token || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [h, p, s] = parts;

  const expectedSig = signHs256(secret, `${h}.${p}`);
  let actualSig;
  try { actualSig = b64urlDecode(s); } catch { return null; }
  if (expectedSig.length !== actualSig.length) return null;
  if (!crypto.timingSafeEqual(expectedSig, actualSig)) return null;

  let payload;
  try { payload = JSON.parse(b64urlDecode(p).toString()); } catch { return null; }

  if (payload.iss !== JWT_ISSUER) return null;
  if (Number(payload.exp || 0) < Math.floor(Date.now() / 1000)) return null;

  return payload;
}

/**
 * Emite JWT custom pro usuário. Caller é responsável por já ter validado o
 * Google id_token e decidido o role.
 */
export function issueJwt({ email, role }) {
  if (!JWT_SECRET) throw new Error('JWT_SECRET environment variable is not set');
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iss: JWT_ISSUER,
    sub: email,
    role,                       // 'admin' | 'cs'
    admin: role === 'admin',    // mantido por compat com Report Center (que checa `admin`)
    iat: now,
    exp: now + JWT_TTL_SECONDS,
  };
  return encodeJwt(payload, JWT_SECRET);
}

/**
 * Valida Google id_token via tokeninfo. Retorna {email, email_verified, ...} ou null.
 *
 * Roda 1× por login (não em toda request) — é o gate inicial. Após emitir
 * nosso JWT custom, requests subsequentes verificam só local.
 */
export async function verifyGoogleIdToken(idToken) {
  if (!idToken) return null;

  const url = `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(idToken)}`;

  const data = await new Promise((resolve, reject) => {
    https.get(url, { timeout: 5000 }, (res) => {
      let body = '';
      res.on('data', (c) => body += c);
      res.on('end', () => {
        try { resolve(JSON.parse(body)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject).on('timeout', () => reject(new Error('tokeninfo timeout')));
  }).catch(err => {
    console.warn('[verifyGoogleIdToken] error:', err.message);
    return null;
  });

  if (!data) return null;
  const email = (data.email || '').toLowerCase();
  if (!email.endsWith(ADMIN_EMAIL_DOMAIN)) return null;
  // tokeninfo retorna 'email_verified' como string "true" (não bool)
  if (String(data.email_verified || '').toLowerCase() !== 'true') return null;
  return { ...data, email };
}

/**
 * Extrai token do header Authorization. Retorna string ou null.
 */
export function extractBearerToken(req) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return null;
  return h.slice(7).trim() || null;
}
