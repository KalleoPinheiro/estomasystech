---
title: "ADR 100 — Veredito do the-judge montado e conferido no Actions"
status: frozen
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-08
related:
  - docs/adr/097-fluxo-enxuto-ate-a-producao-com-portoes-deterministicos.md
  - docs/adr/098-e2e-e-mutacao-de-volta-ao-actions-sem-recibo.md
  - docs/engineering/classe-de-risco.md
---

# ADR 100 — Veredito do the-judge montado e conferido no Actions

- **Data:** 2026-11-08
- **Status:** aceito (issue #764, prioridade máxima da v0.7.0; decisão do coordenador por delegação do
  @KalleoPinheiro). O número 099 já era do ADR de homologação sem operador.
- **Domínios afetados:** engenharia (portões do PR, release).

## Contexto

O `check:veredito` (#763) valida o contrato do veredito `the-judge/v1`, mas não estava ligado ao CI e a origem do
veredito não era provada: todas as PRs dos agentes saem com o login do dono, então qualquer sessão consegue
comentar "aprovado" como o dono, e `autor`/`revisor` no JSON são texto declarado. Filtrar comentário por autor
não protege nada. O sinal que um agente não forja precisa vir de algo que ele não alcança: um segredo do
repositório, o clique do dono num Environment, ou um workflow que a PR não consegue trocar.

## Decisão

1. **O veredito nasce dentro do Actions, não de um comentário.** O workflow `veredito-judge.yml` usa
   `pull_request_target` (a versão do workflow e dos scripts é a da **base**; a PR não os troca). O job `julgar` gera o
   diff do head (que entra só como dado, sem `npm ci` nem execução do código dela; lockfile e `.specs/` ficam de
   fora), chama o modelo com o segredo `ANTHROPIC_API_KEY` (`scripts/release/julgar-pr.ts`) e **monta** o JSON:
   `sha` é o head da PR, `autor` é o da PR e `revisor` é `actions/<run_id>/<tentativa>`. O modelo devolve só `achados`
   e `resumo`; qualquer `sha`/`autor`/`revisor` que ele traga é ignorado.
2. **Conferência.** `check:veredito --revisor-esperado` reprova se faltar veredito, se o SHA for outro ou se houver
   achado bloqueante. O workflow não lê comentário algum. A proteção real contra forja não é essa igualdade de
   revisor (o job confere o que ele mesmo gravou) e sim **onde** o veredito é produzido: job da base, com segredo que
   sessão nenhuma alcança.
3. **Fork não chega ao segredo.** O job `julgar` só roda se `head.repo.full_name == github.repository`; o check final
   reprova PR de fork sem chamar a API (o `pull_request_target` entregaria o segredo a um fork). Um teste do
   workflow (`release-veredito-workflow.test.ts`) prova a condição e que só esse job usa `secrets.*`.
4. **Injeção de prompt.** O diff vai entre `<diff-NONCE>` e `</diff-NONCE>` com um UUID por execução, e o diff perde
   qualquer ocorrência do delimitador. Resposta fora do schema, ou `achados` vazio sem `resumo`, reprova.
5. **Piso mecânico.** Diff que toca `.github/workflows/`, `scripts/release/`, `scripts/gate/` ou `drizzle/` exige
   também a aprovação do dono no Environment `aprovacao-classe-3` (job `humana`): o modelo sozinho nunca aprova esses
   caminhos. A lista de arquivos vem de `git diff --name-only -z --no-renames` com `core.quotePath=false`; ler o
   cabeçalho `diff --git` não serve, porque o git cita (com escapes octais) nomes com acento e o caminho escaparia.
6. **Veredito fixo por SHA.** O primeiro veredito gravado para um SHA vai para o cache (`veredito-judge-<sha>`,
   entrada imutável, escopo da base) e um re-run o reaproveita em vez de sortear de novo. Não há `temperature`: o
   Sonnet 5.5 rejeita o parâmetro com HTTP 400, então a estabilidade vem só do cache por SHA. **Falha não é
   julgamento:** erro de API, resposta ilegível ou diff grande demais saem com código 1 e não gravam o arquivo que o
   cache lê; o re-run julga de novo.
7. **PR release→main não chama o modelo.** `conferir-release.ts` lista os commits `main..head`, acha a PR de cada um
   e exige o último check `Veredito do the-judge` do github-actions aprovado no head dela. Só contam PRs já
   mescladas (`merged_at`) e que não miram a `main`: a API devolve também PRs abertas cuja branch contém o commit e a
   própria PR da release, que reprovariam para sempre. Commits anteriores a
   `vars.VEREDITO_JUDGE_DESDE` e merges sem PR (sincronização com a `main`) ficam isentos; sem a data a conferência
   reprova. Assim o limite de tamanho não afeta a release.
8. **Custo.** Modelo padrão `claude-sonnet-5-5` (variável `JUDGE_MODEL` troca). Diff acima de 400 000 caracteres
   reprova com mensagem pedindo para dividir a PR.
9. **Check obrigatório:** `Veredito do the-judge` (`integration_id` 15368). Como `pull_request_target` usa o workflow
   da base, o check só existe depois que o workflow chega à branch alvo: exigir **primeiro** em `release-branches`
   e, na `main`, só depois da v0.7.0 estar nela.
10. **Chave de introdução.** `vars.VEREDITO_JUDGE_ATIVO` (só o dono a altera): fora de `true` o job passa com aviso,
    só para a introdução. Não dá para distinguir "nunca ligada" de "apagada depois"; por isso a chave **sai na
    v0.8.0**, quando o job passa a falhar fechado sempre.

## Alternativas rejeitadas

| Alternativa | Por que não |
| --- | --- |
| Comentário assinado ou filtrado por autor | Todas as sessões comentam com o login do dono; nada distingue o revisor. |
| GitHub App dedicado ao revisor | Seria a opção mais forte (identidade própria), mas exige criar e hospedar um App; fica como evolução se o custo do Actions pesar. |
| Review `APPROVED` de outra conta | A conta e seu token ficariam no mesmo ambiente das sessões de agente. |
| Environment com clique do dono em todo veredito | Seguro, mas tira a autonomia que o ADR-097 quer; vale só para os caminhos protegidos (item 5). |

## Riscos que permanecem

- O modelo é LLM e pode ser induzido pelo conteúdo do diff. A defesa é em camadas: delimitador com nonce, aprovação
  vazia reprovada, piso mecânico (item 5) e o fato de o modelo não ter ferramentas.
- **Bypass do dono (risco aceito até a fase 3 do ADR-097).** Todas as PRs de agentes saem com o login do dono, e o
  dono tem `bypass_mode: always` nos rulesets: se o token usado pelos agentes honrar o bypass, esse portão (e os
  quatro atuais) não barra agente algum. **Não foi testado** (um merge de PR com check vermelho seria irreversível).
  A fase 3 tira o bypass depois de duas releases estáveis.
- Custo por `synchronize`: o `concurrency` cancela o julgamento anterior; o cache evita repetir o mesmo SHA.

## Pendências do dono (fora do repositório)

1. Segredo `ANTHROPIC_API_KEY` (opcional: variável `JUDGE_MODEL`).
2. Variáveis `VEREDITO_JUDGE_ATIVO=true` e `VEREDITO_JUDGE_DESDE=<data ISO da ativação>`.
3. Exigir `Veredito do the-judge` primeiro em `release-branches`; na `main` depois que o workflow estiver nela.
4. Aprovar esta PR no Environment `aprovacao-classe-3` (toca workflow e `scripts/release/`).

## Prova de que o ruleset barra check vermelho

Rulesets lidos pela API em 2026-11-08: `main` (id 20192203) e `release-branches` (id 25510883, `release/**`)
exigem `required_status_checks` com `integration_id: 15368` para "Typecheck, lint, sv-gate, test:coverage, build",
"Integridade dos testes e homologação", "Gate do PR" e "Portão de risco"; nenhum exige review aprovada. Com o check
vermelho o GitHub devolve `mergeable_state: blocked`; a evidência está na PR desta mudança (rascunho, com "Gate do
PR" vermelho por desenho, ADR-093).
