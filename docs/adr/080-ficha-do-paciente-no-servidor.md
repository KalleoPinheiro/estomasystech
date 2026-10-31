---
title: "ADR 080 — Ficha do paciente no servidor: uma leitura por seção, por papel, e a aba na URL sem reler"
status: living
audience: [dev, agent, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-31
related:
  - docs/adr/074-fundacao-server-first-sessao-dados-e-acoes.md
  - docs/adr/069-dados-no-servidor-e-politica-de-cache.md
  - docs/domains/pacientes-prontuario/README.md
---

# ADR 080 — Ficha do paciente no servidor: uma leitura por seção, por papel, e a aba na URL sem reler

- **Data:** 2026-10-31
- **Status:** aceito (decisão do orquestrador como PO e arquiteto, issue [#552](https://github.com/KalleoPinheiro/estomasystech/issues/552), épico [#541](https://github.com/KalleoPinheiro/estomasystech/issues/541)). Aplica o [ADR-074](074-fundacao-server-first-sessao-dados-e-acoes.md) à ficha do paciente; este é o PR de leituras, o das gravações em Server Actions acrescenta uma seção ao final.
- **Domínios afetados:** pacientes-prontuário.

## Contexto

`/pacientes/[id]` era a rota mais pesada da equipe: `'use client'`, 239 KB de JS e uma cascata de chamadas `/api` depois da hidratação (paciente, anamnese, condições, evoluções, planos, pacotes, consentimento do parceiro e a lista de profissionais para o nome do autor). O paciente via o cabeçalho pronto e o resto chegava aos pedaços.

## Decisão

1. **A página é Server Component e lê tudo em paralelo.** `page.tsx` valida a sessão (`requireStaffPageFor('/pacientes')`), lê o `?aba=` e dispara as leituras de `src/lib/server/data/patient-record.ts` com `loadBlock`; o corpo antigo da página vira `patient-record-client.tsx`, que recebe tudo por props. Sem `/api` na carga. Não há `<Suspense>` por seção: as leituras são do mesmo banco e voltam juntas, e o `loading.tsx` do grupo cobre a espera. Seção com falha vira alerta com «Tentar novamente» na própria aba, sem derrubar a ficha.
2. **Cada leitura só roda para o papel que usa a aba.** A mesma matriz da API (`canRoleAccess`, #199): a recepção não dispara nenhuma leitura clínica. O Profissional lê o saldo de pacotes sem preço (AD-027); o Admin lê com valor. A permissão de exportar a ficha (LGPD) também é decidida no servidor e chega como `canExport`.
3. **Uma função de dados, duas entradas.** As rotas `GET /api/patients/[id]` e suas filhas passam a chamar a mesma função da página, sem duplicar a regra. O R4 do Profissional (sem vínculo = **404**, igual a paciente de outra clínica) e a **leitura auditada** (`read` em `patient`, `anamnesis`, `conditions`, `evolutions`, `care_plans`) continuam dentro da função: ler dado de saúde é evento LGPD, venha pela rota ou pela página.
4. **Trocar de aba não relê o servidor.** A aba ativa é estado do cliente; a URL é atualizada por `window.history.replaceState` (o Next sincroniza `useSearchParams`). `router.replace` pediria ao servidor a ficha inteira de novo e gravaria seis leituras na trilha a cada clique.
5. **Gravar relê.** Depois de uma gravação (ainda por `apiFetch`, até o PR de Server Actions) a tela chama `router.refresh()`: o estado local deixou de ser a fonte da verdade.
6. **O gráfico de cicatrização sai do JS da carga.** `next/dynamic` com reserva de altura; só é baixado ao abrir uma condição.

## Alternativas

- **`<Suspense>` por seção**: o ADR-074 prefere um só acima da dobra; as leituras são curtas e juntas, e cada fronteira a mais é um risco de salto de layout.
- **Ler só a aba aberta**: a contagem nos rótulos das abas (condições, evoluções, planos) precisa das listas, e trocar de aba exigiria nova ida ao servidor.
- **Manter `router.replace` para a aba**: simples, mas multiplica leituras e eventos de auditoria por clique.

## Consequências

- A ficha chega pronta no HTML; a medição antes × depois está no PR.
- Cada abertura da ficha grava as leituras na trilha (como já gravava), e cada `router.refresh()` depois de uma gravação grava de novo.
- Dado de clínica nunca vai para cache compartilhado (ADR-069): as leituras são por requisição.
