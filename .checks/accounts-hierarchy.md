# Hierarquia na edição de contas (#184)

Profile: `standard` · handoff: `on` (verificação independente pela sessão orquestradora).

Sources:

- [Issue #184](https://github.com/KalleoPinheiro/estomasystech/issues/184) - critérios de aceite 1–6, "Relacionados" (fora de escopo)
- [`docs/domains/acesso/README.md`](../docs/domains/acesso/README.md), [ADR-001](../docs/adr/001-multi-tenancy.md), [ADR-002](../docs/adr/002-autorizacao-em-duas-camadas.md)
- Matriz `PROVISIONING_MATRIX` em `src/domain/auth/role-hierarchy.ts` (reusada, não alterada)

## Out of scope

- Remover `password` do `PATCH /api/accounts/[id]` - issue, "Relacionados": pergunta ao dono do produto (Q1 abaixo)
- Invalidar sessões ativas após troca de senha/desativação - issue, "Relacionados": outra issue (sessão stateless)
- Família de rota de `/api/accounts` em `src/lib/auth/route-family.ts` - continua `operational` (issue: de propósito); não tocado
- Trava transacional contra desativação concorrente de dois `company_admin` - ver Swept "Concorrência"

## Landing

Toca `src/domain/auth/account-management.ts` (novo, regra pura), as rotas `src/app/api/accounts/route.ts` (GET),
`src/app/api/accounts/[id]/route.ts` (PATCH) e `src/app/api/accounts/[id]/resend-invite/route.ts` (POST).
Reaproveita `canProvision`, `ProvisioningDeniedError` (403), `ValidationError` (400), `NotFoundError` (404),
`recordAuditNow`, `writeScope`/`sessionScope`.

| Decisão | Forma literal | Alternativa rejeitada |
| --- | --- | --- |
| Status da negação por hierarquia | `ProvisioningDeniedError` → **403**, o mesmo do `POST /api/accounts` (critério 1: "conforme a convenção já usada no POST") | 404 - divergiria do POST; a conta de outra empresa já dá 404 porque o `writeScope` não a encontra |
| Onde mora a regra | `src/domain/auth/account-management.ts`: `assertCanManageAccount`, `assertCanDeactivate`, `visibleAccounts`, `accountChangeDetail` (puras, sem I/O) | inline em cada rota - duplicaria a regra em 3 handlers e estouraria a complexidade cognitiva |
| Ator em modo aberto (sem sessão) | `super_admin`, igual ao POST | negar - mudaria o modo aberto de dev, fora do escopo |
| "Própria conta" | `account.email === session.subject` (o login grava o e-mail como `subject`); o `writeScope` já restringe à empresa | comparar id - a sessão não carrega o id da conta |
| Último `company_admin` | nega desativar quando o alvo é `company_admin` ativo e não há outro `company_admin` ativo na empresa → 400 com mensagem | 409 - os demais bloqueios de estado de conta (`Conta desativada não pode receber convite`) já usam 400 |
| Auditoria | `recordAuditNow` **antes** do `save`/emissão (padrão SEC1-21 de `photos/[id]`); `action: 'update'`, `resourceType: 'account'`, `resourceId: <id>`, `detail`: `password`, `deactivate`, `reactivate` (juntos por `, `) ou `resend-invite` | `recordAudit` (after) - o critério pede write-ahead; auditar depois do save arriscaria mudança sem trilha |
| `GET` filtrado | `visibleAccounts(role, contas)` = contas cujo papel o ator pode provisionar (mesma matriz) | filtro só para atendente/profissional - duas regras para a mesma pergunta; para `company_admin` o efeito é esconder `super_admin`, que ele já não pode editar |
| `resend-invite` auditado | sim, write-ahead, `detail: 'resend-invite'` (reemitir invalida o link anterior) | não auditar - a issue lista o efeito colateral; custo zero |

## Checks

Proofs rodam com `npx vitest run <arquivo> -t "<nome>"`.

**C1** - Atendente troca a senha do `company_admin` → **403**, senha inalterada (`passwordSet` segue `false`)
Proof: `tests/api/accounts-hierarchy.test.ts` › "C1 atendente não troca a senha do admin"

**C2** - Profissional desativa o `company_admin` → **403**, conta segue `active: true`
Proof: `tests/api/accounts-hierarchy.test.ts` › "C2 profissional não desativa o admin"

**C3** - `company_admin` desativa atendente → **200**, `active: false`
Proof: `tests/api/accounts-hierarchy.test.ts` › "C3 admin desativa atendente"

**C4** - Atendente desativa conta `patient` → **200**, `active: false`
Proof: `tests/api/accounts-hierarchy.test.ts` › "C4 atendente desativa paciente"

**C5** - `resend-invite` de atendente para o `company_admin` → **403**; para `patient` → **200**
Proof: `tests/api/accounts-hierarchy.test.ts` › "C5 resend-invite respeita a hierarquia"

**C6** - Conta de outra empresa (PATCH e resend-invite) → **404**
Proof: `tests/api/accounts-hierarchy.test.ts` › "C6 conta de outra empresa é 404"

**C7** - `GET /api/accounts` como atendente e como profissional → só `patient`/`partner`; como `company_admin` → inclui `atendente` e `company_admin`
Proof: `tests/api/accounts-hierarchy.test.ts` › "C7 GET filtra pela hierarquia"

**C8** - Troca de senha grava evento `update`/`account`/`<id>` com `detail: 'password'`, ator = e-mail da sessão; desativação grava `detail: 'deactivate'`; reativação `reactivate`; resend `resend-invite`
Proof: `tests/api/accounts-hierarchy.test.ts` › "C8 alterações gravam auditoria"

**C9** - Write-ahead: se a auditoria falha, a resposta é 500 e a conta não muda
Proof: `tests/api/accounts-hierarchy.test.ts` › "C9 falha de auditoria não altera a conta"

**C10** - Desativar a própria conta → **400** "Não é possível desativar a própria conta"
Proof: `tests/api/accounts-hierarchy.test.ts` › "C10 não desativa a própria conta"

**C11** - Desativar o último `company_admin` ativo → **400** "Não é possível desativar o último administrador ativo da empresa"; com outro admin ativo → 200
Proof: `tests/api/accounts-hierarchy.test.ts` › "C11 último admin ativo não é desativado"

**C12** - Regra pura: matriz, própria conta, último admin, filtro, detalhe de auditoria
Proof: `tests/domain/account-management.test.ts` (todos os `it`)

**C13** - Documentação: regra de edição de conta em `docs/domains/acesso/README.md`
Proof: `npm run check:docs`

## Swept (requisitos não escritos)

| Requisito | Onde caiu |
| --- | --- |
| Validação | `updateSchema` inalterado (zod → 400) - existente |
| Falhas | auditoria falhou → 500 sem mudança (C9) |
| Idempotência | desativar conta já inativa: 200, grava auditoria de novo (pedido registrado, não a transição) - existente |
| Autorização | C1–C7, C10 |
| Concorrência | dois `company_admin` desativando um ao outro ao mesmo tempo podem passar ambos (leitura-verificação-escrita sem transação) - **residual**, registrado como Q3 |
| Ciclo de vida | reativação sujeita só à hierarquia; resend em conta inativa segue 400 - existente |
| Dependência externa | e-mail do resend inalterado (`delivered`) - existente |
| Transições | ativo↔inativo (C3, C4, C11) |
| Observabilidade/auditoria | C8, C9 |

## Perguntas abertas (padrão seguro aplicado)

- **Q1** - Manter `password` no PATCH (Admin define a senha de alguém sem convite)? Mantido, agora sob hierarquia + auditoria.
- **Q2** - Atendente/Profissional não podem mais trocar a própria senha nem se reativar pelo PATCH (a matriz não os deixa gerir o próprio papel). A tela não oferece isso hoje; o caminho é "esqueci a senha"/convite. Confirmar.
- **Q3** - Travar desativação concorrente do penúltimo admin (transação/lock)? Não feito.
