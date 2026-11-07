---
title: "Homologação — Vercel, Neon, MSW, faker e fluxo de git"
status: living
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-03
related: [docs/engineering/homologacao-cenarios.md, docs/adr/054-staging-sem-2fa-e-contas-ficticias-por-cenario.md, docs/adr/041-homologacao-na-vercel-e-branch-staging.md, docs/adr/052-fluxo-de-git-com-release-aberta-e-main-so-homologada.md, docs/engineering/producao.md, docs/engineering/onboarding.md]
---

# Homologação

Ambiente público e descartável para ver o lote (release aberta) **antes de entrar na `main`**, só com dados fictícios
([ADR-041](../adr/041-homologacao-na-vercel-e-branch-staging.md)). Produção continua na VPS
([`producao.md`](producao.md)).

## 1. Fluxo de git

Decidido no [ADR-052](../adr/052-fluxo-de-git-com-release-aberta-e-main-so-homologada.md): a `main` só
recebe lote já homologado.

```
main  ───────────●─────────────────────────●(merge commit)──▶ só releases e hotfixes; tag vX.Y.Z aqui
                  \                       ↗
release/v0.3.0     ●──●(feat a)──●(feat b)──●(versão + CHANGELOG)     uma aberta por vez
                      ↑ squash    ↑ squash
feat/a ───────────────┘           │
feat/b ───────────────────────────┘
staging ═══ = release aberta (ou = main, sem release) ═══▶   descartável; ninguém commita aqui
```

| Regra | Como |
| --- | --- |
| Abrir a release | `git switch -c release/vX.Y.Z origin/main && git push -u origin release/vX.Y.Z`; o nome promete a versão |
| Toda feature nasce da release aberta | `git fetch origin && git switch -c feat/x origin/release/vX.Y.Z` |
| O PR da feature vai contra a **release**, em squash | Nasce em **rascunho** e é marcado pronto uma vez (ADR-093). Em rascunho, "Gate do PR" e `ci` ficam vermelhos de propósito. Sem recibo do gate. Corpo traz `## Homologação`: `Seed:` e cenários Dado/Quando/Então (ou `n/a — <motivo>`); o CI reprova sem eles |
| Antes de abrir o PR da feature | `npm run test:changed -- origin/release/vX.Y.Z`; `check:testes`, `check:changeset` e a mutação do `gate:local` já comparam com a release aberta de que a branch saiu (ADR-058; `GATE_BASE` força outra base) |
| Só a `staging` vira deploy | a Vercel **não** constrói prévia de `feat/*`, `release/*` nem de branch de agente (`git.deploymentEnabled` no `vercel.json`, [ADR-061](../adr/061-vercel-constroi-so-a-staging.md)); para ver uma feature, reconstrua a staging |
| `main` mudou (hotfix) | `npm run release:sync` **mergeia** a `main` na release aberta (nunca rebase); conflito aborta e avisa: resolva na release |
| Testar o lote na staging | `npm run staging:rebuild -- --release --push` (staging = release aberta; branches extras opcionais no fim da linha). O script já passa `--deploy` e empurra sempre para `origin HEAD:staging`; veja a nota abaixo |
| `staging` é reconstruída, não consertada | conflito ou migração colidente: reconstrua; nunca resolva em `staging` |
| Staging aprovada | quem validou cria ou move a marca `homologacao/vX.Y.Z` para o SHA aprovado (`git push --force origin <sha>:refs/heads/homologacao/vX.Y.Z`) ([ADR-071](../adr/071-corte-de-release-em-comando-unico.md)) |
| Cortar a release | `npm run release:cut -- --rollback=redeploy\|backup` **na release**, no WSL: confere a marca e o TESTE-ALTERADO do lote, roda o `release:prepare` primeiro, o gate da release uma vez em worktree limpo (sem mutação; Docker e backup obrigatórios) e abre o PR `release → main` com o recibo. Nada entra na release depois disso; se o gate falhar por ambiente, rode o mesmo comando de novo (não versiona outra vez) |
| Cortar pelo Actions | workflow **Release cut**, disparado da `main` (único caminho) com o input obrigatório `branch=release/vX.Y.Z`; outra ref ou branch fora do padrão falha logo no primeiro step ([ADR-092](../adr/092-emenda-088-disparo-do-corte-e-selo-sem-furos.md)). Rode antes com `dry_run` marcado: só o pré-voo (`npm run release:preflight`: token, identidade git, rollback, pré-condições, versão que os changesets calculam numa cópia descartável contra o nome da release e permissão), em ~1 min e sem escrever nada. O corte real roda a integração Postgres completa antes do `release:prepare` e grava o selo `release-cut/gate` no SHA final ([ADR-088](../adr/088-prova-unica-do-corte-e-pre-voo-do-release-cut.md)). O workflow instala o npm de `packageManager` e o `release:prepare` (e o pré-voo) recusa npm diferente e lockfile que perca dependências opcionais; no WSL rode `npm i -g npm@<versão>` antes ([ADR-091](../adr/091-npm-fixado-e-lockfile-protegido-no-corte.md)) |
| Entrar na `main` | o PR aberto pelo `release:cut`; merge **commit** (nunca squash nem rebase). Com o selo no head e a mesma árvore, o `ci` e o Docker do PR (e do push na `main` depois do merge) passam sem repetir a prova pesada; sem selo ou com árvore diferente, rodam inteiros |
| Depois do merge | `npm run release:publish -- --rollback=...` (tag no commit de merge, Release publicada); deploy da tag em `producao.md` § 3.1. A `staging` volta a ser = `main` |
| Hotfix | `hotfix/*` nasce da `main`, PR direto na `main` (recibo), `release:prepare`/`release:publish --hotfix`; o `release:sync` leva a correção para a release aberta |

