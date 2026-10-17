---
title: "ADR 026 — Textos LGPD em versão prévia ficam fora do sistema até a revisão jurídica"
status: frozen
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-17
related: [docs/legal/textos-lgpd-previa.md, docs/adr/018-transferencia-internacional-ue.md, docs/adr/017-retencao-decisoes-complementares.md]
---

# ADR 026 — Textos LGPD em versão prévia ficam fora do sistema até a revisão jurídica

- **Data:** 2026-10-17
- **Status:** aceito. @KalleoPinheiro pediu uma versão prévia dos textos da [#216](https://github.com/KalleoPinheiro/vitta-flow/issues/216), a ajustar depois; a forma de entregá-la foi delegada a quem implementa.
- **Domínios afetados:** pacientes-prontuario, portal

## Contexto

A #216 espera o aviso de privacidade, o TCLE e o consentimento do parceiro. O sistema grava o
**hash SHA-256 do texto** em cada aceite (PRO-RN-06, POR-RN-11), então trocar uma constante
invalida todos os aceites, inclusive os de papel lançados pela equipe (#310). O termo vigente
(`CONSENT_TEXT` `v1`) mistura tratamento e imagem; a decisão de 2026-10-11 pede aceite de imagem
**separado** e texto com dados da clínica, o que o código ainda não faz.

## Opções consideradas

| Opção | A favor | Contra |
| --- | --- | --- |
| A — Trocar as constantes agora pela prévia | texto no ar já | aceites de papel e portal caem por um texto que o jurídico ainda vai mudar; reaceite duplo; o `v1` hoje não tem cabeçalho de "prévia" que o paciente veria como definitivo |
| B — Prévia só em `docs/legal/`, sem ligar | rascunho editável pelo dono; nenhum aceite cai; revisão jurídica sobre arquivo único | texto não aparece ao paciente até a promoção |
| C — Prévia no código com versão `v2-previa` ao lado do `v1` | testável | duas versões vigentes e hash divergente; resolução de "qual vale" é regra nova |

## Decisão

**Opção B.** A versão prévia mora em [`docs/legal/textos-lgpd-previa.md`](../legal/textos-lgpd-previa.md)
(`status: draft`), marcada em cada texto como pendente de revisão jurídica. **Nenhuma constante
muda**: `CONSENT_TEXT` (`v1`) e `PARTNER_SHARE_CONSENT_TEXT` (`v0-placeholder`) seguem vigentes e
**nenhum aceite existente perde a validade** por causa desta entrega.

A invalidação (#310: papel vale para o texto vigente) só dispara na **promoção** do texto revisado,
que troca texto e versão juntos (procedimento em § 8 do arquivo). A prévia não é versão do sistema.

O que a prévia propõe e o código ainda não suporta (aceite de imagem separado, interpolação de
nome, CNPJ e encarregado, páginas de aviso em login/portal/e-mail) **não vira requisito** aqui:
fica listado em § 7 e § 8 do arquivo, para tickets depois do texto fechado (AGENTS.md, regra 5).
A #323 (retenção) continua dependente do texto final e **não é fechada**.

## Consequências

- Nada muda em produção; a #216 segue `needs-info`, agora com rascunho para o jurídico revisar.
- Entre a prévia e a promoção o paciente continua aceitando o `v1`. Se o go-live com dado real
  vier antes da promoção, o `v1` é o texto vigente e o aviso de privacidade continua ausente
  (bloqueio de go-live já registrado no [runbook](../engineering/producao.md) § 1).
- Promover é aditivo ao arquivo: o `.md` vira a fonte do texto revisado, e a constante o copia.

## Relacionado

[#216](https://github.com/KalleoPinheiro/vitta-flow/issues/216),
[#310](https://github.com/KalleoPinheiro/vitta-flow/issues/310),
[#323](https://github.com/KalleoPinheiro/vitta-flow/issues/323),
[ADR-018](./018-transferencia-internacional-ue.md) item 4.
