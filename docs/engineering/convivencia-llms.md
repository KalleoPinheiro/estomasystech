---
title: "Convivência entre orquestradores de LLMs"
status: living
audience: [agent, dev, po, ops]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-11
related:
  - docs/adr/103-orquestracao-compartilhada-entre-llms.md
  - docs/agents/coordenacao.md
  - docs/adr/101-veredito-do-the-judge-por-status-da-revisora.md
---

# Convivência entre orquestradores de LLMs

> **TL;DR.** Sunny e o orquestrador de outra LLM são equivalentes. Cada issue tem um dono de
> orquestração por vez; a release tem um responsável pela integração. O papel é da sessão,
> não da ferramenta. Há uma fila compartilhada, três vagas globais e revisão independente.

**Vigência.** Kalléo aceitou em 2026-11-10 às 23:21 (America/Sao_Paulo) exceção expressa ao
[ADR-097](../adr/097-fluxo-enxuto-ate-a-producao-com-portoes-deterministicos.md) (proibição de mudar
processo no meio da release), só para a coordenação entre LLMs, já na v0.7.0. O protocolo deste
guia vale com o [ADR-103](../adr/103-orquestracao-compartilhada-entre-llms.md). Não autoriza push,
merge, alteração de variável ou operação de produção. Não antecipa as outras fases do ADR-097.

## 1. Papéis simétricos

- Qualquer dos dois orquestradores faz triagem, planejamento, delegação e acompanhamento das issues sob sua posse.
- A mesma sessão não implementa e julga o mesmo diff. Quem implementou não publica o APPROVE nem faz o merge.
- A revisora é uma sessão nova, em contexto limpo; pode usar a mesma ferramenta ou outra.
- O dono da issue confere evidências antes de informar status. O responsável pela release serializa integrações.
- Kalléo conserva as portas humanas. Nenhum dos orquestradores amplia a própria autorização por este guia.

Leia o [papel de coordenação](../agents/coordenacao.md) e as skills atuais do repo,
sem copiar uma versão da memória. Estoma Arquitetura, QA e Clínica prestam parecer conforme o domínio;
parecer não é aprovação de Environment nem delegação de merge.

## 2. Onde fica o estado

| Artefato | Responsabilidade |
| --- | --- |
| Issue GitHub canônica | Contrato, critérios, decisões, evidências e recibo de transferência |
| EST vinculada no Linear | Dono de orquestração, executor/revisora, estado, versão e reserva operacional |
| EST da release, ligada à issue GitHub do lote | Registro global das três vagas, domínios e fila de integração |
| Branch/PR e SHA | Código publicado, verificações e review exata |
| Handoff no repo | Continuidade técnica versionada, com links para a issue e provas |

Chats, memória de sessão e arquivos locais são índices ou trabalho ainda não publicado: não são lock,
prova de entrega nem autorização. Não duplique contratos completos. Busque a issue/EST existente antes
de criar outra; duplicidade ou divergência bloqueia a execução até escolher o par canônico.

## 3. Reserva única e três vagas globais

A release tem **um responsável pela integração**, que pode ser qualquer dos dois orquestradores.
Ele é o único escritor do registro global no Linear; isso é arbitragem operacional, não hierarquia
entre ferramentas. A designação inicial é confirmada por Kalléo; a troca usa o mesmo handoff da issue.

Antes de iniciar, o dono da issue pede a reserva. O responsável pela integração:

1. Relê o registro e os PRs/agentes ativos, inclusive trabalho local informado e hotfixes.
2. Confirma dono único, domínio livre e uma das vagas 1–3; grava revisão crescente da reserva.
3. Devolve o identificador; o executor relê o registro e confirma antes de agir.

A escrita no Linear não é um mutex atômico. Sem confirmação, com dois donos, com versões divergentes
ou com o registro indisponível: **não iniciar nem escrever**. Resolver primeiro; não escolher por silêncio.
Uma atribuição ao mesmo login GitHub não distingue sessões.

Registro mínimo na EST da issue; o registro global contém os mesmos identificadores e links, não o contrato:

