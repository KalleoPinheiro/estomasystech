---
title: "ADR 063 — Alerta de infecção na triagem e aviso de coerência no TIME"
status: frozen
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-22
related: [docs/adr/062-time-completo-na-avaliacao-de-ferida.md, docs/domains/pacientes-prontuario/README.md]
---

# ADR 063 — Alerta de infecção na triagem e aviso de coerência no TIME

- **Data:** 2026-10-22
- **Status:** aceito (decisões clínicas do Product Owner, mandato de @KalleoPinheiro de 2026-10-21). Responde as perguntas abertas do [ADR-062](062-time-completo-na-avaliacao-de-ferida.md), que não se edita.
- **Domínios afetados:** pacientes-prontuario

## Decisão

1. **Infecção local ou pior gera alerta na triagem.** Quando a avaliação mais recente da condição tem nível `local`, `spreading` ou `systemic`, a fila de triagem de fotos (`GET /api/photos/triage`, campo `infectionAlert`) mostra um selo vermelho com o nível ("Infecção local" etc.) ao lado do nome. Inflamação e "sem sinais" não alertam. O alerta é só para a equipe: o portal e o parceiro seguem sem infecção e bordas (ADR-062).
2. **Percentual de tecido fica fora do PUSH.** O PUSH continua calculado de área, exsudato (quantidade) e **tecido predominante escolhido pelo profissional**; os percentuais são registro clínico, não entram na pontuação.
3. **Coerência nível × sinais é aviso, não bloqueio.** O formulário confere o nível contra os sinais marcados e mostra avisos, sem impedir o registro (a combinação é juízo clínico). Avisos: sinais marcados com nível "sem sinais de infecção"; nível de infecção local ou pior sem nenhum sinal; sinal de disseminação (eritema em expansão, linfangite, linfadenopatia) com nível abaixo de disseminação; sinal sistêmico (febre, mal-estar) com nível abaixo de sistêmica. A API continua aceitando qualquer combinação.
4. **Vocabulário atual aceito** (sinais, bordas, tipo de exsudato) como está no ADR-062. Mudar a lista é decisão futura, com novo ADR.

## Consequências

- Sem migração: o alerta é calculado na leitura, a partir da última avaliação.
- A fila de triagem continua na mesma ordem; o selo é só visual.
- Os agrupamentos de sinais (locais, de disseminação, sistêmicos) vivem em `src/domain/clinical/wound-time.ts` e são a fonte das regras de aviso.
