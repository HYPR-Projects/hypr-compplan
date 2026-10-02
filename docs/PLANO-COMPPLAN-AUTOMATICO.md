# Plano — Compplan automático e conectado (Force + Report Center + Library)

> **Status:** proposta. **Nada disto vai para produção enquanto o bônus do Q3/2026 não estiver fechado.**
> Tudo que mudar regra de cálculo entra como **nova versão do Compplan** (`commplan_versions`), com
> vigência a partir de um quarter futuro — o Q3 continua calculado exatamente como está hoje.

---

## 0. Objetivo

Reduzir ao mínimo o preenchimento manual do CS e, portanto, o erro humano:

1. **Puxar automaticamente** o que já existe em outras plataformas (checklist, short token, CS
   responsável, carteira, métricas, Loom, link do relatório, reuniões).
2. **Validar** tudo — o que o CS declarou e o que veio automático — e mostrar a divergência.
3. **Dar autonomia aos admins** para incluir/tirar/editar etapas sem deploy.
4. **Deixar a tela simples**: cada etapa com um card explicando o que a configura.
5. **Exportar** quem preencheu o quê em cada campanha.

---

## 1. Diagnóstico do que existe hoje (código atual)

| Tema | Como está | Problema |
|---|---|---|
| Catálogo de etapas e % | Fixo em `backend/engine/compplan-catalog.js` | Mudar etapa exige deploy. As tabelas `commplan_rules` e `commplan_features_catalog` existem no schema mas **não são lidas** por nenhum código. |
| Tiers de features | `FEATURE_TIERS` com comparação **exata** de texto | O Force grava `P-DOOH`, `Tap To Scratch`, `Tap To Carousel`, `Tap To Chat`, `Downloaded Apps`; o catálogo tem `PDOOH`, `Tap to Scratch`… → provavelmente caem em "unknown" e o Setup não é pré-marcado. Features do Force **sem tier**: `Tap To Slide`, `Tap To Hotspot`, `CTV`, `Video Survey`. |
| Pré-campanha | 100% manual (checkbox + 1 link) | Ninguém confere se a feature foi de fato oferecida no documento. |
| Setup | Semi-auto a partir de `features`/`products` do checklist | OK, mas depende do problema de grafia acima. |
| Otimização | Fórmulas próprias em `lib/bonus-calc.js` (`fetchMetricsByToken`) | **Diverge do Report Center**: over/pacing, eCPM e tech cost são calculados de forma diferente (ver §3.2). O CS vê um número no RC e outro no Compplan. |
| Loom / Relatório | Link colado manualmente | O Report Center já tem `campaign_looms` e `campaign_share_ids` por short token. |
| Pós-venda (reunião) | Link colado manualmente | Sem prova de que a reunião aconteceu. |
| Exportação | `routes/admin/export.js` (resumo + detalhe por etapa) | Não mostra origem do dado (auto × manual) nem status de validação. |

---

## 2. Fontes de dados (o que pegar de onde)

### 2.1 Force / Command
| Dado | Onde está | Observação |
|---|---|---|
| Checklist (features `cl_features`, produtos, formatos, audiências, estudos, volumetria por feature) | Backend do **Command** (`GET /checklists`) e `hypr_sales_center.checklists` | O Compplan já lê via view `commplan_checklists`. Cópia leve em `staging.checklist_info` (sem features/CS). |
| Short token | Mesmo registro do checklist | Gerado sem checagem de unicidade (`generateShortToken`) — validar colisão no sync. |
| CS responsável pela campanha | `cs_email` do checklist (Command) | — |
| CP | `cp_email` / `salesman` | Útil para atribuir "quem preencheu o checklist". |
| Carteira de CS (cliente → CS) | `hyprops_app.force_cs_portfolio` (`cliente`, `cs_responsavel` **por nome**) + overlay `hyprforce.carteira_trocas` / `carteira_inativos` | Converter nome → e-mail via `hypr_sales_center.team_members` com a mesma normalização do Force (`canonicalCS`). |
| Agenda Google | Force pede `calendar.readonly calendar.events` no login e guarda refresh token em `force_google_tokens` | Token em texto puro — ver §6. |

