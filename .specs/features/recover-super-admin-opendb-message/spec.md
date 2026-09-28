# Mensagem de falha de conexão no recover-super-admin — Specification

## Problem Statement

Issue #247: em `runRecoverSuperAdminCli`, `await deps.openDb()` roda dentro do mesmo `try` que a
recuperação. Se a conexão falhar (`DATABASE_URL` errada, banco fora do ar), o script imprime
`ROLLED_BACK_MESSAGE` (fala em "transação desfeita"), mas nenhuma transação chegou a existir —
diagnóstico enganoso numa emergência.

## Goals

- [ ] `openDb()` falhando produz mensagem própria citando conexão/`DATABASE_URL`, sem falar em
      transação; saída continua `1`.
- [ ] Falha depois de o banco abrir continua imprimindo `ROLLED_BACK_MESSAGE` e saindo `1`.

## Out of Scope

| Item | Motivo |
| --- | --- |
| Qualquer outro caminho de erro do script (precondição, uso) | Já correto; issue só cobre o caso `openDb` |
| Retry/reconexão automática | Não pedido pela issue |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Texto exato da nova mensagem | `Falha ao conectar ao banco (confira DATABASE_URL): nada foi alterado.` | Sugestão textual da própria issue; atende ao critério (cita conexão + DATABASE_URL, sem "transação") | y (a critério de quem implementa, conforme a issue) |
| Nome da constante exportada | `DB_CONNECTION_FAILED_MESSAGE` | Segue o padrão de nomes das constantes já exportadas (`ROLLED_BACK_MESSAGE`, `DRY_RUN_MESSAGE`) | y |

**Open questions:** nenhuma — resolvidas acima.

---

## User Stories

### P1: Diagnóstico correto quando o banco não abre ⭐ MVP

**User Story**: Como operador rodando a recuperação de emergência do super_admin, quero uma
mensagem que diga que a conexão falhou (não que uma transação foi desfeita) quando `DATABASE_URL`
está errada ou o banco está fora do ar, para não concluir erroneamente que o banco está acessível.

**Why P1**: É o único requisito da issue.

**Acceptance Criteria**:

1. WHEN `deps.openDb()` rejeita THEN a CLI SHALL escrever em `deps.err` uma mensagem que cita
   conexão/`DATABASE_URL` e não contém a substring "transação desfeita", e retornar `1`.
2. WHEN a recuperação falha depois de `deps.openDb()` resolver (ex.: `auditEventsFor` falha)
   THEN a CLI SHALL continuar escrevendo `ROLLED_BACK_MESSAGE` em `deps.err` e retornar `1`.
3. WHEN o teste "DB offline" (`tests/infrastructure/recover-super-admin.test.ts`) roda THEN ele
   SHALL afirmar a nova mensagem e não conter "transação desfeita".

**Independent Test**: `npm run test:coverage -- tests/infrastructure/recover-super-admin.test.ts`
verde, cobrindo os dois casos (openDb falha vs. falha pós-abertura).

---

## Edge Cases

- WHEN `openDb()` rejeita com um erro não-`Error` (ex.: string) THEN a CLI SHALL ainda assim
  imprimir a nova mensagem fixa (o detalhe do erro não precisa ser interpolado no texto).

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| RSA-01 | P1 | Execute | Pending |
| RSA-02 | P1 | Execute | Pending |
| RSA-03 | P1 | Execute | Pending |

**Coverage:** 3 total, 3 mapped to tasks (inline, small scope), 0 unmapped.

---

## Success Criteria

- [ ] `npm run typecheck`, `npm run lint`, `npm run check:sv`, `npm run test:coverage` (≥90%),
      `npm run check:docs` verdes.
- [ ] `docs/engineering/producao.md` § 10 (tabela de saídas) cita a nova mensagem para o caso de
      banco offline.
