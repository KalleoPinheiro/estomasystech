# Testes do portal do Super Admin: asserções fracas do B2 ao B6 — Specification

## Problem Statement

Issue #246: os Verifiers do B2 ao B6 do portal do Super Admin (#214) deixaram lacunas não
bloqueantes. O código está correto, mas sete pontos deixam uma regressão passar sem teste
vermelho. Mudança **só de testes**: nenhum arquivo de `src/` muda.

## Goals

- [ ] Cada lacuna de 1 a 7 da issue tem uma asserção que falha quando a regra é quebrada,
      provada por mutação manual (registrada no PR).
- [ ] `npm run test:coverage` (≥ 90%), `lint`, `typecheck`, `check:sv` e `check:docs` verdes.

## Out of Scope

| Item | Motivo |
| --- | --- |
| Qualquer mudança em `src/` | A issue pede só testes; defeito revelado vira issue separada |
| Revogação imediata no próprio processo depois do recadastro do segundo fator | Comportamento de produção; registrado como observação no PR (ver Decisões) |

---

## Acceptance Criteria

1. **B2 · C23** — WHEN o super_admin confirma o recadastro do segundo fator THEN um cookie de
   sessão emitido **antes** SHALL receber `401` do proxy, e o cookie novo `200`.
   Proof: `tests/api/mfa-login.test.ts -t "emitido antes do recadastro"`
2. **B4 · C9** — WHEN o cadastro de clínica é recusado por `adminEmail` ausente ou inválido THEN o
   número de `company_admin` em todas as clínicas SHALL ficar igual, e a busca por conta usa o
   e-mail efetivamente enviado.
   Proof: `tests/api/platform-clinics.test.ts -t "valida os campos obrigatórios"`
3. **B4** — WHEN o Admin de Empresa envia `contactEmail: ''` THEN o e-mail SHALL ficar `null` e a
   plataforma SHALL ver `registrationComplete: false` ("Cadastro incompleto").
   Proof: `tests/api/clinic-info-settings.test.ts -t "texto vazio"`
4. **B5 · C18** — WHEN a clínica é suspensa THEN o cookie de `partner` emitido antes SHALL receber
   `401`, continuar `401` depois da reativação, e um login novo SHALL voltar a `200`.
   Proof: `tests/api/session-revocation.test.ts -t "suspensão da clínica revoga"`
5. **B6 · C6** — WHEN a trilha de plataforma em memória é lida THEN SHALL vir do mais recente ao
   mais antigo e respeitar `from`/`to`/`limit`/`offset` com as mesmas regras do C9 no Drizzle,
   com eventos em instantes distintos gravados fora de ordem.
   Proof: `tests/infrastructure/in-memory-repositories.test.ts -t "instantes distintos"`
6. **B6 · C21** — a linha `Proof:` da metade `src/app` já cita
   `tests/lib/tenant-scope.test.ts -t "fallback legado"` em `.checks/b6-auditoria-plataforma.md`
   (corrigida no próprio B6, commit `93b79dc`). Nada a mudar; conferido que o filtro roda 1 teste.
7. **B6 (tela)** — WHEN a trilha abre THEN SHALL mostrar o link `Clínicas` para `/plataforma`, os
   cabeçalhos `Quando`/`Clínica`/`Ator`/`Ação`/`Recurso`/`Detalhe`, os rótulos
   `Situação da clínica`/`Recuperação de conta`, e `Carregar mais` SHALL buscar `offset=100` e
   sumir quando a página vem incompleta.
   Proof: `tests/pages/plataforma-auditoria.test.tsx`

---

## Decisões

| Decisão | Escolha | Motivo |
| --- | --- | --- |
| Como provar a ausência de conta no C9 | Contar `company_admin` (escopo de sistema) antes/depois, e procurar pelo e-mail do corpo enviado quando ele é texto | `findByRole` não tem o teto de `findAll`; cobre o caso sem `adminEmail` |
| Onde provar o "Cadastro incompleto" | `GET /api/platform/clinics/[id]` (`registrationComplete`) | É o campo que a tela da plataforma traduz em "Cadastro incompleto" |
| Cache de revogação no teste do C23 | Avança o relógio além de `REVOCATION_CACHE_TTL_MS` antes de conferir o `401` | A confirmação do segundo fator não chama `forgetSessionStatus`; o teste prova a garantia do ADR-005 (≤ 60 s), não revogação imediata no processo |