### 2.2 Report Center
| Dado | Onde está |
|---|---|
| Pacing, over, CTR, VTR, eCPM efetivo por tática | `report_data?action=navi_metrics` (compacto, read-only) e `_compute_totals` em `backend/main.py` |
| eCPM admin, custo total | `?list=true` (admin) → `admin_ecpm`, `display_ecpm`, `video_ecpm`, `admin_total_cost_full` |
| Peças Max Attention (formato da feature) | `prod_assets.report_ma_links` + métricas via Platform (ver abaixo) |
| Tech cost | Hoje calculado **no frontend do RC** (`costFull ÷ budget × 100`, `src/v2/admin/lib/aggregation.js`) → precisamos mover para o backend do RC ou replicar a mesma fórmula num único lugar compartilhado. |
| Loom | `prod_assets.campaign_looms (short_token, loom_url, updated_at)` (ou `bidiq_app.reportcenter_campaign_looms` no layout de taxonomia) |
| Link do relatório | `prod_assets.campaign_share_ids` → `https://report.hypr.mobi/report/{share_id}` (`?action=get_share_id&token=`) |
| Métricas por audiência | Nome da audiência vem do **`line_name`** (`extract_audience` / `extractAudience`) |
| Auth | JWT HS256 com `JWT_SECRET` (o mesmo do Compplan) → o Compplan consegue emitir um token admin de serviço. |

