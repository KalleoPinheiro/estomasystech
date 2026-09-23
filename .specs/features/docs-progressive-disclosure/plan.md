# Documentação em Progressive Disclosure

Sources:

- conversa (2026-09-23) - pedido de TPM/arquiteto: estrutura de docs por domínio, template de especificação funcional, guia de onboarding/integrações/troubleshooting, arquivo global de contexto, roadmap indexável e guia de governança para consumo por IA
- `AGENTS.md`, `CONTEXT.md`, `README.md`, `docs/**`, `.specs/STATE.md` - estado atual lido nesta sessão; é daqui que saem os números do Problem
- conversa (2026-09-23, resposta do usuário) - aprova `AGENTS.md` como SSOT e a migração em um único PR

## Problem

O Vitta Flow já tem as peças certas (glossário em `CONTEXT.md`, 4 ADRs, PRDs por fase, roadmap
faseado, `.specs/` por feature), mas elas não estão arranjadas para leitura progressiva, e quem
paga é quem chega sem contexto — dev novo ou LLM:

- **A mesma verdade existe em 4 cópias que já divergem.** A tabela de variáveis de ambiente está
  em `README.md` (l. 54), `docs/setup-local.md` (l. 75), `AGENTS.md` (§ Env vars) e `.env.example`;
  o passo a passo de Docker está em `README.md` e em `docs/setup-local.md` com textos diferentes
  (só o segundo avisa de `delivered: false`).
- **Não há camada de domínio entre o glossário e o código.** Para saber "como funciona a agenda"
  hoje é preciso cruzar `CONTEXT.md` (291 linhas, todos os domínios), a seção `Funcionalidades`
  do `README.md` e 45 pastas em `.specs/features/`, que são snapshots de execução, não o estado vivo.
- **Integrações externas não têm documento.** `src/infrastructure/` tem 4 gateways (Resend,
  Google Calendar, Meta WhatsApp, S3) e há um endpoint de cron (`/api/reminders/run`,
  `CRON_SECRET`); credenciais, contrato e modo de falha de cada um só existem espalhados em
  `.env.example`, `AGENTS.md` e no código.
- **O contexto que todo agente carrega está poluído.** `.specs/STATE.md` tem 769 linhas, das quais
  ~600 são handoffs de sequências `CONCLUÍDA`; a skill manda ler esse arquivo antes de toda feature.
- **Nada impede link quebrado.** Nenhum gate de CI olha `docs/`; 11 arquivos `.md` apontam para
  `setup-local.md`/`plano-evolucao-faseado.md` por caminho literal.

O source não traz métrica de custo (tempo de onboarding, tokens desperdiçados); não inventamos uma.

Quando isto for entregue: uma LLM ou um dev lê `AGENTS.md` (≤ 150 linhas), encontra na tabela
"vai mexer em X → leia Y" o único arquivo do domínio, e daí desce para a spec funcional, a
integração ou o ADR — cada fato em um lugar só, com o CI provando que os links resolvem.

## Out of scope

| Excluded | Why |
| --- | --- |
| Reescrever o conteúdo de PRDs, ADRs e auditorias | são snapshots/decisões; só ganham frontmatter e entram no índice |
| Mudar o layout de `.specs/features/` | é fixado pelas skills tlc-*; `docs/agents/planning.md` já proíbe reorganizá-lo daqui |
| Sincronização automática repo ↔ GitHub Projects/Jira/Notion (bot, Action) | exige token e decisão de ferramenta; o plano define o contrato manual e deixa a automação para uma feature própria |
| Documentação de API gerada (OpenAPI) | outra feature; a seção `API` do README fica como está, só é movida |
| `CONTEXT-MAP.md` multi-contexto | o repo é single-context (`docs/agents/domain.md`); a camada de domínio aqui é de documentação, não de bounded context no código |
| Tradução dos docs | prosa segue PT-BR como hoje; arquivos em inglês (`CONTEXT.md`, ADR-001/002) ficam como estão |

## Assumptions

