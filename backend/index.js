/**
 * index.js — entry point do HYPR Commplan Backend.
 *
 * Roda em Cloud Run, southamerica-east1.
 *
 * Ordem das rotas é importante:
 *   /health, /auth/*    → públicas
 *   /commplan/me/*      → CS autenticado
 *   /commplan/evidences → CS autenticado
 *   /commplan/admin/*   → admin autenticado
 *
 * Erros não tratados de rota retornam 500 com payload genérico.
 */

import 'dotenv/config';
import express from 'express';
import cors from 'cors';

import { router as authRouter } from './routes/auth.js';
import { router as meRouter } from './routes/me.js';
import { router as studiesPublicRouter } from './routes/studies-public.js';

import { router as adminCsConfig } from './routes/admin/cs-config.js';
import { router as adminOverExceptions } from './routes/admin/over-exceptions.js';
import { router as adminCampaignOverrides } from './routes/admin/campaign-overrides.js';
import { router as adminStudies } from './routes/admin/studies.js';
import { router as adminTeamMembers } from './routes/admin/team-members.js';
import { router as adminOverview } from './routes/admin/overview.js';
import { router as adminAudit } from './routes/admin/audit.js';
import { router as adminExport } from './routes/admin/export.js';

const app = express();
const PORT = process.env.PORT || 8080;

// ─── CORS allowlist ──────────────────────────────────────────────────────
const ALLOWED = (process.env.ALLOWED_ORIGINS ||
  'https://commplan.hypr.mobi,http://localhost:5173,http://localhost:4173')
  .split(',').map(s => s.trim()).filter(Boolean);

app.use(cors({
  origin(origin, cb) {
    if (!origin) return cb(null, true);  // health checks, server-to-server
    if (ALLOWED.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS: ${origin} não permitido`));
  },
  credentials: true,
}));

app.use(express.json({ limit: '1mb' }));

// ─── Health ──────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'hypr-commplan',
    version: '1.0.0',
    ts: new Date().toISOString(),
  });
});

// ─── Auth ────────────────────────────────────────────────────────────────
app.use('/auth', authRouter);

// ─── CS-side ─────────────────────────────────────────────────────────────
app.use('/commplan/me', meRouter);
app.use('/commplan/studies', studiesPublicRouter);

// ─── Admin-side ──────────────────────────────────────────────────────────
app.use('/commplan/admin/cs-config', adminCsConfig);
app.use('/commplan/admin/over-exceptions', adminOverExceptions);
app.use('/commplan/admin/studies', adminStudies);
app.use('/commplan/admin/team-members', adminTeamMembers);
app.use('/commplan/admin/audit', adminAudit);
app.use('/commplan/admin/export', adminExport);
// Mais genéricos por último (eles têm router.use(adminRequired) global,
// e Express casa por prefixo — então routers de path mais específico
// devem vir antes pra não serem interceptados.
app.use('/commplan/admin', adminCampaignOverrides);
app.use('/commplan/admin', adminOverview);

// ─── Error handler ───────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error('[unhandled]', err);
  res.status(500).json({
    error: process.env.NODE_ENV === 'production'
      ? 'erro interno'
      : err.message,
  });
});

// ─── Server bootstrap ────────────────────────────────────────────────────
// Em Cloud Functions Gen2 (mesmo padrão Report Center), functions-framework
// chama `commplan` como handler — NÃO devemos abrir listener próprio (causa
// "port in use"). Em Cloud Run / dev local, abrimos listener normalmente.
//
// Detecta-se Cloud Functions pela env K_SERVICE (presente em Gen2).
const isCloudFunction = !!process.env.K_SERVICE;

if (!isCloudFunction) {
  app.listen(PORT, () => {
    console.log(`▸ HYPR Commplan listening on :${PORT}`);
    console.log(`▸ allowed origins: ${ALLOWED.join(', ')}`);
  });
}

// ─── Cloud Functions Gen2 entry point ────────────────────────────────────
// functions-framework usa `commplan` como entry point.
export const commplan = app;
export default app;
