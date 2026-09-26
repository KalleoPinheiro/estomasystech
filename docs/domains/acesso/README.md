---
title: "Domínio: Acesso, empresas e auditoria"
status: living
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-26
domain: acesso
---

# Acesso, empresas e auditoria

## Resumo

Quem entra, em qual empresa (Clinic, o tenant) e o que pode ver. Todo acesso é por e-mail + senha
própria; toda conta, exceto o Super Admin, pertence a exatamente uma empresa; toda mudança
registra o ator. Fronteira: começa no login/convite e termina na decisão de autorização — o que
cada tela faz com o dado é dos outros domínios.

**Termos ([`CONTEXT.md`](../../../CONTEXT.md) § Access Control):** `Clinic`, `Session`, `Role`, `Audit Event`, `Consent Record`.

## Regras de negócio

| ID | Regra | Onde é garantida |
| --- | --- | --- |
| ACE-RN-01 | Sem `AUTH_SECRET`, toda rota responde `503`; `VITTA_ALLOW_OPEN_MODE` só funciona fora de produção | `src/proxy.ts`, `src/lib/auth/require-session.ts` |
| ACE-RN-02 | Único login: e-mail + senha (scrypt). Não há senha mestre, allowlist nem login Google | [ADR-004](../../adr/004-remocao-google-oauth-autenticacao.md) |
| ACE-RN-03 | Primeiro acesso por convite (link de 24 h, uso único); reset por link de 1 h | `src/application/auth/auth-token-flow.ts` |
| ACE-RN-04 | `POST /api/auth/bootstrap` cria o Super Admin só com `x-bootstrap-token` válido **e** zero contas; depois, `403` | `src/app/api/auth/bootstrap/` |
| ACE-RN-05 | Catálogo fechado de 6 papéis; ninguém se autocadastra; cada papel cria só os papéis abaixo dele | [ADR-003](../../adr/003-modelo-de-papeis-multi-empresa.md), `src/domain/auth/role-hierarchy.ts` |
| ACE-RN-06 | Autorização em duas camadas (proxy + handler), fail-closed | [ADR-002](../../adr/002-autorizacao-em-duas-camadas.md), `src/lib/auth/access-policy.ts` |
| ACE-RN-07 | Leitura e escrita escopadas pela empresa da sessão via `TenantScope`; `{ clinicId }` literal não compila | `src/lib/auth/tenant-scope.ts` |
| ACE-RN-08 | Conta desativada, logout, reset ou troca de senha revogam todas as sessões da conta em até 60 s, mesmo com cookie válido, para todos os papéis (inclusive portal) — `session_version` no token × na conta | [ADR-005](../../adr/005-revogacao-de-sessao-por-versao.md), `src/lib/auth/staff-revocation.ts` |
| ACE-RN-09 | Mesmo e-mail pode existir em empresas diferentes; login testa a senha contra cada conta e nega se houver ambiguidade | `.specs/features/fix-login-email-ambiguo/` |
| ACE-RN-10 | Acesso do Super Admin a dado de outra empresa é sempre auditado | `src/lib/audit.ts` |
| ACE-RN-11 | Editar conta existente (senha, ativar/desativar, reenviar convite) segue a matriz do ACE-RN-05: papel fora da matriz → `403`, conta de outra empresa → `404`. Atendente/Profissional só listam e alteram contas `patient`/`partner`. Ninguém desativa a própria conta nem o último `company_admin` ativo (`400`). Senha, ativação e reenvio gravam auditoria antes da alteração; se a auditoria falha, nada muda | `src/domain/auth/account-management.ts`, `src/app/api/accounts/` (#184) |
| ACE-RN-12 | Toda sub-rota de `/api/patients/:id/*` é família `clinical` por padrão (Atendente 403); exceção só por allowlist explícita, hoje vazia. Inclui a exportação LGPD, que também exige vínculo R4 do Profissional (404 sem vínculo) | `src/lib/auth/route-family.ts`, `.specs/STATE.md` AD-025 |
| ACE-RN-13 | A interface esconde o que o papel não pode usar, pela mesma matriz de famílias de rota (sem regra duplicada): menu, blocos do dashboard, abas da ficha; tela proibida mostra "sem permissão" sem chamar a API. Esconder é UX — a API continua barrando (#199) | `src/lib/staff-access.tsx`, `src/lib/auth/route-family.ts` |
| ACE-RN-14 | Equipe autenticada sem acesso à família de rota recebe `403` "Seu papel não tem acesso a este recurso" também no proxy — "restrito à equipe" fica para sessões de paciente/parceiro (#199) | `src/proxy.ts` |
| ACE-RN-15 | Limite geral da API por conta autenticada (empresa + e-mail) e por IP só para anônimos — clínicas atrás de NAT não dividem o teto (#201) | `src/proxy.ts` |

### Papéis

| Papel | O que acessa |
| --- | --- |
| `super_admin` | todas as empresas, inclusive dado clínico (auditado) |
| `company_admin` | tudo dentro da própria empresa: operacional, clínico, configurações, contas |
| `atendente` | só operacional: agenda e cadastro de paciente/parceiro; lê profissionais e procedimentos só pela lista reduzida `/api/options/*`, sem comissão nem kit (#188) |
| `profissional` | clínico, só dos pacientes com quem tem consulta ou evolução; busca NANDA-I/NOC/NIC da SAE (`/api/taxonomy/**`, família `clinical`) e nomes de profissionais por `/api/options/professionals`; a aba Pacotes do prontuário fica oculta até a decisão de produto (#189) |
| `partner` | portal com os pacientes que indicou (sem financeiro e sem anamnese) |
| `patient` | portal com os próprios dados |

## Funcionalidades

| Funcionalidade | Estado | Onde |
| --- | --- | --- |
| Login, convite, definir senha, esqueci a senha | entregue | `/login`, `/definir-senha`, `/esqueci-senha` |
| Contas e papéis (criar, desativar, reenviar convite) | entregue | Configurações → Contas |
| Dados cadastrais da empresa (CNPJ, responsável técnico) | entregue | Configurações → Dados da clínica |
| Trilha de auditoria | entregue | `/auditoria` |
| Consentimento LGPD e exportação de dados do paciente | entregue (exportação só para Admins e Profissional com vínculo; Atendente sem acesso, pergunta aberta em AD-025) | portal, `patients/[id]/export` |

Specs de execução: `.specs/features/{autenticacao-nativa,rbac-catalogo-papeis,fundacao-multi-tenancy,fase-c-lgpd-seguranca-dado}/`.

## Código

| Camada | Caminho |
| --- | --- |
| domínio | `src/domain/{auth,clinic,audit,consent}/` |
| casos de uso | `src/application/auth/` |
| borda e política | `src/proxy.ts`, `src/lib/auth/` |
| API | `src/app/api/{auth,accounts,admin,audit,settings,clinic-info}/` |
| UI | `src/app/{login,definir-senha,esqueci-senha}/`, `src/app/(staff)/{auditoria,configuracoes}/` |
| testes | `tests/lib/`, `tests/proxy.test.ts`, `e2e/{auth,auditoria,equipe,export-lgpd}.spec.ts`, `e2e/papeis-*.spec.ts` (uma sessão real por papel) |

## Decisões

- [ADR-001](../../adr/001-multi-tenancy.md) — multiempresa por `clinic_id`, RLS adiada
- [ADR-002](../../adr/002-autorizacao-em-duas-camadas.md) — proxy + handler
- [ADR-003](../../adr/003-modelo-de-papeis-multi-empresa.md) — seis papéis, vínculo dinâmico do Profissional
- [ADR-004](../../adr/004-remocao-google-oauth-autenticacao.md) — login nativo; Google só como integração
- [ADR-005](../../adr/005-revogacao-de-sessao-por-versao.md) — revogação de sessão por `session_version`
- Integração: [Resend](../../engineering/integrations/resend.md) (convite e reset)
