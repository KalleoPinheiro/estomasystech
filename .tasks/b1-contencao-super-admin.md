# B1 — Contenção do super_admin

> Build this with **tlc-implement**.
> Every criterion below becomes a check with a proof, referenced by its number. Nothing under
> `Unresolved` gets settled while building.

## Intent

Hoje o super_admin usa a área da equipe com `clinicId = null`. Ele lê o prontuário de todas as
clínicas e grava tudo na `legacy-clinic` sem aviso (`writeClinicId`,
`src/lib/auth/tenant-scope.ts:41`). A matriz `PROVISIONING_MATRIX.super_admin` deixa criar outra
conta `super_admin` ligada a uma clínica, e o índice `uq_user_accounts_single_system_account` só
barra a segunda conta **sem** clínica. Qualquer `company_admin` consegue disparar
`POST /api/admin/taxonomy/import`, que grava o catálogo **global** de NANDA-I/NOC/NIC usado por
todas as clínicas. Quem paga são as clínicas clientes: o operador da plataforma tem acesso a dado
de saúde que não precisa ver (minimização da LGPD), e uma clínica consegue alterar dado das outras.
Nada está em produção; o go-live terá uma clínica e outras estão no radar
([#214](https://github.com/KalleoPinheiro/vitta-flow/issues/214)).

Com esta task, o super_admin passa a ser o operador da plataforma. Ele entra em `/plataforma` e não
abre mais nenhuma tela nem API da clínica. Só existe um super_admin, e o banco recusa qualquer
outro. O convite do primeiro `company_admin` de uma clínica passa a ser feito por
`POST /api/platform/clinics/[id]/admins`. A importação do catálogo de taxonomias vira ato
exclusivo do super_admin.

24 critérios em 6 fatias · 5 portas sem volta (1 migração) · 4 perguntas decididas pelo dono em 2026-09-27

## Criteria

### Só um super_admin

1. Quando `CreateAccount` recebe `role: 'super_admin'`, de qualquer ator e para qualquer
   `clinicId`, então lança `ProvisioningDeniedError` e nenhuma conta é gravada.
2. Sempre, o banco recusa (SQLSTATE `23514`, constraint `ck_user_accounts_system_role_has_no_clinic`)
   gravar em `user_accounts` uma linha com `role = 'super_admin'` e `clinic_id` não nulo, ou com
   `role <> 'super_admin'` e `clinic_id` nulo.
3. Se a migração roda num banco que já tem linha violando o critério 2, então ela falha com erro
   que nomeia a constraint e nenhuma linha é alterada.

### Super_admin fora da clínica

4. Dada sessão `super_admin`, quando ela chama qualquer rota das famílias `clinical`,
   `operational`, `administrative` ou `professional_self` (ex.: `GET /api/patients`,
   `GET /api/audit`, `PUT /api/settings/clinic-info`, `GET /api/auth/identity`, `POST /api/accounts`),
   então recebe `403` com `"Seu papel não tem acesso a este recurso"`, tanto no proxy quanto no
   handler.
5. Dada sessão `super_admin`, quando ela abre uma página que não é de `/plataforma` nem do portal
   (ex.: `/`, `/agenda`, `/pacientes/<id>`, `/configuracoes`, `/documentos/...`), então o proxy
   redireciona (`307`) para `/plataforma`.
6. Dado super_admin com senha válida, quando ele entra por `/login`, então termina em
   `/plataforma`.
7. Dada sessão `super_admin` chegando ao handler de `PUT /api/settings/clinic-info` (camada 2, sem
   o proxy), então a resposta é `403` e os dados da clínica não mudam.
8. Sempre, `company_admin`, `atendente`, `profissional`, `patient` e `partner` mantêm exatamente
   as famílias de rota que têm hoje (`FAMILY_ALLOWED_ROLES`), com a nova família `platform`
   negada a todos eles.

### Família `platform`

9. Dada sessão `company_admin`, `atendente` ou `profissional`, quando ela chama `/api/platform/**`,
   então recebe `403` com `"Seu papel não tem acesso a este recurso"`; dada sessão `patient` ou
   `partner`, recebe `403` com `"Acesso restrito à equipe da clínica"`.
10. Dada sessão `company_admin`, `atendente` ou `profissional`, quando ela abre `/plataforma`,
    então o proxy redireciona (`307`) para `/`; dada sessão `patient` ou `partner`, redireciona
    para `/portal`.
11. Sem sessão, quando alguém abre `/plataforma`, então é redirecionado para `/login`; quando chama
    `/api/platform/**`, recebe `401` com `"Não autenticado"`.
12. Dada sessão `super_admin`, quando ela abre `/plataforma`, então a página mostra o título
    `Plataforma` e o botão `Sair`, sem sidebar da equipe. Clicar em `Sair` encerra a sessão
    (`POST /api/auth/logout`) e leva a `/login`.

### Primeiro admin de uma clínica

13. Dado super_admin e clínica `X` existente, quando ele faz
    `POST /api/platform/clinics/X/admins` com `{ "email": "<e-mail>" }`, então a resposta é `200`
    com `{ id, email, role: "company_admin", clinicId: "X", active: true, passwordSet: false, delivered }` (os campos de `toUserAccountDto` mais `role` e `clinicId`). A conta
    nasce na clínica `X` sem senha usável, e o convite de definir senha (24 h, uso único) é
    emitido pelo fluxo atual (`sendInvite`).
14. Sempre, a resposta de `POST /api/platform/clinics/[id]/admins` não traz o link do convite,
    nem quando `delivered` é `false`.
15. Se a clínica `[id]` não existe, então a resposta é `404` com `"Clínica não encontrada"` e
    nenhuma conta é criada.
16. Se `email` falta, não é texto ou tem menos de 3 ou mais de 200 caracteres, então a resposta é
    `400`. Se já existe conta com esse e-mail na clínica `X`, a resposta é `400` com
    `"Já existe conta com este email"`.
17. Se duas requisições simultâneas criam o mesmo e-mail na mesma clínica, então uma recebe `200`,
    a outra recebe `400` com `"Já existe conta com este email"` e só uma conta existe. O que garante
    é o índice `uq_user_accounts_clinic_email`; a violação `23505` é traduzida, não vira `500`.
18. Se o envio do e-mail falha, então a conta continua criada, a resposta é `200` com
    `delivered: false` e o convite pode ser reenviado depois.
19. Quando a conta é criada, então um evento de auditoria é gravado com `action: 'create'`,
    `resourceType: 'account'`, `resourceId` = id da conta, `actorRole: 'super_admin'` e
    `clinic_id` = `X`.

### Catálogo de taxonomias

20. Dada sessão `super_admin`, quando ela faz `POST /api/platform/taxonomy/import`, então a
    resposta é `200` com as mesmas contagens que a rota antiga devolve hoje. Uma segunda chamada
    não duplica termos (importação idempotente, como hoje).
21. Quando alguém chama `POST /api/admin/taxonomy/import`, então recebe `404`: a rota não existe
    mais.
22. Dada sessão `company_admin`, quando ela chama `POST /api/platform/taxonomy/import`, então
    recebe `403` e o catálogo não muda.

### Registro da decisão

23. Existe `docs/adr/007-super-admin-operador-da-plataforma.md` com status aceito. Ele registra:
    super_admin sem acesso clínico nem operacional; família `platform`; um único super_admin
    (matriz + constraint do critério 2); importação do catálogo como ato de plataforma. Declara que
    emenda o ADR-003 (escopo do super_admin), e `npm run check:docs` passa.
24. `docs/domains/acesso/README.md` e `CONTEXT.md` descrevem o super_admin como operador da
    plataforma, sem acesso a dado de clínica. Muda a ACE-RN-10, a linha `super_admin` da tabela
    de papéis e, no `CONTEXT.md`, as linhas de Super Admin em § Access Control e a do fechamento
    mensal de repasses, que hoje diz "(Super Admin too)". Nenhum dos dois documentos diz mais que o
    super_admin lê prontuário ou cria qualquer papel.

## Out of scope

- Listar, criar e editar clínicas; listar admins, reenviar convite, desativar e reativar admin em
  `/plataforma` — bloco B4.
- Exigir cadastro completo da clínica antes do primeiro convite — bloco B4, junto com a edição do
  cadastro pela plataforma. Em B1 não há como o super_admin preencher o cadastro.
- Remover o parâmetro `clinicId` e o caminho do super_admin de `POST /api/accounts` — bloco B4. Em
  B1 o caminho fica inalcançável por sessão (critério 4) e só é usado no modo aberto de
  desenvolvimento.
- Segundo fator no login do super_admin — bloco B2.
- Recuperação de emergência — bloco B3.
- Suspensão de clínica — bloco B5.
- Trilha de auditoria de plataforma e `audit_events.clinic_id` nullable — bloco B6.
- Interface para a importação de taxonomias — não pedida; a rota é chamada por API ou por
  `scripts/import-taxonomy.ts`.

## Observable

| Surface | Decision | Landing |
| --- | --- | --- |
| screen `/plataforma` | empty state | 12 |
| screen `/plataforma` | loading state | n/a - a página não busca dados em B1 |
| screen `/plataforma` | error state | n/a - a página não busca dados em B1 |
| screen `/plataforma` | unauthorised state | 10, 11 |
| screen `/plataforma` | density and ordering | n/a - só título e botão |
| screen `/plataforma` | destructive action confirms | existing - `Sair` não pede confirmação em nenhuma tela hoje |
| screens da equipe | unauthorised state (super_admin) | 5 |
| API `POST /api/platform/clinics/[id]/admins` | response shape | 13, 14 |
| API `POST /api/platform/clinics/[id]/admins` | error shape and codes | 15, 16, 17; envelope `{ success: false, error }` existente (`fail`) |
| API `POST /api/platform/clinics/[id]/admins` | who may call it | 9, 11, 13 |
| API `POST /api/platform/clinics/[id]/admins` | versioning | n/a - API interna, sem versão, como as demais |
| API `POST /api/platform/clinics/[id]/admins` | rate limit | existing - limite geral de `/api/*` por conta (ACE-RN-15) |
| API `POST /api/platform/taxonomy/import` | response shape | 20 |
| API `POST /api/platform/taxonomy/import` | error shape and codes | 22; envelope `fail` existente |
| API `POST /api/platform/taxonomy/import` | who may call it | 9, 20, 22 |
| API `POST /api/platform/taxonomy/import` | versioning | n/a - API interna |
| API `POST /api/platform/taxonomy/import` | rate limit | existing - ACE-RN-15 |
| API rotas da clínica | who may call it (super_admin) | 4, 7 |
| document ADR-007 | structure, depth, next step | 23; estrutura de `docs/templates/` (checada por `check:docs`) |
| document `docs/domains/acesso/README.md`, `CONTEXT.md` | structure, tone | 24 |

## Swept

- validation: 16
- failure modes: 3, 15, 18
- idempotency and retry: 20 (importação); 16 (repetir o convite do mesmo e-mail responde `400`, não cria outra conta)
- authorization: 4, 5, 7, 8, 9, 10, 11, 22
- concurrency and ordering: 17
- data lifecycle: n/a - nada é removido; a conta criada segue o ciclo de vida atual de contas (ACE-RN-11)
- external-dependency failure: 18
- state transitions: n/a - nenhum ciclo de vida muda em B1 (estado da clínica é o B5)
- observability: 19

## Impact

| Front | What changes |
|---|---|
| domain | existing term: `super_admin` significava "cross-empresa com acesso total, inclusive clínico" e passa a significar "operador da plataforma, sem acesso a dado de clínica". Quem depende disso hoje: `FAMILY_ALLOWED_ROLES` (`src/lib/auth/route-family.ts:125`); `canEdit` de `src/app/api/settings/clinic-info/route.ts:21`; o ator de `POST /api/accounts` e `src/lib/auth/account-manager.ts:11`; `PROVISIONING_MATRIX` (`src/domain/auth/role-hierarchy.ts:10`); o tipo de papel em `src/app/portal/page.tsx:13` |
| domain | new term: família de rota `platform` - rotas só do operador da plataforma (`/plataforma`, `/api/platform/**`), mora em `src/lib/auth/route-family.ts` |
| stored data | check constraint nova em `user_accounts`. Instalação nova passa. Antes de rodar, o banco não pode ter conta não-super_admin com `clinic_id` nulo nem super_admin com clínica (critério 3). Nada migra de dado |
| API | `POST /api/admin/taxonomy/import` sai; `POST /api/platform/taxonomy/import` e `POST /api/platform/clinics/[id]/admins` entram |
| testes unitários/API | mudam os casos de super_admin em `tests/lib/route-family.test.ts`, `tests/api/route-guard-conformance.test.ts`, `tests/api/accounts-provisioning.test.ts`, `tests/application/create-account.test.ts`, `tests/domain/role-hierarchy.test.ts`, `tests/api/cross-tenant-aggregates-isolation.test.ts`, `tests/lib/clinical-resource-scope.test.ts`, `tests/api/calendar-integration-status.test.ts`, `tests/api/auth-identity.test.ts`. A allowlist de `systemScope()` em `tests/lib/tenant-scope.test.ts` troca o caminho da rota de taxonomias; `tests/proxy.test.ts` também cita o caminho antigo |
| E2E | Hoje a sessão padrão da suíte (`ADMIN_STORAGE_STATE_PATH`, `playwright.config.ts:49`) é o super_admin, usada por 22 dos 28 specs. Ela passa a ser um `company_admin` da `legacy-clinic`. Em `e2e/global-setup.ts`, o super_admin convida esse admin por `POST /api/platform/clinics/legacy-clinic/admins`, o admin é quem semeia os dados, e a importação usa a rota nova. `e2e/auditoria.spec.ts:24` passa a esperar `company_admin`, e `ADMIN_COOKIE` em `e2e/triagem.spec.ts:11` troca de papel. A suíte contra o build de produção (`roleAccounts: false`, e-mail com chave inválida) não recebe o link do convite (critério 14). Ela usa cookie assinado de `company_admin` (`e2e/support/session-token.ts`), que continua válido porque sujeito sem conta não é revogado (ADR-005) |
| docs | ADR-007 novo; `docs/domains/acesso/README.md`; `CONTEXT.md` (critérios 23 e 24) |

## Decided

| Decision | Shape | Alternative rejected |
|---|---|---|
| Unicidade do super_admin no banco | `ALTER TABLE "user_accounts" ADD CONSTRAINT "ck_user_accounts_system_role_has_no_clinic" CHECK (("role" = 'super_admin') = ("clinic_id" IS NULL));` junto com o índice existente `uq_user_accounts_single_system_account` | Só a regra no `CreateAccount` — não protege de escrita direta no banco nem de um caminho novo que esqueça a regra |
| Família de rota da plataforma | `RouteFamily` ganha `'platform'`; `PLATFORM_PREFIXES = ['/plataforma', '/api/platform']`; `FAMILY_ALLOWED_ROLES.platform = ['super_admin']`; `super_admin` sai de `clinical`, `operational`, `administrative` e `professional_self` | App ou subdomínio separado — só compensa com vários operadores ou exigência de conformidade (design, Shape) |
| Redirecionamento de página negada | No proxy, página negada leva o `super_admin` a `/plataforma`, o resto da equipe a `/` e `patient`/`partner` a `/portal` (como hoje) | Tela "sem permissão" em `/plataforma` para a equipe — ver Unresolved 3 |
| Contrato do convite do primeiro admin | `POST /api/platform/clinics/[id]/admins` · in `{ email }` · out `{ id, email, role, clinicId, active, passwordSet, delivered }` · sem link de convite na resposta. É a primeira rota de `/api/platform/clinics/[id]/*`; o B4 soma listar, reenviar, desativar e reativar no mesmo recurso | Continuar por `POST /api/accounts` com `clinicId` — mantém o super_admin numa rota da clínica, o que contradiz o critério 4; devolver o link na resposta — deixaria o super_admin definir a senha do admin e entrar com acesso clínico |
| Rota da importação de taxonomias | `POST /api/platform/taxonomy/import`; `POST /api/admin/taxonomy/import` removida sem alias | Manter a rota antiga como alias — continuaria na família `administrative`, aberta ao `company_admin` |

## Surface

| Route | In | Out | Status | Criteria |
|---|---|---|---|---|
| `POST /api/platform/clinics/[id]/admins` | `email` | `id`, `email`, `role`, `clinicId`, `active`, `passwordSet`, `delivered` | `200`, `400`, `401`, `403`, `404` | 9, 11, 13–19 |
| `POST /api/platform/taxonomy/import` | — | contagens da importação (as de hoje) | `200`, `401`, `403` | 9, 11, 20, 22 |
| `POST /api/admin/taxonomy/import` | — | — | `404` | 21 |
| página `/plataforma` | — | título `Plataforma`, botão `Sair` | `200`, `307` | 5, 10, 11, 12 |

## Sources

- [`.design/portal-super-admin.md`](../.design/portal-super-admin.md) — bloco B1 do Roadmap; linhas de Decisions "Onde fica a área do super_admin", "Alcance do super_admin", "Unicidade do super_admin" e "Catálogo de taxonomias"; Journey estados 1, 9 e 10.
- [#214](https://github.com/KalleoPinheiro/vitta-flow/issues/214) — decisões do dono do produto, 2026-09-27.
- Conversa com @KalleoPinheiro, 2026-09-27 (sem endereço), linhas que decidem: "deve existir somente 1 superadmin e ele sou eu, o super admin deveria ser cadastrado de uma forma a prova de falha"; pergunta 4 "não, sem acesso clínico por padrão"; pergunta 5 "opção (b)".
- Código lido: `src/lib/auth/route-family.ts`, `src/lib/auth/access-policy.ts`, `src/proxy.ts`, `src/domain/auth/role-hierarchy.ts`, `src/application/auth/create-account.ts`, `src/app/api/accounts/route.ts`, `src/app/api/settings/clinic-info/route.ts`, `src/app/api/admin/taxonomy/import/route.ts`, `e2e/global-setup.ts`, `playwright.config.ts`, `playwright.prod.config.ts`.

This task is the record of decision. If a linked document diverges, ask before building.

## Unresolved

None. As 4 perguntas abertas foram confirmadas pelo dono do produto (@KalleoPinheiro) em
2026-09-27, todas com a recomendação padrão:

| # | Kind | Question | Decision (2026-09-27) |
|---|---|---|---|
| 1 | decided | O convite do primeiro `company_admin` (`POST /api/platform/clinics/[id]/admins`) sai do B4 e entra no B1? | Sim, entra no B1 (critérios 13–19) |
| 2 | decided | A migração do critério 2 deve **falhar** diante de linhas inválidas ou **sanear**? | Falha sem alterar nada (critério 3) |
| 3 | decided | `company_admin` que abre `/plataforma` deve ir para `/` ou ver uma tela "sem permissão"? | Redireciona para `/` — vale para `company_admin`, `atendente` e `profissional` (critério 10); o Journey 10 do design foi ajustado |
| 4 | decided | O super_admin pode convidar o próprio e-mail como `company_admin` de uma clínica? | Sem bloqueio; o evento fica na auditoria da clínica (critério 19) |
