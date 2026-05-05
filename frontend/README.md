# HYPR° Commplan — Frontend

Painel de cálculo de bônus do time CS (Compplan 2026). React + Vite + recharts.

## Stack
- **React 18** + **Vite 5** (HMR rápido, build pequeno)
- **react-router-dom 6** com `ProtectedRoute` e role-based redirects
- **recharts** pros gráficos de crescimento/audiences/top studies
- **lucide-react** para ícones (line-style consistente com Report Center)
- **CSS vars** com tema dark (default) + light, sem framework
- Fontes: **Inter** (sans) + **JetBrains Mono** (números/dados)

## Estrutura
```
src/
├── lib/
│   ├── api.js          ← Cliente HTTP com JWT, refresh, atalhos de endpoint
│   ├── format.js       ← BRL, datas, iniciais, hash de cor pra avatar
│   └── mockData.js     ← Mocks de dev (substituir por useFetch quando staging)
├── hooks/
│   ├── useTheme.jsx    ← Provider de tema com persistência em localStorage
│   └── useFetch.jsx    ← Wrapper async com loading/error
├── components/
│   ├── ui/             ← Card, Button, Badge, Avatar, Input, Modal, Logo
│   ├── charts/         ← AreaChart, BarChart (theme-reactive)
│   └── layout/AppShell ← Sidebar (CS|Admin) + header com user + theme toggle
├── pages/
│   ├── Login.jsx       ← Google OAuth (@hypr.mobi) + dev fake login
│   ├── cs/
│   │   ├── Dashboard       ← KPIs hero + crescimento + campanhas + top studies
│   │   ├── Campaigns       ← Lista com tabs (todas|pendentes|abs)
│   │   ├── CampaignDetail  ← Cálculo detalhado por categoria + RuleRows
│   │   ├── EvidenceModal   ← Submit/edit/delete de claim manual
│   │   └── History         ← Histórico de quarters anteriores
│   └── admin/
│       ├── Overview        ← Visão global + top performers + total gerido
│       ├── Quarter         ← Compute / approve / mark-paid
│       ├── EvidencesReview ← Aprovar/rejeitar claims pendentes
│       ├── Team            ← CRUD de CS (cria team_member + cs_config juntos)
│       ├── Rules           ← Editor Path B (bonus_pct, display, active, cap)
│       ├── Studies         ← CRUD do catálogo de estudos
│       ├── AbsClients      ← Lista de advertisers ABS
│       ├── Mentorships     ← Mentor → mentee
│       └── Audit           ← Log auditável
└── styles/
    ├── tokens.css      ← HYPR cyan, status colors, spacing, typography scales
    └── global.css      ← Reset, tipografia base, scrollbar, animations
```

## Rodando

```bash
npm install
npm run dev          # http://localhost:5173 — proxy /api → :8080 (backend)
npm run build        # gera dist/
npm run preview      # serve dist em :4173
```

Em **dev mode** (`import.meta.env.DEV`), o login mostra botões de "fake login"
(CS Beatriz / Admin Matheus) que populam JWT mock no localStorage e usam os
mocks de `lib/mockData.js`. Sem backend rodando, o app já é navegável.

## Quando o backend subir
1. Rodar backend em `:8080` (ou ajustar proxy em `vite.config.js`).
2. Em cada página, trocar `MOCK_*` por `useFetch(endpoints.X)`. Ex:
   ```diff
   - const team = MOCK_TEAM_OVERVIEW;
   + const { data: team, loading } = useFetch(endpoints.adminTeam);
   ```
3. Login real via Google OAuth (configurar `VITE_GOOGLE_CLIENT_ID` no `.env`).

## Theming
Toggle no header (sol/lua). Tema persiste em `localStorage[hypr_theme]`.
Light mode usa cyan mais escuro (`#0891B2`) pra contraste em fundo claro.
Todos os componentes consomem CSS vars — nada hardcoded.

## Identidade visual
- **Logo** sempre presente (sidebar + login + header da landing).
- **Cores HYPR** consistentes com Report Center: cyan `#5DD5E0`, fundo `#0A0E14`,
  status verde/amarelo/vermelho com saturação ajustada por tema.
- **Tipografia**: títulos com `letter-spacing: -0.02em` (refinado, não genérico).
  Números sempre em mono com `font-feature-settings: 'tnum' 1` pra alinhar.
- **Espaçamento**: escala 4-base (`--space-1` a `--space-24`). Nada arbitrário.
- **Animações**: stagger fade-up de 60ms entre items, ease-out cubic-bezier.
  Nunca passa de 400ms — sutil, nunca distrai.
