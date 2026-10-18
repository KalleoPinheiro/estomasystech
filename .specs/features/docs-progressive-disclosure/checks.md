# Documentação em Progressive Disclosure - checks

Profile: light
Plan: `.specs/features/docs-progressive-disclosure/plan.md`

## Intent

30 checks em 6 fatias · 4 portas sem volta · 0 perguntas abertas

Duas provas cobrem tudo: `tests/scripts/check-docs.test.ts` exercita o gate `check:docs` sobre
fixtures (planta a violação e exige o vermelho, como `tests/scripts/check-sv-adoption.test.ts`
faz com `check:sv`), e `tests/docs/structure.test.ts` afirma a estrutura sobre a árvore real do
repositório.

## Checks

### S1 - Roteador L0 · 4 arquivos · ~20 KB · ~5k

**C1** - `AGENTS.md` tem no máximo 150 linhas (DOCS-01, AC 1)
Proof: `npx vitest run tests/docs/structure.test.ts -t "AGENTS.md tem no máximo 150 linhas"`

**C2** - As H2 de `AGENTS.md` aparecem nesta ordem: `Produto`, `Comandos`, `Regras invioláveis`, `Mapa de contexto`, `Agent skills` (DOCS-01, AC 1)
Proof: `npx vitest run tests/docs/structure.test.ts -t "AGENTS.md tem as seções na ordem"`

**C3** - `Mapa de contexto` é uma tabela com as colunas `Se vai mexer em`, `Leia primeiro`, `Depois, se precisar` e uma linha que linka cada um dos 9 `docs/domains/<slug>/` (DOCS-01, AC 2)
Proof: `npx vitest run tests/docs/structure.test.ts -t "mapa de contexto linka os 9 domínios"`

**C4** - `.github/copilot-instructions.md` e `.cursor/rules/00-estomasystech.mdc` existem, têm no máximo 15 linhas cada e linkam `AGENTS.md` (DOCS-01, AC 3)
Proof: `npx vitest run tests/docs/structure.test.ts -t "pontes apontam para AGENTS.md"`

**C5** - `README.md` tem no máximo 120 linhas e não contém a linha de cabeçalho da tabela de variáveis (`| Variável |`) (DOCS-01, AC 4)
Proof: `npx vitest run tests/docs/structure.test.ts -t "README enxuto e sem tabela de variáveis"`

### S2 - Domínios e metadados · ~30 arquivos · ~120 KB · ~30k

**C6** - Existem os 9 `docs/domains/<slug>/README.md`: `acesso`, `pacientes-prontuario`, `agenda`, `financeiro`, `estoque`, `portal`, `equipe-parceiros`, `comunicacao`, `relatorios` (DOCS-02, AC 5)
Proof: `npx vitest run tests/docs/structure.test.ts -t "existem os 9 domínios"`

**C7** - Cada README de domínio tem as H2 `Resumo`, `Regras de negócio`, `Funcionalidades`, `Código`, `Decisões`, nesta ordem (DOCS-02, AC 6)
Proof: `npx vitest run tests/docs/structure.test.ts -t "README de domínio tem as seções na ordem"`

**C8** - Um `.md` em `docs/` sem frontmatter, ou sem uma das chaves `title`, `status`, `audience`, `owner`, `last_reviewed`, faz `check:docs` sair `1` nomeando o arquivo e a chave (DOCS-02, AC 7; DOCS-06, AC 21)
Proof: `npx vitest run tests/scripts/check-docs.test.ts -t "frontmatter ausente"`
Proof: `npx vitest run tests/scripts/check-docs.test.ts -t "chave de frontmatter ausente"`

**C9** - `status` fora de `living`, `frozen`, `draft`, `superseded` faz `check:docs` sair `1` (DOCS-02, AC 8; DOCS-06, AC 21)
Proof: `npx vitest run tests/scripts/check-docs.test.ts -t "status inválido"`

**C10** - Os 4 valores válidos de `status` passam com saída `0` (DOCS-02, AC 8)
Proof: `npx vitest run tests/scripts/check-docs.test.ts -t "aceita os quatro status"`

**C11** - `docs/README.md` linka todo `.md` de `docs/` exceto os de `docs/domains/*/features/` (DOCS-02, AC 9)
Proof: `npx vitest run tests/docs/structure.test.ts -t "índice de docs linka todos os arquivos"`

**C12** - A árvore real passa em `check:docs` com saída `0` (DOCS-02, AC 7, 8; DOCS-06, AC 20)
Proof: `npx vitest run tests/docs/structure.test.ts -t "check:docs verde na árvore real"`

