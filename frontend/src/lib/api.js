/**
 * lib/api.js — cliente HTTP do Compplan backend.
 *
 * Convenções:
 *   - Token JWT em localStorage (persiste entre abas + restart do browser)
 *   - Sessão de 8h: backend emite JWT com exp=8h; frontend também checa
 *     expiry local pra fazer logout proativo (evita 401 surpresa)
 *   - Em dev, usa proxy /api → http://localhost:8080 (ver vite.config.js)
 *   - Em produção, usa VITE_API_URL como base
 *
 * Tratamento de erro:
 *   - 401 → redirect pra /login (token expirado)
 *   - Outros: lança Error com message do backend
 */

import { config } from './config.js';

const API_BASE = config.apiUrl;
const TOKEN_KEY = 'commplan_jwt';
const USER_KEY = 'commplan_user';
const EXPIRY_KEY = 'commplan_jwt_exp';   // unix timestamp em ms

/** Decodifica payload do JWT sem verificar (só pra ler `exp`). */
function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    // base64url → base64
    const pad = parts[1].length % 4 === 0 ? '' : '='.repeat(4 - parts[1].length % 4);
    const b64 = (parts[1] + pad).replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(b64));
  } catch (_) { return null; }
}

export const auth = {
  getToken() {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    // Checa expiry local
    const exp = Number(localStorage.getItem(EXPIRY_KEY) || 0);
    if (exp > 0 && Date.now() >= exp) {
      // expirado — limpa e retorna null
      this.clearToken();
      this.clearUser();
      return null;
    }
    return token;
  },
  setToken(t) {
    localStorage.setItem(TOKEN_KEY, t);
    // Armazena expiry pra checar localmente
    const payload = decodeJwtPayload(t);
    if (payload?.exp) {
      localStorage.setItem(EXPIRY_KEY, String(payload.exp * 1000));
    } else {
      localStorage.removeItem(EXPIRY_KEY);
    }
  },
  clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EXPIRY_KEY);
  },

  getUser() {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? JSON.parse(raw) : null;
  },
  setUser(u) { localStorage.setItem(USER_KEY, JSON.stringify(u)); },
  clearUser() { localStorage.removeItem(USER_KEY); },

  logout() {
    this.clearToken();
    this.clearUser();
    window.location.href = '/login';
  },
};

async function request(method, path, body) {
  const url = `${API_BASE}${path}`;
  const headers = { 'Content-Type': 'application/json' };
  const token = auth.getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const opts = { method, headers };
  if (body != null) opts.body = JSON.stringify(body);
  // Anti-cache: força bypass do 304 do browser pra GETs (especialmente após mutations)
  if (method === 'GET') opts.cache = 'no-store';

  let res;
  try {
    res = await fetch(url, opts);
  } catch (err) {
    throw new Error(`Falha de rede: ${err.message}`);
  }

  if (res.status === 401) {
    auth.logout();
    throw new Error('Sessão expirada');
  }

  let data = null;
  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    try { data = await res.json(); } catch { /* corpo vazio ok */ }
  }

  if (!res.ok) {
    throw new Error(data?.error || `Erro ${res.status}`);
  }

  return data;
}

export const api = {
  get(path)         { return request('GET', path); },
  post(path, body)  { return request('POST', path, body); },
  put(path, body)   { return request('PUT', path, body); },
  delete(path)      { return request('DELETE', path); },
};

// ─── Endpoints tipados (atalhos) ──────────────────────────────────────

// Helper: monta '?as=email' pra admin impersonar um CS.
function asQuery(opts) {
  if (!opts || !opts.as) return '';
  return `?as=${encodeURIComponent(opts.as)}`;
}

