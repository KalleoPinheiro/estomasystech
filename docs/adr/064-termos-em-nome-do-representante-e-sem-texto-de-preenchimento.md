---
title: "ADR 064 — Termos em nome de quem assina e sem texto de preenchimento"
status: frozen
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-22
related: [docs/adr/030-textos-lgpd-ligados-sem-revisao-juridica.md, docs/adr/032-paciente-menor-no-portal-pelo-representante-legal.md, docs/domains/portal/README.md]
---

# ADR 064 — Termos em nome de quem assina e sem texto de preenchimento

- **Data:** 2026-10-22
- **Status:** aceito (decisão do orquestrador como Product Owner, mandato de @KalleoPinheiro de 2026-10-21; o texto continua sem revisão jurídica, ADR-030).
- **Domínios afetados:** portal, pacientes-prontuario

## Contexto

O QA da staging v0.2.0 ([#469](https://github.com/KalleoPinheiro/estomasystech/issues/469)) achou dois defeitos nos termos de consentimento: o termo imprimia «Responsável técnico: responsável técnico da clínica» (texto de preenchimento num documento legal) e seguia em primeira pessoa («propostos a mim», «meu prontuário») quando quem assina é o representante legal do menor.

## Decisão

1. **Texto de preenchimento nunca vai impresso.** Sem responsável técnico cadastrado, a linha «Responsável técnico» some do termo; sem nome do encarregado, fica só o canal de contato. Os textos-base não mudam (o hash dos aceites já feitos continua valendo); a omissão é feita ao renderizar (`renderLegalText`).
2. **Uma variante por termo para o representante legal.** O TCLE de tratamento e a autorização de imagem ganham uma variante redigida em nome de quem assina (`v2-representante` e `v1-representante`), com versão e hash próprios, em `consent-representative-text.ts` e `image-consent-representative-text.ts`. O representante legal que lê e assina pelo portal vê, e o registro guarda, a variante dele; o paciente adulto segue com o texto original.
3. **O aceite vale para os dois textos vigentes.** `ConsentRecord.resolveStatus` e `covers` aceitam uma lista de textos: o aceite do paciente cobre o original e o do representante cobre a variante dele. Assim o gate de foto, o aviso de maioridade e o aceite em nome próprio aos 18 anos (ADR-033) seguem iguais.
4. **O termo impresso pela equipe** acompanha: menor com responsável cadastrado imprime a variante do representante, com a frase de abertura «Eu, <responsável>, <parentesco> e responsável legal de <paciente>».

## Consequências

- Nenhuma migração e nenhum aceite existente é invalidado.
- Mudar um texto da variante exige versão nova, como nos termos originais (ADR-030); a revisão jurídica (#376) deve cobrir os quatro textos.
