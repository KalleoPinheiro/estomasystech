---
title: "ADR 004 — Remoção do Google OAuth como mecanismo de autenticação"
status: frozen
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-23
---

# ADR 004 — Remoção do Google OAuth como mecanismo de autenticação

- **Status:** Aceito (implementação incremental futura)
- **Data:** 2026-08-30
- **Contexto:** reforma do sistema de login/autorização, ver [CONTEXT.md](../../CONTEXT.md) § Access Control; depende do modelo de papéis da [ADR-003](./003-modelo-de-papeis-multi-empresa.md)

## Contexto

Hoje existem dois caminhos de autenticação (`src/lib/auth/`):

1. **Senha**: `AUTH_PASSWORD` (senha mestre) ou conta individual em
   `user_accounts` — em ambos os casos, o login por senha **sempre** atribui
   `role: "admin"`, independente de quem seja o dono da conta.
2. **Google OAuth**: papel resolvido por allowlist (`GOOGLE_ALLOWED_EMAILS`,
   env var global do deploy) — admin se o e-mail está na allowlist, senão
   partner ou patient ativo, senão acesso negado.

Consequência prática: **Patient e Partner nunca tiveram senha própria** — o
único jeito de logar era Google OAuth casando com um cadastro ativo. E
qualquer conta de equipe com senha virava admin, não importa a intenção.

Com o modelo de papéis multi-empresa da ADR-003, esse desenho fica
insustentável em dois pontos:

- `GOOGLE_ALLOWED_EMAILS` é uma env var **global do deploy** — não faz sentido
  quando papel e acesso passam a ser **por empresa** (ADR-001 já registrava a
  convenção "configuração por linha, não por env" para exatamente este tipo de
  caso).
- Cadastro/permissão/autorização deixam de ser intenção do sistema — dependiam
  de uma lista de e-mails mantida fora do produto (só editável via variável de
  ambiente do deploy, não pela hierarquia de papéis que a ADR-003 define).

## Opções consideradas

| Opção | Prós | Contras |
|---|---|---|
| **A. Remover Google como autenticação; login 100% nativo** | Fonte única de verdade (banco, por empresa); resolve a inconsistência de Patient/Partner sem senha; elimina o fail-open de allowlist esquecida | Precisa de infraestrutura de e-mail transacional do zero (convite/reset), hoje inexistente no projeto |
| B. Manter Google OAuth, mover allowlist para o banco (por empresa) | Preserva login sem senha para quem já usa | Mantém duas fontes de verdade de identidade (conta local + conta Google) para o mesmo papel; mais superfície de configuração por empresa (allowlist a manter) sem ganho claro agora |
| C. Manter como está, só adicionar `clinic_id` à resolução de papel | Menor mudança de código | Não resolve a inconsistência de Patient/Partner sem senha nem o fail-open de allowlist; incompatível com "autorização 100% pelo sistema" |

## Decisão

**Opção A.** Login OAuth do Google deixa de existir como mecanismo de
autenticação. Toda conta (Super Admin, Admin de Empresa, Atendente,
Profissional, Patient, Partner) autentica com senha própria, definida por:

- **Convite por e-mail** ao ser cadastrada (link com expiração curta para
  definir a senha), ou
- **Reset self-service** por e-mail, mesmo mecanismo do convite.

`GOOGLE_ALLOWED_EMAILS` e a resolução de papel por allowlist
(`src/application/auth/resolve-user-role.ts`) são removidos.
`AUTH_PASSWORD` (senha mestre / bypass de emergência) também desaparece —
Super Admin passa a ser uma conta real como qualquer outra, sem atalho de
"break-glass".

A sincronização com Google Calendar (`google_accounts`, eventos
bidirecionais) **não é afetada** — continua existindo como integração à
parte, conectada por uma conta já autenticada, sem nenhuma relação com login
ou autorização.

Fora de escopo desta decisão: a integração de WhatsApp Business usada pelos
lembretes de agendamento continua como está; não foi cogitada como canal para
convite/reset (ver opções de canal abaixo).

## Consequências

**Positivas**

- Fonte única de verdade para identidade e papel: o banco, por empresa —
  nenhuma configuração de autorização vive em variável de ambiente do deploy.
- Resolve a inconsistência onde Patient e Partner não tinham senha própria.
- Elimina um fail-open perigoso: hoje, uma allowlist mal configurada ou uma
  env var esquecida podia conceder ou negar acesso administrativo de forma
  silenciosa; com o novo modelo, papel é um dado de cadastro comum.

**Negativas / custos aceitos**

- Precisa de um provedor de e-mail transacional novo (ex.: Resend) — hoje o
  projeto não tem nenhum (o único canal de notificação existente é WhatsApp,
  usado só pelos lembretes de paciente, e foi deliberadamente descartado como
  canal de convite/reset).
- Perde-se o login sem senha que o Google oferecia; mitigado pelo fluxo de
  convite (a pessoa nunca digita uma senha "temporária" comunicada por
  terceiros — só a define, uma vez, a partir do link).
- Sem `AUTH_PASSWORD`, não há mais bypass de emergência: se todas as contas
  Super Admin perderem acesso (senha e e-mail comprometidos), a recuperação
  exige intervenção direta no banco, não um caminho de login alternativo.

## Relacionado

- [ADR-001: Multi-tenancy strategy](./001-multi-tenancy.md) — convenção
  "configuração por linha, não por env" que motiva descartar
  `GOOGLE_ALLOWED_EMAILS`.
- [ADR-003: Modelo de papéis multi-empresa](./003-modelo-de-papeis-multi-empresa.md)
  — define os papéis e a hierarquia de cadastro que substituem a resolução de
  papel via Google.