Numeração de migração colidente entre features da release: quem mergeia primeiro mantém o número; a
outra renumera antes do merge. Reconstruir a `staging` expõe a colisão cedo.

Ao reconstruir com um conjunto de migrações diferente, **reinicie o branch de banco `staging`** no
Neon (*Reset from parent*, ou apague e crie de novo). O build migra e semeia sozinho.

**Por que o rebuild cria um commit vazio e fixa o destino do push.** A Vercel só cria deploy de
Production para um SHA que ainda não construiu; se a `staging` ficar igual ao SHA da release (já
construído como prévia), nada é implantado. Com `--deploy` (padrão do `npm run staging:rebuild`),
quando algum ref remoto já aponta para o SHA final o script acrescenta o commit vazio
`chore(staging): dispara deploy de homologação`. A `staging` local é criada com `--no-track` e o
push é sempre `git push --force-with-lease --set-upstream origin HEAD:staging`, então o upstream
fica em `origin/staging` e um `git push` simples nunca vai para a release. Chamando
`scripts/staging/rebuild.sh` direto, sem `--deploy`, a staging continua igual à base.

Os scripts rodam no seu computador (`rebuild.sh`, `sync-main.sh`, sem `gh` nem Actions). O
`staging.yml` reconstrói a staging a cada push na `main` (e por `workflow_dispatch`). Desde o ADR-088 ele
**não** empurra a `main` na release (o ruleset `release/**` recusava o push, GH013): o merge da `main` na
release é de quem tem bypass, por `npm run release:sync`, e o `release:cut` exige a `main` dentro da release. O
commit de deploy sai com a identidade do dono do repositório (a Vercel bloqueia autor fora do time) e o smoke
usa o segredo opcional `VERCEL_AUTOMATION_BYPASS_SECRET`: com o SSO da Vercel ativo, sem ele o health não é
verificado (aviso no log).

**Prévia de PR não existe mais (ADR-061).** O `vercel.json` desliga o deploy automático de toda branch
(`"**": false`) exceto `staging`. O `vercel.json` vale a partir do commit empurrado: branch antiga, criada
antes desta regra, só obedece depois de trazer a release. Efeitos: o check "Vercel" some dos PRs (nada o exige
como obrigatório; se o ruleset exigir, tire-o da lista) e a integração Neon deixa de criar branch de banco por
push. Se aparecer "Resource provisioning failed" / "Branch limit reached" num deploy, apague os branches de
preview antigos no Neon (painel § 5) e confira que a integração não está criando branch por preview.

## 2. Ambientes

