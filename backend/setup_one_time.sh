#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# setup_one_time.sh — Configuração inicial do GCP pro HYPR Commplan.
#
# Roda UMA VEZ SÓ. Cria:
#   1. Service Account `commplan-runner`
#   2. Dataset `hypr_commplan` no BigQuery (isolado, southamerica-east1)
#   3. Permissões granulares:
#      - hypr_commplan       → Data Editor (Compplan tem ownership)
#      - hypr_sales_center   → Data Editor (lê checklists + escreve team_members)
#      - prod_prod_hypr_reporthub → Data Viewer (lê campaign_results.loom_url)
#      - Job User no projeto → necessário pra rodar QUALQUER query
#
# Pré-requisitos:
#   gcloud auth login
#   gcloud config set project site-hypr
#
# Uso:
#   ./setup_one_time.sh
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

PROJECT_ID="${PROJECT_ID:-site-hypr}"
SA_NAME="commplan-runner"
SA_EMAIL="${SA_NAME}@${PROJECT_ID}.iam.gserviceaccount.com"
LOCATION="us-central1"
COMMPLAN_DATASET="hypr_commplan"
SOURCE_DATASET="hypr_sales_center"
REPORTHUB_DATASET="prod_prod_hypr_reporthub"

echo "▸ Project: $PROJECT_ID"
echo "▸ Service Account: $SA_EMAIL"
echo "▸ Datasets:"
echo "    write→ $COMMPLAN_DATASET (isolado, criado agora)"
echo "    write→ $SOURCE_DATASET (compartilhado: team_members + read checklists)"
echo "    read → $REPORTHUB_DATASET (campaign_results pra Loom)"
echo ""

# ── 1. Cria Service Account (idempotente) ────────────────────────────────────
if gcloud iam service-accounts describe "$SA_EMAIL" --project="$PROJECT_ID" &>/dev/null; then
  echo "  ✓ SA já existe"
else
  echo "▸ Criando service account..."
  gcloud iam service-accounts create "$SA_NAME" \
    --display-name "HYPR Commplan Runner" \
    --description "SA do backend do Commplan, executa em Cloud Functions Gen2" \
    --project="$PROJECT_ID"
  echo "  ✓ SA criada"
fi

# ── 2. Cria dataset hypr_commplan (idempotente) ──────────────────────────────
echo ""
echo "▸ Criando dataset $COMMPLAN_DATASET..."
if bq --project_id="$PROJECT_ID" show "${COMMPLAN_DATASET}" &>/dev/null; then
  echo "  ✓ Dataset $COMMPLAN_DATASET já existe"
else
  bq --project_id="$PROJECT_ID" --location="$LOCATION" mk \
    --dataset \
    --description="HYPR Commplan — cálculo de bônus do time CS (isolado)" \
    "${PROJECT_ID}:${COMMPLAN_DATASET}"
  echo "  ✓ Dataset $COMMPLAN_DATASET criado em $LOCATION"
fi

# ── 3. Permissão Job User no projeto (necessário pra QUALQUER query) ─────────
echo ""
echo "▸ Aplicando roles no projeto..."
gcloud projects add-iam-policy-binding "$PROJECT_ID" \
  --member="serviceAccount:${SA_EMAIL}" \
  --role="roles/bigquery.jobUser" \
  --condition=None \
  --quiet > /dev/null
echo "  ✓ roles/bigquery.jobUser"

# ── 4. Permissões granulares por dataset ─────────────────────────────────────
# Granular > project-wide. Dá só o que precisa em cada dataset.
echo ""
echo "▸ Aplicando permissões granulares por dataset..."

