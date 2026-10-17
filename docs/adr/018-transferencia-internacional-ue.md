---
title: "ADR 018 — Transferência internacional: dados na UE (Alemanha) e base do art. 33"
status: frozen
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-17
related: [docs/adr/015-servidor-sem-cifra-de-disco.md, docs/engineering/producao.md]
---

# ADR 018 — Transferência internacional: dados na UE (Alemanha) e base do art. 33

- **Data:** 2026-10-17
- **Status:** aceito na parte técnica e arquitetural. **O texto jurídico final (aviso de privacidade,
  TCLE, cláusulas) segue pendente de revisão jurídica** ([#216](https://github.com/KalleoPinheiro/vitta-flow/issues/216)); este ADR não o redige.
- **Domínios afetados:** pacientes-prontuario, comunicacao, portal, infraestrutura

## Contexto

Em 2026-10-11 e 2026-10-12 o dono decidiu hospedar na Hetzner, na Alemanha, com a cópia de
backup numa Storage Box (AD-033, ADR-015). Guardar dado de saúde (LGPD art. 11) num servidor fora
do Brasil é transferência internacional (art. 33) e exige base documentada no aviso e no registro
de operações (art. 37). Em 2026-10-17 o dono delegou a base técnica e a versão do consentimento a
quem implementa, com o texto jurídico final reservado ao jurídico.

## Opções consideradas

| Opção | A favor | Contra |
| --- | --- | --- |
| A — Adequação (art. 33, I) com cláusulas-padrão como reserva | Sem contrato por operador enquanto a adequação UE ↔ Brasil valer; a reserva cobre a revogação | Depende de ato de terceiros; precisa ser reconferido |
| B — Só cláusulas-padrão contratuais (art. 33, II, "b"; Res. CD/ANPD nº 19/2024) | Independe da adequação | Contrato com cada operador, ainda antes de haver paciente real |
| C — Consentimento específico do titular (art. 33, VIII) | Simples de explicar | Revogável; não serve para quem não pode negar (prontuário com guarda legal) |

## Decisão

**Opção A.** O destino é a UE (Alemanha), e a base técnica registrada é a **decisão de adequação
recíproca entre Brasil e UE** (art. 33, I), com as **cláusulas-padrão da ANPD** como mecanismo de
reserva se a adequação deixar de valer. Segundo a fonte secundária consultada em 2026-10-17 (artigo
da Confidata sobre a atualização da ANPD), o ato brasileiro é a Resolução CD/ANPD nº 32/2026 (janeiro
de 2026), com reavaliação prevista para janeiro de 2030. **Não é fonte primária**: o jurídico
confere o número e o texto no Diário Oficial antes do go-live, e este ADR é atualizado se divergir.

Decisões de arquitetura que sustentam a base e valem independentemente do texto jurídico:

1. **Região única na UE.** Servidor na Alemanha; a Storage Box fica em **outra localização da
   Hetzner dentro da UE** (Helsinki, Finlândia, se a caixa estiver disponível lá; senão qualquer
   outra localização da UE diferente da do servidor). Nunca fora da UE/EEE. A diferença de local é
   o que protege contra a perda de um datacenter; a UE é o que mantém uma só base legal.
2. **O backup sai cifrado.** O `age` cifra antes de qualquer cópia (`backup.sh`), então o provedor
   da Storage Box guarda só texto cifrado, e a chave privada nunca está no servidor.
3. **Subprocessadores fora da UE são transferência à parte.** Cada um precisa de mecanismo próprio
   do art. 33 e entra no registro do art. 37 com a lista do que recebe:

   | Serviço | O que recebe | Tratamento |
   | --- | --- | --- |
   | Hetzner (servidor e Storage Box) | tudo, backup cifrado | UE; contrato de tratamento de dados do provedor, a anexar ao registro |
   | Resend (e-mail) | e-mail e nome nos convites e lembretes | sede fora da UE: mecanismo do art. 33 **pendente do jurídico**; o corpo já não vai para o log (AD-028) |
   | Google Agenda (opcional) | título e horário da consulta | só quando a clínica conecta; mecanismo **pendente do jurídico**; o job de retenção apaga os eventos (AGE-RN-16) |
   | UptimeRobot | só o endereço do servidor | sem dado pessoal (decisão do dono, AD-032) |
   | GlitchTip | nada de paciente (ADR-014) | self-hosted, no próprio servidor |

4. **Versão do consentimento.** O texto do consentimento de compartilhamento com o parceiro
   (`PARTNER_SHARE_CONSENT_TEXT_VERSION`) continua `v0-placeholder` até o jurídico entregar a
   redação. Ao receber, o texto e a versão trocam **juntos** (para `v1`), o hash muda e quem
   autorizou autoriza de novo. Não se inventa redação definitiva: o aviso provisório continua
   marcado na tela. Mesma regra para `data-rights-text.ts`.

## Consequências

**Positivas**

- Uma única base legal para tudo que fica no servidor e no backup; a decisão não depende de
  contrato por provedor de infraestrutura enquanto a adequação valer.
- A parte pendente é só texto, e a troca é uma constante versionada (o hash invalida aceites
  antigos de propósito).

**Negativas / custos aceitos**

- Resend e Google Agenda continuam sem mecanismo documentado até o jurídico responder. Isso é
  **bloqueio de go-live para dado real**, já listado no [runbook](../engineering/producao.md) § 1.
- A adequação pode ser revogada ou alterada; aí a reserva (cláusulas-padrão) vira a base e exige
  contrato com a Hetzner.

**O que esta decisão fecha:** mudar de região para fora da UE/EEE passa a exigir ADR novo.

## Relacionado

- [ADR-015](./015-servidor-sem-cifra-de-disco.md), [ADR-014](./014-observabilidade-sem-pii.md),
  [ADR-006](./006-chave-de-dados-clinicos.md).
- [#216](https://github.com/KalleoPinheiro/vitta-flow/issues/216) (textos jurídicos),
  [#313](https://github.com/KalleoPinheiro/vitta-flow/issues/313) (infra).
- Fonte consultada: <https://confidata.com.br/blog/transferencia-internacional-dados-atualizacao-anpd-2026> (secundária).