export const endpoints = {
  // Auth
  login(googleIdToken) {
    return fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${googleIdToken}`,
        'Content-Type': 'application/json',
      },
    }).then(async (res) => {
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.error || `Erro ${res.status}`);
      return data;
    });
  },

  // CS-side
  meQuarter(q)         { return api.get(`/commplan/me/quarter/${q}`); },
  meCampaigns(q)       { return api.get(`/commplan/me/campaigns/${q}`); },
  meHistory()          { return api.get(`/commplan/me/history`); },

  // Evidences (claims)
  createEvidence(body) { return api.post('/commplan/evidences', body); },
  updateEvidence(id, body) { return api.put(`/commplan/evidences/${id}`, body); },
  deleteEvidence(id)   { return api.delete(`/commplan/evidences/${id}`); },

  // Studies (CP usa no Command, CS pode ver)
  studiesAvailable(version='2026') { return api.get(`/commplan/studies/available?version=${version}`); },

  // CS (portal pessoal)
  meDashboard(q, opts = {})    { return api.get(`/commplan/me/dashboard/${q}${asQuery(opts)}`); },
  meCampaign(token, opts = {}) { return api.get(`/commplan/me/campaign/${token}${asQuery(opts)}`); },
  meSaveCampaign(token, body, opts = {}) {
    return api.put(`/commplan/me/campaign/${token}${asQuery(opts)}`, body);
  },
  meHistory(opts = {})         { return api.get(`/commplan/me/history${asQuery(opts)}`); },
  meFeaturesCatalog()          { return api.get(`/commplan/me/features-catalog`); },
  meStudiesCatalog()           { return api.get(`/commplan/me/studies-catalog`); },

  // Admin
  adminOverview(q)       { return api.get(`/commplan/admin/overview/${q}`); },
  teamOverview(q)        { return api.get(`/commplan/me/team-overview/${q}`); },
  adminCampaigns(q)      { return api.get(`/commplan/admin/campaigns/${q}`); },
  adminPending(q)        { return api.get(`/commplan/admin/pending/${q}`); },
  adminTeam()            { return api.get(`/commplan/admin/team`); },
  adminAssignPending(token, cs_email) {
    return api.post(`/commplan/admin/pending/${token}/assign`, { cs_email });
  },
  adminQuarter(q)        { return api.get(`/commplan/admin/quarter/${q}`); },
  computeQuarter(q)      { return api.post(`/commplan/admin/quarter/${q}/compute`); },
  approveQuarter(q, cs)  { return api.put(`/commplan/admin/quarter/${q}/${encodeURIComponent(cs)}/approve`); },
  markPaidQuarter(q, cs) { return api.put(`/commplan/admin/quarter/${q}/${encodeURIComponent(cs)}/mark-paid`); },

  // Floor override (admin tira meses do piso de um CS)
  getFloorOverride(csEmail, q) {
    return api.get(`/commplan/admin/cs/${encodeURIComponent(csEmail)}/floor-override/${q}`);
  },
  setFloorOverride(csEmail, q, months_off, note = null) {
    return api.post(`/commplan/admin/cs/${encodeURIComponent(csEmail)}/floor-override/${q}`,
      { months_off, note });
  },

  // Assign-study (admin atribui bônus de estudo a outro CS, opcionalmente com study_id)
  assignStudy(token, cs_email, study_id, opts = {}) {
    return api.post(`/commplan/me/campaign/${token}/assign-study${asQuery(opts)}`,
      { cs_email, study_id });
  },

  pendingEvidences()     { return api.get('/commplan/admin/evidences/pending'); },
  approveEvidence(id, notes) { return api.put(`/commplan/admin/evidences/${id}/approve`, { review_notes: notes }); },
  rejectEvidence(id, notes)  { return api.put(`/commplan/admin/evidences/${id}/reject`,  { review_notes: notes }); },

  listMembers(role)      { return api.get(`/commplan/admin/team-members${role ? `?role=${role}&with_salary=true` : '?with_salary=true'}`); },
  getMember(email)       { return api.get(`/commplan/admin/team-members/${encodeURIComponent(email)}`); },
  createMember(body)     { return api.post('/commplan/admin/team-members', body); },
  updateMember(email, body) { return api.put(`/commplan/admin/team-members/${encodeURIComponent(email)}`, body); },
  setMemberRole(email, role) { return api.put(`/commplan/admin/team-members/${encodeURIComponent(email)}/role`, { role }); },
  deactivateMember(email) { return api.delete(`/commplan/admin/team-members/${encodeURIComponent(email)}`); },

  listRules(version='2026') { return api.get(`/commplan/admin/rules?version=${version}`); },
  updateRule(id, body)   { return api.put(`/commplan/admin/rules/${id}`, body); },
  createRule(body)       { return api.post('/commplan/admin/rules', body); },

  listAbsClients()       { return api.get('/commplan/admin/abs-clients'); },
  addAbsClient(body)     { return api.post('/commplan/admin/abs-clients', body); },
  removeAbsClient(id)    { return api.delete(`/commplan/admin/abs-clients/${encodeURIComponent(id)}`); },

  listOverExceptions()        { return api.get('/commplan/admin/over-exceptions'); },
  addOverException(body)      { return api.post('/commplan/admin/over-exceptions', body); },
  removeOverException(name)   { return api.delete(`/commplan/admin/over-exceptions/${encodeURIComponent(name)}`); },

  adminOverrideItem(token, body) {
    return api.put(`/commplan/admin/campaign/${token}/override`, body);
  },
  adminReviewRequests() {
    return api.get('/commplan/admin/review-requests');
  },

  meReplicateSources(token, opts = {}) {
    const q = opts.as ? `?as=${encodeURIComponent(opts.as)}` : '';
    return api.get(`/commplan/me/campaign/${token}/replicate-sources${q}`);
  },
  meReplicateFrom(token, sourceToken, opts = {}) {
    const q = opts.as ? `?as=${encodeURIComponent(opts.as)}` : '';
    return api.post(`/commplan/me/campaign/${token}/replicate-from${q}`, { source_token: sourceToken });
  },

  mePreCampaignSearch(q = '', opts = {}) {
    const params = new URLSearchParams();
    if (q) params.set('q', q);
    if (opts.as) params.set('as', opts.as);
    return api.get(`/commplan/me/pre-campaign-search?${params.toString()}`);
  },
  meAssignPre(token, opts = {}) {
    const q = opts.as ? `?as=${encodeURIComponent(opts.as)}` : '';
    return api.post(`/commplan/me/campaign/${token}/assign-pre${q}`, {});
  },
  meUnassignPre(token, opts = {}) {
    const q = opts.as ? `?as=${encodeURIComponent(opts.as)}` : '';
    return api.delete(`/commplan/me/campaign/${token}/assign-pre${q}`);
  },

  listMentorships()      { return api.get('/commplan/admin/mentorships'); },
  createMentorship(body) { return api.post('/commplan/admin/mentorships', body); },
  endMentorship(id)      { return api.delete(`/commplan/admin/mentorships/${id}`); },

  listStudies(version='2026') { return api.get(`/commplan/admin/studies?version=${version}`); },
  createStudy(body)      { return api.post('/commplan/admin/studies', body); },
  updateStudy(id, body)  { return api.put(`/commplan/admin/studies/${id}`, body); },

  audit(filters={})      {
    const qs = new URLSearchParams(filters).toString();
    return api.get(`/commplan/admin/audit${qs ? '?' + qs : ''}`);
  },

  // Legacy assignments (campanhas pré-Command)
  legacyPending()        { return api.get('/commplan/admin/legacy/pending'); },
  legacyAll()            { return api.get('/commplan/admin/legacy/all'); },
  legacyAssign(body)     { return api.post('/commplan/admin/legacy/assign', body); },
  legacyAssignBatch(assignments) {
    return api.post('/commplan/admin/legacy/assign-batch', { assignments });
  },
  legacyUnassign(token)  { return api.delete(`/commplan/admin/legacy/${encodeURIComponent(token)}`); },
};
