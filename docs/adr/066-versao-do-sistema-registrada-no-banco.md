---
title: "ADR 066 — Versão do sistema registrada no banco a cada implantação"
status: frozen
audience: [dev, ops, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-23
related: [docs/adr/039-deploy-manual-no-coolify-sem-down-de-migracao.md, docs/adr/043-versionamento-com-changesets-e-release-por-tag.md, docs/adr/052-fluxo-de-git-com-release-aberta-e-main-so-homologada.md, docs/engineering/producao.md, docs/engineering/homologacao.md]
---

# ADR 066 — Versão do sistema registrada no banco a cada implantação

- **Data:** 2026-10-23
- **Status:** aceito (decisão do orquestrador como Product Owner, mandato de @KalleoPinheiro de 2026-10-21, a partir da sugestão dele na QA da staging: «pegar a versão via API, versionando no banco a cada release»). Complementa o [ADR-043](043-versionamento-com-changesets-e-release-por-tag.md) na parte «versão na tela».
- **Domínios afetados:** release, interface (rodapé), acesso (rota nova)

## Contexto

O rodapé da barra lateral e do portal mostrava `NEXT_PUBLIC_APP_VERSION`, embutida no build a partir do `package.json`. Na staging aparecia `v0.1.0`, embora a release em andamento fosse a `0.2.0`: o `package.json` só sobe no `release:prepare` ([ADR-052](052-fluxo-de-git-com-release-aberta-e-main-so-homologada.md)), **depois** da homologação, então durante toda a homologação o build ainda carrega a versão da release anterior. Além disso, nada ligava o que a clínica via ao que de fato foi implantado: o deploy da produção é manual ([ADR-039](039-deploy-manual-no-coolify-sem-down-de-migracao.md)).

## Decisão

- **Tabela `app_releases`** (migração `0070`, sem `clinic_id`, dado de plataforma como `job_runs`): `id`, `version` (semver, única), `git_sha` (opcional), `released_at` e `notes` (texto curto opcional, até 500 caracteres, nunca dado de paciente).
- **Gravação no boot, idempotente.** O `instrumentation.ts` chama `recordCurrentRelease()` depois do `warmUpDatabase()` (que migra): `INSERT … ON CONFLICT (version) DO NOTHING` com a versão do build e o SHA (`NEXT_PUBLIC_APP_COMMIT`, `SOURCE_COMMIT` do Coolify ou `VERCEL_GIT_COMMIT_SHA`). Repetir o boot não duplica nem muda a data da primeira implantação. Na Vercel (staging e preview) a migração roda no build e a gravação, no primeiro cold start. Sem `DATABASE_URL`, nada acontece. Versão inválida é recusada; falha de gravação vai para o log (`release.record_failed`) e **não** derruba nem bloqueia o deploy. Não usamos o `release:prepare` para gravar: ele roda na máquina de quem faz a release, sem acesso ao banco de cada ambiente.
- **Versão da release em andamento.** O build calcula `NEXT_PUBLIC_RELEASE_VERSION` aplicando o maior nível dos changesets pendentes (`.changeset/*.md`) sobre o `package.json`: é a conta que o `changeset version` fará e que o `release:prepare` confere contra o nome da branch `release/vX.Y.Z`. Na staging com changesets `minor`, `0.1.0` vira `0.2.0`. Depois do `prepare` não há changesets pendentes e vale o `package.json`. `NEXT_PUBLIC_APP_VERSION` segue igual (os testes do ADR-043 continuam valendo) e é a reserva.
- **Leitura.** `CurrentVersionReader` devolve a release gravada mais recente (por `released_at`); sem linha ou com o banco fora do ar, cai para a versão do build. Cache em memória por processo: 5 minutos, ou 30 segundos quando o banco falhou. `GET /api/version` (equipe) e `GET /api/portal/version` (paciente, responsável e parceiro) respondem `{ version, releasedAt }` e, **só com `APP_ENV` `staging` ou `preview`**, `sha`. Exigem sessão, nunca aparecem em login nem em `/api/health`, mandam `Cache-Control: private, max-age=300` e seguem o rate limit de `/api/*`. São duas rotas porque a conformidade das guardas (`route-guard-conformance`) trata toda rota fora de `/api/portal` como exclusiva da equipe; ambas usam o mesmo leitor.
- **Rodapé.** `ReleaseVersion` (sidebar e portal) lê a rota e, enquanto carrega ou se falhar, mostra a versão do build. Staging: versão + SHA curto; produção: só a versão ([ADR-043](043-versionamento-com-changesets-e-release-por-tag.md)).

## Alternativas

- **Gravar no `release:publish`/`release:prepare`:** exige credencial de cada banco na máquina do operador e deixa o deploy manual sem registro se o passo for esquecido. Descartado.
- **Passo extra no build da Vercel:** o teste do plano de build (`planBuild`) fixa os passos, e produção na VPS não passa pelo build da Vercel. O boot cobre os dois.
- **Mostrar só o `package.json` corrigido:** não responde a «o que está implantado» e continua errado durante a homologação.

## Consequências

- **Rollback por backup** restaura a tabela junto: o rodapé volta à versão do backup (esperado). **Rollback por redeploy** do commit anterior roda o código antigo, que não apaga a linha mais nova: o rodapé continua na versão mais recente gravada até alguém remover a linha (`DELETE FROM app_releases WHERE version = '…'`, documentado em `producao.md` § 3.1). Pergunta aberta para o PO: gravar o rollback como evento próprio (implantação, não só release)?
- Migração aditiva (tabela nova): o `--rollback=redeploy` do lote é seguro.
- Várias réplicas com versões diferentes durante um deploy continuam consistentes: cada uma grava a sua linha; vale a mais recente.
- O SHA gravado em produção depende de `SOURCE_COMMIT` existir no container (Coolify); sem ele, `git_sha` fica nulo, e a versão aparece igual.
