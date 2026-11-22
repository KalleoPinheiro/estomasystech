---
title: "ADR 116 — Receituário de enfermagem congelado na emissão, com observações (#956)"
status: living
audience: [dev, agent, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-22
related:
  - docs/adr/082-documentos-imprimiveis-no-servidor-com-ilha-de-emissao.md
  - docs/adr/006-chave-de-dados-clinicos.md
  - docs/adr/110-rls-por-clinica-spike-e-plano-de-rollout.md
  - docs/domains/pacientes-prontuario/README.md
---

# ADR 116 — Receituário de enfermagem congelado na emissão, com observações (#956)

- **Data:** 2026-11-22
- **Status:** aceito. Decisão do dono (Kalléo, 2026-11-22, "Sim siga as recomendações"): o receituário emitido
  é imutável; ele ganha um campo de texto livre além das intervenções do plano; o envio ao paciente é só pelo
  portal, por enquanto (sem e-mail).
- **Domínios afetados:** pacientes-prontuario (plano de cuidados, documentos), portal (entrega ao paciente).

## Contexto

A primeira versão do receituário (PR 993) seguia a emissão de documento do ADR-082: o número e a data ficavam
no evento de auditoria, idempotente por plano, e cada download redesenhava as intervenções **vigentes** do
plano. Um documento clínico entregue ao paciente não pode mudar depois com o mesmo número.

## Decisão

1. **Conteúdo congelado.** Emitir grava em `nursing_prescriptions` tudo o que sai impresso: timbre de quem
   emite, cidade, nome do paciente, intervenções com a frequência, observações e quem assina. Baixar de novo
   desenha desse registro, nunca do plano atual.
2. **Número por emissão.** O número é `RCT-` e os 8 primeiros caracteres do id do receituário. Se o plano, o
   timbre, a prescritora ou as observações mudarem, a próxima emissão é outro receituário, com outro número.
   Emitir de novo sem nada mudar devolve o último emitido (clique duplo não gera número novo). A trava
   consultiva por plano (ADR-082) impede duas emissões simultâneas, e o conteúdo é lido pela própria
   transação depois dela (#998): quem esperou a trava congela o plano como está, nunca o de antes.
3. **Observações.** Texto livre opcional da prescritora, até 2000 caracteres, impresso depois das
   intervenções. Em branco, a seção não sai.
4. **Cifra.** O conteúdo é dado de saúde: um JSON cifrado numa coluna só (`content`), com a
   `DATA_ENCRYPTION_KEY`, e entra no `data:reencrypt` (`CIPHERED_TABLES`). Nunca é consultado por partes.
5. **Escopo e trilha.** Tabela com `clinic_isolation` e `FORCE` (ADR-110). Emissão é o evento `create`
   `receituario` com o id do receituário e o paciente. Rotas da família clínica `/api/care-plans/:id/receituarios`
   (lista e emite) e `/:prescriptionId` (PDF): Admin e Profissional vinculado; Atendente `403`. O receituário
   sai da emissão genérica `POST /api/documents/issue`.
6. **Retenção.** A anonimização do paciente apaga o conteúdo (`content = null`); número e data ficam. O PDF
   desse receituário responde `400` dizendo que o conteúdo saiu pela retenção.

## Consequências

- Migração `0092` aditiva (tabela nova). O código anterior não a lê.
- Receituários emitidos antes desta versão (só na staging; não chegaram à produção) não aparecem na lista.
- **Entrega ao paciente só pelo portal:** a seção "Meus receituários" lista os emitidos para o titular da sessão (o anonimizado não aparece) e baixa o PDF do conteúdo gravado; cada download é auditado (`read`). E-mail fica fora.
