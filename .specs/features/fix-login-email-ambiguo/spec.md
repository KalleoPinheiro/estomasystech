# Fix: login resolve conta errada com e-mail duplicado entre clínicas

## Problem Statement

`user_accounts` permite o mesmo e-mail em `clinic_id` diferentes por decisão intencional (MT-06/ADR-003: mesma pessoa pode ter conta em mais de uma empresa). O login (`authenticateAccount` em `src/app/api/auth/login/route.ts`) busca a conta via `findByEmail`, que usa `withTenant(table, clinicId=null, ...)` — e `withTenant` com `clinicId === null` não filtra por clínica nenhuma (é o modo "papel de sistema", AD-017). Com `.limit(1)` e sem `ORDER BY`, se duas contas ativas tiverem o mesmo e-mail, o Postgres devolve uma linha arbitrária: o login pode verificar a senha digitada contra o hash da conta errada, autenticando ou negando a pessoa errada.

## Goals

- [ ] Login nunca autentica com o hash de senha de uma conta diferente da que o usuário está tentando acessar.
- [ ] Preservar o comportamento intencional de MT-06 (mesmo e-mail em clínicas diferentes continua permitido) — a correção é no login, não uma constraint de unicidade global.

## Out of Scope

| Feature | Reason |
| --- | --- |
| UI de seleção de empresa no formulário de login | Nenhuma tela hoje pede isso; resolver por senha (critério já disponível) evita mudança de UX para um caso raro |
| Constraint de unicidade global de e-mail (Opção 1 da issue) | Contradiz decisão já tomada em ADR-003/MT-06 (mesma pessoa, múltiplas empresas) |
| Rate limiting adicional específico para o caso de e-mail ambíguo | Rate limit por IP já existe (`LOGIN_RATE_LIMIT`); fora do escopo desta issue |

---

## Assumptions & Open Questions

| Assumption / decision | Chosen default | Rationale | Confirmed? |
| --- | --- | --- | --- |
| Critério de desambiguação quando 2+ contas ativas compartilham e-mail | Verificar a senha contra TODAS as contas ativas com aquele e-mail; autentica só se exatamente UMA bater | Preserva MT-06 sem exigir novo campo de UI; senha já é o segredo que identifica a conta certa na prática (repro da issue usa senhas diferentes) | n (assumido — ambiguidade que muda comportamento de auth, decisão registrada aqui em vez de travar a issue; ver AGENTS.md/auto mode) |
| Comportamento quando a MESMA senha bate em 2+ contas distintas (colisão rara: duas pessoas diferentes, mesmo e-mail e mesma senha, em clínicas diferentes) | Rejeitar login com erro genérico (`Email ou senha incorretos`) e registrar evento de auditoria com detail `ambiguous_credentials` (sem revelar quantidade/identidade das contas ao cliente) | Autenticar arbitrariamente nessa colisão é exatamente o bug original; falhar fechado é o único comportamento seguro sem pedir mais contexto ao usuário | y (decorre do goal "nunca autentica com hash de conta diferente") |
| Contas inativas (`active=false`) entram na comparação de senha? | Não — mesmo filtro que já existia (`account.isActive === true`) aplicado a cada candidata antes de comparar senha | Mantém paridade com o comportamento atual para contas desativadas | y |
| `findByEmail` (retorna 1) muda de contrato ou ganha um método novo? | Mantém `findByEmail` como está (outros chamadores dependem de "uma conta, uma clínica"); adiciona `findAllByEmail(email): Promise<UserAccount[]>` para uso exclusivo do login | Menor blast radius — não versão de todos os call sites hoje escopados por clínica (onde e-mail já é único por `uq_user_accounts_clinic_email`) | y |

**Open questions:** nenhuma — resolvidas ou registradas acima.

---

## User Stories

### P1: Login autentica a conta certa mesmo com e-mail duplicado entre clínicas ⭐ MVP

**User Story**: Como usuário com conta cujo e-mail existe em mais de uma clínica (ou colide com o e-mail do Super Admin), quero logar com minha senha e cair exatamente na minha própria conta, para nunca ser autenticado (ou barrado) com a identidade errada.

**Why P1**: É o bug de segurança relatado na issue — falha de isolamento de identidade em auth.

**Acceptance Criteria**:

1. WHEN existe só uma conta ativa com o e-mail informado e a senha bate THEN o sistema SHALL autenticar essa conta (comportamento atual preservado).
2. WHEN existem duas ou mais contas ativas com o mesmo e-mail em clínicas diferentes e a senha informada bate com o hash de exatamente uma delas THEN o sistema SHALL autenticar exatamente essa conta (role/clinicId/professionalId dela, nunca de outra).
3. WHEN existem duas ou mais contas ativas com o mesmo e-mail e a senha informada bate com o hash de mais de uma delas THEN o sistema SHALL negar o login com "Email ou senha incorretos" (401) e SHALL registrar evento de auditoria com `detail: 'ambiguous_credentials'`.
4. WHEN nenhuma conta ativa com o e-mail bate com a senha (0 matches) THEN o sistema SHALL negar o login com "Email ou senha incorretos" (401) — comportamento atual preservado.
5. WHEN existem contas inativas com o e-mail mas nenhuma ativa THEN o sistema SHALL negar o login (comportamento atual preservado).

**Independent Test**: Seed de duas contas (`clinic_id` diferentes) com o mesmo e-mail e senhas distintas; login com a senha da segunda conta deve retornar sessão com `clinicId`/`role` da segunda, nunca da primeira.

---

## Edge Cases

- WHEN o e-mail buscado não existe em nenhuma conta THEN o sistema SHALL retornar 401 genérico (sem timing/mensagem que revele existência do e-mail — AC-02 já documentado no código).
- WHEN duas contas com o mesmo e-mail existem mas uma está inativa e a outra ativa com senha certa THEN o sistema SHALL autenticar só a ativa (a inativa nunca entra na comparação).
- WHEN `findAllByEmail` roda no repositório Drizzle com `clinicId=null` (modo sistema) THEN a query SHALL continuar sem filtro de clínica (mesmo comportamento estrutural de `withTenant`), só que retornando todas as linhas em vez de uma.

---

## Requirement Traceability

| Requirement ID | Story | Phase | Status |
| --- | --- | --- | --- |
| AUTHFIX-01 | P1 | Design | Pending |
| AUTHFIX-02 | P1 | Design | Pending |
| AUTHFIX-03 | P1 | Design | Pending |
| AUTHFIX-04 | P1 | Design | Pending |
| AUTHFIX-05 | P1 | Design | Pending |

**Coverage:** 5 total, 5 mapped to tasks (inline execution, no formal tasks.md — scope is Medium/Large boundary, <10 atomic steps), 0 unmapped.

---

## Success Criteria

- [ ] Repro da issue (duas contas, mesmo e-mail, senhas diferentes) autentica a conta certa nos dois sentidos (login com senha A pega conta A, login com senha B pega conta B).
- [ ] Suite de auth existente (`login`, `create-account`, `forgot-password`) continua verde, sem teste enfraquecido.
- [ ] Cobertura ≥90% mantida (gate do projeto).
