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

## Errata (2026-10-31, PR 2 da #552: gravações em Server Actions)

O PR 2 troca as gravações da ficha de `apiFetch` para Server Actions (`defineAction`, ADR-069 § 2 e ADR-075); a decisão 5 acima passa a valer assim:

1. **Quatro arquivos de ações por assunto**, em `src/app/(staff)/pacientes/[id]/actions/`: `cadastro.ts` (anamnese, responsável e vínculo do responsável), `prontuario.ts` (condição, avaliação seriada, resolver condição, evolução), `plano-cuidados.ts` (abrir e resolver o plano, diagnóstico, resultado, intervenção, execução e avaliação do resultado) e `consentimento.ts` (consentimento do parceiro em papel e revogação). Os `zod` são os mesmos das rotas (`src/lib/patient-record-schemas.ts`, `src/lib/guardian-schema.ts`): uma validação, duas portas.
2. **Papel e R4 em `authorize`.** Cada ação usa a mesma matriz de papéis da rota (`canRoleAccess`) e roda o R4 antes de abrir a transação: Profissional sem vínculo = 404, recurso de outra empresa = 404 (`src/lib/server/ficha-authorization.ts`). Responsável continua só com Admin e Atendente; consentimento em papel só com Admin e Atendente (#310).
3. **Gravação e trilha na mesma transação.** O `TransactionScope` ganhou os repositórios da ficha (anamnese, evolução, avaliação, consentimento do parceiro, plano de cuidados e filhos, catálogos de enfermagem). Se a trilha falha, nada fica gravado e a tela não atualiza. O `patientId` do evento dos recursos filhos (diagnóstico, resultado, intervenção, execução, avaliação) vem do plano lido na transação, nunca do corpo.
4. **Mudanças de comportamento aceitas:** (a) a evolução de Profissional grava o vínculo com o paciente na mesma transação (antes era best-effort depois da nota; agora, se o vínculo falha, a nota também não fica); (b) o consentimento em papel já ativo, que antes não gravava evento, agora grava um evento `update` dizendo que nada foi gravado, porque a ação auditada sempre devolve um evento; (c) a vinculação do responsável ao paciente é uma ação própria (`linkPatientGuardian`) que audita sempre, e não mais um `PUT` genérico do paciente que só auditava com `guardianId`.
5. **Sessão expirada.** Ação sem sessão responde `Não autenticado`; `unwrapAction` leva ao login com a rota em `next` e lança o mesmo `ApiError` 401 que o `apiFetch` lançava, então o rascunho da anamnese e da evolução continua sendo guardado (#207).
6. **Fora das ações:** o envio de foto continua Route Handler (multipart), e a leitura das avaliações ao expandir uma condição continua `GET` sob demanda.
7. **JS da carga (#615).** As abas Condições, Evoluções e Plano de cuidados passam a `next/dynamic`: só descem quando abertas. `/pacientes/[id]` em produção, 1280 px: 253,5 KB gz antes do PR, 254,6 KB com as ações e 240,0 KB com o carregamento sob demanda. A meta de 215 KB **não foi atingida**: o restante é a casca compartilhada com as outras rotas (React, Next, `@still-void/ui`) e a aba Anamnese; fica como pergunta aberta para a #559.
