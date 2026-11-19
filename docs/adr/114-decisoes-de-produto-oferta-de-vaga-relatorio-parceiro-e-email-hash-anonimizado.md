---
title: "ADR 114 — Oferta de vaga (RM-16), relatório ao parceiro (RM-15) e email_hash de conta anonimizada (#909)"
status: living
audience: [dev, agent, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-19
related:
  - docs/adr/111-email-de-login-cifrado-com-indice-cego-global.md
  - docs/plano-evolucao-faseado.md
  - docs/domains/agenda/README.md
  - docs/domains/equipe-parceiros/README.md
---

# ADR 114 — Oferta de vaga (RM-16), relatório ao parceiro (RM-15) e email_hash de conta anonimizada (#909)

- **Data:** 2026-11-19
- **Status:** aceito. Decisões do dono (Kalléo, 2026-11-19), que aprovou as recomendações apresentadas.
  **Emenda o [ADR-111](./111-email-de-login-cifrado-com-indice-cego-global.md)** no passo de contração.
- **Domínios afetados:** agenda (lista de espera), equipe-parceiros, comunicação, acesso (cifra).

## RM-16: oferta de vaga da lista de espera

1. Quando um horário é cancelado, o sistema oferece a vaga ao próximo da lista de espera,
   exceto o paciente daquela consulta. Se ele estiver na fila do mesmo dia e profissional,
   a oferta passa ao seguinte (dono, 2026-11-19; regra na AGE-RN-27).
2. A oferta **vale 2 horas** e expira sozinha, passando ao próximo.
3. Se faltarem **menos de 2 horas** para a consulta, a oferta expira sozinha no horário da consulta
   (não se oferece vaga que já passou do prazo útil).
4. O envio é por **e-mail** (canal que já funciona, RM-19). WhatsApp fica para o RM-14, que segue em espera.

## RM-15: relatório ao parceiro

1. Cadência **mensal**, canal **e-mail**.
2. O relatório **não traz dado clínico do paciente**: só o que o parceiro pode ver pela LGPD
   (a spec do PR de implementação lista os campos e a revisão confere).

## #909: email_hash de conta anonimizada

1. Conta **anonimizada** mantém `email_hash` vazio (como já faz a rotina de retenção, ADR-111 § 6).
2. Conta **ativa** passa a exigir `email_hash` preenchido: restrição condicional (`NOT NULL` só quando a conta
   não está anonimizada), no lugar do `NOT NULL` simples previsto no ADR-111 § 5.
3. A contração do ADR-111 (fim do ramo em claro, drop dos índices antigos) segue esta regra. É classe 3
   (cifra e migração): espera o clique do dono. Como a conta é marcada como anonimizada na restrição é
   detalhe da implementação, a registrar na spec.

## Fora desta decisão

RM-14 (WhatsApp), RM-05 (pagamento online) e RM-17 (TISS) seguem em espera pelo dono (regra 5).
