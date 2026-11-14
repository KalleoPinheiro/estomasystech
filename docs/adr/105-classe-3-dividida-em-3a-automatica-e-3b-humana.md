---
title: "ADR 105 — Classe 3 dividida em 3A automática e 3B humana"
status: living
audience: [dev, ops, agent, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-14
related:
  - docs/engineering/classe-de-risco.md
  - docs/adr/097-fluxo-enxuto-ate-a-producao-com-portoes-deterministicos.md
  - docs/adr/101-veredito-do-the-judge-por-status-da-revisora.md
  - docs/adr/103-orquestracao-compartilhada-entre-llms.md
  - docs/engineering/convivencia-llms.md
---

# ADR 105 — Classe 3 dividida em 3A automática e 3B humana

- **Data:** 2026-11-14
- **Status:** decidido pelo coordenador (PO/arquiteto) sob a autorização do @KalleoPinheiro de 2026-11-08 e 2026-11-09,
  a partir do pedido dele de 2026-11-14 ("como manter qualidade e segurança e velocidade sem depender de mim").
  **Só desenho: nada deste ADR está implementado.** A implementação é a issue
  [#819](https://github.com/KalleoPinheiro/estomasystech/issues/819) (v0.8.0) e só começa depois dos PRs #811 (#769) e
  #816 (ADR-104). Enquanto isso, a classe 3 continua como em [`classe-de-risco.md`](../engineering/classe-de-risco.md):
  todo caminho sensível pede o clique. Mesmo depois de implementado, a 3A só liga com a chave da seção 8, que é do Kalléo.
- **Domínios afetados:** engenharia (portões do PR). Sem `src/`, `drizzle/`, `Dockerfile`, limiar ou teste.
- **Issue:** [#818](https://github.com/KalleoPinheiro/estomasystech/issues/818).

## Contexto

O clique do Kalléo no Environment `aprovacao-classe-3` é o maior gargalo medido do fluxo (até 130 min por run). Hoje
cai nele tudo o que o classificador chama de caminho sensível, sem distinguir risco real:

- PR #814: `biome.json` liga a regra de complexidade cognitiva (endurece o lint).
- PR #817: job novo `compat-migracao` no `gate-pr.yml` (acrescenta um portão).
- PR #816: workflow e `scripts/release/` do ADR-104.

São mudanças que **aumentam** a proteção ou são reversíveis por `git revert` de um squash, e pedem o mesmo clique que
uma mudança em `Dockerfile` de produção ou em cifra de PII. O clique virou rotina, e clique de rotina é o pior
controle: custa horas e o aprovador não lê o diff. O que de fato protege é o conjunto determinístico (classificador por
script, 100% de cobertura no núcleo, mutação, regra 8, the-judge). O ADR fixa o princípio do ADR-097, **humano onde o
erro é irreversível, máquina onde é reversível e verificável**, e o aplica à classe 3.

Fatos conferidos no código da release/v0.7.0 que moldam o desenho:

1. `portao-risco.yml` roda em `pull_request`, não em `pull_request_target`: o YAML vem do merge, então um PR que edita
   o próprio portão pode desligá-lo. O PR #811 já faz o *script* classificar a partir da base, mas deixa o YAML em
   aberto (limite declarado no corpo dele).
2. Migração **aditiva** já é classe 2 hoje (sem clique). Só a não aditiva, o relatório ausente e o erro são classe 3.
3. Todos os agentes usam o mesmo login do GitHub (`KalleoPinheiro`). `autor` e `revisor` do the-judge são declarados,
   não autenticados (ADR-101, ADR-103 § Consequências).
   **Premissa corrigida pelo Kalléo em 2026-11-14:** Claude e Cursor **nunca estão ativos ao mesmo tempo**; a troca só
   acontece quando os créditos de um acabam. Revisão cruzada entre os dois não existe, e o desenho não conta com ela.
   O caso real é a **passagem de bastão** (seção 9), não o paralelismo.
4. O `main` só recebe merge do Kalléo e o deploy é manual (Coolify): os dois pontos irreversíveis já são humanos,
   independentes da classe.

## Opções consideradas

| Opção | Veredito |
| --- | --- |
| Manter tudo como está | Rejeitada: o custo medido é alto e o clique não lê diff. |
| Aprovar toda a classe 3 só com the-judge | Rejeitada: o portão passaria a ser julgado por quem o altera; sem controle independente do autor. |
| Tirar o Environment dos PRs da release e deixar só o `main` | Rejeitada como regra geral: mudança no classificador ou no veredito vale para o resto da release e só seria vista no fim. Aproveitada só para a 3B de produto (seção 4). |
| **Dividir em 3A (máquina) e 3B (humano), com controles verificáveis, clique por release e auditoria** | **Escolhida.** |

## Decisão

### 1. Duas subclasses

**3A: automática, sem clique.** Mudança que pode apertar ou reorganizar o portão, mas não o enfraquece, e que se
reverte com um `git revert`. **3B: humana.** Irreversível, ou toca produção, dado de saúde, identidade ou o próprio
portão. As regras ficam em `CAMINHOS_SENSIVEIS` (`scripts/release/classificar-risco-lib.ts`), com o campo novo
`subclasse` em `classificar-risco/v1`.

| Regra atual | Subclasse | Observação |
| --- | --- | --- |
| `workflow` em `ci.yml`, `gate-pr.yml` e demais workflows de CI que passem nos invariantes do item 2.7 | **3A** | O invariante é estrutural, não por nome de arquivo. |
| `workflow` que declare `environment:`, `secrets.`, `id-token`, `permissions` além de `contents: read`, `pull_request_target`, `workflow_run` ou `self-hosted`; `portao-risco.yml`; `veredito-judge.yml`; deploy, staging, release e backup | **3B-trava** | |
| `portao`: `biome.json`, `vitest*.config.mts`, `stryker.config.json`, `playwright*.config.ts`, `scripts/check-*` e `scripts/release/*` que não sejam do classificador, do veredito ou da publicação, `scripts/gate-cloud*`, `scripts/docker-smoke.sh`, `package.json > scripts` de `check`, `test`, `gate`, `lint`, `build` | **3A**, sujeita aos controles 2.3 e 2.4 | |
| `portao` do **próprio classificador e do veredito**: `classificar-risco*`, `check-migracao*`, `julgar-pr*`, `check-veredito*`; `release:prepare`, `release:cut`, `release:publish`; tabela `CAMINHOS_SENSIVEIS`; `docs/engineering/classe-de-risco.md`; `.github/CODEOWNERS` | **3B-trava** | Quem escreve o portão não o abre sozinho. |
| **Regra 8**: `scripts/gate/`, `.husky/`, `.claude/hooks/`, `.claude/settings.json` | **3B-trava** | **Mais estreita que a lista do pedido** (que punha "config de gate" em 3A): o `check:testes` é o que impede afrouxar teste; mexer nele não pode ser automático. |
| `dados-de-producao` (backup e restauração), `imagem-e-deploy` (`Dockerfile`, `deploy/`) | **3B-trava** | Erro aparece tarde e custa dado ou disponibilidade. |
| `escopo-de-empresa`, `auth`, `cifra`, `auditoria`, `dependencia-sensivel` | **3B-lote** | Seção 4. |
| Migração `aditiva` com `ok: true` | segue classe 2 (já é automática hoje) | Ganha o controle 2.5. |
| Migração `nao_aditiva`, `ok: false`, relatório ausente | **3B-lote** | |
| Redução de limiar (item 2.3) em qualquer arquivo | **3B-trava** | Nunca é 3A. |

Docs de governança em `.md` continuam classe 0 (já sem clique), com a única exceção da tabela acima
(`classe-de-risco.md`, que define a política).

### 2. Controles que substituem o clique na 3A

Todos verificáveis por máquina. **Se qualquer um não puder ser avaliado, o PR cai em 3B-trava.**

1. **Duas reviews the-judge no head SHA**, no formato `the-judge/v1: APPROVE` do ADR-101, ambas de **sessões novas e
   limpas, distintas da sessão que implementou e entre si**. A segunda tem **papel adversarial**: não repete a
   primeira, procura como a mudança **afrouxa o gate** (limiar, exceção, `if`, job removido, caminho excluído) e tenta
   um caso que passe e não devia. Cada review declara `sessao` e `papel` (`revisora` ou `adversarial`); o check
   confere a presença e que `sessao` difere do autor e entre si, sem chamar modelo. **Isto é processo, não
   mecanismo:** as duas são o mesmo agente e o mesmo login, a sessão é declarada e não autenticada. O que segura de
   verdade são os controles mecânicos 2.2 a 2.7, que nenhuma review controla. Review vale por head SHA: push novo
   invalida as duas.
2. **O gate que julga o PR roda a partir da base.** `portao-risco.yml` passa a `pull_request_target` (o YAML e o
   classificador vêm da base; o head é lido só como objeto do git, como o #811 já faz com os scripts). Um PR não
   consegue afrouxar o gate que o avalia: a mudança vale a partir do merge. Complementa o #769. PR de fork nunca roda
   nada do head (o repositório é público): cai em 3B-trava.
3. **Não regressão de limiar, por comparação base × head.** Um script lê os limiares registrados (cobertura por
   camada e global, mutação 85, `maxAllowedComplexity`, `maxLines`, `retries`, `timeout`, timeouts de job, tabela
   `TIMEOUTS`) e a **lista de exceções** (por exemplo `overrides` do `biome.json`, que o PR #814 abre com 56
   arquivos em `warn`). Qualquer redução, aumento de tolerância ou arquivo novo em lista de exceção vira **3B-trava**.
   A lista só pode encolher. Arquivo ilegível vira 3B-trava.
4. **Canário.** `tests/canarios/` guarda casos ruins conhecidos (violação de lint, de tipo e de complexidade, teste
   enfraquecido, migração destrutiva). Um job **roda a partir da base**, aplica a configuração do head a esses casos e
   exige que continuem reprovando. Mudança em gate ou config sem o canário verde vira 3B-trava. Os canários seguem a
   regra 8 (só crescem).
5. **Migração.** Só `aditiva` com `ok: true` e o job `compat-migracao` (#760) verde (o código da base passa sobre o
   esquema novo). Qualquer outra coisa é 3B-lote.
6. **Regra 8 e gates intactos.** `check:testes` verde, `Gate do PR` verde (cobertura 100% no núcleo e piso 90%,
   mutação, E2E, integração). Nada é pulado por causa da classe.
7. **Invariantes de workflow** (para a 3A em YAML), testados contra a base: o conjunto de jobs exigidos pelo agregador
   `Gate do PR` só cresce; nenhum `continue-on-error`, `|| true` ou `paths-ignore` novo; ações continuam fixadas por
   SHA; nenhum `environment`, segredo ou permissão de escrita novos (isso é 3B-trava, tabela da seção 1).

Além dos controles, vale a regra de processo do ADR-103: uma thread por domínio, então não há duas mudanças de gate
em voo ao mesmo tempo.

### 3. Falha fechada

Arquivo de limiar ilegível, relatório ausente, review sem `agente`/`sessao`, canário que não rodou, variável da
seção 8 ausente ou diferente de `true`, PR de fork, base indeterminada: **3B-trava**, isto é, o comportamento de hoje.

### 4. 3B: um clique por release, salvo o que mexe no portão

- **3B-trava** (clique por PR, como hoje): meta-portão (classificador, tabela, veredito, `portao-risco.yml`, CODEOWNERS,
  regra 8), `dados-de-producao`, `imagem-e-deploy`, redução de limiar, qualquer controle da seção 2 não avaliável.
  Razão para não adiar: mudança nessas peças vale para o **resto da release**; adiar o clique deixaria o portão
  alterado julgar os PRs seguintes.
- **3B-lote** (`escopo-de-empresa`, `auth`, `cifra`, `auditoria`, `dependencia-sensivel`, migração não aditiva): o PR
  na `release/**` passa **sem clique**, mas só com os controles 2.1, 2.2, 2.6 e, na migração, 2.5, e fica marcado
  `3B` no resumo. O clique humano acontece **uma vez, no PR `release → main`**, onde o `portao-risco` já exige o
  Environment quando o lote tem 3B. O PR traz o **resumo gerado** do que é 3B naquele lote (arquivo, PR, SHA, motivo,
  linhas alteradas). O Kalléo aprova o lote sabendo o que entra, depois de ver a staging homologada.
- O `main` segue recebendo merge só do Kalléo; deploy e backup seguem dele. Esta decisão não delega nada disso.

Custo aceito: código de auth e de cifra entra na release sem clique por PR e é visto no corte. A staging tem dado
fictício, o deploy é manual, e o PR `release → main` concentra o clique. É a parte mais sensível do desenho; está nos
riscos (seção 7).

### 5. Auditoria posterior no lugar de bloqueio prévio

Um job no PR `release → main` (e `npm run release:auditoria`) gera o resumo da release com **todas as mudanças 3A que
passaram sem clique**: PR, SHA, agente autor, reviews (agente, sessão), controles avaliados e resultado, link, e o
comando de reversão (`git revert <sha>` no squash). Ele **reclassifica cada mudança no SHA do merge com a base daquele
momento** e reprova o PR `release → main` se algum controle não se confirma, até o Kalléo reconhecer. Reversão é
documentada em `classe-de-risco.md` quando a implementação entrar.

### 6. O que não muda

Regra 8 (teste intocável), limiares de cobertura e mutação, 100% nas camadas de núcleo, `main` só por merge commit do
Kalléo, deploy e backup manuais, `VEREDITO_JUDGE_ATIVO`, Environment `aprovacao-classe-3` (continua, para 3B-trava e
para o lote no `main`). Nenhum segredo, flag de clínica real, jurídico (#376) ou dinheiro é tocado.

## 7. Riscos residuais (lista honesta)

1. **Erro correlato de um único modelo.** Autor, revisora e adversária são o mesmo modelo, com o mesmo viés, lendo o
   mesmo texto de issue (uma injeção de prompt nele conduz as três). Sessão limpa e papel adversarial reduzem o viés de
   contexto; **não criam independência**. Nada impede, tecnicamente, que as três errem do mesmo jeito. Compensação, na
   ordem de força: (a) o gate que julga vem da base (2.2); (b) canário e limiar são comparação mecânica que **nenhuma
   review controla** (2.3, 2.4), e o canário é **obrigatório**; (c) o que mais enfraquece o portão (meta, regra 8,
   limiar) é 3B-trava; (d) a **auditoria por release** (seção 5) reclassifica cada 3A no SHA do merge. **Não impede:**
   um enfraquecimento que nenhum canário e nenhum limiar registrado cubram (o desconhecido). Por isso o canário cresce
   a cada falha achada e a lista de limiares é revista a cada release.
2. **Sessão declarada.** `sessao` e `papel` são texto na review, com o mesmo login do Kalléo. Uma sessão mal
   comportada poderia publicar as duas. Aceito porque a defesa real está nos controles mecânicos e na auditoria; um
   login próprio de review não acrescentaria independência de modelo, só identidade, e fica como evolução.
3. **Lacuna do desconhecido nos invariantes de workflow.** A lista do item 2.7 é finita. Novas formas de desligar um
   job exigem novo invariante; até lá, o PR passa.
4. **Auth e cifra entram na release sem clique por PR** (seção 4); o freio é o clique do lote, a staging e o deploy
   manual. O risco é uma regressão sutil de escopo de empresa passar o the-judge e os testes e ser percebida só no
   corte. Cobertura 100% e mutação seguem como defesa principal.
5. **`pull_request_target` em repositório público** exige que nada do head seja executado, que não haja segredo no
   workflow e que PR de fork seja ignorado. Um erro de implementação aqui vira execução de código de terceiro com
   token do repositório. Por isso a própria troca é 3B-trava e leva teste vermelho → verde.
6. **O clique que sai valia pouco como leitura, mas valia como pausa.** A auditoria muda a defesa de "antes" para
   "depois". Reversão por `git revert` cobre o que é código; não desfaz dado já gravado por uma migração (daí a
   migração só ser 3A quando aditiva e compatível).
7. **O token dos agentes.** Se ele tiver permissão de administração do repositório, poderia alterar a variável da
   seção 8 ou o ruleset. Está fora do que este ADR pode garantir: só o Kalléo confere isso nos painéis.
8. **O the-judge é um LLM, não determinístico** (já assim no ADR-097): continua um controle adicional, nunca o único.

## 8. O que só o Kalléo pode fazer para isso valer

Nenhum destes passos é feito por agente. Ordem importa; o primeiro pode ser feito agora, sem risco, e o
passo 3 (ligar) só depois que a #819 mergear.

1. **Chave de segurança, desligada.** GitHub → repositório `estomasystech` → *Settings* → *Secrets and variables* →
   *Actions* → aba *Variables* → *New repository variable*. Nome `CLASSE_3A_AUTOMATICA`, valor `false`. É variável
   do **repositório**, não do Environment (o ADR-103 § 6 explica por que variável só no Environment não é lida). Ela só
   vai a `true` no passo 3.
2. **Environment `aprovacao-classe-3`.** *Settings* → *Environments* → `aprovacao-classe-3`: conferir *Required
   reviewers* = o próprio Kalléo e ligar *Prevent self-review*. Depois que o `portao-risco.yml` virar
   `pull_request_target`, em *Deployment branches and tags* escolher *Selected branches and tags* e acrescentar
   `release/**` e `main` (com `pull_request` a referência era `refs/pull/N/merge` e isso não era possível; confira no
   painel se a opção aparece assim).
3. **Ligar.** Quando a #819 estiver mergeada e o relatório de canário estiver verde na release, mudar
   `CLASSE_3A_AUTOMATICA` para `true`. Para desligar, de volta a `false`: a próxima execução já trata tudo como hoje.
4. **Ruleset.** *Settings* → *Rules* → *Rulesets*: conferir que `release/**` e `main` exigem os checks `portao-risco`,
   `Veredito do the-judge` e `Gate do PR`, e que **só o Kalléo está na lista de bypass**. Verificar também que o token
   que os agentes usam **não tem permissão de administração** (risco 7). O recurso "Require workflows to pass" do
   ruleset, que fecharia o limite do #811 sem `pull_request_target`, só existe para repositórios de organização;
   confirme no painel se a conta pessoal o oferece. Este ADR não depende dele.
5. **Forks.** *Settings* → *Actions* → *General* → *Fork pull request workflows*: marcar *Require approval for all
   outside collaborators*.

## 9. Revezamento entre agentes (passagem de bastão)

Claude e Cursor se alternam quando os créditos de um acabam, **sem aviso e sem despedida**. A memória de cada um é
própria (o Cursor não lê a do Claude), então **todo o estado precisa estar no repositório e no Linear**, nunca na
sessão. Isto reforça, para a 3A, o que o [ADR-103](103-orquestracao-compartilhada-entre-llms.md) e o ADR-104 (#816)
já pedem.

**Regras para quem pode ser interrompido (todo agente, o tempo todo)**

1. Push a cada marco e PR em rascunho aberto cedo, com corpo atualizado (o que falta e por quê).
2. Handoff em `.specs/archive/handoff/<issue>-<slug>.md` atualizado **a cada marco, não só no fim**, com `Next step` e
   `Blockers` (ADR-102).
3. Posse sempre na issue pela label `dono:*` e vaga pela label `em-andamento` (ADR-104). Trailer dos commits identifica o
   agente.

**Passos de quem entra**

1. `git fetch` e `npm run estado` (ADR-104; gera `reports/estado-release.md` com issues por dono, PRs e vagas `n/3`).
   Enquanto o #816 não estiver mergeado, o equivalente manual é listar issues com `dono:*`, `em-andamento` e PRs
   abertos. Ler `convivencia-llms.md`.
2. Separar **o que é do agente que saiu e está parado**: issue com o dono anterior, `em-andamento` e PR sem atividade.
   O ADR-103 já diz que recuperar sem o cedente **depende do Kalléo; não há takeover automático por timeout**. O que
   entra pede ao Kalléo **uma troca em lote** da label `dono:*` (uma linha, com a lista de issues e links), e só então
   assume. As vagas órfãs voltam à contagem.
3. **Nunca dar push na branch do outro agente** (`claude/*` ou `cursor/*`). Trabalho em voo continua em branch nova do
   agente que entra, criada a partir do head da anterior (preserva os commits), com PR novo que cita `Closes #N`; o PR
   antigo recebe um comentário que aponta o novo. O fechamento do antigo segue o `convivencia-llms.md`; se não cobrir,
   pergunta ao Kalléo.
4. Ler o handoff da issue e o corpo do PR; **não confiar em memória, só no repositório**. O que faltar vira
   pergunta no PR, não suposição (regra 5).
5. **Aprovações não passam de mão.** As reviews do the-judge valem por head SHA: qualquer commit do agente que entra
   invalida as do anterior e pede as duas reviews novas (seção 2.1). A 3A não herda aprovação nem exceção do agente
   que saiu.
6. `check:posse` e o trailer garantem que a label e o agente do PR coincidem; sem a troca de label do passo 2, o
   PR do agente que entra reprova.

Nada disso depende de os dois estarem ativos: a passagem é lida do repositório quando o bastão muda de mãos. O que o
revezamento **não resolve** é o risco 1 (um modelo só por vez): o erro correlato se mantém ao trocar de agente, porque
agora são modelos diferentes revisando em momentos diferentes, nunca em paralelo.

## Consequências

**Positivas**

- O clique sai do caminho das mudanças que apertam o portão ou o reorganizam (a maior parte do que hoje espera
  horas), sem perder a trava onde o erro é irreversível ou muda o próprio portão.
- A aprovação humana passa a ser um clique por release com resumo do que é 3B, e uma leitura de um resumo da 3A.
- O portão passa a ser avaliado pela base, o que fecha o limite do #811.

**Negativas / custos aceitos**

- Mais lógica no classificador e no workflow do portão (a #819 é 3B-trava e leva o clique uma vez).
- A 3A não tem revisor independente de modelo: depende dos controles mecânicos, do canário obrigatório e da
  auditoria por release (risco 1). A chave `CLASSE_3A_AUTOMATICA` é do Kalléo e liga só depois da implementação.
- Parte do risco passa de "antes" para "depois" (auditoria e `git revert`).

**Testes, cobertura e LGPD:** este ADR não muda aplicação, limiar, teste, segredo nem dado clínico; 100% no núcleo,
piso 90% e mutação 85 não mudam. A implementação (#819) só acrescenta testes (canários inclusive) e prova vermelho →
verde de que um PR 3A que reduz limiar ou remove o canário cai em 3B-trava.

**O que esta decisão fecha:** nenhuma redução de limiar (cobertura, mutação, complexidade, timeout, `retries`) é 3A;
nenhum PR altera o gate que o avalia; nenhuma mudança no classificador, na tabela 3A/3B, no check de veredito ou na
proteção de branch dispensa o clique.

## Relacionado

- [`classe-de-risco.md`](../engineering/classe-de-risco.md): estado atual da classe 3.
- [ADR-097](097-fluxo-enxuto-ate-a-producao-com-portoes-deterministicos.md): princípio e fases.
- [ADR-101](101-veredito-do-the-judge-por-status-da-revisora.md): review do the-judge e limite de identidade.
- [ADR-103](103-orquestracao-compartilhada-entre-llms.md) e [`convivencia-llms.md`](../engineering/convivencia-llms.md): posse, vagas e portas humanas.
- PRs [#811](https://github.com/KalleoPinheiro/estomasystech/pull/811) (portão pela base, #769), [#816](https://github.com/KalleoPinheiro/estomasystech/pull/816) (ADR-104) e [#817](https://github.com/KalleoPinheiro/estomasystech/pull/817) (`compat-migracao`, #760).
- Issues [#818](https://github.com/KalleoPinheiro/estomasystech/issues/818) (este ADR) e [#819](https://github.com/KalleoPinheiro/estomasystech/issues/819) (implementação).
