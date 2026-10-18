---
title: "ADR 031 — Retenção em dias inteiros, prazos numa fonte só e registro de cada execução"
status: frozen
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-18
related: [docs/adr/013-retencao-por-anonimizacao.md, docs/adr/017-retencao-decisoes-complementares.md, docs/adr/030-textos-lgpd-ligados-sem-revisao-juridica.md]
---

# ADR 031 — Retenção em dias inteiros, prazos numa fonte só e registro de cada execução

- **Data:** 2026-10-18
- **Status:** aceito. Decidido pelo coordenador do projeto como PO, com a autonomia delegada por
  @KalleoPinheiro em 2026-10-17. Completa o [ADR-013](./013-retencao-por-anonimizacao.md) e o
  [ADR-017](./017-retencao-decisoes-complementares.md) sem alterá-los.
- **Issue:** [#323](https://github.com/KalleoPinheiro/vitta-flow/issues/323) (fatia da
  [#210](https://github.com/KalleoPinheiro/vitta-flow/issues/210), item 2).
- **Domínios afetados:** acesso, pacientes-prontuario, agenda

## Contexto

O job de retenção (#294) já anonimizava a trilha de auditoria com mais de 5 anos, o prazo que o
aviso de privacidade final (#216, ADR-030) promete. A #323 pede três coisas que faltavam:

1. **Fronteira.** O corte era a mesma data **e hora** N anos antes da execução, em UTC. Um evento
   das 08:00 de 18/10/2021 saía às 08:01 de 18/10/2026, ainda dentro do último dia do prazo. O
   Código Civil (art. 132, § 3º) conta prazo em anos até o dia de igual número, inteiro; e o
   critério "nunca apagar dentro do prazo legal" vale com mais força para o prontuário (20 anos,
   Lei 13.787/2018).
2. **Configurável.** Os prazos estavam em `RETENTION_YEARS` e, repetidos à mão, no texto do aviso.
3. **Auditado.** A execução só deixava rastro quando anonimizava algo; sem nada vencido (o normal
   nos primeiros anos) não havia como saber, pela trilha, se o job rodou.

## Decisão

1. **Dias inteiros, no fuso da aplicação.** `retentionCutoff(now, anos)` devolve a meia-noite, em
   `APP_TIMEZONE`, do dia seguinte a "ontem menos N anos". Na execução do dia `D` sai só o que tem
   referência num dia cujo prazo terminou antes de `D`. Início em 29/02 sem par no ano final
   termina em 01/03 ("no imediato", art. 132 § 3º). Vale para **todos** os tipos (prontuário,
   trilha, fila, contas): a mudança só atrasa a saída, no máximo um dia.
2. **Fonte única, no código.** `RETENTION_YEARS` (`src/domain/retention/retention-policy.ts`) é
   o único lugar dos prazos; o aviso de privacidade interpola os números. **Não** há variável de
   ambiente: o prazo é uma promessa ao titular escrita no aviso, e trocá-lo sem trocar o texto
   seria informar errado (LGPD art. 9º). Mudar um prazo exige subir `PRIVACY_NOTICE_VERSION`; um
   teste prende os dois juntos.
3. **Um evento de plataforma por execução.** A trilha de plataforma (só o Super Admin vê) ganha
   um `update`/`retention` a cada execução, mesmo com tudo zero, com as contagens da plataforma,
   o número de empresas processadas e com falha (sem identificá-las) e o corte da trilha. A trilha
   de cada clínica continua ganhando evento só quando algo mudou nela (RET-09), para não encher a
   tela do Admin com uma linha por dia.

## Alternativas consideradas

| Alternativa | Por que não |
| --- | --- |
| Manter o corte por instante | Anonimiza dentro do último dia do prazo |
| `AUDIT_RETENTION_YEARS` no ambiente | O aviso ficaria desatualizado sem ninguém perceber; prazo legal muda por PR revisado, não por variável |
| Excluir ou arquivar fora do banco a trilha anonimizada | Contraria o ADR-013 ("anonimizar, nunca excluir") e não foi decidido pelo dono |
| Evento por clínica a cada execução | Uma linha por dia na trilha de cada Admin, sem informação para ele |

## Consequências

- O dado sai até um dia depois do que saía antes. Nenhum dado sai mais cedo.
- O operador confere em *Plataforma → Auditoria* que o job rodou hoje e se alguma empresa falhou.
- A trilha anonimizada continua no banco e cresce. Com a medição da #222 (2 milhões de eventos,
  p95 ≤ 25 ms) não há pressa; particionar ou expurgar o que já está anonimizado é decisão nova.
- A revisão jurídica do aviso (ADR-030) pode mudar um prazo; o caminho é o § 2 acima.

## Relacionado

- Regra ACE-RN-44 (acesso), spec RET-02 e RET-09 (`.specs/features/retencao-anonimizacao/spec.md`).
- Runbook: [`producao.md` § 7.1](../engineering/producao.md).
- Decisão em `.specs/STATE.md` (AD-052).