```text
Issue GitHub / EST / release:
Dono da orquestração: ferramenta + id/link da sessão
Executor / revisora: ferramenta + id/link de cada sessão
Reserva: revisão N / vaga 1|2|3 / domínio e arquivos compartilhados
Base: release/vX.Y.Z @ SHA / branch / PR / head remoto
Estado: ativo | pausado | revisão | aguardando Kalléo | transferência | liberado
Última evidência / próximo passo / pendência humana com link:
Atualizado / próxima atualização: data e hora America/Sao_Paulo (BRT)
```

- O teto é **três execuções de código somadas**, não três por orquestrador ou ferramenta.
- Implementação, revisão de código, QA com execução e subagentes que editam/testam ocupam vaga; leitura pontual e coordenação não.
- Nunca duas execuções ativas no mesmo domínio. Autor pausa antes de a revisão assumir a vaga/domínio.
- Workflow, gate e release compartilham domínio; arquivos globais e ADRs também são reservados por caminho/número.
- Subagentes não multiplicam vagas. Se não há vaga, enfileirar; não omitir Verifier ou revisão para caber.
- Branch/worktree tem um escritor; não compartilhar índice Git nem arquivos não publicados entre sessões concorrentes.
- Dono da issue pede liberação; responsável pela integração confirma parada real antes de devolver a vaga.

Cada executor relê dono, revisão da reserva e head antes de push, ready ou outra escrita externa.
Reserva antiga não vale depois de um handoff. Esta disciplina não é fencing imposto pela API.

## 4. Handoff e perda de contato

Troca de dono exige recibo na **issue GitHub canônica** e atualização do Linear, não apenas mensagem no chat:

1. Dono anterior pausa executores, informa jobs ainda ativos e deixa SHA remoto, diff local não publicado,
   testes executados/falhos/não executados, autorizações com origem, blockers e próximo passo.
2. Aponta o handoff versionado e as evidências. Patch local só por canal autorizado; sem segredo ou dado clínico.
3. Responsável pela integração serializa a troca: estado `transferência`, nova revisão e novo dono.
4. Novo dono confirma leitura e remoto/local na issue; o responsável pela integração então ativa a reserva global no Linear.
5. Dono antigo não retoma comandos pendentes: relê a reserva e entrega qualquer diferença que tenha restado.

