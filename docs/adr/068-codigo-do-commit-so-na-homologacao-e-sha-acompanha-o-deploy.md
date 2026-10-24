---
title: "ADR 068 — Código do commit só na homologação e SHA da release acompanha o deploy"
status: frozen
audience: [dev, ops, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-24
related: [docs/adr/043-versionamento-com-changesets-e-release-por-tag.md, docs/adr/066-versao-do-sistema-registrada-no-banco.md, docs/engineering/homologacao.md]
---

# ADR 068 — Código do commit só na homologação e SHA da release acompanha o deploy

- **Data:** 2026-10-24
- **Status:** aceito (decisão do orquestrador como Product Owner, com a confirmação de @KalleoPinheiro: o código do commit não é necessário, principalmente em produção; na homologação é intencional). Complementa o [ADR-066](066-versao-do-sistema-registrada-no-banco.md).
- **Domínios afetados:** release, interface (rodapé)

## Contexto

Na primeira validação da versão na staging, logo após o rebuild, o rodapé mostrava `v0.2.0 (aaa5023)` quando o commit publicado era `302a61c`. A causa: a gravação do ADR-066 era `INSERT … ON CONFLICT (version) DO NOTHING`. A homologação reconstrói a mesma versão (`0.2.0`) a cada commit da release, então a linha ficava com o SHA do **primeiro** deploy da versão e o rodapé nunca o atualizava.

## Decisão

- **Quem vê o código do commit.** Só a homologação (`APP_ENV` `staging` ou `preview`). Em produção, o rodapé da barra lateral, o do portal, `GET /api/version` e `GET /api/portal/version` mostram só a versão (`v0.2.0`, `{ version, releasedAt }`). Já era assim por `exposesSha()` e pelo build (`NEXT_PUBLIC_APP_COMMIT` só em homologação); esta decisão torna a regra explícita e coberta por teste.
- **`git_sha` fica gravado em `app_releases` também em produção**, mas nunca sai por API nem por tela: é dado de diagnóstico para quem tem acesso ao banco (`psql`), sem nada sensível (SHA de commit de repositório privado, sem conteúdo). Não há motivo para descartá-lo e há ganho ao investigar qual build gravou a versão.
- **SHA acompanha o deploy.** A gravação passa a `ON CONFLICT (version) DO UPDATE SET git_sha = coalesce(excluded.git_sha, app_releases.git_sha)`: um novo deploy da mesma versão atualiza o SHA; um boot sem SHA mantém o já gravado; `released_at` (primeira implantação) e `notes` não mudam.

## Alternativas

- **Remover o SHA da homologação também:** o Kalléo quer o código na staging para saber qual commit está sendo validado. Descartado.
- **Na leitura, preferir o SHA do build ao do banco:** corrige só o rodapé do processo atual e deixa o banco desatualizado. Descartado em favor de corrigir a origem.
- **Uma linha por deploy (versão + SHA únicos):** muda o modelo do ADR-066 e polui a tabela. Descartado.

## Consequências

- Sem migração (a coluna e a constraint já existem). Rollback por redeploy continua como no ADR-066: o SHA da linha reflete o último boot que o informou.
- Em produção, `SOURCE_COMMIT` ausente continua deixando `git_sha` nulo, sem efeito visível.
