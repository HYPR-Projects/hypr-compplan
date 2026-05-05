# Deploy — Backend (Cloud Functions Gen2)

Mesmo padrão do Report Center pra uniformidade operacional:
- **Cloud Functions Gen2** em `southamerica-east1` (project `site-hypr`)
- **Dataset isolado** `hypr_commplan` pras 11 tabelas commplan_*
- Cross-dataset reads de `hypr_sales_center` (checklists) e `prod_prod_hypr_reporthub` (campaign_results)
- `min-instances=1` pra eliminar cold start

## Setup inicial (uma vez só)

### 1. Service Account + dataset + permissões

```bash
gcloud auth login
gcloud config set project site-hypr

cd hypr-commplan-backend
./setup_one_time.sh
```

Esse script:
- Cria SA `commplan-runner@site-hypr.iam.gserviceaccount.com`
- **Cria dataset `hypr_commplan`** em `southamerica-east1`
- Aplica permissões granulares:
  - `hypr_commplan` → WRITER
  - `hypr_sales_center` → WRITER (read checklists + write team_members)
  - `prod_prod_hypr_reporthub` → READER

### 2. Schema no BigQuery

```bash
# Cria as 11 tabelas commplan_* dentro de hypr_commplan
bq query --project_id=site-hypr --use_legacy_sql=false < sql/01-schema.sql

# Popula seeds (28 features + 15 studies + 15 ABS + 31 rules)
bq query --project_id=site-hypr --use_legacy_sql=false < sql/02-seeds.sql

# Adiciona studies_used em hypr_sales_center.checklists
bq query --project_id=site-hypr --use_legacy_sql=false < sql/03-migrations.sql

# Confirma
bq ls --project_id=site-hypr hypr_commplan | grep commplan
# Esperado: 11 tabelas
```

### 3. GitHub

```bash
git init && git add . && git commit -m "Initial commit"
gh repo create hypr-commplan-backend --private --source=. --remote=origin --push
```

### 4. Primeiro deploy

```bash
JWT_SECRET="<cole-do-report-center>" \
GOOGLE_OAUTH_CLIENT_ID="<id>.apps.googleusercontent.com" \
EMAIL_PASS="<gmail-app-password>" \
./deploy.sh
```

URL aparece no final. **Anota** — você usa no Vercel.

## Deploys subsequentes

```bash
git add . && git commit -m "<descrição>" && git push    # só GitHub
./deploy.sh                                              # deploy real
```

Script captura secrets da revisão anterior automaticamente.

## Atualizar um secret

```bash
JWT_SECRET="novo" ./deploy.sh
```

Os outros secrets são preservados.

## Logs em tempo real

```bash
gcloud run services logs tail commplan-api \
  --region=southamerica-east1 --project=site-hypr
```

## Rodar localmente

```bash
cp .env.example .env
# Edita .env com seus valores

npm install
npm run dev    # roda em :8080 com auto-reload

# Em outro terminal:
npm test       # 39 testes
```

## Estrutura de datasets

| Dataset | Permissão SA | O que tem |
|---|---|---|
| `hypr_commplan` | WRITER | 11 tabelas commplan_* (todas do Compplan) |
| `hypr_sales_center` | WRITER | `checklists` (read), `team_members` (read+write), `+ studies_used col` |
| `prod_prod_hypr_reporthub` | READER | `campaign_results.loom_url` (Account Mgmt rule) |

## Migrations futuras

```bash
# sql/04-foo.sql com seu ALTER/CREATE/INSERT
bq query --project_id=site-hypr --use_legacy_sql=false < sql/04-foo.sql

git add sql/04-foo.sql
git commit -m "Migration: foo"
git push
```

## Troubleshooting

**"Permission denied" no deploy** → SA sem roles.
```bash
gcloud projects get-iam-policy site-hypr \
  --flatten="bindings[].members" \
  --filter="bindings.members:commplan-runner@site-hypr.iam.gserviceaccount.com" \
  --format="table(bindings.role)"
```

**"Cross-project query failed: Access Denied"** → SA sem permissão em `hypr_sales_center` ou `prod_prod_hypr_reporthub`. Roda `./setup_one_time.sh` de novo.

**"Dataset hypr_commplan does not exist"** → primeiro setup falhou. Roda manualmente:
```bash
bq --location=southamerica-east1 mk --dataset site-hypr:hypr_commplan
```

**JWT inválido** → secret diferente. Pega do Report Center:
```bash
JWT_SECRET="$(gcloud run revisions list --service=report-data --region=southamerica-east1 --limit=1 --format='value(metadata.name)' | xargs -I{} gcloud run revisions describe {} --region=southamerica-east1 --format=json | python3 -c '
import sys, json
env = json.load(sys.stdin)[\"spec\"][\"containers\"][0].get(\"env\", [])
print(next((e[\"value\"] for e in env if e[\"name\"]==\"JWT_SECRET\"), \"\"))
')" ./deploy.sh
```