Após a entrada da [#800](https://github.com/KalleoPinheiro/estomasystech/pull/800), use o ADR-102:
`.specs/archive/handoff/<issue>-<slug>.md`. PR em voo move só sua própria entrada do arquivo antigo.
Antes disso, vale o caminho indicado no AGENTS.md da base. O recibo da transferência pode linkar a
última versão publicada e registrar o delta na issue; não exige push vazio para produzir um handoff.
`reports/handoff-agregado.md` é gerado, não editado/versionado. Handoff temporário de sessão não substitui o recibo.

**Timeout não transfere posse.** Sessão ativa sem progresso por mais de 20 min: investigar. Ao passar 30 min
sem resposta à verificação, registrar bloqueio e escalar; espera conhecida de job ou Kalléo fica explícita
com próxima atualização. Não liberar vaga de job ainda rodando. Sem cedente, o responsável pela integração
pede a Kalléo a recuperação da posse após inventário/preservação do trabalho e confirmação de parada.
Se quem sumiu é o responsável pela integração, ambos aguardam a nova designação de Kalléo.
O registro recebe nova revisão e o motivo; sessão que reaparecer precisa de nova reserva, nunca retoma por memória.

## 5. Revisão, identidade e merge

Siga AGENTS.md, [ADR-101](../adr/101-veredito-do-the-judge-por-status-da-revisora.md) e a skill atual
[the-judge](../../.claude/skills/the-judge/SKILL.md). O contrato do projeto prevalece sobre o template genérico da skill:

```text
**the-judge/v1: APPROVE**

PR #N / head SHA completo
Implementação: ferramenta + sessão
Revisão independente: ferramenta + sessão
Evidências, achados e limites da validação
```

- Só a revisora publica a review COMMENT; `commit_id` precisa ser o head. A review válida mais nova prevalece.
- Os ids de sessão são trilha de auditoria, **não autenticação**: OWNER/SHA/contrato não provam qual LLM escreveu.
- Push novo exige julgamento do novo SHA. Verde de onboarding (`VEREDITO_JUDGE_ATIVO` diferente de `true`) não prova revisão.
- Depois da review, confirmar execução real de `review-judge.ts` e seu resultado no log, além dos outros checks.
- O veredito usa definição/scripts confiáveis da branch padrão (`main`, ADR-100); corrigir só a release não os atualiza.
- Rerun conserva payload/SHA/ref; não atualiza corpo antigo. Reviews são buscadas ao vivo pela API.
- `edited` não dispara o veredito atual. Novo evento só nos tipos previstos pelo YAML; não usar push vazio,
  alternância draft/ready ou alteração de variável para fabricar um verde. Workflow histórico inadequado exige execução nova planejada.

A identidade de commit autorizada de Kalléo é usada apenas no escopo já concedido, mantendo
`Co-Authored-By` verdadeiro e identificação da sessão na entrega. Não invente aprovação humana,
assinatura ou conta separada; autoria Git não distingue implementação de revisão. Não altere identidade global por conveniência.

| Integração vigente | Quem executa, com autorização e verificações |
| --- | --- |
| Feature/correção/docs → release | Revisora independente, squash; responsável pela integração serializa a janela |
| main → release / resolução em sync/* | Sessão de integração designada pelo responsável da release, merge commit; revisão limpa da resolução |
| release/hotfix → main | Kalléo, merge commit; nenhuma das duas LLMs assume esta porta |
| Homologação/corte final | Responsável da release congela integrações e segue o procedimento do mesmo SHA |

Quem escreveu uma resolução de conflito também não a aprova nem faz o merge do próprio diff.
Não remover proteção nem invocar bypass para esconder falha. Antes de integrar, reler head, review,
checks exigidos, mergeability e a reserva. As duas LLMs não disparam cortes ou merges paralelos.

## 6. Portas humanas e variáveis compartilhadas

O dono da issue reúne o pedido; o responsável pela release deduplica ações que atingem o lote.
Risco urgente de segurança/produção pode ser avisado imediatamente por qualquer dos dois, com link
para a mesma pendência. A outra sessão consulta o registro antes de pedir novamente.

- Kalléo: main, produção, Environment de classe 3, credenciais/painéis, dinheiro, jurídico e decisões de produto não especificadas.
- Regra 8 e caminhos protegidos exigem autorização específica; permissão antiga de outra issue não migra.
- Variáveis globais e rulesets não são espaço de trabalho dos agentes. Só Kalléo altera `VEREDITO_JUDGE_ATIVO`;
  registrar nome, escopo e confirmação, nunca tokens/valores sensíveis. Não desligar a chave para destravar PR.
- `julgar` lê `vars.VEREDITO_JUDGE_ATIVO` sem Environment: variável apenas no Environment de classe 3 não basta.
- Backup/deploy/restore/migração/recifra e flags de clínica real seguem seus portões, sem delegação implícita por este documento.

Mensagem ao Kalléo: **entregue; agora; ação única + motivo + link de run/PR e SHA; já resolvido**.
Uma tela no celular, sem repetir segredo ou clique já confirmado.

## 7. Pronto e retomada

Antes de ready/merge, os dois orquestradores aplicam o mesmo checklist:

- Ticket canônico, reserva válida, branch da release e handoff; revisão em sessão independente.
- Provas do SHA real; testes existentes preservados; coverage 100% no núcleo, piso global 90%, mutação 85.
- Draft até a rodada planejada; confirmar visibilidade/cota e margem. Não desativar portões para economizar.
- Apenas massa fictícia; nunca PII, prontuário, segredo, `.env` ou credencial em brief, review, log ou handoff.
- Atualizar EST com evidências; `Na release` não é `Em produção`. Sem changeset para PR só de docs.

Para retomar, ler remoto + Linear, inventariar worktrees e alterações locais sem reset/force push,
conferir reservas e só então continuar. Memória antiga não reabre issue nem restaura autorização.

Fluxo e operação: [homologação](homologacao.md), [produção](producao.md) e
[governança](../governance.md). Este guia não implanta feat→main nem auto-deploy; divergência de
workflow/ADR paralisa a ação de risco e vira decisão registrada, nunca remoção silenciosa de portão.
