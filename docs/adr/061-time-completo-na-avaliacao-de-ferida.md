---
title: "ADR 061 — TIME completo na avaliação de ferida: vocabulário fechado e colunas aditivas"
status: frozen
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-22
related: [docs/domains/pacientes-prontuario/README.md, docs/adr/006-chave-de-dados-clinicos.md]
---

# ADR 061 — TIME completo na avaliação de ferida: vocabulário fechado e colunas aditivas

- **Data:** 2026-10-22
- **Status:** aceito (decisão do orquestrador como Product Owner, mandato de @KalleoPinheiro de 2026-10-21; vocabulário a validar com o enfermeiro estomaterapeuta).
- **Domínios afetados:** pacientes-prontuario

## Contexto

O QA da staging v0.2.0 ([#464](https://github.com/KalleoPinheiro/estomasystech/issues/464)) mostrou que a avaliação de ferida só registrava medidas, tecido predominante, exsudato (quantidade) e dor. Faltavam **I**nfecção/Inflamação e **B**ordas/epitelização do protocolo TIME, e o tecido era um valor único, sem percentual. O PUSH não substitui o TIME: ele não orienta troca de cobertura nem encaminhamento.

## Decisão

Acrescentar à avaliação (`condition_assessments`) **oito colunas nulas** (migração `0069`, aditiva, sem tocar dado existente):

| Eixo TIME | Campo | Vocabulário |
| --- | --- | --- |
| Infecção/Inflamação | `infection_level` | contínuo de infecção da IWII: `none`, `inflammation`, `local`, `spreading`, `systemic` |
| Infecção/Inflamação | `infection_signs` (CSV) | locais (eritema, calor, edema, aumento do exsudato, exsudato purulento, odor fétido, dor local nova, granulação friável, cicatrização estagnada, suspeita de biofilme) e de disseminação/sistêmicos (eritema em expansão, linfangite, linfadenopatia, febre, mal-estar) |
| Bordas/epitelização | `wound_edges` | `attached`, `detached`, `rolled` (epíbole), `macerated`, `undermined`, `hyperkeratotic`, `epithelializing` |
| Umidade | `exudate_type` | `serous`, `serosanguineous`, `sanguineous`, `purulent` (a quantidade segue em `exudate`) |
| Tecido | `granulation_pct`, `epithelial_pct`, `slough_pct`, `necrotic_pct` | inteiros 0–100, soma ≤ 100 |

Escolhas:

- **Lista fechada com código em inglês e rótulo em pt-BR** (`src/lib/format.ts`), como `exudate`; o mesmo padrão de `complication_codes`. Bordas é **valor único** (a escolha mais simples para a tela e para o histórico); sinais de infecção é múltipla escolha.
- **Validação no domínio** (`src/domain/clinical/wound-time.ts`) e `CHECK` no banco para nível, bordas, tipo de exsudato e percentuais. Nenhum campo é obrigatório: avaliação antiga e avaliação rápida continuam válidas.
- **Sem regra cruzada** entre nível e sinais (por exemplo "sem infecção" com sinais marcados): a combinação é juízo clínico, não regra do sistema. Fica como pergunta aberta.
- **PUSH inalterado**: continua calculado de área, exsudato (quantidade) e tecido predominante. Os percentuais não alteram o PUSH.
- **Pele perilesional** reaproveita `skin_condition` (já cifrado, PRO-RN-12) com o rótulo "Pele perilesional" na ferida; "Pele periestomal" na estomia.
- **Portal e parceiro**: os DTOs de allowlist não mudam; infecção e bordas não vão ao paciente nem ao parceiro por enquanto.

## Consequências

- Linhas anteriores à `0069` ficam com os campos nulos e a tela mostra "—".
- A tabela de avaliações e o relatório imprimível ganham a coluna "Infecção / Bordas"; o perfil de tecido em % aparece sob "Tecido" e o tipo de exsudato sob "Exsudato".
- O seed de homologação grava TIME nas avaliações novas; a massa pesada só nasce em banco vazio (ADR-059), então a staging só mostra isso em banco novo.
- Os campos novos são códigos, não texto livre: não entram na cifra (PRO-RN-12) e sobrevivem à anonimização (PRO-RN-15), como as demais medidas.

## Perguntas abertas (para o estomaterapeuta, não são requisito)

1. O vocabulário de sinais e de bordas cobre a prática da clínica? Falta algo (por exemplo tunelização, calosidade, "bordas elevadas")?
2. Infecção local, com disseminação ou sistêmica deve gerar alerta no painel "Hoje" ou no cabeçalho do prontuário?
3. O percentual de tecido deve substituir o "tecido predominante" no PUSH, ou o predominante continua escolhido pelo profissional?
4. A combinação nível × sinais deve ser conferida pelo sistema?
