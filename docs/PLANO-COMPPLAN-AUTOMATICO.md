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
> Dependências: (1) o vínculo é manual no RC — se o admin não vincular, a feature fica "⚪ sem dado"
> (não reprova); (2) o Compplan lê `report_ma_links` direto no BQ e, para impressões, chama o RC
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

### 2.3 HYPR Library
- `backend/drive_client.py`: extrai texto de Google Slides (export), `.pptx` (python-pptx) e por slide.
- `backend/tagging.py`: `TAXONOMY` (tag → regex) + normalização sem acento + `tag_slide`/`tag_deck`.
- Não há endpoint que receba um link arbitrário → **portar para o Compplan** (Node, `googleapis`)
  ou criar `POST /analyze` na Library. Recomendação: **portar** (código pequeno, evita acoplamento e deploy de outro serviço).
- Lacunas a cobrir no port: Google **Docs**, **PDF** (o caminho atual da Library provavelmente
  retorna vazio), parser de link → `fileId`, detecção de `mimeType`.

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

### 4.3 Exemplo de card (Pré-campanha → Mapas HYPR)
> **Enriquecimento — Mapas HYPR (Explorer / GeoIQ)** · 0,20%
> **O que configura:** proposta com mapa gerado no Explorer ou GeoIQ **específico da campanha**
> (marca, praças, audiência ou dados de venda do cliente).
> **Obs.:** não vale mapa genérico ou reaproveitado de outra proposta só para preencher slide. O
> mapa precisa estar contextualizado (legenda/insight ligado ao objetivo da campanha).
> **Evidência:** link do documento da pré-campanha (lido automaticamente).
> **Validação:** documento cita Explorer/GeoIQ + mesmo mapa/link não usado em outro cliente no quarter.

---

## 5. Mudanças nas etapas (proposta inicial — validar com você)

### Pré-campanha
| Etapa | Mudança |
|---|---|
| Enriquecimento — Mapa no Kepler | **Sai.** |
| Enriquecimento — Mapas HYPR (Explorer / GeoIQ) | **Entra** (card acima). |
| Definição de features 1/2/3 | Passa a ser **automática**: conta `ofertadas no doc ∩ ativadas`. |
| Definição de audiências, RMN Físico, Bench/estudo, Plano sazonal | Mantidas, com card + validação pelo doc. |

**Regra de features (pré × setup):**
- Ofereceu no documento de pré-campanha **e** ativou → ganha **Pré-campanha** (feature N) **e** **Setup** (tier).
- **Não** ofereceu no documento, mas a campanha fechou com a feature e ele ativou → ganha **só Setup**.
- Ofereceu e não ativou → não ganha nada.
- "Ativou" = está no checklist **e** há prova de entrega: peça com o formato na aba **Max Attention** do RC
  (rich media), ou survey/P-DOOH/RMND nas tabelas do RC, ou line/criativo com a feature no nome.

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

### Otimização
- 100% automática a partir do Report Center (pacing, over, CTR, eCPM, VTR, tech cost).
- O card mostra o valor de cada métrica, o limite e se passou.

### Account Management
| Etapa | Automação |
|---|---|
| Loom | Auto: existe `loom_url` no RC para o short token. |
| Relatório | Auto: existe `share_id` para o token (link montado direto). |
| Pós-venda — Reunião | Só pode ser marcada **vinculando um evento do Google Calendar** (ver §6). |
| Pós-venda — Doc/One page | Link do Drive lido automaticamente (verifica se é do cliente/campanha). |
| Renovação | A definir: dá para detectar renovação via novo checklist do mesmo cliente na carteira do CS. |

---

## 6. Pós-venda × Google Calendar

1. **Login no Compplan** pede o escopo `calendar.readonly` (incremental, mesmo OAuth client do Force
   para o usuário consentir uma vez só).
2. Na etapa "Reunião pós-venda", o Compplan lista eventos do CS na janela
   `[fim da campanha − 7 dias, fim + 45 dias]`, priorizando os que têm convidados com domínio do cliente
   (mesma lógica de `reuniao-agenda.ts` do Force).
3. O CS **escolhe qual evento** é o pós-venda daquela campanha → gravamos `event_id`, data,
   título, convidados.
4. Validação automática: evento aconteceu (não cancelado), tem convidado externo, data na janela.
   Sem evento vinculado, a etapa não pode ser marcada.

**Segurança:** o Force guarda refresh token em texto puro em `force_google_tokens`. Recomendo o
Compplan **não reutilizar** essa tabela; pedir o escopo próprio e guardar o token criptografado
(KMS/Secret Manager) — e levar a mesma correção para o Force.

---

## 7. Leitura automática do documento de pré-campanha

