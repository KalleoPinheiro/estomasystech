---
title: "ADR 103 — Orquestração compartilhada entre LLMs com posse única por issue"
status: frozen
audience: [dev, ops, agent, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-11
related:
  - docs/agents/coordenacao.md
  - docs/engineering/convivencia-llms.md
  - docs/adr/097-fluxo-enxuto-ate-a-producao-com-portoes-deterministicos.md
  - docs/adr/101-veredito-do-the-judge-por-status-da-revisora.md
---

# ADR 103 — Orquestração compartilhada entre LLMs com posse única por issue

- **Data:** 2026-11-10
- **Status:** aceito (decisão de @KalleoPinheiro em 2026-11-10 às 23:21, America/Sao_Paulo).
  Exceção expressa à proibição do [ADR-097](097-fluxo-enxuto-ate-a-producao-com-portoes-deterministicos.md)
  de mudar processo no meio da release, restrita à coordenação entre LLMs e já vigente na v0.7.0.
  O resto do ADR-097 segue. Este registro autoriza a coordenação; não amplia push, merge,
  variável nem operação de produção.
- **Domínios afetados:** engenharia (coordenação, revisão, integração), governança.

## Contexto

O repositório permite várias ferramentas, mas `docs/agents/coordenacao.md` atribuía automaticamente a
coordenação a quem abre o Claude CLI. Kalléo esclareceu que Sunny e o orquestrador da outra LLM são
**equivalentes**: ambos planejam e orquestram, e nenhum é implementador subordinado permanente.

Dois orquestradores com a mesma conta GitHub podem reservar a mesma issue, exceder as três threads,
publicar reviews indistinguíveis ou integrar o mesmo lote em paralelo. Status e assignee não identificam
sessões. O ADR-101 reconhece que OWNER + SHA não comprovam independência de revisão.
Handoff por issue (#800 / ADR-102) reduz conflitos de arquivos, mas não decide posse da orquestração.

Permanecem as restrições: revisão limpa, quem implementa não aprova/mergeia, três threads globais,
nenhuma concorrência de domínio, classe 3 humana, main/produção com Kalléo e nenhuma promoção
antecipada de fase do ADR-097. Estado compartilhado vive no repositório e no Linear, não em chats.

Em 2026-11-10 às 23:21 (America/Sao_Paulo), Kalléo autorizou exceção expressa à proibição do ADR-097
de mudar processo no meio da release, já na v0.7.0. O contexto da exceção é a release aberta: Sunny
e o outro orquestrador já compartilham conta, fila e a v0.7.0, e adiar a posse única deixaria dois
donos possíveis sem regra vigente. O escopo fica só na coordenação. Workflow, revisão, CI, proteção
de branch, main, homologação, corte, deploy e LGPD não entram na exceção.

## Opções consideradas

| Opção | A favor | Contra |
| --- | --- | --- |
| A — Um coordenador permanente, outro só implementa | Simples; um escritor da fila | Contraria a equivalência esclarecida por Kalléo e concentra disponibilidade |
| B — Dois coordenadores independentes com locks por convenção | Paralelismo máximo | Sem escritor único do contador, ambos podem consumir a última vaga ou o mesmo domínio |
| C — Equivalência com posse única e arbitragem da integração | Mantém autonomia por issue e serializa recursos globais | Mais registro e handoff; depende de disciplina, não de lock atômico |

## Decisão

**Opção C.** Qualquer orquestrador pode ser dono de uma issue e responsável pela integração da release;
o papel pertence à sessão designada e pode ser transferido. Não há ferramenta principal.

1. **Posse única.** A EST ligada à issue GitHub canônica registra um dono de orquestração e ids/links das
   sessões implementadora/revisora. Sem dono confirmado ou com divergência, parar escritas da issue.
2. **Arbitragem global.** Uma EST da release, ligada à issue do lote, concentra vagas 1–3, domínios,
   branches e fila de integração, inclusive hotfixes. Um responsável pela integração é seu único escritor.
   Kalléo confirma a designação inicial; o responsável pela integração não é superior hierárquico ao outro orquestrador
   nem amplia autorizações.
3. **Reserva confirmada.** O responsável serializa concessões, relê o registro e confirma revisão crescente
   da reserva. Solicitante só inicia após confirmação e releitura. Dois donos, registro indisponível ou
   slot/domínio ocupado bloqueiam o início; Linear não fornece mutex ou fencing por este ADR.
4. **Três vagas somadas.** Implementação, revisão de código, QA com execução e subagentes que editam/testam
   contam globalmente. Nunca duas execuções ativas no mesmo domínio. Autor pausa antes de revisão assumir.
5. **Transferência explícita.** Handoff na issue GitHub com SHA, alterações locais, testes, jobs ativos,
   blockers, autorizações e próximo passo; link para o arquivo versionado. Registro fica em transferência,
   ganha nova revisão e só é ativado após aceite do novo dono. Dono anterior não retoma comandos pendentes.
   Depois do merge da #800 usa-se o caminho do ADR-102; antes vale o AGENTS.md da base.
6. **Ausência não libera posse.** Mais de 20 min sem progresso: investigar; 30 min sem resposta à
   verificação: registrar bloqueio e escalar. Espera conhecida tem próxima atualização explícita.
   Recuperação sem cedente exige Kalléo, inventário/preservação do trabalho e confirmação de parada;
   jobs ativos continuam ocupando vaga. Nova revisão invalida a reserva antiga por disciplina dos agentes.
7. **Revisão/merge preservados.** Thread revisora nova publica review COMMENT no head, conforme ADR-101.
   Quem editou não aprova nem mergeia o próprio diff, inclusive resolução de conflito. Revisora integra
   feature na release por squash, na janela serializada. main→release/sync usa merge commit por sessão
   de integração designada e revisão independente da resolução; release/hotfix→main continua com Kalléo.
8. **Atribuição, não autenticação.** Brief, PR e review ligam implementação e revisão a sessões distintas.
   Primeira linha contratual the-judge/v1 permanece. Esses ids não provam qual LLM chamou a API; não há
   identidade separada nova. Identidade de commit de Kalléo apenas no escopo explicitamente autorizado,
   com Co-Authored-By verdadeiro; isso não representa revisão/aprovação humana.
9. **Portas compartilhadas.** Dono da issue reúne pedidos; responsável da release deduplica ações globais.
   Urgência de segurança pode ser avisada por qualquer um. Só Kalléo altera variáveis globais/rulesets,
   inclusive VEREDITO_JUDGE_ATIVO; nenhum agente a desliga para produzir verde.

Detalhes operacionais ficam em [convivencia-llms.md](../engineering/convivencia-llms.md).
Este ADR substitui somente a presunção de dono automático por ferramenta e explicita a coordenação
compartilhada; não altera o contrato de aprovação dos ADRs 097/100/101, CI, proteção, deploy ou LGPD.

### Entrada em vigor

O [ADR-097](097-fluxo-enxuto-ate-a-producao-com-portoes-deterministicos.md) proíbe mudar o processo
no meio de uma release: cada fase entra entre releases. Kalléo abriu exceção expressa a essa proibição.

- **Contexto.** Em 2026-11-10 às 23:21 (America/Sao_Paulo), com a v0.7.0 aberta, os dois
  orquestradores equivalentes já compartilham conta GitHub, fila e a release. Sem regra vigente,
  os dois podem reservar a mesma issue ou a mesma vaga. Esperar a próxima release deixaria essa
  janela sem posse única.
- **Decisão.** A opção C entra em vigor já na v0.7.0, como regra de coordenação: dono único por
  issue, três vagas globais, handoff na troca de dono e um responsável pela integração como único
  escritor do registro global.
- **Escopo.** Só a coordenação entre LLMs. A exceção não muda workflow, revisão, CI, proteção de
  branch, main, homologação, corte, deploy, LGPD nem as fases 3 a 5 do ADR-097. Não autoriza push,
  merge, alteração de variável ou operação de produção além do que os ADRs 097, 100 e 101 já concedem.
  ADRs congelados anteriores não são reescritos. O ponteiro do `AGENTS.md` e o TL;DR de
  `coordenacao.md` acompanham este registro.

## Consequências

**Positivas**

- Equivalência sem dois donos da mesma issue; contador compartilhado impede contagens locais independentes.
- Troca auditável e retomada segura, inclusive com trabalho não publicado.
- Mesmas escalas e portas para ambas as ferramentas; nenhuma API paga ou serviço novo.

**Negativas / custos aceitos**

- Arbitragem é serial e indisponibilidade pode bloquear; há custo de registrar confirmação/handoff.
- Processo não é exclusão mútua técnica. Sessão que ignore a reserva ou use o login OWNER indevidamente
  não é impedida pela API. Uma identidade separada para revisão continua evolução, não requisito implementado.
- A recuperação sem cedente depende de Kalléo; não há takeover automático por timeout.

**Testes, cobertura e LGPD:** nenhuma mudança de aplicação, limiar, teste, segredo ou dado clínico.
Validar docs/links/150 linhas e simular disputa de dono, quarta vaga, domínio duplicado, retomada com
reserva velha e ausência. Evidência só com dados fictícios; 100% no núcleo, 90% global e mutação 85 não mudam.

**O que esta decisão fecha:** iniciar trabalho apenas por ler um status/assignee ou por abrir uma ferramenta;
nenhuma das duas LLMs reserva capacidade ou substitui o dono unilateralmente.

## Relacionado

- [Coordenação](../agents/coordenacao.md) e [governança](../governance.md).
- [ADR-097](097-fluxo-enxuto-ate-a-producao-com-portoes-deterministicos.md): fases e transição.
- [ADR-101](101-veredito-do-the-judge-por-status-da-revisora.md): review e risco de identidade compartilhada.
- [PR #800](https://github.com/KalleoPinheiro/estomasystech/pull/800): reserva ADR-102 e handoff por issue.
- Issue canônica: [#808](https://github.com/KalleoPinheiro/estomasystech/issues/808) / [EST-100](https://linear.app/estomasystech/issue/EST-100).