| Assumption | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Criar `PROJECT_CONTEXT.md` separado como SSOT | **não criar**: `AGENTS.md` vira o SSOT/roteador; `CLAUDE.md` continua `@AGENTS.md` | `AGENTS.md` é lido nativamente por Cursor, Copilot, Codex, Gemini e Claude (via import); um segundo arquivo "global" divide a verdade e nenhuma ferramenta o carrega sozinha | y |
| Ferramenta de gestão do roadmap | GitHub Projects espelha; o arquivo no repo é a fonte | issues já vivem no GitHub (`docs/agents/issue-tracker.md`); Projects lê issues sem integração extra; o arquivo é versionado e legível offline por LLM | n |
| Idioma dos templates | cabeçalhos-schema estáveis + prosa PT-BR; Gherkin em PT (`Dado/Quando/Então`, `# language: pt`) | é o idioma do produto e dos PRDs; palavras-chave Gherkin em PT são oficiais | n |
| Caminhos com muitas referências | manter `docs/plano-evolucao-faseado.md` e `docs/still-void-gaps.md` onde estão | `scripts/check-sv-adoption.sh` l. 55 fixa `docs/still-void-gaps.md`; o plano faseado é citado em 11 `.md`, inclusive `.specs/` congelados | n |
| `docs/setup-local.md` | move para `docs/engineering/onboarding.md` e os links vivos são atualizados | nome atual não descreve integrações/troubleshooting; referências em `.specs/` congelados ficam históricas (fora do checker) | n |
| Domínios da camada de docs | 9: `acesso`, `pacientes-prontuario`, `agenda`, `financeiro`, `estoque`, `portal`, `equipe-parceiros`, `comunicacao`, `relatorios` | agrupam as 16 pastas de `src/domain` + 14 de `src/application` em unidades que um PO reconhece | n |
| Prazo de revisão de doc vivo | 90 dias em `last_reviewed`, só aviso | bloquear por data gera commits cosméticos de "bump"; aviso mantém o sinal sem ruído | n |
| Handoffs concluídos de `STATE.md` | movem para `.specs/archive/handoff-<ano>.md`; `## Decisions` e handoffs abertos ficam | reduz a leitura obrigatória sem perder histórico | n |
| Migração em fases ou em um PR | um único PR com todas as fatias | decisão do usuário | y |
| Links dentro de `docs/templates/` | fora da checagem de links (frontmatter continua obrigatório) | um template aponta para o destino onde será copiado, com placeholders como `<slug>`; checar daqui produziria falso vermelho | n |

**Open questions:** none - all resolved or logged above.

## Criteria

### S1: Roteador L0 - `AGENTS.md` como fonte única (P1)

**Acceptance Criteria**

1. The `AGENTS.md` SHALL have at most 150 lines and contain these H2 sections, in this order: `Produto`, `Comandos`, `Regras invioláveis`, `Mapa de contexto`, `Agent skills`
2. The `Mapa de contexto` section SHALL be a table with columns `Se vai mexer em`, `Leia primeiro`, `Depois, se precisar`, with one row per domain in `docs/domains/`
3. The files `.github/copilot-instructions.md` and `.cursor/rules/00-vitta-flow.mdc` SHALL each have at most 15 lines and contain no rule that is not also in `AGENTS.md`
4. The `README.md` SHALL have at most 120 lines and SHALL NOT contain the environment variable table

**Independent test:** abrir só o `AGENTS.md` e chegar ao doc de domínio da agenda em um clique.

### S2: Camada de domínio e metadados (P1)

**Acceptance Criteria**

5. The repository SHALL contain `docs/domains/<slug>/README.md` for each of the 9 domains in Assumptions
6. The system SHALL require every `docs/domains/<slug>/README.md` to contain the H2 sections `Resumo`, `Regras de negócio`, `Funcionalidades`, `Código`, `Decisões` in this order
7. The system SHALL require every `.md` file under `docs/` to start with YAML frontmatter containing `title`, `status`, `audience`, `owner`, `last_reviewed`
8. The frontmatter `status` SHALL be one of `living`, `frozen`, `draft`, `superseded`
9. The `docs/README.md` SHALL link every `.md` file under `docs/` except files inside `docs/domains/*/features/`, which are linked from their domain README

**Independent test:** `npm run check:docs` verde num checkout limpo.

### S3: Templates (P1)

**Acceptance Criteria**

10. The directory `docs/templates/` SHALL contain `feature-spec.md`, `integration.md`, `prd.md`, `adr.md`, `domain.md`
11. The `docs/templates/feature-spec.md` SHALL contain the H2 sections `Resumo`, `Contexto e valor`, `Regras de negócio`, `Casos de uso`, `Fluxo de valor`, `Critérios de aceite`, `Fora de escopo`, `Rastreabilidade`
12. The `Critérios de aceite` section of `feature-spec.md` SHALL contain a fenced block tagged `gherkin` starting with `# language: pt`

