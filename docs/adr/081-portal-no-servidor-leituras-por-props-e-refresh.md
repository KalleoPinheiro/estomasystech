---
title: "ADR 081 — Portal do paciente no servidor: leituras por props, `router.refresh()` e sem salto de layout"
status: living
audience: [dev, agent, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-31
related:
  - docs/adr/069-performance-front-linha-de-base.md
  - docs/adr/074-fundacao-server-first-sessao-dados-e-acoes.md
  - docs/adr/075-papel-por-tela-no-servidor-e-auditoria-na-mesma-transacao.md
  - docs/domains/portal/README.md
---

# ADR 081 — Portal do paciente no servidor: leituras por props, `router.refresh()` e sem salto de layout

- **Data:** 2026-10-31
- **Status:** aceito (decisão do orquestrador como PO e arquiteto, issue [#553](https://github.com/KalleoPinheiro/estomasystech/issues/553), PR 1). Aplica o [ADR-074](074-fundacao-server-first-sessao-dados-e-acoes.md) ao portal.
- **Domínios afetados:** portal.

## Contexto

`/portal` era uma página `'use client'` que buscava o papel (`/api/portal/me`) e depois, em cascata, o paciente, dois termos, a lista de espera, os pedidos do titular e o consentimento do parceiro. No celular, entre o esqueleto de carregamento e a tela pronta, o conteúdo trocava de forma duas vezes: CLS de 0,26 (360 px) e 0,33 (390 px), no lugar onde o paciente mais usa o sistema.

## Decisão

1. **O papel vem da sessão no servidor.** `page.tsx` é Server Component: `requireSignedInPage({ next: '/portal' })` (sessão ausente ou vencida vira `/login?error=session_expired`, a mesma mensagem de antes) escolhe a visão do paciente, do responsável ou do parceiro. A equipe da clínica continua vendo o cartão «Ir para o sistema da clínica». `GET /api/portal/me` fica para integrações.
2. **Uma função de dados por leitura, dividida com a rota.** `src/lib/server/data/portal.ts` guarda a regra de `GET /api/portal/{patient,partner,guardian/patients,patient/consent,patient/waitlist,patient/data-requests,patient/partner-consent}`; as rotas passam a chamar a mesma função (ADR-074 § 3). O escopo é o da sessão (`sessionScope`), nada vai para cache compartilhado (ADR-069), e **a leitura do titular continua auditada** (`recordAudit` de `portal-patient` e `portal-partner` mora na função, porque o acesso do titular a dado de saúde é evento LGPD).
3. **Leituras auxiliares falham sozinhas.** `loadPatientPortalView` lê em paralelo o portal, os dois termos e a lista de espera, com `loadBlock` por bloco auxiliar; pedidos do titular e consentimento do parceiro só são lidos para quem decide (o responsável de adulto não vê esses blocos e nem dispara a leitura que a rota negaria com 403).
4. **As telas recebem props e não buscam.** `PatientPortalView`, `GuardianPortalView`, `PartnerPortalView`, `DataRights`, `PartnerConsentSection` e `MyWaitlist` não usam `useApiQuery`. O instante que separa consulta futura de passada (`nowMs`) é o da renderização no servidor e vai como prop, igual no servidor e na hidratação. O fuso é o da clínica (ADR-073).
5. **Gravações continuam por `/api` e a tela se refaz por `router.refresh()`.** `usePortalRefresh` (`use-portal-refresh.ts`) chama `router.refresh()` dentro de `startTransition`: a tela atual fica no lugar até a nova chegar. As Server Actions do portal (aceite e revogação de termo, cancelar, sair da lista de espera, pedido do titular, acesso do responsável, «agir em nome de») ficam para o PR 2, com auditoria na mesma transação (ADR-075). **Continuam Route Handler**: auto-agendamento (`schedule-return`, `slots`), entrada na lista de espera, upload de foto e exportação, pelo limite estrito do Traefik e por serem arquivo.
6. **Rodapé de versão no servidor.** `layout.tsx` lê `getAppVersion()` e passa `initial` ao `ReleaseVersion`: sem `fetch` de `/api/portal/version` na carga.
7. **Sem salto de layout.** A tela chega inteira no HTML (aviso de urgência fixo no layout, PORT-05, mais o conteúdo do papel). Não há mais estado intermediário entre o esqueleto e o conteúdo, que era a origem do CLS. O layout (aviso de urgência, privacidade, versão) chega antes do conteúdo; o único elemento visível que mudava de lugar era o rodapé, que descia quando o conteúdo entrava (CLS 0,066 na primeira medição). `loading.tsx` ocupa a altura de uma tela (`min-h-svh`), o rodapé nasce abaixo da dobra e o salto some. Medido com CPU 4x em 360 e 390 px, 2x em 768 px e 1x em 1280 px (`e2e/server-first-portal.spec.ts`): 0 chamadas de `/api` e CLS < 0,05.

## Alternativas

- **`Suspense` por seção:** mostraria o conteúdo aos poucos, mas cada seção que chega empurra a seguinte; o dado é leve e lido em paralelo, então uma resposta só é mais estável.
- **Fixar alturas dos blocos:** reduziria o salto, mas manteria a cascata de chamadas e o esqueleto trocado por conteúdo.
- **Cache do portal por paciente:** proibido pelo ADR-069 (dado de saúde em cache compartilhado).

## Consequências

- A carga do portal não chama `/api` (fora fotos autenticadas); a leitura auditada do titular continua gravada.
- Paciente A nunca lê o B: o paciente sai da sessão (e-mail dentro da empresa), o responsável só do vínculo ativo (`patients.guardian_id`) revalidado a cada leitura, o parceiro só dos indicados por ele. Nenhuma função de dados do portal aceita identificador vindo do cliente.
- Pergunta aberta (PO): nenhuma nova. As regras de negócio do portal não mudaram.

## Atualização — PR 2a (atos de LGPD como Server Action)

A decisão 5 foi cumprida em duas entregas (divisão aprovada pelo coordenador em 2026-10-31): o **PR 2a** leva os atos de LGPD e o **PR 2b** (próximo) leva cancelar consulta, sair da lista de espera, encerrar o acesso do responsável e «agir em nome de».

- **Ações do PR 2a** (`src/app/portal/actions.ts`, `defineAction` com papéis paciente e responsável): `acceptConsent` e `revokeConsent` (os dois termos), `acceptPartnerConsent` e `revokePartnerConsent`, `openDataRequest`. Cada uma grava e **audita na mesma transação** (ADR-075): sem trilha, o ato não existe. As rotas `POST /api/portal/patient/{consent,consent/revoke,partner-consent,partner-consent/revoke,data-requests}` seguem para integrações, com a mesma regra.
- **`TransactionScope`** ganha `consentRecords`, `partnerShareConsents`, `dataSubjectRequests` e `clinics`: tudo que o ato lê e grava vem do escopo da transação (usar o repositório de fora trava o PGlite).
- **IP de evidência** do aceite vem de `headers()` pela mesma derivação das rotas (`clientIpFromHeaders`, `TRUSTED_PROXY_HOPS`, último salto do proxy confiável); o corpo da ação nunca o traz.
- **Responsável**: a ação lê o cookie «agir em nome de» (`withActingPatient`) e o revalida contra o vínculo a cada chamada, como as rotas. Cookie de paciente de outro responsável não vale.
- **Repetição idempotente** (termo já aceito, parceiro já autorizado) não grava registro nem trilha: `audit` pode devolver `null` quando o handler nada gravou.
- **Pedido do titular**: o aviso aos Admins sai por `after()`, fora da transação já confirmada; falha no aviso nunca desfaz o pedido (#312). Se a trilha falhar depois do `after()` agendado, o pedido é desfeito e o aviso, que não leva o conteúdo, ainda pode sair.
- **Sessão expirada**: o proxy deixa o POST de Server Action sem sessão passar à ação, que responde «Não autenticado», e `unwrapAction` leva ao login com a rota em `next` (ADR-080, #552 PR 2; #207). As cinco ações do portal herdam isso sem código próprio; `server-first-portal.spec.ts` prova com o cookie apagado no portal do paciente.
- **Sem salto depois do aceite (CLS < 0,05)**: o cartão do termo muda de altura ao aceitar ou revogar, e a tela nova só chega depois da rede. O cartão troca no toque (estado local, desfeito se o servidor recusa) para o salto cair na janela de 500 ms da entrada do usuário; o dado do servidor depois só confirma. Medido em 360 e 390 px com CPU 4x e rede lenta: 0,19 antes, abaixo de 0,05 depois (`server-first-portal.spec.ts`).
- **Continua Route Handler**: auto-agendamento, entrada na lista de espera, foto, exportação (decisão 5, sem mudança).

