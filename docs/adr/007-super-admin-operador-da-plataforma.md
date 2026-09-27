---
title: "ADR 007 — Super Admin é o operador da plataforma, sem acesso a dado de clínica"
status: frozen
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-27
---

# ADR 007 — Super Admin é o operador da plataforma, sem acesso a dado de clínica

- **Data:** 2026-09-27
- **Status:** aceito (decisão do dono do produto na issue [#214](https://github.com/KalleoPinheiro/vitta-flow/issues/214))
- **Domínios afetados:** acesso, pacientes-prontuario
- **Emenda:** [ADR-003](./003-modelo-de-papeis-multi-empresa.md) — muda o escopo do Super Admin; o catálogo de seis papéis e o resto do ADR-003 continuam valendo

## Contexto

O ADR-003 definiu o Super Admin como papel cross-empresa com acesso a tudo, inclusive dado clínico.
Na prática, a sessão dele tinha `clinicId = null`: lia o prontuário de todas as clínicas e gravava
tudo na `legacy-clinic` sem aviso (`writeClinicId`). A matriz de provisionamento deixava criar outra
conta `super_admin` ligada a uma clínica, e o índice `uq_user_accounts_single_system_account` só
barrava a segunda conta **sem** clínica. Qualquer `company_admin` podia disparar
`POST /api/admin/taxonomy/import`, que grava o catálogo global de NANDA-I/NOC/NIC lido por todas as
clínicas.

Quem paga são as clínicas clientes: o operador da plataforma via dado de saúde de que não precisa
(minimização da LGPD), e uma clínica conseguia alterar dado das outras. Nada está em produção; o
go-live terá uma clínica e outras estão no radar. O dono do produto decidiu (2026-09-27): um único
super_admin, sem acesso clínico por padrão, com alcance limitado a cadastro de clínica e gestão de
`company_admin` (opção b). Discovery: [`.design/portal-super-admin.md`](../../.design/portal-super-admin.md).

## Opções consideradas

| Opção | A favor | Contra |
| --- | --- | --- |
| A — Super Admin com acesso total auditado (ADR-003) | Suporte lê qualquer dado sem pedir | Operador vê dado de saúde que não precisa; a auditoria registra, não impede |
| B — Operador da plataforma, fora de toda rota da clínica | Minimização da LGPD; a clínica é dona do próprio dado | Suporte que precise ler dado clínico depende de um admin da clínica |
| C — Acesso excepcional justificado e visível à clínica | Suporte possível com rastro | Mais fluxo (pedido, justificativa, aviso) sem demanda hoje |

## Decisão

**Opção B.** O `super_admin` só acessa a família de rota `platform` (`/plataforma`,
`/api/platform/**`) e as rotas compartilhadas (logout e portal), e nada mais.

- **Sem acesso clínico nem operacional.** `super_admin` sai das famílias `clinical`,
  `operational`, `administrative` e `professional_self` (`FAMILY_ALLOWED_ROLES`,
  `src/lib/auth/route-family.ts`). A API responde `403` "Seu papel não tem acesso a este recurso"
  nas duas camadas do ADR-002, e o proxy leva qualquer página da clínica a `/plataforma`.
- **Família `platform`.** `PLATFORM_PREFIXES = ['/plataforma', '/api/platform']`,
  `FAMILY_ALLOWED_ROLES.platform = ['super_admin']`. Equipe da clínica que abre `/plataforma` vai
  a `/`; paciente e parceiro vão a `/portal`.
- **Um único super_admin.** Ninguém cadastra `super_admin` (`PROVISIONING_MATRIX` sem o papel em
  nenhuma linha; o único caminho é o bootstrap). O banco garante o mesmo com
  `ck_user_accounts_system_role_has_no_clinic`:
  `CHECK (("role" = 'super_admin') = ("clinic_id" IS NULL))`, somada ao índice
  `uq_user_accounts_single_system_account`. A migração `0041` falha diante de linha inválida, sem
  alterar nada.
- **Primeiro admin pela plataforma.** `POST /api/platform/clinics/[id]/admins` com `{ email }`
  cria o `company_admin` sem senha usável e envia o convite. A resposta não traz o link: com ele, o
  operador definiria a senha do admin e entraria na clínica.
- **Catálogo como ato de plataforma.** A importação do catálogo de taxonomias passa a
  `POST /api/platform/taxonomy/import`; `/api/admin/taxonomy/import` foi removida sem alias.

A opção A perde porque a auditoria registra o acesso mas não o evita, e a LGPD pede que ele não
aconteça. A opção C vence se o suporte precisar ler dado clínico; hoje não há essa demanda.

## Consequências

**Positivas**

- O operador da plataforma não lê nem grava dado de clínica, e a clínica deixa de receber, em
  silêncio, dado gravado pelo operador na `legacy-clinic`.
- Nenhum `company_admin` altera o catálogo global que as outras clínicas leem.
- Um segundo super_admin é impossível mesmo por escrita direta no banco.

**Negativas / custos aceitos**

- Suporte que precise ver o prontuário depende de um admin da clínica.
- Nada impede o super_admin de convidar o próprio e-mail como `company_admin` de uma clínica; o
  evento fica na auditoria da clínica (bloqueio por e-mail igual seria contornado com outro e-mail).
- `POST /api/accounts` ainda aceita `clinicId` e o caminho de ator super_admin, alcançável só no
  modo aberto de desenvolvimento; sai no bloco B4.

**O que esta decisão fecha:** dar ao super_admin qualquer acesso a dado de clínica passa a exigir
um ADR novo, com a opção C como ponto de partida.

## Relacionado

- [ADR-002: Autorização em duas camadas](./002-autorizacao-em-duas-camadas.md) — a família `platform` usa as mesmas duas camadas.
- [ADR-003: Modelo de papéis multi-empresa](./003-modelo-de-papeis-multi-empresa.md) — emendado aqui no escopo do Super Admin.
- [ADR-005: Revogação de sessão por versão](./005-revogacao-de-sessao-por-versao.md).
- Tarefa [`.tasks/b1-contencao-super-admin.md`](../../.tasks/b1-contencao-super-admin.md), issue [#214](https://github.com/KalleoPinheiro/vitta-flow/issues/214).