| | Produção | Staging | Preview (por PR) | Dev local |
| --- | --- | --- | --- | --- |
| Onde | VPS + Coolify | Vercel (branch `staging`) | Vercel (branch do PR) | `npm run dev` |
| `APP_ENV` | `production` (ou ausente com `NODE_ENV=production`) | `staging` | `preview` | `development` |
| Banco | Postgres 18 privado | Neon branch `staging` | Neon branch por preview (desligado por padrão, ADR-061) | docker compose (`npm run ambiente:local`, [ADR-044](../adr/044-ambiente-local-completo-e-integracao-em-postgres-real.md)) |
| Dados | reais | fictícios (seed) | fictícios (seed) | seed opcional |
| Integrações | reais | MSW (`MOCK_INTEGRATIONS=true`) | MSW | opcional |
| Faixa de aviso e `noindex` | não | sim | sim | não |
| Deploy | manual | push na `staging` (= release aberta) | push no PR | — |

### Versão exibida na homologação (ADR-066)

O rodapé da barra lateral e do portal mostra `v<versão> (<sha curto>)`. A versão é a **da release em andamento**
(o `package.json` mais os changesets pendentes: `0.2.0` enquanto a `release/v0.2.0` está aberta), e não a
do `package.json`, que só sobe no `release:prepare`. Ela vem de `GET /api/version` (equipe) e
`GET /api/portal/version` (portal): `{ version, releasedAt }` e, só em `staging` e `preview`, `sha`.
Exigem sessão, têm cache de 5 minutos e, se o banco falhar, o rodapé usa a versão do build. A linha em
`app_releases` é gravada no primeiro cold start depois do deploy. Para conferir à mão:
`curl -b "estomasystech_session=…" $URL/api/version`.

## 3. Variáveis na Vercel

Todas só para `Preview` e `Production` do projeto de homologação (nunca valores de produção).