**Independent test:** copiar o template, preencher uma funcionalidade real (ex.: lista de espera) e passar no `check:docs`.

### S4: Onboarding, integrações e troubleshooting consolidados (P1)

**Acceptance Criteria**

13. The environment variable table SHALL exist only in `docs/engineering/onboarding.md`, and `README.md` and `AGENTS.md` SHALL link to it
14. The `docs/engineering/integrations/` directory SHALL contain one file per external dependency: `resend.md`, `google-calendar.md`, `whatsapp-meta.md`, `s3-storage.md`, `cron.md`
15. The system SHALL require every integration file to contain the H2 sections `Propósito`, `Credenciais`, `Contrato`, `Modos de falha`, `Teste local`
16. The `docs/engineering/troubleshooting.md` SHALL contain every row of the current `docs/setup-local.md` troubleshooting table (8 rows)

**Independent test:** dev novo sobe o compose seguindo só o `onboarding.md` e cria o Super Admin.

### S5: Roadmap indexável (P2)

**Acceptance Criteria**

17. The `docs/plano-evolucao-faseado.md` SHALL contain a `Now / Next / Later` table whose rows each carry `id` (`RM-NN`), `status`, `issue` and `spec` columns
18. IF a roadmap row has status `entregue` THEN its `spec` cell SHALL link a directory that exists under `.specs/features/`
19. The `status` column SHALL use only `backlog`, `especificado`, `em-andamento`, `entregue`, `descartado`

**Independent test:** filtrar a tabela por `status` e bater com a view do GitHub Project.

### S6: Docs-as-code no CI (P1)

**Acceptance Criteria**

20. WHEN `npm run check:docs` finds a relative Markdown link in `AGENTS.md`, `CONTEXT.md`, `README.md` or `docs/**` (except `docs/templates/**`) whose target does not exist THEN it SHALL exit `1` and print `file:line -> target`
21. IF a file under `docs/` violates criterion 7 or 8 THEN `npm run check:docs` SHALL exit `1` naming the file and the missing key
22. WHEN a `living` file has `last_reviewed` older than 90 days THEN `npm run check:docs` SHALL print a warning and exit `0`
23. The CI job that runs `npm run lint` SHALL also run `npm run check:docs`
24. The `.specs/STATE.md` SHALL have at most 250 lines, with sections marked `CONCLUÍDA` moved to `.specs/archive/`

**Independent test:** quebrar um link de propósito e ver o CI vermelho.

## Traceability

| ID | Slice | Criteria | Status |
| --- | --- | --- | --- |
| DOCS-01 | S1 | 1, 2, 3, 4 | Pending |
| DOCS-02 | S2 | 5, 6, 7, 8, 9 | Pending |
| DOCS-03 | S3 | 10, 11, 12 | Pending |
| DOCS-04 | S4 | 13, 14, 15, 16 | Pending |
| DOCS-05 | S5 | 17, 18, 19 | Pending |
| DOCS-06 | S6 | 20, 21, 22, 23, 24 | Pending |

## Observable

| Surface | Decision | Landing |
| --- | --- | --- |
| document `AGENTS.md` | structure | AC 1, 2 |
| document `AGENTS.md` | tone and depth | AC 1 - só regra e ponteiro; explicação desce para `docs/` |
| document `AGENTS.md` | what the reader does next | AC 2 - a tabela manda para um arquivo |
| document `docs/domains/*/README.md` | structure | AC 6 |
| document `docs/domains/*/README.md` | what the reader does next | AC 6 - seção `Código` aponta pastas de `src/` e testes |
| document `docs/templates/feature-spec.md` | structure | AC 11, 12 |
| document `docs/engineering/onboarding.md` | structure and depth | AC 13, 16 |
| document `docs/engineering/integrations/*` | structure | AC 15 |
| document `docs/plano-evolucao-faseado.md` | structure | AC 17, 19 |
| collection `docs/` | grouping criterion | AC 5 - por domínio de negócio; `engineering/` para o que é transversal |
| collection `docs/` | naming | existing - `lower-kebab-case.md` (`docs/agents/planning.md` § Naming) |
| collection `docs/` | ordering | AC 9 - índice em `docs/README.md` |
| collection `docs/` | duplicates | AC 13 - cada fato em um arquivo; os outros linkam |
| collection `docs/` | the exception that does not fit | existing - `docs/audits/` congelado com sufixo de data |
| command `npm run check:docs` | output format | AC 20, 21 - `file:line -> target` |
| command `npm run check:docs` | exit codes | AC 20, 21, 22 - `1` erro, `0` com aviso |
| command `npm run check:docs` | flags and defaults | n/a - sem flags; escopo fixo nos caminhos do AC 20 |
| command `npm run check:docs` | failure halfway | n/a - leitura pura, não escreve nada |

