---
title: "ADR 030 — Textos LGPD ligados ao sistema antes da revisão jurídica"
status: frozen
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-18
related: [docs/legal/textos-lgpd.md, docs/adr/026-textos-lgpd-previa-nao-ligada.md, docs/adr/018-transferencia-internacional-ue.md, docs/adr/017-retencao-decisoes-complementares.md]
---

# ADR 030 — Textos LGPD ligados ao sistema antes da revisão jurídica

- **Data:** 2026-10-18
- **Status:** aceito. Substitui o [ADR-026](./026-textos-lgpd-previa-nao-ligada.md) (a prévia agora entra no código). @KalleoPinheiro pediu em 2026-10-18 que o texto cubra tudo o que é necessário e que esta etapa feche, com a revisão por profissional da área **depois**; as decisões abertas foram delegadas a quem implementa (opção mais segura).
- **Domínios afetados:** pacientes-prontuario, portal, acesso, comunicacao

## Contexto

O ADR-026 deixou os textos fora do código para não derrubar aceites por um rascunho. O dono
reverteu a premissa: quer a #216 fechada com o texto completo e a revisão externa depois. Sobram
duas forças: o hash do aceite invalida tudo quando o texto muda (a revisão futura vai trocá-lo), e
não há como esperar o jurídico para ter, no mínimo, aviso de privacidade, controlador e encarregado
identificados (LGPD, arts. 9º e 41).

## Decisão

1. **Os textos entram em vigor agora** (TCLE `v2`, imagem `v1`, parceiro `v1`, aviso `v1`), nos
   arquivos de [`docs/legal/textos-lgpd.md`](../legal/textos-lgpd.md) § 1. `LEGAL_REVIEW_PENDING`
   fica `true` e Configurações avisa a equipe. **Ainda falta a revisão jurídica**, e isso está
   escrito em todo lugar onde a equipe lê (tela, doc, handoff).
2. **Imagem é aceite à parte** (decisão do dono de 2026-10-11): `consent_records.purpose`
   (`treatment` | `image`, migração `0062`). O envio de foto pelo portal exige a imagem aceita; o
   tratamento não libera foto. Revogar um não revoga o outro. Linhas antigas viram `treatment` e,
   como o texto mudou, pedem novo aceite.
3. **Hash do texto-base, dados da clínica à parte.** Interpolar o nome e o encarregado no texto que
   é hasheado faria cada troca de encarregado derrubar o aceite de todos os pacientes da clínica.
   O hash é do texto com marcadores; o que o paciente viu (clínica, CNPJ, encarregado, canal) vai em
   `consent_records.controller_snapshot`. Propriedade que desqualificou a alternativa: aceite
   instável a mudanças cadastrais irrelevantes.
4. **Encarregado por clínica** em `clinics.dpo_name`/`dpo_contact`, editado pelo Admin de Empresa.
   Sem eles vale o contato da clínica (e-mail, depois telefone). **Falha fechado** sem CNPJ ou sem
   nenhum canal (`409`): o titular não saberia a quem recorrer.
5. **Aviso de privacidade em dois níveis.** `/privacidade` (público, genérico, linkado em `/login`
   e no rodapé do portal) e o aviso da clínica no portal (com CNPJ e encarregado). Todo e-mail pelo
   Resend leva o link no rodapé. Sem login não se sabe a clínica, por isso o genérico.
6. **Pontos do jurídico decididos pela opção mais segura** (detalhe em
   [`textos-lgpd.md` § 3](../legal/textos-lgpd.md)): clínica controladora e VittaFlow operador;
   base de saúde = tutela da saúde + obrigação legal; **sem uso de foto fora do tratamento**;
   responsável legal assina pelos menores; art. 33 de Resend e Google Agenda vira **condição de
   go-live** em vez de afirmação não verificada no texto.
7. **O texto do parceiro `v1` troca o `v0-placeholder`.** Consentimentos do parceiro anteriores
   (portal e papel, #310) perdem a validade, como o ADR-018 item 4 previu; ainda não há paciente real.

## Opções consideradas

| Opção | A favor | Contra |
| --- | --- | --- |
| A — Manter o ADR-026 (prévia só em doc) | nenhum aceite cai | contraria o pedido do dono; sem aviso nem encarregado no sistema |
| B — Ligar tudo, hash do texto interpolado | evidência literal do que foi lido | cada edição do encarregado derruba todos os aceites |
| C — Ligar tudo, hash do texto-base + snapshot (esta) | aceite estável; evidência do controlador | duas fontes (hash e snapshot) |

## Consequências

- **Go-live com dado real segue bloqueado** até: revisão jurídica dos cinco textos; mecanismo do
  art. 33 para Resend e Google Agenda; conferência do ato da ANPD (runbook § 1).
- Quem aceitou o TCLE `v1` e o consentimento do parceiro `v0-placeholder` aceita de novo.
- **A #323 (retenção da trilha) fica desbloqueada:** o prazo (5 anos) já era decisão do dono na
  #216 e agora está no aviso. O que continua pendente é só o texto revisado.
- Troca futura de texto é só texto + versão, sem migração ([`textos-lgpd.md` § 4](../legal/textos-lgpd.md)).
- Limite aceito: menores — o aceite em papel do TCLE e da imagem não tem onde ser registrado.

## Relacionado

[#216](https://github.com/KalleoPinheiro/vitta-flow/issues/216),
[#323](https://github.com/KalleoPinheiro/vitta-flow/issues/323),
[#310](https://github.com/KalleoPinheiro/vitta-flow/issues/310),
[ADR-018](./018-transferencia-internacional-ue.md), [ADR-027](./027-responsavel-acessa-portal-em-nome-do-paciente.md).