| Nome | Valor |
| --- | --- |
| `APP_ENV` | `staging` em Production; `preview` em Preview |
| `DATABASE_URL`, `DATABASE_URL_UNPOOLED` | injetadas pela integração Neon (pooler no app, direta na migração) |
| `ESTOMASYSTECH_MIGRATE_ON_BOOT` | `false` |
| `PG_POOL_MAX` | `5` |
| `PRODUCTION_DB_HOSTS` | host do banco de produção (trava de segurança) |
| `AUTH_SECRET`, `DATA_ENCRYPTION_KEY`, `CRON_SECRET` | valores novos, diferentes dos de produção |
| `STAGING_SEED_PASSWORD` | senha (≥ 10 caracteres) das contas fictícias |
| `MOCK_INTEGRATIONS` | `true` |
| `STAGING_DISABLE_MFA` | `true` só em Production (a staging); nunca em Preview. Dispensa o 2FA no login por e-mail e senha ([ADR-054](../adr/054-staging-sem-2fa-e-contas-ficticias-por-cenario.md)); com `APP_ENV` diferente de `staging` o app recusa subir |
| `APP_URL` | URL pública do ambiente. Se faltar na Vercel, o convite usa `https://$VERCEL_PROJECT_PRODUCTION_URL` (#467); em outro ambiente de produção, sem `APP_URL` o convite é recusado |
| `TRUSTED_PROXY_HOPS` | `1` (a Vercel acrescenta o IP real ao fim do `x-forwarded-for`; confira no primeiro deploy) |
| `PHOTO_STORAGE`, `S3_*` | bucket R2 só de homologação (obrigatório: a Vercel não tem disco) |
| `RESEND_API_KEY`, `EMAIL_FROM`, `GLITCHTIP_DSN` | **não definir** |

## 4. Contas fictícias do seed

Senha de todas: `STAGING_SEED_PASSWORD`. Se a variável mudar, o próximo deploy reaplica a nova senha às contas. O seed é aditivo: em banco já semeado cria só o que falta (conta, clínica vizinha, parceiro) e não apaga nem duplica. Com `STAGING_DISABLE_MFA=true` (ADR-054) ninguém cadastra nem digita segundo fator; sem a variável, o fator é cadastrado no primeiro login (QR no app). Conta nova de um PR aparece no próximo deploy, sem reiniciar o branch de banco.

| E-mail | Papel / clínica | Para testar |
| --- | --- | --- |
| `super@homologacao.invalid` | `super_admin` | plataforma, clínicas, suspensão, taxonomia; 403 em rota de clínica |
| `admin@homologacao.invalid` | `company_admin` · principal | tudo da clínica principal |
| `admin2@homologacao.invalid` | `company_admin` · principal | segundo admin: desativar um sem cair no último admin |
| `atendente@homologacao.invalid` | `atendente` · principal | agenda e cadastro, sem dado clínico, 403 em financeiro/estoque/grade |
| `profissional@homologacao.invalid` | `profissional` · principal | evolução e prontuário só de paciente com vínculo (Ana) |
| `profissional2@homologacao.invalid` | `profissional` · principal | outro vínculo e outra comissão (Bruno) |
| `inativo@homologacao.invalid` | `atendente` · principal, **inativa** | **erro**: login recusado |
| `admin-suspensa@homologacao.invalid` | `company_admin` · suspensa | **erro**: clínica suspensa, login negado (403) |
| `admin-vizinha@homologacao.invalid` | `company_admin` · vizinha | isolamento entre empresas; admin único (409 ao desativar); clínica sem CNPJ (recibo bloqueado) |
| `paciente@homologacao.invalid` | `patient` | portal com termo de tratamento e de imagem aceitos: agendar, remarcar, foto |
| `paciente-novo@homologacao.invalid` | `patient` | portal sem nenhum termo: fluxo de aceite, foto bloqueada |
| `responsavel@homologacao.invalid` | `guardian` | portal em nome de menor de idade |
| `parceiro@homologacao.invalid` | `partner` | portal do parceiro |

Os casos de validação que cada conta exercita estão em [`homologacao-cenarios.md`](homologacao-cenarios.md).

Massa (`npm run seed:staging`, idempotente; `scripts/seed/`): 3 clínicas (principal, suspensa, vizinha com 3 pacientes), 40 pacientes (sem e-mail, sem CPF,
menor com responsável), 2 profissionais, 6 procedimentos, agenda de 7 semanas com realizadas,
cancelamento tardio e falta, faturas pagas e vencidas, avaliações seriadas (ferida melhorando e
piorando) e estoque com lote vencido, estoque baixo e estoque zerado. Cenários de integração com
erro: destinatário `erro@homologacao.invalid` (e-mail 500) e chave S3 com `__erro__` (403).

Cenários do roteiro com dado específico (`scripts/seed/cenarios.ts`, #477), aditivos e idempotentes (rodam também em banco já semeado): pausa de almoço 12:00–13:00 na grade da principal; repasse percentual (40%) da Ana; kits de *Curativo simples* e *Troca de bolsa de estomia*; responsável técnico da principal (documentos clínicos liberados); consulta concluída e fatura paga na vizinha (recibo bloqueado por CNPJ); histórico de `paciente@` (consulta daqui a ~2 h, outra daqui a ~10 dias, uma concluída com fatura pendente, condição com 3 avaliações e retorno pendente, uma vez por banco); a parceira indica 2 pacientes e um deles já aceitou compartilhar. Já a vizinha nasce escura e âmbar (#476). Em banco novo a massa pesada também traz anamnese com alergia e uma evolução SOAP por paciente com condição, avaliações semanais com curvas diferentes, fatura emitida na data da consulta (pagamento nunca antes da emissão) e quadro de criança sem pé diabético; em banco antigo isso só vem reiniciando o branch (§ 1).

Toda feature nova acrescenta seus cenários (sucesso **e** erro) em `scripts/seed/seed.ts` no mesmo PR.
O seed é aditivo (ADR-059): contas, clínicas, profissionais, parceiro, pacientes da vizinha e o vínculo de cada profissional com os pacientes da própria agenda (PRO-RN-08, #465) que faltam são criados em banco já semeado,
sem apagar nem duplicar. Massa pesada (pacientes, agenda, faturas, avaliações, estoque) só nasce em banco novo: para ela, reinicie o branch de banco (§ 1).

## 5. Passo a passo no painel (uma vez, por Kalléo)

1. **Vercel**: *Add New Project* → importar `KalleoPinheiro/estomasystech`, plano Hobby. *Production
   Branch* = `staging` (Settings → Git). *Build Command* já vem do `vercel.json`.
2. **Neon**: criar o projeto (região São Paulo), ativar `pg_trgm` e `btree_gist` (as migrações
   fazem `CREATE EXTENSION`). Criar o branch `staging`.
3. **Integração Neon–Vercel** (Marketplace): ligar ao projeto para injetar `DATABASE_URL` e
   `DATABASE_URL_UNPOOLED`. **Deixe desligado** *Create a branch for every preview deployment* (o plano
   grátis do Neon tem limite de branches e só a `staging` é construída, ADR-061).
4. **Variáveis** da seção 3; gerar `AUTH_SECRET`, `DATA_ENCRYPTION_KEY` e `CRON_SECRET` novos.
5. **Vercel Authentication** nos previews (Settings → Deployment Protection → Standard).
6. **GitHub**: criar o branch `staging` (`git push origin origin/main:refs/heads/staging`) e proteger
   (sem push direto de humanos, force-push só do rebuild). Para o fluxo do ADR-052: *Allow merge
   commits* em Settings → General e um ruleset em `release/**` (PR obrigatório, CI rápido exigido,
   force push bloqueado, bypass para quem roda `release:sync`).
7. Reconstruir a staging (§ 1), conferir o deploy de Production e entrar com `admin@homologacao.invalid`.

## 6. Limites e cuidados

- A URL de `staging` é pública de propósito (sem Vercel Authentication, que só protege previews). Quem
  entra precisa de senha e do segundo fator; o rate limit é o do app (120/min por IP em `/api/*`).
- Vercel Hobby é uso não comercial e o cron é diário; os crons do `vercel.json` só rodam no deploy
  de Production (a branch `staging`).
- Sem foto persistente se `PHOTO_STORAGE` não apontar para o bucket de homologação.
- Dado real em homologação é incidente de LGPD: não cadastre pessoas reais; a faixa de aviso e a
  trava `PRODUCTION_DB_HOSTS` existem para isso.

## 7. Validação logada após cada rebuild da staging (#668)

Depois de cada rebuild da staging, uma thread **nova, em contexto limpo**, roda a validação logada. Ela **não corrige
código**: cada falha vira issue com evidência, a correção vai para outra thread e uma nova rodada confere só o que
reprovou. Cobre o que o build local não mostra: cabeçalhos da Vercel, variáveis ausentes (`GOOGLE_*`), SSO e CSP no
edge (como na #658).

**O que roda:** `scripts/staging/validacao-logada.mjs` (Playwright, fora do Actions, ADR-042). Entra com Admin,
Atendente e Profissional (§ 4, login real por e-mail e senha), percorre o menu de cada papel (mais `/configuracoes/*` e
`/auditoria` no Admin) em **360, 390, 768 e 1280** e, em cada tela, exige: status < 400 sem redirecionamento
inesperado; `console.error`/`console.warn` e `pageerror` = 0 (#543); violação de CSP = 0; nenhuma resposta 4xx/5xx de
`/api/*`; sem rolagem horizontal. Grava uma captura por tela e `resultados.json`; sai com código 1 se houver achado.

```bash
BASE_URL=https://estomasystech.vercel.app \
STAGING_SEED_PASSWORD=<senha do seed> \
VERCEL_AUTOMATION_BYPASS_SECRET=<segredo> \
PAUSE_MS=2000 OUT_DIR=/mnt/project-files/<release>/qa-<issue> \
node scripts/staging/validacao-logada.mjs
```

- **Bypass do SSO:** com a proteção da Vercel ativa, `VERCEL_AUTOMATION_BYPASS_SECRET` (o mesmo segredo do smoke, § 1)
  vai no cabeçalho `x-vercel-protection-bypass` e a Vercel devolve um cookie para as navegações seguintes. Sem o
  segredo e com SSO, o script cai na página de login da Vercel e reprova. Nunca cole o segredo em issue ou captura.
- **Limitador de taxa:** o app limita `/api/*` a 120/min por IP (§ 6). Contra a staging, use `PAUSE_MS=2000`; sem pausa a
  rodada gera 429 do próprio limitador, que não é defeito. Contra build local, suba o servidor com
  `API_RATE_LIMIT_MAX=100000` e `ACTION_RATE_LIMIT_MAX=100000` (como faz o E2E).
- **Local (sem a Vercel):** `npm run build` e `next start` sobre Postgres com `npm run seed:staging` e
  `APP_ENV=staging`, `STAGING_DISABLE_MFA=true`; `BASE_URL` aponta para a porta local. Serve de ensaio, não substitui
  a rodada na staging real.
- **Navegador:** `CHROME=<caminho do Chromium>` quando o Playwright não achar o dele.
- **Evidência:** anexe `resultados.json` e as capturas em `/mnt/project-files/` e comente o resultado na issue da
  release. Rodada local da v0.5.0 (efc714d): 144 páginas, 0 achados.