## Flow

Reusa o que já existe: `CONTEXT.md` continua sendo o glossário (não é duplicado nos domínios, só
linkado), os ADRs e `.specs/` continuam onde estão, e o gate novo segue o padrão de
`check:sv` (script em `scripts/`, chamado por `npm run`, passo no `ci.yml`).

1. leitor (humano ou LLM) -> `AGENTS.md` (exists, reescrito - door 1) - produto, comandos, regras, mapa
2. `AGENTS.md` -> `docs/domains/<slug>/README.md` (new - door 2) - resumo, regras, funcionalidades, código
3. `docs/domains/<slug>/README.md` -> `docs/domains/<slug>/features/<feature>.md` (new - door 2), `CONTEXT.md` (exists), `docs/adr/` (exists), `.specs/features/` (exists)
4. tarefa técnica -> `docs/engineering/{onboarding,architecture,conventions,troubleshooting}.md` e `integrations/` (new - door 2)
5. autor de doc -> `docs/templates/` (new - door 2) - copia, preenche frontmatter (door 3)
6. PR -> `scripts/check-docs.ts` (new - door 4) via `npm run check:docs` no `ci.yml` (exists)
7. out: CI vermelho em link quebrado/frontmatter inválido; aviso em doc vivo vencido

## Relations

None - no stored-data shape change

## Surface

None - nothing consumed outside; `npm run check:docs` é interno ao repo e não tem status HTTP

## Landing

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| 1. `AGENTS.md` é o SSOT e roteador | 5 seções fixas (AC 1); pontes finas em `.github/copilot-instructions.md` e `.cursor/rules/00-vitta-flow.mdc` que só apontam para ele | `PROJECT_CONTEXT.md` separado - nenhuma ferramenta o carrega sozinha, e coexistir com `AGENTS.md` cria duas verdades |
| 2. Árvore de `docs/` | `docs/{domains/<slug>/{README.md,features/},engineering/{integrations/},product/,adr/,audits/,agents/,templates/}` | pastas por tipo de artefato no topo (`specs/`, `guides/`) - o leitor chega com um domínio na cabeça, não com um tipo; caminhos viram links em issues/PRs e deixam de ser baratos de mudar |
| 3. Schema de frontmatter | `title`, `status` ∈ {`living`,`frozen`,`draft`,`superseded`}, `audience` ∈ {`dev`,`po`,`stakeholder`,`agent`} (lista), `owner`, `last_reviewed` (`YYYY-MM-DD`); opcionais `domain`, `related` | sem metadados - LLM não distingue snapshot congelado de verdade viva; tags livres - não validáveis |
| 4. Gate `check:docs` | `tsx scripts/check-docs.ts`, sem dependência nova, só links relativos | `lychee`/`markdown-link-check` - dependência nova e checagem de URL externa é instável em CI |

- Nothing else in this change is hard to reverse

## Impact

| Front | What changes |
| --- | --- |
| domain | new term: `doc vivo` (`status: living`) - descreve o sistema agora, atualizado no mesmo PR que muda o comportamento; lives in `docs/domains/`, `docs/engineering/` |
| domain | existing term: `spec` - hoje nomeia `.specs/features/<slug>/spec.md` (execução, congelado); passa a coexistir com `docs/domains/*/features/*.md` (funcional, vivo) - `docs/agents/planning.md` e a skill `fix-audit-issues` ramificam nele e ganham uma linha distinguindo os dois |
| docs | `README.md` perde ~150 linhas (env vars, API, arquitetura) que descem para `docs/engineering/`; `docs/setup-local.md` deixa de existir e 11 links vivos são atualizados; referências em `.specs/` congelados ficam históricas |
| agents | `.specs/STATE.md` encolhe de 769 para ≤ 250 linhas; handoffs concluídos vão para `.specs/archive/` |
| CI | novo passo `check:docs` no job de lint - o primeiro PR após o merge falha se trouxer link quebrado |
| stored data | nothing to migrate |
