# Deploy — Frontend

## Setup inicial (uma vez só)

```bash
# 1. Subir pro GitHub
git init
git add .
git commit -m "Initial commit"
gh repo create hypr-commplan-frontend --private --source=. --remote=origin --push

# 2. Conectar Vercel ao GitHub
# - https://vercel.com → Add New Project → Import this repo
# - Framework: Vite (auto-detectado)
# - Build: npm run build  |  Output: dist
# - Env vars (CRÍTICO):
#     VITE_API_URL          = https://hypr-commplan-backend-xxx.run.app
#     VITE_GOOGLE_CLIENT_ID = SEU_CLIENT_ID.apps.googleusercontent.com
#     VITE_DATA_MODE        = live

# 3. Atualizar vercel.json com a URL real do backend
# Edita vercel.json → substitui REPLACE_ME pela URL do Cloud Run
git add vercel.json
git commit -m "Configura proxy do Vercel pro Cloud Run"
git push
```

## Deploys subsequentes (todos os dias)

```bash
git add .
git commit -m "<descrição da mudança>"
git push
# ↑ Vercel detecta o push e faz redeploy em ~90s
```

## Rodar localmente

```bash
npm install
npm run dev          # http://localhost:5173

# Pra testar com backend rodando local:
# 1. Backend roda em :8080 (cd ../hypr-commplan-backend && npm run dev)
# 2. Frontend automaticamente faz proxy /api → :8080 (vide vite.config.js)

# Pra testar com mocks (sem backend):
# Define VITE_DATA_MODE=mock em .env.local
```

## Preview de Pull Requests

Cada branch que você criar vira uma URL própria de preview no Vercel:

```bash
git checkout -b feat/novo-grafico
# ... edita código ...
git push -u origin feat/novo-grafico
# ↑ Vercel cria URL tipo: https://hypr-commplan-frontend-git-feat-novo-grafico.vercel.app
```

## Troubleshooting

**Build falha com "Cannot find module"** → roda `npm install` e commita o `package-lock.json`.

**Página em branco / erro 404 ao navegar** → confere se `vercel.json` tem o rewrite SPA fallback.

**Erro de CORS no console** → backend precisa permitir o domínio Vercel:
```bash
gcloud run services update hypr-commplan-backend \
  --region southamerica-east1 \
  --update-env-vars="ALLOWED_ORIGINS=https://commplan.hypr.mobi,https://hypr-commplan-frontend.vercel.app"
```
