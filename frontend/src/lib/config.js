/**
 * lib/config.js — configuração central do frontend.
 *
 * Valores de produção estão hardcoded como fallback. Env vars (.env ou Vercel)
 * sobrescrevem se setadas — útil pra dev local.
 *
 * Como NÃO há segredos aqui (Client ID OAuth e URL de API são públicos por
 * design), tudo bem hardcodar. Mudança de qualquer um = commit + push.
 */

export const config = {
  // Backend API (Cloud Functions Gen2)
  apiUrl: import.meta.env.VITE_API_URL ||
    'https://commplan-api-s7bziuk2fa-uc.a.run.app',

  // Google OAuth Client ID (público — vai no frontend de qualquer jeito)
  googleOAuthClientId: import.meta.env.VITE_GOOGLE_OAUTH_CLIENT_ID ||
    '453955675457-hrnfnck3ifq66cdjcqh3hhqbu8h7ojnp.apps.googleusercontent.com',

  // Modo de dados: 'live' (backend real) ou 'mock' (dados fake locais)
  dataMode: import.meta.env.VITE_DATA_MODE || 'live',
};
