/**
 * lib/api.js — cliente HTTP do Commplan backend.
 *
 * Convenções:
 *   - Token JWT armazenado em sessionStorage (some no fechar de aba)
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

export const auth = {
  getToken() { return sessionStorage.getItem(TOKEN_KEY); },
  setToken(t) { sessionStorage.setItem(TOKEN_KEY, t); },
  clearToken() { sessionStorage.removeItem(TOKEN_KEY); },

  // role e email persistem em memória + sessionStorage pra sobreviver a F5
  getUser() {
    const raw = sessionStorage.getItem('commplan_user');
    return raw ? JSON.parse(raw) : null;
  },
  setUser(u) { sessionStorage.setItem('commplan_user', JSON.stringify(u)); },
  clearUser() { sessionStorage.removeItem('commplan_user'); },

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
  meDashboard(q)         { return api.get(`/commplan/me/dashboard/${q}`); },
  meCampaign(token)      { return api.get(`/commplan/me/campaign/${token}`); },
  meSaveCampaign(token, body) {
    return api.put(`/commplan/me/campaign/${token}`, body);
  },
  meHistory()            { return api.get(`/commplan/me/history`); },
  meFeaturesCatalog()    { return api.get(`/commplan/me/features-catalog`); },
  meStudiesCatalog()     { return api.get(`/commplan/me/studies-catalog`); },

  // Admin
  adminOverview(q)       { return api.get(`/commplan/admin/overview/${q}`); },
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