**Sim, dá para fazer.** Fluxo:
1. CS cola o link do Drive → backend extrai `fileId`, descobre `mimeType`.
2. Extrai texto (Docs/Slides via export, `.pptx`, PDF via download + parser).
3. Procura cada feature do catálogo pelos `doc_keywords`/aliases (normalizado, sem acento) →
   lista de **features ofertadas** com o trecho e o número do slide como prova.
4. (Opcional, fase 2) LLM para casos ambíguos ("vamos usar clima para ativar…" → Weather).
5. Cruza com as features ativadas (§5) e calcula Pré-campanha automaticamente.

**Checagens anti-fraude:**
- Documento criado/modificado **antes do início da campanha** (`createdTime`, revisões do Drive) —
  se a feature só entrou no doc depois do start, sinaliza para o admin.
- Documento menciona o cliente/marca da campanha.
- Mesmo documento usado em mais de uma campanha → sinaliza.

**Pré-requisito:** a service account do Compplan precisa ter leitura nos documentos (pasta
compartilhada / shared drive de propostas). Alternativa: ler com o token Google do próprio CS.

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

| Fase | Entrega | Vai para produção? |
|---|---|---|
| **0 — Validação (agora, sem código em prod)** | (a) Confirmar o mapeamento formato Max Attention → feature e quanto das campanhas do Q3 tem peças vinculadas em `report_ma_links`; query nos `line_name`/criativos para as features fora da Max Attention; (b) listar grafias de `cl_features` no Command × catálogo; (c) suas decisões da §12; (d) congelar regras do Q3. | Não |
| **1 — Fundação** | Catálogo em BQ + versão nova + editor de etapas + cards + normalização de features (aliases). | Depois do fechamento do Q3 |
| **2 — Integrações de dados** | `integrations/` + `commplan_campaign_facts` + sync horário (Force, carteira, RC). Métricas do RC em **modo sombra** ao lado das atuais. | Sim, em modo sombra |
| **3 — Account Management automático** | Loom e relatório do RC; pós-venda via Calendar. | Sim |
| **4 — Documento de pré-campanha** | Leitura de Drive + detecção de features + regra ofertou × ativou. | Sim |
| **5 — Validação e auditoria** | Status por item, fila de divergências, painel de qualidade, tabela de preenchimentos. | Sim |
| **6 — Nova versão valendo** | Comparativo sombra × atual de um quarter inteiro → ativa a versão nova no quarter seguinte. | Sim |

---

## 12. Decisões que preciso de você

1. ✔ Max Attention = Tier 1, cada formato conta 1 (Tap to Go + Tap to Choose = 2); Tier 1 segue com até 3 slots; Video Survey = Tier 3; CTV não é feature. Attention Ad e Seat saem do Tier 2. Tap to Map não existe mais (é Tap to Go). Cada formato diferente no checklist = 1 feature (Tap to Go + Tap to Carousel = 2; 3 diferentes = 3). Tap To Carousel + Tap To Slide = 2, com duas peças de carrossel vinculadas como prova. Free Form e Creative Ad Server desconsiderados.
2. **Quais etapas saem** além do Kepler e quais entram além de Mapas HYPR.
3. **% da etapa Mapas HYPR** — mantém o 0,20% do Kepler?
4. **"Ativou"** — basta estar no checklist ou exige prova de entrega no RC?
5. **Max Attention:** (Tap to Choose = Max Attention ✔; Free Form e Creative Ad Server desconsiderados ✔; Carousel + Slide exigem 2 peças de carrossel ✔.) Widget "Adicionar ao calendário" ativa Click to Calendar? e se o **vínculo de peças no RC** passa a ser obrigatório para toda campanha com rich media.
6. **Vigência** da nova versão: Q4/2026 ou Q1/2027?
7. **Calendar:** Compplan pede o próprio escopo (recomendado) ou reaproveita o token do Force?
8. **Docs no Drive:** shared drive de propostas acessível à service account, ou leitura com o token do CS?

---

## 13. Riscos

- **Divergência de métrica** RC × Compplan muda bônus → resolver com modo sombra antes de valer.
- **Vínculo de peças Max Attention é manual no RC** → se não for feito, a feature rich media fica sem prova; tornar parte do checklist de go-live da campanha.
- **Nomenclatura de lines** inconsistente → feature "ativada" não detectada → fallback para checklist + revisão.
- **Permissão no Drive** → documento ilegível vira ⚪ Sem dado (não reprova o CS automaticamente).
- **Command `GET /checklists?short_token=` ignora o filtro** → sync deve ler do BQ, não da API.
- **Short token sem checagem de unicidade** → validar colisão no sync.
- **Carteira por nome** (não e-mail) → usar a mesma normalização do Force.
- **Tokens Google em texto puro no Force** → não replicar; corrigir lá também.
