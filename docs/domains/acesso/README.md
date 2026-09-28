---
title: "Domínio: Acesso, empresas e auditoria"
status: living
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-28
domain: acesso
---

# Acesso, empresas e auditoria

## Resumo

Quem entra, em qual empresa (Clinic, o tenant) e o que pode ver. Todo acesso é por e-mail + senha
própria; toda conta, exceto o Super Admin, pertence a exatamente uma empresa; toda mudança
registra o ator. O Super Admin é o operador da plataforma: cuida das clínicas e dos admins delas,
sem acesso a dado de clínica ([ADR-007](../../adr/007-super-admin-operador-da-plataforma.md)), e entra com senha **e** segundo fator ([ADR-008](../../adr/008-segundo-fator-do-super-admin.md)). Fronteira: começa no login/convite e termina na decisão de autorização — o que
cada tela faz com o dado é dos outros domínios.

**Termos ([`CONTEXT.md`](../../../CONTEXT.md) § Access Control):** `Clinic`, `Session`, `Role`, `Audit Event`, `Consent Record`.

## Regras de negócio

| ID | Regra | Onde é garantida |
| --- | --- | --- |
| ACE-RN-01 | Sem `AUTH_SECRET`, toda rota responde `503`; `VITTA_ALLOW_OPEN_MODE` só funciona fora de produção | `src/proxy.ts`, `src/lib/auth/require-session.ts` |
| ACE-RN-02 | Único login: e-mail + senha (scrypt). Não há senha mestre, allowlist nem login Google | [ADR-004](../../adr/004-remocao-google-oauth-autenticacao.md) |
| ACE-RN-03 | Primeiro acesso por convite (link de 24 h, uso único); reset por link de 1 h | `src/application/auth/auth-token-flow.ts` |
| ACE-RN-04 | `POST /api/auth/bootstrap` cria o Super Admin só com `x-bootstrap-token` válido **e** zero contas; depois, `403` | `src/app/api/auth/bootstrap/` |
| ACE-RN-05 | Catálogo fechado de 6 papéis; ninguém se autocadastra; cada papel cria só os papéis abaixo dele; ninguém cria `super_admin` — o único nasce do bootstrap, e o banco recusa `super_admin` com clínica e conta de empresa sem clínica (`ck_user_accounts_system_role_has_no_clinic`). O Super Admin só cadastra `company_admin`, pela plataforma (`POST /api/platform/clinics/[id]/admins`) — não cria atendente, profissional, paciente nem parceiro de clínica (ADR-007, #253) | [ADR-003](../../adr/003-modelo-de-papeis-multi-empresa.md), [ADR-007](../../adr/007-super-admin-operador-da-plataforma.md), `src/domain/auth/role-hierarchy.ts`, `drizzle/0041_*` |
| ACE-RN-06 | Autorização em duas camadas (proxy + handler), fail-closed | [ADR-002](../../adr/002-autorizacao-em-duas-camadas.md), `src/lib/auth/access-policy.ts` |
| ACE-RN-07 | Leitura e escrita escopadas pela empresa da sessão via `TenantScope`; `{ clinicId }` literal não compila | `src/lib/auth/tenant-scope.ts` |
| ACE-RN-08 | Conta desativada, logout, reset ou troca de senha revogam todas as sessões da conta em até 60 s, mesmo com cookie válido, para todos os papéis (inclusive portal) — `session_version` no token × na conta. Sessão sem empresa é conferida contra a conta de sistema pelo papel: e-mail do cookie diferente do da conta revoga (ADR-009) | [ADR-005](../../adr/005-revogacao-de-sessao-por-versao.md), `src/lib/auth/staff-revocation.ts` |
| ACE-RN-09 | Mesmo e-mail pode existir em empresas diferentes; login testa a senha contra cada conta e nega se houver ambiguidade | `.specs/features/fix-login-email-ambiguo/` |
| ACE-RN-10 | Super Admin só acessa a família `platform` (`/plataforma`, `/api/platform/**`, inclusive a trilha de plataforma `/plataforma/auditoria`, ACE-RN-31) e as rotas compartilhadas (logout, portal). Toda rota da clínica responde `403` "Seu papel não tem acesso a este recurso" no proxy e no handler; toda página da clínica redireciona para `/plataforma`. Equipe da clínica que abre `/plataforma` vai a `/`; paciente e parceiro, a `/portal` | [ADR-007](../../adr/007-super-admin-operador-da-plataforma.md), `src/lib/auth/route-family.ts`, `src/proxy.ts` |
| ACE-RN-11 | Editar conta existente (senha, ativar/desativar, reenviar convite) segue a matriz do ACE-RN-05: papel fora da matriz → `403`, conta de outra empresa → `404`. Atendente/Profissional só listam e alteram contas `patient`/`partner`. Ninguém desativa a própria conta nem o último `company_admin` ativo (`400`). Senha, ativação e reenvio gravam auditoria antes da alteração; se a auditoria falha, nada muda | `src/domain/auth/account-management.ts`, `src/app/api/accounts/` (#184) |
| ACE-RN-12 | Toda sub-rota de `/api/patients/:id/*` é família `clinical` por padrão (Atendente 403); exceção só por allowlist explícita, hoje vazia. Inclui a exportação LGPD, que também exige vínculo R4 do Profissional (404 sem vínculo) | `src/lib/auth/route-family.ts`, `.specs/STATE.md` AD-025 |
| ACE-RN-13 | A interface esconde o que o papel não pode usar, pela mesma matriz de famílias de rota (sem regra duplicada): menu, blocos do dashboard, abas da ficha; tela proibida mostra "sem permissão" sem chamar a API. Esconder é UX — a API continua barrando (#199) | `src/lib/staff-access.tsx`, `src/lib/auth/route-family.ts` |
| ACE-RN-14 | Equipe autenticada sem acesso à família de rota recebe `403` "Seu papel não tem acesso a este recurso" também no proxy — "restrito à equipe" fica para sessões de paciente/parceiro (#199) | `src/proxy.ts` |
| ACE-RN-15 | Limite geral da API por conta autenticada (empresa + e-mail) e por IP só para anônimos — clínicas atrás de NAT não dividem o teto (#201) | `src/proxy.ts` |
| ACE-RN-16 | Um `company_admin` de uma clínica é convidado pelo Super Admin em `POST /api/platform/clinics/[id]/admins` (`{ email }`): nasce sem senha usável, recebe o convite (24 h, uso único) e a resposta nunca traz o link. Clínica com cadastro incompleto (sem nome, CNPJ, telefone ou e-mail de contato) → `400` "Complete o cadastro da clínica (nome, CNPJ, telefone e e-mail de contato) antes de convidar o admin" — é o caso da `legacy-clinic` até o operador completá-la. Clínica inexistente → `404`; e-mail repetido na clínica (inclusive em corrida) → `400`; falha do e-mail → `200` com `delivered: false`. O evento fica na auditoria da clínica com o ator `super_admin` | `src/app/api/platform/clinics/[id]/admins/`, `src/application/platform/manage-clinic-admins.ts` (#214) |
| ACE-RN-17 | Importar o catálogo global de taxonomias (NANDA-I/NOC/NIC) é ato de plataforma: `POST /api/platform/taxonomy/import`, só Super Admin; `/api/admin/taxonomy/import` não existe mais | `src/app/api/platform/taxonomy/import/` (#214) |
| ACE-RN-18 | Super Admin entra em duas etapas: a senha certa não emite sessão, só `{ mfaRequired: true, pendingToken }` (fator cadastrado) ou `{ mfaEnrollmentRequired: true, pendingToken }` (sem fator). O token pendente vale 5 min, é assinado com chave derivada do `AUTH_SECRET` e morre se a `session_version` da conta mudar. `POST /api/auth/mfa/verify` confere o código TOTP (6 dígitos, 30 s, janela ±1, mesmo código não entra duas vezes) e emite a sessão. Código errado → `401` "Código inválido"; token ausente, expirado ou de outra etapa → `401` "Verificação expirada. Entre novamente com e-mail e senha."; 6ª tentativa da conta no minuto → `429` | [ADR-008](../../adr/008-segundo-fator-do-super-admin.md), `src/application/auth/mfa-login.ts`, `src/app/api/auth/mfa/` (#214) |
| ACE-RN-19 | Sem fator cadastrado, o Super Admin cadastra um antes de qualquer sessão (`POST /api/auth/mfa/enroll`: chave em texto e link `otpauth://`, sem QR). A chave só é gravada (cifrada, ADR-006) quando o código dela é confirmado; a confirmação devolve 10 códigos de recuperação de uso único, exibidos uma única vez e guardados como hash scrypt, e derruba sessões e tokens pendentes anteriores | [ADR-008](../../adr/008-segundo-fator-do-super-admin.md), `drizzle/0042_*` (#214) |
| ACE-RN-20 | Código de recuperação válido não abre sessão: é consumido e leva ao recadastro obrigatório do autenticador; o fator antigo vale até o novo ser confirmado, e o recadastro troca os 10 códigos. Usado ou inexistente → `401` "Código de recuperação inválido" | [ADR-008](../../adr/008-segundo-fator-do-super-admin.md) (#214) |
| ACE-RN-21 | Super Admin que perdeu tudo (senha, e-mail ou autenticador e códigos) só volta pelo servidor: `npm run admin:recover` remove o segundo fator e os códigos, invalida a senha, troca o e-mail se pedido (recusa e-mail de outra conta), derruba as sessões, audita e imprime um link de definir senha de 1 hora — só no terminal. Não existe rota pública de recuperação. Roteiro: [`producao.md` § 10](../../engineering/producao.md) | [ADR-009](../../adr/009-recuperacao-de-emergencia-do-super-admin.md), `src/infrastructure/persistence/drizzle/recover-super-admin.ts` (#214) |
| ACE-RN-22 | O Super Admin cadastra clínicas em `POST /api/platform/clinics`: nome, CNPJ, telefone/WhatsApp e e-mail de contato e e-mail do primeiro admin são obrigatórios; responsável técnico (nome + registro) é opcional. A clínica e a conta do primeiro `company_admin` gravam na mesma transação; o convite sai depois, e falha de e-mail responde `200` com `delivered: false`. Grava `create/clinic` e `create/account` na auditoria da clínica nova | `src/application/platform/create-clinic.ts`, `src/app/api/platform/clinics/` (#214) |
| ACE-RN-23 | CNPJ é guardado na forma `AA.AAA.AAA/AAAA-DD` (aceita com ou sem pontuação e o CNPJ alfanumérico; sem conferir dígito verificador) e é único entre clínicas (`uq_clinics_cnpj`): repetido → `400` "Já existe clínica com este CNPJ", na criação, na edição pela plataforma e em Configurações. E-mail de contato inválido → `400` | `src/domain/clinic/cnpj.ts`, `drizzle/0043_*` (#214) |
| ACE-RN-24 | Dados cadastrais (nome, CNPJ, contato, responsável técnico, endereço) são editados pelo Super Admin em `PATCH /api/platform/clinics/[id]` e pelo `company_admin` em `PUT /api/settings/clinic-info`, pela mesma regra; a edição do Super Admin fica na auditoria da clínica (`update/clinic-info`). Editar não exige cadastro completo: limpar CNPJ ou contato deixa a clínica "cadastro incompleto" | `src/application/platform/update-clinic-info.ts` (#214) |
| ACE-RN-25 | Na plataforma o Super Admin só vê e gere contas `company_admin` (`GET /api/platform/clinics/[id]/admins`, `PATCH .../admins/[accountId]` com `action` `resend-invite`, `deactivate` ou `reactivate`); qualquer outra conta → `404` "Admin não encontrado". Vale o ACE-RN-11: o último `company_admin` ativo não é desativado (`400`) — para trocar o admin, convide o novo antes. Cada ação grava a auditoria na clínica-alvo antes de mudar a conta | `src/application/platform/manage-clinic-admins.ts` (#214) |
| ACE-RN-26 | `POST /api/accounts` não aceita `clinicId`: a conta nasce sempre na empresa da sessão (no modo aberto de dev, a clínica de escrita) | `src/app/api/accounts/route.ts` (#214) |
| ACE-RN-27 | O Super Admin suspende e reativa uma clínica em `POST /api/platform/clinics/[id]/suspend` e `.../reactivate` (sem corpo; `200` com o cadastro e `status`, `statusChangedAt`, `statusChangedBy`; clínica inexistente → `404`). Repetir é idempotente: `200` sem nova auditoria. Cada mudança grava antes `update/clinic-status` (`detail` `suspend`/`reactivate`) na auditoria da clínica-alvo; se a auditoria falha, nada muda. Nenhum dado é apagado | `src/application/platform/change-clinic-status.ts`, `drizzle/0044_*` (#214) |
| ACE-RN-28 | Clínica suspensa: login de toda conta dela (equipe, `patient`, `partner`) com a senha certa → `403` "O acesso desta clínica está suspenso. Fale com o responsável pela clínica."; no portal a mensagem termina com o contato da clínica (": telefone …, e-mail …."). Senha errada continua `401` "Email ou senha incorretos" — a suspensão só aparece para quem provou a senha. O mesmo e-mail numa clínica ativa entra nela | `src/app/api/auth/login/route.ts`, `src/application/auth/suspended-clinic-message.ts` (#214) |
| ACE-RN-29 | Suspender incrementa a `session_version` de toda conta da clínica na mesma transação e a revogação por consulta trata a clínica suspensa como conta inativa: as sessões caem na hora no processo que suspendeu e em ≤ 60 s nos demais (ADR-005). Reativar não devolve as sessões antigas — as contas entram de novo com novo login | `src/lib/auth/staff-revocation.ts` (#214) |
| ACE-RN-30 | Clínica suspensa não recebe convite nem reenvio de convite de admin (`400` "Clínica suspensa: reative a clínica antes de convidar o admin"); desativar/reativar admin e editar o cadastro seguem. Links de convite/reset já emitidos continuam valendo para definir a senha — o login seguinte é que é negado | `src/application/platform/manage-clinic-admins.ts` (#214) |
| ACE-RN-31 | Evento de auditoria sem empresa é **evento de plataforma** (`clinic_id` nulo): login com falha — mesmo com e-mail de conta de alguma clínica —, segundo fator e recuperação do Super Admin, importação do catálogo de taxonomia. Nenhum Admin de Empresa o vê. A trilha de plataforma (`clinic_id` nulo ou ator `super_admin`) é só do Super Admin: `GET /api/platform/audit` (`from`, `to`, `limit` 1..500, `offset`; linhas com `clinicId`/`clinicName`, sem paciente) e a tela `/plataforma/auditoria`. Ação do Super Admin numa clínica grava a clínica-alvo e aparece nas duas trilhas. O login barrado por clínica suspensa segue na trilha da clínica | [ADR-010](../../adr/010-trilha-de-auditoria-de-plataforma.md), `src/lib/audit.ts`, `drizzle/0045_*` (#210, #214) |
| ACE-RN-32 | O repositório de auditoria é escopado pela empresa como os demais (AD-017): `/api/audit` e a emissão de documento (`POST /api/documents/issue`) só leem a própria empresa; gravar evento de outra empresa num repositório de clínica é erro | `src/infrastructure/persistence/drizzle/drizzle-audit-event-repository.ts` (#210) |

### Papéis

| Papel | O que acessa |
| --- | --- |
| `super_admin` | só a plataforma (`/plataforma`, `/api/platform/**`): cadastra e edita clínicas, suspende e reativa clínicas, convida, reenvia convite, desativa e reativa o `company_admin` de cada uma e importa o catálogo de taxonomias; lê a trilha de plataforma (ACE-RN-31). Nenhum dado de clínica — nem prontuário, nem agenda, nem configurações. Existe um só, e entra com segundo fator (ACE-RN-18) |
| `company_admin` | tudo dentro da própria empresa: operacional, clínico, configurações, contas |
| `atendente` | só operacional: agenda e cadastro de paciente/parceiro; lê profissionais e procedimentos só pela lista reduzida `/api/options/*`, sem comissão nem kit (#188) |
| `profissional` | clínico, só dos pacientes com quem tem consulta ou evolução; busca NANDA-I/NOC/NIC da SAE (`/api/taxonomy/**`, família `clinical`) e nomes de profissionais por `/api/options/professionals`; a aba Pacotes do prontuário fica oculta até a decisão de produto (#189) |
| `partner` | portal com os pacientes que indicou (sem financeiro e sem anamnese) |
| `patient` | portal com os próprios dados |

## Funcionalidades

| Funcionalidade | Estado | Onde |
| --- | --- | --- |
| Login, convite, definir senha, esqueci a senha | entregue | `/login`, `/definir-senha`, `/esqueci-senha` |
| Segundo fator do Super Admin (código do autenticador, cadastro, códigos de recuperação) | entregue, com recuperação de emergência no servidor (`npm run admin:recover`) | `/login` (etapas depois da senha), `/api/auth/mfa/**` |
| Contas e papéis (criar, desativar, reenviar convite) | entregue | Configurações → Contas |
| Dados cadastrais da empresa (CNPJ, contato, responsável técnico) | entregue | Configurações → Dados da clínica; plataforma → detalhe da clínica |
| Trilha de auditoria (da clínica; inclui as ações do Super Admin nela) | entregue | `/auditoria` |
| Área da plataforma (Super Admin): lista de clínicas (situação ativa/suspensa, cadastro completo/incompleto, admin sem admin/aguardando primeiro acesso/ativo), nova clínica, detalhe com situação (suspender/reativar), cadastro e admins | entregue, com a trilha de plataforma (B6) | `/plataforma`, `/plataforma/clinicas/**`, `/plataforma/auditoria`, `/api/platform/**` |
| Consentimento LGPD e exportação de dados do paciente | entregue (exportação só para Admins e Profissional com vínculo; Atendente sem acesso, pergunta aberta em AD-025) | portal, `patients/[id]/export` |

Specs de execução: `.specs/features/{autenticacao-nativa,rbac-catalogo-papeis,fundacao-multi-tenancy,fase-c-lgpd-seguranca-dado}/`.

## Código

| Camada | Caminho |
| --- | --- |
| domínio | `src/domain/{auth,clinic,audit,consent}/` |
| casos de uso | `src/application/{auth,platform}/` |
| borda e política | `src/proxy.ts`, `src/lib/auth/` |
| API | `src/app/api/{auth,accounts,audit,settings,clinic-info,platform}/` |
| UI | `src/app/{login,definir-senha,esqueci-senha,plataforma}/`, `src/app/(staff)/{auditoria,configuracoes}/` |
| testes | `tests/lib/`, `tests/proxy.test.ts`, `tests/api/platform-*.test.ts`, `tests/api/audit-platform-trail.test.ts`, `tests/api/mfa-login.test.ts`, `tests/{api,infrastructure}/recover-super-admin.test.ts`, `e2e/{auth,auditoria,equipe,export-lgpd,plataforma,plataforma-suspensao}.spec.ts`, `e2e/papeis-*.spec.ts` (uma sessão real por papel) |

## Decisões

- [ADR-001](../../adr/001-multi-tenancy.md) — multiempresa por `clinic_id`, RLS adiada
- [ADR-002](../../adr/002-autorizacao-em-duas-camadas.md) — proxy + handler
- [ADR-003](../../adr/003-modelo-de-papeis-multi-empresa.md) — seis papéis, vínculo dinâmico do Profissional
- [ADR-004](../../adr/004-remocao-google-oauth-autenticacao.md) — login nativo; Google só como integração
- [ADR-005](../../adr/005-revogacao-de-sessao-por-versao.md) — revogação de sessão por `session_version`
- [ADR-007](../../adr/007-super-admin-operador-da-plataforma.md) — Super Admin é o operador da plataforma, único e sem dado de clínica
- [ADR-008](../../adr/008-segundo-fator-do-super-admin.md) — segundo fator TOTP obrigatório para o Super Admin
- [ADR-009](../../adr/009-recuperacao-de-emergencia-do-super-admin.md) — recuperação de emergência do Super Admin por script no servidor
- Integração: [Resend](../../engineering/integrations/resend.md) (convite e reset)
