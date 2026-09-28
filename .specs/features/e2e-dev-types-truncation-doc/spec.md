# Documentar truncamento de .next/dev/types/validator.ts no fluxo E2E dev → build

## Problem Statement

Issue #252: rodar E2E contra `next dev` e, na sequência, `npm run build`, pode falhar o build no
type check apontando erro de sintaxe/tipo em `.next/dev/types/validator.ts` — um arquivo gerado,
não versionado, que ninguém editou. O sintoma já apareceu nas rodadas locais do B4 (#214, PR #238)
e de novo no B5. `docs/engineering/troubleshooting.md` não cita o caso, então cada ocorrência é
investigada do zero e pode ser confundida com erro de tipo real no código.

## Goals

- [ ] Confirmar via código do Next instalado (`node_modules/next`) por que `next build` toca
      `.next/dev/types/` e registrar o achado nesta spec e no PR.
- [ ] `docs/engineering/troubleshooting.md` ganha uma entrada (sintoma → causa → contorno) para o
      caso, na tabela "Ambiente e build" existente.
- [ ] Se existir correção barata e segura que reduza a chance do sintoma sem tocar em
      `--max-old-space-size=4096`, aplicá-la e documentá-la junto.

## Out of Scope

| Item | Reason |
| --- | --- |
| Unificar `next dev` E2E + build + E2E prod num único script orquestrado | Issue pede documentar o contorno, não redesenhar o fluxo de CI/local; os dois fluxos (`npm run test:e2e` e `npm run build && npx playwright test -c playwright.prod.config.ts`) continuam separados, como já documentado em `playwright.prod.config.ts`. |
| Remover ou reduzir `--max-old-space-size=4096` do build | Proibido explicitamente por AGENTS.md e pela issue. |
| Corrigir o comportamento do Next.js (upstream) | Fora do controle do repo; o achado é sobre o código já instalado (`next@16.3.6`), não uma mudança na lib. |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Onde documentar o contorno | Nova linha na tabela "Ambiente e build" de `docs/engineering/troubleshooting.md`, seguindo o formato existente (sintoma literal → causa → ação) | Tabela já existe e já cobre outro sintoma de build (heap); mesma seção temática | y |
| Correção "barata e segura" aplicável | `prebuild`: `rm -rf .next/dev/types` em `package.json` (roda automaticamente antes de `npm run build` via hook de lifecycle do npm) | `next@16.3.6` (`node_modules/next/dist/lib/typescript/runTypeCheck.js` + `type-paths.js`) já filtra `.next/dev/types/**/*.ts` do type-check em modo build (`NODE_ENV !== 'development'`) — então o cenário relatado no B4/B5 não deveria mais se reproduzir nesta versão. Mesmo assim, `.next/dev/types/validator.ts` pode existir truncado em disco (dev morto no meio da escrita) e um `prebuild` que o remove é defesa em profundidade de custo ~zero (só apaga um diretório de tipos gerado, nunca versionado) contra qualquer regressão futura do filtro do Next ou versão mais antiga em outra máquina | y |

**Open questions:** none — resolvidas acima.

---

## User Stories

### P1: Diagnosticar e documentar o contorno ⭐ MVP

**User Story**: Como dev/agent que roda o fluxo "E2E dev, depois build", quero uma entrada em
`docs/engineering/troubleshooting.md` que explique o sintoma, a causa raiz confirmada no código do
Next e o contorno, para não perder tempo reinvestigando algo já mapeado.

**Why P1**: é o próprio critério de aceite da issue.

**Acceptance Criteria**:

1. WHEN alguém inspeciona `node_modules/next/dist/lib/typescript/type-paths.js` e
   `runTypeCheck.js` THEN a spec (e o PR) SHALL registrar, em português, por que o tsconfig gerado
   pelo Next inclui `.next/dev/types/**/*.ts` e o que a versão instalada faz com esses arquivos
   durante `next build`.
2. WHEN alguém abre `docs/engineering/troubleshooting.md` → seção "Ambiente e build" THEN SHALL
   existir uma linha nova cobrindo: sintoma literal (erro de type check apontando para
   `.next/dev/types/validator.ts`), causa (truncamento do arquivo quando `next dev` é encerrado
   pelo Playwright no meio da escrita) e ação (contorno + nota de que `next@16.3.6` já filtra esse
   diretório do type-check de build).
3. WHEN `npm run check:docs` roda THEN SHALL passar (frontmatter e links da página continuam
   válidos).

**Independent Test**: abrir `docs/engineering/troubleshooting.md`, achar a linha na tabela
"Ambiente e build", conferir que descreve sintoma/causa/ação sem inventar API do Next.

---

### P2: Reduzir a chance de o arquivo ficar truncado

**User Story**: Como dev, quero que `npm run build` limpe `.next/dev/types` antes de rodar, para
que um resquício truncado de uma sessão anterior de `next dev` nunca chegue ao type check do
build, mesmo em versões do Next sem o filtro atual.

**Why P2**: é a correção "barata e segura" opcional citada no 3º critério de aceite da issue — só
entra se existir uma clara e não requer redesenho do fluxo E2E.

**Acceptance Criteria**:

1. WHEN `npm run build` é executado THEN o hook `prebuild` do npm SHALL remover
   `.next/dev/types` (se existir) antes do `next build` rodar, sem remover `.next/dev` inteiro
   (preserva cache de webpack do `next dev` para a próxima sessão de dev).
2. WHEN `.next/dev/types` não existe (checkout limpo, CI) THEN o `prebuild` SHALL não falhar
   (`rm -rf` é idempotente para caminho inexistente).
3. WHEN o build roda com o `prebuild` novo THEN `npm run typecheck`, `npm run lint`,
   `npm run check:sv` e `npm run test:coverage` (≥90%) SHALL continuar verdes — o `prebuild` não
   deve alterar nenhum outro comportamento do build ou dos testes.

**Independent Test**: rodar `npm run build` localmente com um `.next/dev/types/*.ts` fake presente
e confirmar que o diretório some antes do `next build` começar (log do `rm -rf` ou verificação
manual do FS).

---

## Edge Cases

- WHEN `.next/dev` inteiro (não só `types/`) não existe ainda (primeiro build de um checkout novo)
  THEN o `prebuild` SHALL não falhar.
- WHEN o build roda em CI (sem sessão prévia de `next dev`) THEN o `prebuild` SHALL ser um no-op
  rápido, sem custo perceptível no tempo de build.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| DEVTYPES-01 | P1 | Execute | Pending |
| DEVTYPES-02 | P1 | Execute | Pending |
| DEVTYPES-03 | P2 | Execute | Pending |

**Coverage:** 3 total, 3 mapeados para execução direta (doc + script), 0 unmapped.

---

## Success Criteria

- [ ] `docs/engineering/troubleshooting.md` tem a entrada nova e `npm run check:docs` passa.
- [ ] `package.json` tem `prebuild` limpando `.next/dev/types`, e o gate completo
      (`typecheck`, `lint`, `check:sv`, `check:docs`, `test:coverage` ≥90%) passa.
- [ ] PR referencia o achado do código do Next (`type-paths.js`/`runTypeCheck.js`) e fecha a
      issue #252.
