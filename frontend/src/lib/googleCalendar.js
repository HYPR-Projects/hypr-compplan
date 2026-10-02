/**
 * lib/googleCalendar.js — leitura da agenda Google do CS, só no momento de
 * vincular a reunião de pós-venda. O token de acesso (1h) fica só na memória
 * desta aba; o backend o usa uma vez para conferir o evento e não guarda.
 */
import { config } from './config.js';

const SCOPES = 'https://www.googleapis.com/auth/calendar.readonly openid email';

function loadGis() {
  if (window.google?.accounts?.oauth2) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    const script = existing || document.createElement('script');
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => reject(new Error('Não foi possível carregar o login do Google.')));
    if (!existing) {
      script.src = 'https://accounts.google.com/gsi/client';
      script.async = true;
      document.head.appendChild(script);
    }
  });
}

/** Pede permissão de leitura da agenda e devolve o access token. */
export async function requestCalendarToken(loginHint) {
  await loadGis();
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: config.googleOAuthClientId,
      scope: SCOPES,
      hint: loginHint || undefined,
      callback: (resp) => {
        if (resp?.error || !resp?.access_token) reject(new Error(resp?.error_description || 'Permissão da agenda não concedida.'));
        else resolve(resp.access_token);
      },
      error_callback: (err) => reject(new Error(err?.message || 'Permissão da agenda não concedida.')),
    });
    client.requestAccessToken({ prompt: '' });
  });
}

/** Eventos da agenda principal entre duas datas (YYYY-MM-DD). */
export async function listCalendarEvents(accessToken, fromDate, toDate) {
  const p = new URLSearchParams({
    timeMin: new Date(`${fromDate}T00:00:00`).toISOString(),
    timeMax: new Date(`${toDate}T23:59:59`).toISOString(),
    singleEvents: 'true',
    orderBy: 'startTime',
    maxResults: '250',
  });
  const r = await fetch(`https://www.googleapis.com/calendar/v3/calendars/primary/events?${p}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!r.ok) throw new Error(r.status === 403 ? 'A API do Google Calendar não está liberada para o Compplan.' : `Erro ${r.status} ao ler a agenda.`);
  const data = await r.json();
  return (data.items || []).filter(e => e.status !== 'cancelled').map(e => {
    const attendees = e.attendees || [];
    const external = attendees.filter(a => a.email && !a.resource && a.responseStatus !== 'declined' && !/@hypr\.mobi$/i.test(a.email));
    return {
      id: e.id,
      summary: e.summary || '(sem título)',
      start: e.start?.dateTime || e.start?.date,
      external: external.length,
      domains: [...new Set(external.map(a => a.email.split('@')[1]))],
    };
  });
}
