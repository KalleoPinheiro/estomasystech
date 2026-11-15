---
title: "Corrigir um subconjunto de issues de auditoria (fim a fim)"
status: living
audience: [agent, dev]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-03
---

# Corrigir um subconjunto de issues de auditoria (fim a fim)

Fluxo padrão quando o pedido é "especifique e corrija só as issues N e M [de
uma fase/lote de auditoria]" — usado nas Fases A–E de
`docs/plano-correcao-achados-auditoria-2026-09.md`. Serve tanto para um lote
inteiro quanto para um subconjunto dele (ex.: só 2 das 4 issues de uma fase).

## Quando usar

O pedido nomeia issues específicas (por número) que vêm de um audit doc
(`docs/audits/*.md`) ou do plano de correção, e pede o ciclo completo:
especificar → implementar → documentar → PR → merge → fechar issue.

## Passo a passo

1. **Ler as issues** (`gh issue view <n>`) e a seção do audit doc/plano que
   cada uma cita — o "Origem" na tabela do plano de correção aponta o
   parágrafo exato.
2. **Especificar com o skill `tlc-spec-driven`** (`/specify`): um
   `.specs/features/<slug>/spec.md` cobrindo só as issues pedidas. Se o
   escopo do audit doc for mais amplo que o da issue (ex.: "várias
   listagens" mas só 2 têm consumidor de UI real), **restrinja e documente a
   decisão no próprio spec.md** — não implemente superfície sem consumidor
   (YAGNI). Não edite o audit doc de origem: `docs/audits/` é snapshot
   congelado (ver `docs/agents/planning.md`); a decisão de escopo mora no
   spec da feature, não lá.
3. **Branch a partir da `main` atualizada**: `git checkout main && git pull
   --ff-only && git status` (árvore limpa) antes de `git checkout -b
   fix/<slug>` — só `git fetch` não atualiza o `HEAD` local nem garante que
   a branch nasça da `main` mais recente.
4. **Implementar** com o `tlc-spec-driven` (`/implement`) — gate local
   (`typecheck`, `lint`, `check:sv`, `test:coverage` ≥ 90%, `test:e2e`) verde
   antes de cada commit. O `tlc-spec-driven` já roda um Verifier independente
   (author ≠ verifier) ao final de `/implement` quando o escopo virou
   `tasks.md` formal — não duplique essa verificação; registre o PASS dele no
   handoff do passo 10.
5. **Um commit semântico por issue** (`fix: <resumo> (#N)`) — ou um commit
   atômico por task se o `tlc-spec-driven` gerou `tasks.md` formal (o
   contrato dele exige isso). Em ambos os casos: cada issue fecha via
   `Closes #N` no corpo do commit/task final que a resolve, ou no squash do
   PR (ver passo 8) — nunca um commit monolítico pro PR inteiro.
6. **Atualizar a documentação viva** antes de abrir o PR:
   - `docs/plano-evolucao-faseado.md` — risque o item de backlog citado e
     marque `**entregue**`, linkando a issue e o spec novo.
   - `docs/domains/<slug>/` — se a mudança altera regra ou funcionalidade
     do domínio (tabela `Regras de negócio`/`Funcionalidades`).
   - `docs/engineering/onboarding.md` (setup, env vars) ou
     `docs/engineering/api.md` (contrato de API) — só se a mudança os afeta;
     `AGENTS.md` só para regra que vale para toda tarefa.
   - **Não** edite `docs/audits/*.md` (frozen) nem a tabela geral de fases em
     `docs/plano-correcao-achados-auditoria-2026-09.md` — precedente das
     Fases A–C é deixar essa tabela como está; o rastro de "feito" vive nas
     issues fechadas + `.specs/archive/handoff/`.
7. **Push + PR**: `git push -u origin <branch>`, `gh pr create --draft` com
   descrição assertiva (o que mudou, por quê, o que ficou fora e por quê,
   plano de teste). PR para `release/**` nasce em rascunho e é marcado pronto
   uma vez, pelo coordenador, depois de confirmar a cota (ADR-093). Em
   rascunho, "Gate do PR" e `ci` ficam vermelhos de propósito. A base do fluxo
   atual é a release aberta (ADR-052), não a `main` do passo 3.
8. **Acompanhar CodeRabbit**: esperar a primeira revisão automática
   (`gh pr view <n> --comments` ou `gh api .../pulls/<n>/comments`), corrigir
   achados reais em commit novo (nunca amend), registrar recusas com
   justificativa se algum apontamento não proceder.
9. **Squash merge**: `gh pr merge <n> --squash`. O corpo do squash deve
   conter `Closes #<issue>` para cada issue resolvida — GitHub fecha sozinho
   ao mergear. Confirme depois (`gh issue view <n>`) que fechou; se alguma
   issue não tinha `Closes` no squash, feche manualmente com
   `gh issue close <n> --comment "..."` linkando o commit/PR.
10. **Registrar o handoff em `.specs/archive/handoff-2026.md`**: uma entrada
    no fim do arquivo (feature, o que mudou, gate final, branch/PR, next
    step), com título terminando em `— ENCERRADO (#<PR>)`. É o rastreador
    de "o que já foi feito", não a tabela do plano de correção. O
    `.specs/STATE.md` guarda só o que está em aberto: não acrescente seção
    `CONCLUÍDA` nele nem no arquivo — `tests/docs/structure.test.ts` recusa
    as duas coisas. Rode `npx vitest run tests/docs` antes do push.
11. **Produção está no ar: merge não é deploy.** Se o lote muda código que roda em produção, diga no
    handoff e no comentário da issue: (a) as migrações novas e se são aditivas; (b) qual rollback vale
    (redeploy do commit anterior ou restauração do backup, [`producao.md`](../engineering/producao.md)
    § 3.1); (c) se há script manual a rodar depois. Quem faz o deploy é o dono, depois do backup do
    banco; a fumaça somente leitura do `producao.md` § 9.6 confirma. Mudança que só toca docs,
    testes ou tipos não pede deploy.
    Além do gate local, a imagem precisa construir: `docker build` (ou o `Dockerfile` no Coolify)
    quando o lote toca `Dockerfile`, `next.config.ts`, `package.json`/lockfile ou o que o build lê.

## O que NÃO fazer

- Não implemente issues fora do pedido, mesmo que estejam na mesma fase do
  plano de correção — só as citadas.
- Não crie paginação/feature nova sem consumidor real só porque um audit doc
  menciona a superfície em geral — restrinja e documente por quê.
- Não edite `docs/audits/*.md` (histórico congelado) nem tente "atualizar a
  auditoria" — o rastro de conclusão vive nas issues, no handoff arquivado e no
  spec da feature.