### S3 - Templates · 5 arquivos · ~20 KB · ~5k

**C13** - `docs/templates/` contém `feature-spec.md`, `integration.md`, `prd.md`, `adr.md`, `domain.md` (DOCS-03, AC 10)
Proof: `npx vitest run tests/docs/structure.test.ts -t "existem os 5 templates"`

**C14** - `feature-spec.md` tem as H2 `Resumo`, `Contexto e valor`, `Regras de negócio`, `Casos de uso`, `Fluxo de valor`, `Critérios de aceite`, `Fora de escopo`, `Rastreabilidade`, nesta ordem (DOCS-03, AC 11)
Proof: `npx vitest run tests/docs/structure.test.ts -t "template de spec tem as seções na ordem"`

**C15** - A seção `Critérios de aceite` de `feature-spec.md` contém um bloco ```` ```gherkin ```` cuja primeira linha é `# language: pt` (DOCS-03, AC 12)
Proof: `npx vitest run tests/docs/structure.test.ts -t "critérios de aceite em gherkin pt"`

### S4 - Onboarding, integrações, troubleshooting · ~12 arquivos · ~60 KB · ~15k

**C16** - Só `docs/engineering/onboarding.md` contém a linha de cabeçalho `| Variável |` entre `README.md`, `AGENTS.md` e `docs/**`; `README.md` e `AGENTS.md` linkam `docs/engineering/onboarding.md` (DOCS-04, AC 13)
Proof: `npx vitest run tests/docs/structure.test.ts -t "tabela de variáveis existe só no onboarding"`

**C17** - `docs/engineering/integrations/` contém `resend.md`, `google-calendar.md`, `whatsapp-meta.md`, `s3-storage.md`, `cron.md` (DOCS-04, AC 14)
Proof: `npx vitest run tests/docs/structure.test.ts -t "existem as 5 integrações"`

**C18** - Cada um dos 5 arquivos de integração tem as H2 `Propósito`, `Credenciais`, `Contrato`, `Modos de falha`, `Teste local` (DOCS-04, AC 15)
Proof: `npx vitest run tests/docs/structure.test.ts -t "integração tem as seções"`

**C19** - `docs/engineering/troubleshooting.md` contém os 8 sintomas da tabela atual de `docs/setup-local.md` (DOCS-04, AC 16)
Proof: `npx vitest run tests/docs/structure.test.ts -t "troubleshooting preserva os 8 sintomas"`

### S5 - Roadmap · 1 arquivo · ~12 KB · ~3k

**C20** - `docs/plano-evolucao-faseado.md` tem tabelas `Now`, `Next`, `Later` cujas linhas têm `id` no formato `RM-NN` e colunas `status`, `issue`, `spec` (DOCS-05, AC 17)
Proof: `npx vitest run tests/docs/structure.test.ts -t "roadmap now next later"`

**C21** - Toda linha com status `entregue` linka um diretório existente em `.specs/features/` (DOCS-05, AC 18)
Proof: `npx vitest run tests/docs/structure.test.ts -t "entregue linka spec existente"`

**C22** - Todo `status` do roadmap está em `backlog`, `especificado`, `em-andamento`, `entregue`, `descartado` (DOCS-05, AC 19)
Proof: `npx vitest run tests/docs/structure.test.ts -t "status do roadmap no vocabulário"`

### S6 - Docs-as-code · ~6 arquivos · ~40 KB · ~10k

**C23** - Um link relativo para arquivo inexistente faz `check:docs` sair `1` e imprimir `file:line -> target` (DOCS-06, AC 20)
Proof: `npx vitest run tests/scripts/check-docs.test.ts -t "link quebrado"`

**C24** - Link quebrado em `AGENTS.md`, `CONTEXT.md` e `README.md` na raiz também é pego (DOCS-06, AC 20)
Proof: `npx vitest run tests/scripts/check-docs.test.ts -t "arquivos da raiz"`

**C25** - Link relativo em `docs/templates/**` não é checado; URL externa, âncora pura e link dentro de bloco de código não contam como quebrados (DOCS-06, AC 20)
Proof: `npx vitest run tests/scripts/check-docs.test.ts -t "ignora templates"`
Proof: `npx vitest run tests/scripts/check-docs.test.ts -t "ignora externos, âncoras e código"`

**C26** - Doc `living` com `last_reviewed` a mais de 90 dias imprime aviso e sai `0`; `frozen`, `draft` e `superseded` antigos não avisam (DOCS-06, AC 22)
Proof: `npx vitest run tests/scripts/check-docs.test.ts -t "doc vivo vencido"`