> ✅ **Onde a feature aparece no Report Center — aba Max Attention.** É a fonte mais forte de
> "ativou de verdade" para as features rich media. Como funciona hoje:
> - O admin do RC **vincula** as peças da HYPR Platform (o2o-platform) à campanha. Os vínculos ficam em
>   `prod_assets.report_ma_links` (`short_token, creative_id, template_slug, name, size, dsp_creative_names, linked_by, linked_at`)
>   — `backend/ma_report.py`.
> - O formato vem do `template_slug` da Platform, não do nome digitado → é confiável.
> - As métricas da peça (impressões, cliques, engajamento, widgets) vêm do endpoint de serviço da
>   Platform (o mesmo número do painel da Platform).
>
> **Decisão: no Compplan, tudo que é "Tap To" vira `Max Attention` (Tier 1).** No Force/Command os
> formatos continuam separados (o CP marca Tap to Go, Tap To Scratch etc.). **Cada formato Max Attention
> diferente conta como uma feature**: Tap to Go + Tap to Choose = 2× Max Attention = 2 slots do Tier 1.
>
> | No Force (checklist) | No Report Center (`template_slug`) | No Compplan |
> |---|---|---|
> | Tap to Go (Tap to Map não existe mais — tudo é Tap to Go) | `tap-to-map` | **Max Attention** |
> | Tap To Carousel, Tap To Slide (contam como **2** formatos) | `carrossel` / `slider` | **Max Attention** |
> | Tap To Scratch | `scratch` (Tap to Reveal) | **Max Attention** |
> | Tap To Chat, Tap To Hotspot, Tap to Max, Tap to Experience | — | **Max Attention** |
> | — | `play` (Tap to Game) | **Max Attention** |
> | — | `survey` (Tap to Choose) | **Max Attention** (✔ decidido — não é o Survey/Brand Lift) |
> | — | `freeform` (Free Form), `adserver` (Creative Ad Server) | **desconsiderados** (não são feature) |
> | Click to Calendar | widget `add_to_calendar` | Click to Calendar (feature própria) |
>
> Regra proposta: **cada formato Max Attention ativado** = formato no checklist **e** peça vinculada
> daquele formato na aba Max Attention do RC **com impressões > 0**. Formatos diferentes somam
> slots no Tier 1 (até 3).
>
> **Contagem:** cada formato Max Attention **diferente** no checklist conta 1 feature (Tap to Go + Tap to
> Carousel = 2; três diferentes = 3), limitado aos 3 slots do Tier 1. Tap To Carousel e Tap To Slide contam como 2 e, como usam o
> mesmo template na Platform (`carrossel`), exigem **duas peças de carrossel vinculadas**. Free Form e
> Creative Ad Server são desconsiderados. A prova é peça daquele formato na aba Max Attention com impressões > 0.
>
> Dependências: (1) **vincular as peças no Report Hub é responsabilidade do CS** ✔ — sem peça
> vinculada, o formato **não conta** no Compplan (a tela avisa "vincule a peça no Report Hub para
> contar esta feature"); (2) o Compplan lê `report_ma_links` direto no BQ e, para impressões, chama o RC
> (ou a Platform com a mesma service key).
>
> **Features fora da Max Attention** (Weather, Topics, Footfall, TV Sync, Downloaded Apps, Purchase
> Context, HYPR Pass, Attention Ad…) não aparecem nessa aba — são segmentação/medição. Para elas:
> - nome do criativo/line (ex.: `..._taptomap-shop_...` no print) quando houver convenção;
> - `campaign_surveys` (Survey/Brand Lift), `pdooh_data` (P-DOOH), `rmnd_data` (RMN Digital);
> - nas demais, o checklist é a fonte e a etapa fica "🟡 declarada" até existir prova.
>
> A "Métricas por audiência" (Visão Geral) usa só o segmento do `line_name` depois da tática; ali a
> feature só aparece se o tráfego a colocar no nome da line.

### 2.3 HYPR Library (pasta Audience Discovery)
- A Library já tem acesso à pasta **Audience Discovery** no Drive (service account `biblioteca-hypr@site-hypr`,
  escopo `drive.readonly`) e **já indexa tudo no BigQuery** (resync diário às 6h):
  - `hyprops_app.library_decks_metadata` — `deck_id`, `client` (= nome da pasta do cliente), nome,
    `mime_type`, `created_time`, `modified_time`;
  - `hyprops_app.library_decks_content` — texto do deck;
  - `hyprops_app.library_decks_slide_tags` — tags por slide (`solucao`, `feature`, `audiencia`) via `tagging.py`.
- **Caminho escolhido:** o Compplan **lê direto essas tabelas** (mesmo projeto BQ) para montar o dropdown
  e para saber quais features o deck oferece — sem chamar a API da Library e sem acesso novo ao Drive.
- Ajustes na Library: (1) incluir no `TAXONOMY` todas as features do Compplan (formatos Max Attention,
  Weather, Topics, Footfall, Video Survey, Purchase Context, HYPR Signals, GeoIQ, RevIQ…);
  (2) expor um "sincronizar este cliente agora" para deck criado depois do resync das 6h.
- Fallback (deck fora da pasta ou ainda não indexado): ler o arquivo na hora com o código portado de
  `drive_client.py` + `tagging.py` (precisa cobrir Google Docs e PDF, que a Library hoje não lê bem).

---

## 3. Arquitetura proposta

```
           ┌───────────── Force/Command ─────────────┐
           │ checklist, features, CS, CP, carteira   │
           └──────────────┬──────────────────────────┘
                          │ sync (Cloud Scheduler, 1h)
┌── Report Center ──┐     ▼                         ┌── Google ──────────────┐
│ métricas, loom,   │──► commplan_campaign_facts ◄──│ Drive (doc pré-camp.)  │
│ share_id, lines   │    (1 linha por token×fato,   │ Calendar (pós-venda)   │
└───────────────────┘     com origem e data)        └────────────────────────┘
                          │
                          ▼
              Engine (regras do catálogo em BQ)
                          │
            ┌─────────────┼───────────────┐
            ▼             ▼               ▼
     Tela do CS     Fila de divergências   Tabela/export
     (cards)        (admin)                de preenchimentos
```

### 3.1 Camada de integrações (`backend/integrations/`)
- `force.js` — checklist + carteira + CS (BQ; Command API só se o campo não existir no BQ).
- `reportcenter.js` — chama `navi_metrics` / `list` / `get_share_id` com JWT de serviço; fallback em BQ.
- `drive.js` — link → texto → features detectadas (port da Library).
- `calendar.js` — eventos do CS no período da campanha.

### 3.2 Tabela de fatos `commplan_campaign_facts`
Cada dado automático vira uma linha: `short_token, fact_key, value (JSON), source, source_ref,
fetched_at, confidence`. A engine lê **só daqui**, nunca das fontes ao vivo. Ganhos:
- Rastreabilidade ("esse Loom veio do RC em 05/10 às 14h").
- Snapshot imutável no fechamento do quarter (o número não muda depois de aprovado).
- Tela rápida (não depende do RC/Command estarem no ar).

### 3.3 Uma fonte só para métricas
**Decisão proposta:** o Compplan para de calcular over/eCPM/CTR/VTR/tech cost por conta própria e
passa a consumir o **Report Center** (mesma régua que o CS e o cliente veem). Pré-requisito: mover
o cálculo de tech cost para o backend do RC (ou expor no `navi_metrics`). Durante a transição,
rodar as duas fórmulas em paralelo e listar as campanhas onde o resultado de bônus muda.

---

## 4. Catálogo de etapas editável + cards

### 4.1 Mover o catálogo para o BigQuery
- Usar `commplan_rules` (já existe) + novos campos: `card_title`, `card_description` (o que
  configura a etapa), `card_obs` (regras/armadilhas), `evidence_kind` (nenhuma | link | drive_doc |
  calendar_event | auto), `source` (auto | semi_auto | manual), `validators` (lista), `depends_on`.
- `commplan_features_catalog` passa a ter `aliases` (ex.: `P-DOOH`, `PDOOH`, `pdooh`) e `doc_keywords`
  (termos para achar a feature no documento e no `line_name`).
- Comparação de features **normalizada** (minúsculas, sem acento, sem hífen/espaço) — corrige o bug de grafia.

### 4.2 Tela de admin "Etapas & regras"
- Incluir, desativar, reordenar etapas; editar % e texto do card.
- Mudança estrutural (nova etapa, novo critério) → cria **nova versão** com vigência a partir do
  próximo quarter (já previsto no README: "Caminho B").
- Pré-visualização: "se eu mudar isso, quanto muda o bônus do time no último quarter?".
- Tudo vai para `commplan_audit_log`.

### 4.3 Exemplo de card (Pré-campanha → mapas GeoIQ e RevIQ)
> **Enriquecimento — Uso de mapas do GeoIQ e RevIQ** · 0,20%
> **O que configura:** proposta com mapa gerado no GeoIQ ou no RevIQ **específico da campanha**
> (marca, praças, audiência ou dados de venda do cliente).
> **Obs.:** não vale mapa genérico ou reaproveitado de outra proposta só para preencher slide. O
> mapa precisa estar contextualizado (legenda/insight ligado ao objetivo da campanha).
> **Evidência:** link do documento da pré-campanha (lido automaticamente).
> **Validação:** deck do Audience Discovery cita GeoIQ/RevIQ + mesmo mapa não usado em outro cliente no quarter.

---

## 5. Catálogo da versão Q4/2026 (fechado ✔)

Vale para campanhas com início a partir de 01/10/2026. Q3/2026 e anteriores seguem a versão 2026 atual.

**Pré-campanha**

| Item | % | Origem |
|---|---|---|
| Definição de audiências (OOH, O2O ou RMN) | 0,15% | manual + deck |
| Definição de features — GroundFlow | 0,25% | manual + deck |
| Definição de features — Feature 1 / 2 / 3 | 0,20% / 0,15% / 0,10% | **auto**: ofertada no deck ∩ ativada |
| Enriquecimento — Case, estudo ou bench | 0,10% | manual + deck |
| Enriquecimento — Uso de mapas do GeoIQ e RevIQ | 0,20% | manual + deck |
| Criação de plano sazonal | 0,20% | manual + deck |

**Setup**

| Item | % | Origem |
|---|---|---|
| O2O / OOH | 0,45% | auto (checklist) |
| RMN Digital | 0,15% | auto (checklist) |
| GroundFlow | 0,55% | auto (checklist / line `_GROUNDFLOW_`) |
| Tier 1 — Max Attention (cada formato) · PDOOH · Survey · Purchase Context · HYPR Signals | até 3: 0,25% + 0,20% + 0,15% | auto (checklist; Max Attention exige peça vinculada no RC) |
| Tier 2 — Spotify · Map Intelligence · Downloaded apps · Click to Calendar · Carbon Neutral · Footfall | até 2: 0,20% + 0,15% | auto (checklist) |
| Tier 3 — TV Sync · HYPR Pass · Brand Query · Topics · Weather · Twitch TV · Video Survey | 1: 0,20% | auto (checklist) |

Invalidação do Setup mantida: creative fee > R$ 1.000, over > 50% sem justificativa ou under = perde 100% do Setup.

**Otimização** (sem mudança — paga só uma, 0,30%) · auto pelo Report Center
- Com ABS: Over ≤ 25% e eCPM ≤ R$ 1,50 e CTR ≥ 0,50%
- Sem ABS: Over ≤ 25% e eCPM ≤ R$ 0,70 e CTR ≥ 0,70%
- Vídeo (só vídeo): Tech Cost ≤ 3% e VTR ≥ 85%

**Account Management**

| Item | % | Origem |
|---|---|---|
| Visão analytics | 0,20% | manual |
| Relatórios | 0,10% | auto (share_id no RC) |
| Loom | 0,10% | auto (loom_url no RC) |
| Pós-venda — Reunião | 0,30% | evento do Google Calendar vinculado |
| Pós-venda — Doc PDF | 0,20% | link Drive |
| Pós-venda — Slides / One page | 0,10% | link Drive |
| Renovação | 0,25% | manual (+ detecção por novo checklist) |

Pós-venda não cumulativo: paga só o maior.

**Extras** (sem mudança): Dark test 0,10% · Design studio 0,15% · Estudos 0,30% (vai para o autor).
**Onboarding** (sem mudança): Acompanhamento de implementação de CS novo 0,25%.

---

## 5.1 Detalhe das mudanças por etapa

### Pré-campanha
| Etapa | Mudança |
|---|---|
| Enriquecimento — Uso de dados de venda RMNF / Mapa no Kepler | **Vira** "Enriquecimento — Uso de mapas do GeoIQ e RevIQ" (card acima). ✔ |
| Link da evidência da Pré-campanha | **Vira dropdown com busca**: digita o cliente → lista só os decks daquele cliente na pasta Audience Discovery (índice da Library). Colar link fica como exceção. |
| Definição de features 1/2/3 | Passa a ser **automática**: conta `ofertadas no doc ∩ ativadas`. |
| Enriquecimento — Bench/case/estudo/Explorer/Map Intelligence (0,10%) | **Vira** "Enriquecimento — Case, estudo ou bench" (0,10%). Explorer e Map Intelligence deixam de contar aqui. ✔ |
| Definição de features — RMN Físico (0,25%) | **Vira** "Definição de features — GroundFlow" (0,25%). ✔ |
| Definição de audiências, Plano sazonal | Mantidas, com card + validação pelo doc. |

**Regra de features (pré × setup):**
- Ofereceu no documento de pré-campanha **e** ativou → ganha **Pré-campanha** (feature N) **e** **Setup** (tier).
- **Não** ofereceu no documento, mas a campanha fechou com a feature e ele ativou → ganha **só Setup**.
- Ofereceu e não ativou → não ganha nada.
- "Ativou":
  - **Max Attention:** formato no checklist **e** peça vinculada na aba Max Attention do RC com impressões.
  - **Demais features:** **basta estar no checklist** ✔. Quando a feature entrar na taxonomia da line
    (e portanto aparecer como audiência no report), o Compplan usa isso como confirmação extra
    (🟡 declarado → ✅ confirmado), sem bloquear o pagamento.

### Setup
- **Max Attention** (Tier 1) agrupa no catálogo Tap to Go, Tap to Chat, Tap to Max, Tap to Carousel,
  Tap to Scratch, Tap to Experience, Tap To Slide, Tap To Hotspot, Tap to Choose e Tap to Game (Free Form e Creative Ad Server são desconsiderados).
  Cada formato diferente ativado conta como 1 feature do Tier 1 (o Tier 1 continua pagando até 3).
  Ganho: pagamento exige **prova na aba Max Attention**, não só a marcação no checklist.
- **Video Survey** entra no **Tier 3**. **CTV não é feature** (não entra nos tiers).
- **Saem do Tier 2:** Attention Ad e Seat.

**Tiers — nova versão (decididos):**

| Tier | Features | Paga |
|---|---|---|
| Tier 1 | Max Attention (cada formato conta 1) · PDOOH · Survey · Purchase Context · HYPR Signals | até 3 (0,25% + 0,20% + 0,15%) |
| Tier 2 | Spotify · Map Intelligence · Downloaded apps · Click to Calendar · Carbon Neutral · Footfall | até 2 (0,20% + 0,15%) |
| Tier 3 | TV Sync · HYPR Pass · Brand Query · Topics · Weather · Twitch TV · Video Survey | 1 (0,20%) |
| Fora | CTV · Attention Ad · Seat | — |

> Valem só para a nova versão; o Q3/2026 segue com os tiers atuais. A tabela não usada
> `commplan_features_catalog` (seeds com tiers divergentes) será substituída por esta lista.
- Pré-marcação via checklist normalizado + confirmação de entrega pelo RC.

**Mídia no Setup:**

| Item | % | Mudança |
|---|---|---|
| O2O / OOH | 0,45% | mantido |
| RMN Digital | 0,15% | mantido |
| RMN Físico | 0,55% | **Vira GroundFlow** ✔ (detecção automática: produto `Groundflow` no checklist do Force / tática `_GROUNDFLOW_` nas lines do RC). % mantido ✔. |

### Otimização
- 100% automática a partir do Report Center (pacing, over, CTR, eCPM, VTR, tech cost).
- O card mostra o valor de cada métrica, o limite e se passou.

### Account Management
| Etapa | Automação |
|---|---|
| Loom | Auto: existe `loom_url` no RC para o short token. |
| Relatório | Auto: existe `share_id` para o token (link montado direto). |
| Pós-venda — Reunião (0,30%) | Mantida ✔. Só pode ser marcada **vinculando um evento do Google Calendar** (ver §6). |
| Pós-venda — Doc PDF (**0,20%**, antes 0,30%) | ✔ Link do Drive lido automaticamente (verifica se é do cliente/campanha). |
| **Pós-venda — Slides / One page** (0,10%) | ✔ Novo (substitui o "One Page"). Link do Drive lido automaticamente. |
| **Renovação** (0,25%, antes "sem Value Proposition") | Mantida ✔. Dá para detectar via novo checklist do mesmo cliente na carteira do CS. |
| ~~Renovação com Value Proposition (0,50%)~~ | **Sai** ✔ |

> Pós-venda segue **não cumulativo** ✔: paga só o maior entre Reunião (0,30%), Doc PDF (0,20%) e Slides/One page (0,10%).

---

## 6. Pós-venda × Google Calendar

**Caminho recomendado: consultar a agenda só no momento de vincular, sem guardar token.**

1. Na etapa "Reunião pós-venda", o CS clica em **"Vincular reunião"**. O navegador pede a permissão
   `calendar.readonly` ao Google (autorização incremental — a primeira vez aparece o consentimento,
   depois é um clique). Todo mundo já loga com a conta Google @hypr.mobi.
2. O Compplan lista os eventos do CS na janela `[fim da campanha − 7 dias, fim + 45 dias]`, com os que
   têm convidados do domínio do cliente no topo (mesma lógica de `reuniao-agenda.ts` do Force).
3. O CS **escolhe qual evento** é o pós-venda daquela campanha → gravamos só `event_id`, calendário,
   data, título e convidados (sem o token).
4. Validação no ato: evento não cancelado, com convidado externo, data na janela. Sem evento vinculado,
   a etapa não pode ser marcada.

Por que esse caminho:
- **Não reaproveitar o token do Force:** `force_google_tokens` guarda refresh token em texto puro; ler
  essa tabela daria ao Compplan acesso à agenda de todo mundo, a qualquer hora. (Vale corrigir no Force.)
- **Não guardar refresh token no Compplan:** só precisamos da agenda no instante do vínculo; o token de
  acesso dura 1h e morre sozinho. Menos risco, nada para criptografar ou rotacionar.
- Custo: o CS precisa estar na tela para vincular (não há vínculo automático em segundo plano) — que é
  justamente o comportamento desejado (ele confirma qual reunião é o pós-venda).

---

## 7. Leitura automática do documento de pré-campanha

**Sim, dá para fazer.** Fluxo:
1. CS abre o **dropdown** "Documento da pré-campanha", que já vem filtrado pelo cliente da campanha
   (cliente do checklist × pasta do cliente no Audience Discovery, com busca por nome) e escolhe o deck.
2. O Compplan lê do índice da Library as **tags de feature por slide** (`library_decks_slide_tags`) —
   texto já extraído, nada a baixar.
3. Mapeia as tags para as features do catálogo (aliases) → lista de **features ofertadas**, com o
   número do slide como prova (link direto para o slide).
4. (Opcional, fase 2) LLM para casos ambíguos ("vamos usar clima para ativar…" → Weather).
5. Cruza com as features ativadas (§5) e calcula Pré-campanha automaticamente.

**Checagens anti-fraude:**
- Documento criado/modificado **antes do início da campanha** (`createdTime`, revisões do Drive) —
  se a feature só entrou no doc depois do start, sinaliza para o admin.
- Documento menciona o cliente/marca da campanha.
- Mesmo documento usado em mais de uma campanha → sinaliza.

**Pré-requisito:** a service account do Compplan precisa de leitura nas tabelas `library_decks_*`
(mesmo projeto `site-hypr`). Para o fallback (link colado fora da pasta), leitura do arquivo com a
service account — se ela não tiver acesso, o item fica ⚪ "sem dado" para o admin revisar.

**Recomendação:** exigir que o deck esteja no Audience Discovery (é onde a Library já procura). Isso
padroniza onde as propostas ficam e elimina o problema de permissão.

---

## 8. Validação e qualidade do preenchimento

Cada item da campanha passa a ter um **status de validação**:

| Status | Significado |
|---|---|
| ✅ Confirmado | Veio de fonte automática ou a evidência passou em todos os validadores. |
| 🟡 Declarado | CS marcou, evidência existe mas não dá para validar 100% (ex.: card qualitativo). |
| 🔴 Divergente | CS marcou e a fonte contradiz (ex.: feature não está no doc; Loom não existe no RC). |
| ⚪ Sem dado | Fonte indisponível — não bloqueia, mas aparece. |

- **Validadores reutilizáveis** (configuráveis por etapa no catálogo): link acessível; link do
  cliente certo; link não reutilizado; feature no doc; feature entregue; evento de agenda válido;
  métrica dentro do limite.
- **Fila de divergências** para admin: aprovar, reprovar ou corrigir (com motivo — vai para auditoria).
- **Painel de qualidade por CS**: % de itens automáticos, % divergentes, % reprovados, tempo até preencher.
- **Amostragem**: admin revisa X% aleatório dos itens "Declarados" por quarter.

---

## 9. Tabela de extração ("quem preencheu o quê")

Nova tela admin **Preenchimentos** + view no BQ `commplan_fill_matrix`:

`quarter · CS · cliente · campanha · short token · etapa · item · valor · origem (auto/manual/admin) ·
evidência · status de validação · preenchido por · quando · revisado por`

- Filtros por CS, quarter, etapa, status.
- Export CSV/XLSX (estende `routes/admin/export.js`).
- A mesma view serve para Looker/Sheets.

---

## 10. UX — tela da campanha

- Uma coluna por etapa (Pré → Setup → Otimização → Account → Extras), cada uma com o **card**
  (o que configura + obs) e o **status de validação** por item.
- Itens automáticos já aparecem preenchidos, com a origem ("do Report Center", "do checklist").
- CS só interage com o que não dá para automatizar; o resto é leitura.
- Barra de progresso "o que falta para fechar esta campanha".
- Avisos proativos: "Loom ainda não cadastrado no Report Center", "vincule a reunião de pós-venda".

---

## 11. Fases

> **Vigência decidida: Q4/2026.** O Q4 começou em 01/10, então a nova versão vale para campanhas com
> início a partir de 01/10/2026, mesmo que o código entre no ar depois do fechamento do Q3. O
> fechamento do Q4 (jan/2027) já roda inteiro na versão nova. Consequências:
> - nada de "um quarter em modo sombra": o teste de impacto é **recalcular o Q3 com as regras novas**
>   (sem pagar nada) e comparar com o que foi pago;
> - o que o CS já marcou em campanhas de Q4 na tela atual é migrado para os itens novos (ex.: Kepler →
>   GeoIQ/RevIQ) e aparece como "🟡 declarado" para revalidação.

| Fase | Entrega | Quando |
|---|---|---|
| **0 — Preparação (agora, sem deploy)** | Fechar decisões da §12; queries de validação (cobertura de `report_ma_links` no Q3, grafias de `cl_features`, decks do Audience Discovery por cliente); congelar regras do Q3. | Já |
| **1 — Regras Q4** | Catálogo em BQ + versão `2026-Q4` (vigência 01/10) + tiers novos + Max Attention por formato + normalização de features + item GeoIQ/RevIQ + cards. Recalcular Q3 com regras novas para medir impacto. | 1º deploy após fechar o Q3 |
| **2 — Dados automáticos** | `integrations/` + `commplan_campaign_facts` + sync horário (Force, carteira, RC, Max Attention). Métricas do RC lado a lado com as atuais até validar. | Logo depois |
| **3 — Pré-campanha e Account** | Dropdown de decks + features ofertadas (Library) · Loom e relatório do RC · vínculo de reunião via Calendar. | Meio do Q4 |
| **4 — Validação e auditoria** | Status por item, fila de divergências, painel de qualidade, tabela de preenchimentos, editor de etapas para admin. | Antes do fechamento do Q4 |

---

## 12. Decisões

**Fechadas ✔**
1. Max Attention = Tier 1; cada formato diferente no checklist = 1 feature (Tap to Go + Tap to Carousel = 2;
   Carousel + Slide = 2, exigindo duas peças de carrossel vinculadas). Tap to Map não existe mais (é Tap to Go).
   Tap to Choose = Max Attention. Free Form e Creative Ad Server desconsiderados. Tier 1 segue com até 3 slots.
2. Video Survey = Tier 3. CTV não é feature. Attention Ad e Seat saem do Tier 2.
3. "Enriquecimento — Uso de dados de venda RMNF / Mapa no Kepler" vira "Enriquecimento — Uso de mapas do GeoIQ e RevIQ" (0,20%). "Bench/case/estudo/Explorer/Map Intelligence" vira "Enriquecimento — Case, estudo ou bench" (0,10%).
4. "Ativou" (fora Max Attention) = basta estar no checklist; taxonomia da line vira confirmação extra.
5. Widget "Adicionar ao calendário" da Max Attention confirma Click to Calendar.
6. Vigência: Q4/2026.
7. Calendar: consulta só no vínculo, sem guardar token (§6).
8. Documento da pré-campanha: dropdown com os decks do cliente na pasta Audience Discovery, via índice da Library (§2.3, §7).
9. Vínculo de peças Max Attention no Report Hub é responsabilidade do CS; sem vínculo, o formato não conta.
10. Setup: RMN Físico vira GroundFlow.
11. Account Management: Reunião mantida (0,30%); Doc PDF 0,30% → 0,20%; novo "Slides / One page" 0,10%; Renovação com Value Proposition sai.

12. GroundFlow mantém 0,55% no Setup; na Pré-campanha "Definição de features — RMN Físico" vira "GroundFlow" (0,25%).
13. Pós-venda continua não cumulativo (paga o maior). Renovação fica como item único "Renovação" (0,25%).

14. Otimização, Extras e Onboarding mantidos sem mudança.
15. Tap To Chat, Tap To Hotspot, Tap to Max e Tap to Experience (sem tipo de peça na Platform) contam como formato Max Attention só pelo checklist.
16. Tap to Choose e Tap to Game passam a existir como features no checklist do Force (feito pelo time do Force); no Compplan já são reconhecidos como formatos Max Attention.

**Em aberto:** nada — catálogo Q4/2026 fechado (§5).

---

## 13. Riscos

- **Divergência de métrica** RC × Compplan muda bônus → resolver com modo sombra antes de valer.
- **Vínculo de peças Max Attention é manual no Report Hub** → responsabilidade do CS; sem vínculo o formato não conta. Mitigação: aviso na tela da campanha e lembrete antes do fechamento do quarter.
- **Nomenclatura de lines** inconsistente → feature "ativada" não detectada → fallback para checklist + revisão.
- **Permissão no Drive** → documento ilegível vira ⚪ Sem dado (não reprova o CS automaticamente).
- **Command `GET /checklists?short_token=` ignora o filtro** → sync deve ler do BQ, não da API.
- **Short token sem checagem de unicidade** → validar colisão no sync.
- **Carteira por nome** (não e-mail) → usar a mesma normalização do Force.
- **Tokens Google em texto puro no Force** → não replicar; corrigir lá também.
