---
title: "ADR 065 — Termo de tratamento sem a linha do responsável técnico (v3)"
status: frozen
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-23
related: [docs/adr/030-textos-lgpd-ligados-sem-revisao-juridica.md, docs/adr/064-termos-em-nome-do-representante-e-sem-texto-de-preenchimento.md, docs/domains/portal/README.md]
---

# ADR 065 — Termo de tratamento sem a linha do responsável técnico (v3)

- **Data:** 2026-10-23
- **Status:** aceito (decisão do orquestrador como Product Owner, mandato de @KalleoPinheiro de 2026-10-21; `TESTE-ALTERADO` autorizado por ele em 2026-10-23; o texto continua sem revisão jurídica, ADR-030).
- **Domínios afetados:** portal, pacientes-prontuario

## Contexto

A segunda rodada de QA da staging ([#511](https://github.com/KalleoPinheiro/estomasystech/issues/511)) mostrou que o termo de tratamento ainda imprime «Responsável técnico: …» quando a clínica preenche o campo. O ADR-064 só fazia a linha sumir quando o campo estava vazio; a decisão do PO é que o responsável técnico não consta no termo (o documento já identifica clínica, CNPJ e encarregado).

## Decisão

1. A linha «Responsável técnico» sai dos textos-base do TCLE de tratamento e da variante do representante legal (`consent-text.ts`, `consent-representative-text.ts`). O termo de imagem já não a tinha.
2. **O texto mudou, então a versão sobe**, como manda o domínio (o hash do texto-base é gravado no aceite; texto e versão mudam juntos): `v2` → `v3` e `v2-representante` → `v3-representante`.
3. A interpolação de `{{RESPONSAVEL_TECNICO}}` continua em `renderLegalText` para os demais textos e para clínicas com texto antigo; nenhum termo vigente usa o marcador.

## Consequências

- Aceites de `v2`/`v2-representante` deixam de cobrir o texto vigente: o paciente (ou o representante) aceita de novo. Não há paciente real na base (sem paciente real até a revisão jurídica, #376), então nada é perdido.
- A revisão jurídica (#376) cobre os textos já em `v3`.
