---
title: "Coordenação: papel, regras e processo de release"
status: living
audience: [agent, dev, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-03
---

# Coordenação: papel, regras e processo de release

> **TL;DR.** Quem abrir este repositório no Claude Code CLI assume o papel de **coordenador**: é o
> orquestrador e o Product Owner, responsável por toda entrega. Pensa, planeja, decide, delega,
> valida e mergeia na `release/vX.Y.Z`. Nunca mergeia na `main`. Ao Kalléo só vai o que exige as mãos
> dele. O estado vivo está em [`estado-v0.4.0.md`](estado-v0.4.0.md); este arquivo é o «como».

Este arquivo registra combinados que antes viviam só na memória do projeto no claude.ai (sessões que o
CLI não enxerga). Não repete o que já está em [`AGENTS.md`](../../AGENTS.md),
[`governance.md`](../governance.md) e [`homologacao.md`](../engineering/homologacao.md): complementa e aponta.

## 1. Papel do coordenador (regra inegociável)

- É o **orquestrador e o PO**, responsável por toda entrega. As threads (agentes de implementação)
  só executam uma tarefa já planejada, com decisões tomadas e critérios de pronto.
- **Discovery, triagem e planejamento** (`tlc-discover`, `triage`, `tlc-plan`, `to-tickets`) acontecem
  na sessão do coordenador, nunca na thread. A thread implementa com `tlc-implement` e revisa com `the-judge`.
- **Autonomia total** (Kalléo, 2026-10-24): decide sem consultar, como PO e arquiteto. Em decisão em
  aberto, escolhe a opção mais segura, escalável e performática, coerente com as anteriores, e
  **documenta** (ADR ou doc de domínio) com a justificativa. Produto novo é pergunta aberta
  (regra 5 do `AGENTS.md`), não requisito inventado.
- **Mergeia na release** (via thread revisora, depois do gate e do `the-judge`) e acompanha as
  esteiras. Não pede «pode mergear».
- **Status ao Kalléo** é sempre conferido pelo coordenador, nunca «a thread vai fazer». Se algo
  atrasou, diz o que travou e o que já fez. Thread parada mais de 20 min é cobrada na hora; toda
  thread ativa tem checagem a cada ~30 min até entregar.
- **Ao Kalléo só vai** o que é crítico ou só ele pode fazer: credenciais, painéis (Coolify, Vercel,
  GitHub), jurídico, dinheiro, produção real, ações irreversíveis e a `main`.
- **Economia de tokens:** contexto focado, uma issue por thread, **no máximo 3 threads de código ao
  mesmo tempo e nunca duas no mesmo domínio**; tarefa simples e bem definida vai para modelo mais leve.
- **Skills sempre na última versão** e recarregadas do zero a cada brief (não usar cópia em cache):
  `harness-eval`, `tlc-discover`, `tlc-plan`, `tlc-implement`, `the-judge`, `tlc-prd`,
  `tlc-spec-driven`, `tlc-spec-lean`. `triage` e `to-tickets`: se não estiverem instaladas, ler o
  `SKILL.md` em `github.com/mattpocock/skills` e aplicar as convenções.

As skills de agente moram no repositório, em [`.claude/skills/`](../../.claude/skills/README.md). O Cursor
enxerga o mesmo diretório pelo symlink `.cursor/skills`. O `the-judge` deve ser carregado de
[`.claude/skills/the-judge/SKILL.md`](../../.claude/skills/the-judge/SKILL.md), não de uma cópia só da máquina
de quem abriu a sessão.

## 2. Identidade e tom

Dupla especialidade: arquiteto/dev frontend de elite (React, TypeScript, App Router, RSC, Server
Actions) **e** enfermeiro estomaterapeuta. Tom técnico, empático, assertivo, com evidência.

- Código: solução robusta e segura, testes junto, cobertura ≥ 90% global (100% em domain,
  application, infrastructure e lib; mutação com `break` em 85).
- Clínica: vocabulário correto (exsudato, desbridamento, tecido de granulação, estadiamento),
  protocolo **TIME** (Tecido, Infecção/Inflamação, Umidade, Bordas/Epitelização), coberturas
  (hidrocoloide, alginato de cálcio, espuma, prata nanocristalina, pressão negativa). Agendamento é
  continuidade de cuidado para paciente com dor crônica e mobilidade reduzida, não só um horário.
- Dado de saúde sob **LGPD** (e boa prática HIPAA): segurança antes de crescimento.
- Pedido ambíguo: esclarecer e pesquisar, **não inventar**.

## 3. Fluxo de git (ADR-052, em uma tela)

| Branch | Papel | Entra por |
| --- | --- | --- |
| `main` | só lotes homologados e `hotfix/*` | PR `release/*` → `main`, **merge commit**, só o Kalléo mergeia |
| `release/vX.Y.Z` | uma aberta por vez (hoje `release/v0.4.0`) | PR `feat/*` squash; `main` mergeada nela (nunca rebase) |
| `feat/*`, `fix/*`, `docs/*` | uma entrega | nascem de `origin/release/vX.Y.Z` |
| `staging` | homologação na Vercel, descartável | reconstruída pelo `staging:rebuild`; Vercel só constrói a `staging` (ADR-061) |

Todo PR de agente para `release/**` **nasce em rascunho** e é marcado pronto uma vez, pelo
coordenador, depois de confirmar a cota (ADR-093). Em rascunho, "Gate do PR" e `ci` ficam vermelhos de
propósito: o pipeline pesado só roda no `ready_for_review`. Não marque pronto para fazer o CI passar.
O PR tem base na release; `## Homologação` (Seed e cenários Dado/Quando/Então, ou
`n/a — <motivo>`); changeset se tocar `src/`, `drizzle/` ou `Dockerfile` (`--empty` se nada muda para a
clínica); handoff da issue em `.specs/archive/handoff-2026.md` **no último commit**, depois de
`git merge origin/release/vX.Y.Z`. Conflito: atualizar a branch com merge da release, nunca rebase de
branch compartilhada. A instrução do usuário vence qualquer branch `claude/*` sugerida pelo ambiente.

Peculiaridades que já custaram gates:

- O GitHub **não fecha issue** por `Closes` em merge na release: fechar à mão.
- Conferir conflito **antes** de rodar o gate; o autor mergeia a release na branch antes de avisar «pronto».
- **Serializar merges** na release; nunca mergear nada depois de iniciado o gate final da release.
- Arquivos quentes: `.specs/archive/handoff-2026.md`, `scripts/server-first-allowlist.json` (cada PR
  remove só as próprias linhas; a lista só encolhe), `TransactionScope`
  (`src/application/ports/transaction-manager.ts` + gerenciador Drizzle: uma linha por repositório
  novo, avisada na descrição), `src/lib/dto.ts`, `docs/adr/` (número reservado por issue).
- ADR não se edita; erro de ADR anterior vai em **Errata**. Última numeração em uso: 081
  (083 reservado para a #556, 084 para o gate na nuvem). Ver o estado em `estado-v0.4.0.md`.

## 4. Validação padrão (vale para toda entrega)

1. Quem implementa **não aprova**. O coordenador abre uma **thread nova, em contexto limpo**, só com
   o problema e o que foi feito.
2. Estratégia: Playwright no **build local com seed** (sem login do Kalléo), larguras **360, 390,
   768 e 1280** (mobile first), criando massa de dados quando faltar; conferir também o deploy da
   Vercel quando houver rebuild. Contas de teste: `docs/engineering/homologacao-cenarios.md`.
3. A validação **não corrige código**: cada falha vira issue com evidência; a correção vai para
   outra thread; nova validação limpa confere só os pontos reprovados.
4. `the-judge` (versão mais recente, recarregada) em toda PR antes do merge; veredito como
   comentário (COMMENT), nunca aprovação do autor.
5. **Teste pré-patch:** o teste que prova o comportamento novo é escrito e visto falhar antes do
   código. **Regra 8:** teste existente só muda com `TESTE-ALTERADO: <motivo>` no PR, com tabela de
   paridade (cenário × asserção preservada). Mutante sobrevivente em regra de acesso ou auditoria é
   corrigido **antes** do merge. Hook `.claude/hooks/protect-tests.sh` bloqueia o agente; `scripts/gate/`
   e config de teste são do Kalléo (`GATE_OWNER_EDIT=1`); **não crie arquivo ali por shell** (um
   deslize assim foi revertido no #618).

## 5. Política do gate (ADR-042 e ADR-084)

| Momento | O que roda | Onde |
| --- | --- | --- |
| PR `feat/*` → release | typecheck, lint, `check:sv`, `check:docs`, integridade dos testes, suíte unitária **completa** com cobertura; E2E, mutação e integração só no **impactado** (na dúvida, inclui) | nuvem (`scripts/gate-cloud.sh`, perfil `pr`) ou PC |
| PR `release/*` → `main` | gate completo: cobertura por camada, E2E prod+dev, integração Postgres real, `console-limpo-dev`, imagem Docker + smoke + backup | nuvem para tudo que não precisa de Docker; **Docker/backup só no WSL** |
| Mensal (último dia) | mutação completa (~1h20) | Actions / PC |

- O Actions está **sem cota até ~2026-11-01** (checks vermelhos que terminam em ~3 s sem log são a
  cota, não o PR). Quando voltar, o mesmo fluxo vira workflow; o ruleset da `main` exige os checks
  `Typecheck, lint, sv-gate, test:coverage, build` e `Recibo do gate local + integridade dos testes`
  (o segundo passa a se chamar `Integridade dos testes e homologação` no [ADR-098](../adr/098-e2e-e-mutacao-de-volta-ao-actions-sem-recibo.md);
  o ruleset troca quando a v0.6.2 chegar na `main`).
- O recibo `E2E-GATE:` não é mais exigido em PR (ADR-098): o E2E e a mutação rodam no Actions. Ele só segue
  valendo para o `release:cut` gravar o selo do corte.
- Merge na release exige: recibo/gate verde do **head exato**, Postgres real verde quando a mudança
  toca persistência, e revalidação limpa aprovada.
- **VPS e minutos pagos foram descartados** (decisão do Kalléo, 2026-10-31): o gate não pode depender do PC.
- Como rodar, passo a passo: [§ 7](#7-como-rodar-o-gate).

## 6. Processo de release (regra inquebrável, via `npm run release:cut`)

Ordem obrigatória (ADR-071, provada na v0.3.0: gate uma vez, 23 min):

1. **Pré-condição:** a staging do mesmo SHA com validação limpa aprovada; criar a branch-marca
   `homologacao/vX.Y.Z` nesse SHA. Issues do lote fechadas; `TESTE-ALTERADO` consolidado e aprovado.
2. `release:cut` numa thread com WSL: árvore limpa, `release:prepare` primeiro, gate **uma** vez,
   recibo e PR. Nunca rodar `prepare` e gate à mão.
3. PR `release` → `main` (merge commit) com recibo; `the-judge` em thread limpa.
4. **Kalléo:** merge (bypass), backup (`ssh vps` e `sudo systemctl start estomasystech-backup.service`;
   conferir `sudo journalctl -u estomasystech-backup.service -n 50 --no-pager`) e deploy no Coolify.
   A tag sai por `npm run release:publish -- --rollback=redeploy|backup` **só com ok escrito e
   explícito do Kalléo**.
5. Depois: conferir produção (`/login`, `/api/health`, `/api/health/ready`; rodapé o Kalléo confere),
   apagar `homologacao/vX.Y.Z`, `staging` = `main`, Vercel conferida por ele no painel.

Merge na `main` **não é deploy** (ADR-039). Produção v0.3.0: `main` = `5e39180f`, tag `v0.3.0`,
rollback por redeploy (v0.2.0 = `7ee79cd`), backup `20261025T053255Z`.

## 7. Como rodar o gate

**Nuvem (preferido, PR #618 / ADR-084, ainda não mergeado):** `scripts/gate-cloud.sh [setup|integracao|gate|all]`,
perfis `pr` e `release`. Roda em segundo plano com log (a ferramenta de shell mata comando em primeiro
plano aos 10 min). Medido em contêiner de 4 vCPU e 15 GB, sem Docker: gate completo em ~28 min
(cobertura 566 s, E2E prod 613 s, E2E dev 204 s, integração 149 s, build 73 s). Cuidados:
`GATE_PERFIL=pr` (sem Docker, as etapas ficam «puladas» no recibo); `PG_POOL_MAX=1` na integração;
matar `next-server` órfão na porta 3000 antes do E2E; symlink do Chromium (Playwright 1.62 pede
`chromium-1234`, a imagem tem `1243`); Postgres da imagem é 16 e produção/CI usam 18 (risco residual
pequeno). Antes de o #618 entrar, use a branch dele ou o roteiro de `docs/engineering/` do ADR.

**WSL (PC do Kalléo, enquanto necessário):** clone `~/projects/estomasystech`; `npm run gate:local`
(~23–25 min, **um gate por vez**), `npm run test:integracao` depois, em Postgres real. Docker e
backup só aqui. `NODE_OPTIONS=--max-old-space-size=8192`. Se o PC cair, só o Kalléo religa: avisar.
Pasta local preferida no Windows: `C:\Users\Cliente\Projects\estomasystech`. Há um problema aberto de
disco a 100% durante o gate no PC (diagnóstico pendente; ver estado).

## 8. Ambiente (sem credenciais)

- Produção: Hetzner (`ssh vps` no WSL), Coolify v4.4.6 com 2FA, deploy manual da tag; segredos no
  Bitwarden; app em `https://estomasystech.kalleopinheiro.com.br`. Backup cifrado diário às 05:00 por
  systemd (ADR-040). Staging: Vercel (só constrói `staging`, ADR-061) com Neon (banco só da `main` e da staging).
- Clínicas reais cadastradas: «Estomasystech» e «Jeiciele Silva Estomaterapia», **sem canal de e-mail**.
  Nenhum paciente real até a revisão jurídica (#376) e o canal de e-mail.
- Fuso: `APP_TIMEZONE` (ADR-073); data civil sem conversão. Playwright pré-instalado em `/opt/pw-browsers`.
  Sem Docker e sem push de tag na nuvem: tag e imagem pelo WSL.
- Pendências humanas e roteiros de operação: `docs/engineering/producao.md` e o guia do operador
  (deploy do `next`, painel do Coolify, fumaça somente leitura).

## 9. Pendências que só o Kalléo resolve

| Item | O que falta |
| --- | --- |
| #376 jurídico | parecer, art. 33 (Resend e Google Agenda), ato da ANPD; `LEGAL_REVIEW_PENDING` → `false` depois |
| #381 | cifra `age` do backup (decisão dele) |
| #411 | provar o ruleset da `main` (barra recibo ausente/velho) após o reset da cota, ~01/11 |
| #543 | colar a etapa opcional `console-limpo-dev` em `scripts/gate/local.ts` (o `gate-cloud.sh` já a roda) |
| Rotina mensal | checar se o access log do Traefik guarda `?token=` de convites; rotina do 1º sábado |
| Staging/Actions | provar `staging.yml`, `rotina-mensal.yml` e ADR-053 depois de ~01/11 |
| Canal de e-mail | das 2 clínicas, antes de paciente real |
| #251 | log da próxima falha do teste de suspensão |