grant_dataset_role() {
  local dataset="$1"
  local role="$2"
  local member="serviceAccount:${SA_EMAIL}"

  # bq update --add-iam-policy-binding (mais granular que CLI antiga)
  # Dataset DataEditor: pode ler/escrever em todas as tabelas do dataset.
  # Dataset DataViewer: só lê.
  echo "    ▸ ${dataset} ← ${role}"

  # Pega política atual
  local policy
  policy=$(bq --project_id="$PROJECT_ID" --format=prettyjson show "${dataset}" 2>/dev/null)

  # Verifica se já tem essa role pro SA (idempotente)
  if echo "$policy" | python3 -c "
import sys, json
data = json.load(sys.stdin)
target_role = '$role'
target_member = 'serviceAccount:$SA_EMAIL'
access = data.get('access', [])
for entry in access:
    role = entry.get('role', '')
    user = entry.get('userByEmail', '')
    # bq usa formato curto: 'WRITER', 'READER', 'OWNER' ou prefixo 'roles/...'
    role_match = role == target_role or role == target_role.replace('roles/bigquery.data', '').upper()
    if role_match and user == '$SA_EMAIL':
        sys.exit(0)
sys.exit(1)
"; then
    echo "      (já configurado)"
    return
  fi

  # Adiciona via bq update com nova entry
  bq --project_id="$PROJECT_ID" --format=prettyjson show "${dataset}" \
    | python3 -c "
import sys, json
data = json.load(sys.stdin)
data.setdefault('access', []).append({
    'role': '$role',
    'userByEmail': '$SA_EMAIL'
})
print(json.dumps(data))
" > /tmp/dataset-policy.json

  bq --project_id="$PROJECT_ID" update --source /tmp/dataset-policy.json "${dataset}"
  rm -f /tmp/dataset-policy.json
}

# Compplan: WRITER (data editor) — escreve nas 11 tabelas commplan_*
grant_dataset_role "$COMMPLAN_DATASET" "WRITER"

# Sales Center: WRITER pra escrever em team_members + ler checklists
# (READER seria suficiente pra checklists, mas team_members precisa de WRITER)
grant_dataset_role "$SOURCE_DATASET" "WRITER"

# Report Hub: READER — só lê campaign_results.loom_url
grant_dataset_role "$REPORTHUB_DATASET" "READER"

# ── 5. Resumo ────────────────────────────────────────────────────────────────
echo ""
echo "✓ Setup concluído."
echo ""
echo "▸ Estado atual:"
echo "    SA:                 $SA_EMAIL"
echo "    Dataset Compplan:   $COMMPLAN_DATASET (vazio, schema vai ser criado pelo SQL)"
echo "    Dataset Source:     $SOURCE_DATASET (acesso WRITE pra team_members)"
echo "    Dataset ReportHub:  $REPORTHUB_DATASET (acesso READ)"
echo ""
echo "▸ Próximos passos:"
echo ""
echo "  1. Rodar schema (cria as 11 tabelas commplan_*):"
echo "       bq query --project_id=$PROJECT_ID --use_legacy_sql=false < sql/01-schema.sql"
echo ""
echo "  2. Popular seeds (28 features + 15 studies + 15 ABS + 31 rules):"
echo "       bq query --project_id=$PROJECT_ID --use_legacy_sql=false < sql/02-seeds.sql"
echo ""
echo "  3. Migration (adiciona studies_used em hypr_sales_center.checklists):"
echo "       bq query --project_id=$PROJECT_ID --use_legacy_sql=false < sql/03-migrations.sql"
echo ""
echo "  4. Legacy + VIEW unificada (resolve campanhas pré-Command):"
echo "       bq query --project_id=$PROJECT_ID --use_legacy_sql=false < sql/04-legacy-assignments.sql"
echo ""
echo "  5. Primeiro deploy do backend:"
echo "       JWT_SECRET=xxx GOOGLE_OAUTH_CLIENT_ID=yyy EMAIL_PASS=zzz ./deploy.sh"
echo ""
echo "  6. Auto-import de campanhas legadas (dry-run, depois --execute):"
echo "       node scripts/import-legacy-2026.js"
echo "       node scripts/import-legacy-2026.js --execute"