**C27** - `last_reviewed` fora de `YYYY-MM-DD` faz `check:docs` sair `1` (DOCS-06, AC 21)
Proof: `npx vitest run tests/scripts/check-docs.test.ts -t "data inválida"`

**C28** - O job de CI que roda `npm run lint` também roda `npm run check:docs` (DOCS-06, AC 23)
Proof: `npx vitest run tests/docs/structure.test.ts -t "ci roda check:docs"`

**C29** - `.specs/STATE.md` tem no máximo 250 linhas e nenhuma seção marcada `CONCLUÍDA` (DOCS-06, AC 24)
Proof: `npx vitest run tests/docs/structure.test.ts -t "STATE enxuto"`

**C30** - As seções `CONCLUÍDA` removidas de `STATE.md` existem em `.specs/archive/` (DOCS-06, AC 24)
Proof: `npx vitest run tests/docs/structure.test.ts -t "handoffs arquivados"`

## Coverage

| Set (size) | Member -> proof | Unproven |
| --- | --- | --- |
| domínios (9) | C6, C3, C7 - table-driven sobre os 9 | - |
| seções H2 de `AGENTS.md` (5) | C2, table-driven sobre as 5 | - |
| pontes de ferramenta (2) | `copilot-instructions.md` C4 · `00-estomasystech.mdc` C4 | - |
| chaves de frontmatter (5) | C8, table-driven sobre as 5 | - |
| valores de `status` do frontmatter (4) | C10, table-driven sobre os 4 · inválido C9 | - |
| templates (5) | C13, table-driven sobre os 5 | - |
| seções da spec funcional (8) | C14, table-driven sobre as 8 | - |
| integrações (5) | C17, C18 - table-driven sobre as 5 | - |
| seções de integração (5) | C18, table-driven sobre as 5 | - |
| sintomas de troubleshooting (8) | C19, table-driven sobre os 8 | - |
| horizontes do roadmap (3) | `Now` C20 · `Next` C20 · `Later` C20 | - |
| status do roadmap (5) | C22, table-driven sobre os 5 | - |
| escopo da checagem de links (4) | `AGENTS.md` C24 · `CONTEXT.md` C24 · `README.md` C24 · `docs/**` C23 | - |
| exclusões da checagem de links (4) | `docs/templates/**` C25 · URL externa C25 · âncora C25 · bloco de código C25 | - |
| `status` que não avisam quando vencidos (3) | C26, table-driven sobre os 3 | - |
| saídas do gate (3) | erro `1` C23 · aviso `0` C26 · limpo `0` C10, C12 | - |
| portas sem volta (4) | door 1 C1-C4 · door 2 C6, C13, C17 · door 3 C8-C10, C27 · door 4 C12, C23, C28 | - |

- Surface: none - nenhuma rota; o gate é comando interno com as saídas acima
- Nenhum outro check afirma mais do que o caso que sua prova exercita

## Swept

- validation: C8, C9, C27
- failure modes: C23 - o gate imprime cada falha com `file:line` e sai `1` sem escrever nada
- idempotency: n/a - o gate só lê; rodar duas vezes dá a mesma saída
- authorization: n/a - documentação versionada; quem revisa é o fluxo de PR existente
- concurrency: n/a - sem estado compartilhado; leitura de arquivos
- data lifecycle: C26, C29, C30
- dependency failure: n/a - o gate não chama rede (URLs externas são ignoradas por C25)
- state transitions: C9, C10 - `status` do doc; `superseded` exige apontar o substituto na governança
- observability: C23, C26 - saída do gate no log do CI

## Handoff

- S1-S6 ≈ 70k somados, abaixo do orçamento de 150k - um builder, um PR (decisão do usuário)

- **Boundary:** C1-C30 fechados; provas verdes (`tests/docs/structure.test.ts` + `tests/scripts/check-docs.test.ts`: 84/84) e gate completo verde (`typecheck`, `lint`, `check:sv`, `check:docs`, `test:coverage` 209 arquivos / 3374 testes / 96,56% linhas). E2E não rodado: nenhum arquivo de `src/` ou `e2e/` no diff
- **Settled mid-build:** `docs/templates/**` fora da checagem de links (linha nova em Assumptions do plano, antes dos checks); `.cursor/` passa a versionar só `rules/` (Impact)
- **Abandoned:** `PROJECT_CONTEXT.md` separado (recusado pelo usuário em favor de `AGENTS.md`); migração em fases (usuário escolheu um PR)
