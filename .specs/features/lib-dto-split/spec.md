# Split de src/lib/dto.ts por aggregate — Specification

Refactor interno (issue #149), achado pelo relatório `/improve-codebase-architecture` de 2026-09-06.

## Problem Statement

`src/lib/dto.ts` (845 linhas) reúne ~32 mappers `toXDto` de aggregates sem relação entre si (Patient, Invoice, CarePlan, Supply, Audit, Portal DTOs...) num único arquivo. Deletion test: apagar o arquivo relocaria a mesma lógica de mapeamento pros ~102 call sites que importam de `@/lib/dto` hoje — o arquivo tem locality real (evita duplicação), mas zero coesão interna: editar o DTO de Patient exige abrir um arquivo que também define o de Invoice, CarePlan e Supply.

## Goals

- [ ] Cada aggregate (Patient, Appointment, CarePlan, etc.) tem seu DTO + mapper num arquivo próprio e coeso sob `src/lib/dto/`
- [ ] Nenhum dos 102 arquivos que hoje fazem `import ... from '@/lib/dto'` muda — o import continua resolvendo pro mesmo caminho
- [ ] Comportamento de runtime idêntico (são apenas movimentações de código, zero lógica nova)

## Out of Scope

| Feature | Reason |
| --- | --- |
| Mover mappers pra `domain/*` | Contradiz a camada documentada em `CONTEXT.md` (`domain/` = regras de negócio; `lib/` = utilitários/DTO). Decidido com o usuário antes de especificar — ver Assumptions. |
| Mudar o shape de qualquer DTO (campos, tipos) | Puro split estrutural — qualquer mudança de shape é feature separada |
| Migrar call sites para importar do submódulo específico (`@/lib/dto/patient` em vez de `@/lib/dto`) | Fora de escopo: o barrel existe exatamente pra não forçar essa migração agora; migração incremental é backlog futuro, não bloqueia este refactor |
| Consolidar DTOs de portal num módulo de "projeção de privacidade" com API própria | A separação física (arquivo por aggregate, com o par normal/portal lado a lado) já resolve a locality; criar uma abstração de "privacy projection" seria especulativo sem segundo caso de uso |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Onde os DTOs moram | `src/lib/dto/*.ts` (não `domain/*`) | Confirmado com o usuário: mover pra `domain/` violaria a separação de camadas do próprio `CONTEXT.md` | y |
| Compatibilidade de import | Barrel `src/lib/dto.ts` vira `src/lib/dto/index.ts` que re-exporta tudo — nenhum caminho de import muda pros 102 consumidores | Minimiza risco: um refactor cujo único objetivo é locality não deve, ele mesmo, introduzir 102 pontos de mudança | y |
| Agrupamento por aggregate | Ver tabela de módulos no design.md | Cada arquivo cobre um aggregate coeso (ex.: todo o cluster de CarePlan — diagnóstico, resultado, intervenção — num arquivo, porque `toCarePlanDetailDto` já compõe os três) | y |
| Tipos "interface-only" sem mapper (ex.: `TriagePhotoDto`, `SidebarIdentityDto`, `CalendarIntegrationStatusDto`) | Vão junto do arquivo do aggregate mais próximo (Triagem → clinical, Sidebar/Calendar → staff) | Não há mapper pra "por perto de quê", mas o aggregate de origem é claro pelo nome/uso | y |

**Open questions:** none — todas resolvidas acima.

---

## User Stories

### P1: Split físico com barrel de compatibilidade ⭐ MVP

**User Story**: Como desenvolvedor editando o DTO de um aggregate, quero que o arquivo que abro contenha só esse aggregate, pra não navegar por 30 mappers alheios pra achar o meu.

**Why P1**: É o único objetivo do refactor.

**Acceptance Criteria**:

1. WHEN qualquer um dos 102 arquivos que hoje importam de `@/lib/dto` é compilado (`tsc --noEmit`) THEN a compilação SHALL resolver os mesmos símbolos que resolvia antes do split, sem nenhuma mudança nesses 102 arquivos.
2. WHEN a suíte de testes completa (`npm run test:coverage`) roda após o split THEN o número de testes passando SHALL ser idêntico ao número antes do split (nenhum teste quebrado, nenhum removido).
3. WHEN um novo módulo `src/lib/dto/<aggregate>.ts` é criado THEN ele SHALL conter apenas os tipos/mappers do aggregate que o design.md atribui a ele — nenhum tipo de outro aggregate.
4. WHEN `src/lib/dto.ts` (arquivo original) é removido THEN `src/lib/dto/index.ts` SHALL re-exportar todos os símbolos que o arquivo original exportava, com os mesmos nomes.
5. WHEN `./node_modules/.bin/biome check .` roda após o split THEN SHALL reportar zero erros novos (arquivos podem mudar de lugar; nenhuma violação de lint introduzida).

**Independent Test**: `git diff main --stat` mostra zero linhas alteradas em qualquer arquivo fora de `src/lib/dto.ts` (removido), `src/lib/dto/**` (novo) e `tests/lib/dto.test.ts` (se precisar seguir o arquivo movido).

---

## Edge Cases

- WHEN um tipo é usado por outro tipo do mesmo cluster mas de aggregate "vizinho" (ex.: `toCarePlanOutcomeDto` chama `toOutcomeEvaluationDto`) THEN ambos SHALL ficar no mesmo arquivo de módulo (não faz sentido separar um mapper do outro que ele compõe diretamente).
- WHEN um import circular apareceria entre dois módulos novos de `src/lib/dto/` THEN a divisão SHALL ser ajustada (fundir os dois clusters afetados) antes de prosseguir — nenhum ciclo é aceitável.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| DTO-SPLIT-01 | P1 | Design | Pending |
| DTO-SPLIT-02 | P1 | Design | Pending |
| DTO-SPLIT-03 | P1 | Design | Pending |
| DTO-SPLIT-04 | P1 | Design | Pending |
| DTO-SPLIT-05 | P1 | Design | Pending |

**Coverage:** 5 total, 5 mapped to tasks (via design.md + tasks.md), 0 unmapped.

---

## Success Criteria

- [ ] `npx tsc --noEmit`, `./node_modules/.bin/biome check .`, `npm run test:coverage` passam sem regressão
- [ ] `src/lib/dto.ts` não existe mais como arquivo monolítico — vira `src/lib/dto/index.ts` (barrel) + N módulos por aggregate
- [ ] Zero dos 102 consumidores de `@/lib/dto` precisou mudar
