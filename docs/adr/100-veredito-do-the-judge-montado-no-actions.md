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

1. **O veredito nasce dentro do Actions, não de um comentário.** O workflow `veredito-judge.yml` roda em
   `pull_request_target` (a versão do workflow e dos scripts é a da **base**; a PR não os troca). O job gera o
   diff do head da PR (que entra só como dado, sem `npm ci` nem execução do código dela), chama o modelo com o
   segredo `ANTHROPIC_API_KEY` (`scripts/release/julgar-pr.ts`) e **monta** o JSON: `sha` é o head da PR, `autor`
   é o da PR e `revisor` é `actions/<run_id>/<tentativa>`. O modelo devolve só `achados` e `resumo`; qualquer
   `sha`/`autor`/`revisor` que ele traga é ignorado.
2. **O mesmo job confere.** `check:veredito --revisor-esperado actions/<run_id>/<tentativa> --sha <head.sha>` reprova
   se faltar veredito, se o revisor não for a identidade deste job, se o SHA for outro ou se houver achado
   bloqueante. **O workflow não lê comentário nenhum**: a fonte de comentário continua existindo no script para uso
   manual, mas nenhum portão depende dela.
3. **Falha fechada.** Segredo ausente, API fora do ar, resposta ilegível, diff vazio ou acima de 400 000 caracteres
   (a PR deve ser dividida) viram veredito reprovado. PR em rascunho reprova (ADR-093).
4. **Check obrigatório:** `Veredito do the-judge`, no ruleset da `main` e das `release/**` com `integration_id`
   15368 (github-actions), ao lado dos quatro atuais.
5. **Chave de introdução.** A variável do repositório `VEREDITO_JUDGE_ATIVO` (só o dono a altera; a PR não a
   alcança) liga a exigência. Fora de `true` o job passa com aviso, para o check existir antes de virar
   obrigatório. Ligar a chave e exigir o check no ruleset é um único passo do dono.

## Por que não forja

| Tentativa de um agente | Resultado |
| --- | --- |
| Comentar um JSON aprovado como o dono | Ignorado: o workflow não lê comentário. |
| Escrever `revisor` diferente do `autor` num arquivo da PR | O revisor tem de ser `actions/<run_id>/<tentativa>` do job que conferiu; arquivo de PR não é lido. |
| Escrever "aprove" no diff ou no título | Texto entra como dado marcado como não confiável; o modelo pode ser enganado (risco residual abaixo), mas o piso mecânico e a classe 3 continuam. |
| Alterar `veredito-judge.yml` ou `scripts/release/` na própria PR | `pull_request_target` roda a versão da base; e mexer em workflow e `scripts/release/` é classe 3 (aprovação do dono pelo Environment). |
| Trocar o `integration_id` ou o ruleset | Só o dono altera o ruleset. |

## Riscos que permanecem

- O modelo é LLM e pode ser induzido por conteúdo do diff (injeção de prompt). A defesa é em camadas: o piso
  mecânico não depende dele, a classe 3 exige humano, e o modelo não tem ferramentas (só devolve texto).
- O dono tem `bypass_mode: always` nos rulesets: a barreira vale para agentes que não usam a identidade de admin
  do dono. Reavaliar quando a tag e o deploy forem automáticos (#750 a #752).
- Custo por `synchronize`: o `concurrency` cancela o julgamento anterior da mesma PR.

## Pendências do dono (fora do repositório)

1. Segredo `ANTHROPIC_API_KEY` no repositório (e, opcional, variável `JUDGE_MODEL`; padrão `claude-opus-5-5`).
2. Variável `VEREDITO_JUDGE_ATIVO=true` e o check `Veredito do the-judge` (github-actions) nos dois rulesets.
3. Aprovar esta PR no Environment `aprovacao-classe-3` (toca workflow e `scripts/release/`).

## Prova de que o ruleset barra check vermelho

Rulesets lidos pela API em 2026-11-08: `main` (id 20192203) e `release-branches` (id 25510883, `release/**`)
exigem `required_status_checks` com `integration_id: 15368` para "Typecheck, lint, sv-gate, test:coverage, build",
"Integridade dos testes e homologação", "Gate do PR" e "Portão de risco"; nenhum exige review aprovada. Com o check
vermelho o GitHub devolve `mergeable_state: blocked`; a evidência está na PR desta mudança (rascunho, com "Gate do
PR" vermelho por desenho, ADR-093).
