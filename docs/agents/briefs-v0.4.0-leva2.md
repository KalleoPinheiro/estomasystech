---
title: "Briefs da leva 2 da v0.4.0"
status: living
audience: [agent, dev]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-31
---

# Briefs da leva 2 — release/v0.4.0

Planejado em 2026-10-26 sobre `origin/release/v0.4.0` @ `d7db229` (inclui #599, #600, #601, #602 e #607). Somente leitura: nenhum PR aberto, a release não foi tocada. Estado da cadeia em [`estado-v0.4.0.md`](estado-v0.4.0.md).

## Como usar

Cada brief vai inteiro no prompt da thread, junto com os anexos de sempre (a autonomia total e o mandato descritos em [`coordenacao.md`](coordenacao.md)). Todo brief herda o **bloco comum** abaixo e não o repete.

### Bloco comum (vale para os 8)

- **Fluxo ADR-052.** `git fetch origin && git switch -c <tipo>/<slug> origin/release/v0.4.0`. PR squash com base `release/v0.4.0`, `## Homologação` (Seed + cenários Dado/Quando/Então, ou `n/a — <motivo>`), changeset (`npm run changeset`; `--empty` se nada muda para a clínica), handoff da issue em `.specs/archive/handoff-2026.md`. Sem recibo do `gate:local` no PR de feat; o gate local roda no WSL pela thread do PC (um por vez).
- **Padrão server first** (ADR-069, ADR-074, ADR-075): página é Server Component; guarda por `requireStaffPageFor(href)` / `requirePortalPage()`; dado por `src/lib/server/data/*` devolvendo DTO, em `loadBlock` por bloco (único, `src/lib/server/data/load-block.ts`); um só `<Suspense>` acima da dobra; escrita por `defineAction` com `audit` na mesma transação (`tx.*`; `getRepositories` dentro do handler auditado é proibido); a página sai de `scripts/server-first-allowlist.json` (a lista só encolhe); `loading.tsx`/`error.tsx`/`forbidden.tsx` do grupo já existem.
- **Proibições.** Nenhum dado de clínica/paciente em cache compartilhado (ADR-069); sem `cacheComponents`/PPR; imagem autenticada sempre `unoptimized`; rota com limite estrito do Traefik continua Route Handler; nada de `biome-ignore` sem motivo; função ≤ 120 linhas, `.tsx` ≤ 320, cognitiva ≤ 10.
- **Testes.** Regra 8. Teste pré-patch: o teste que prova o comportamento novo é escrito e visto falhar **antes** do código. Troca de harness de teste de página existente (de `useApiQuery` simulado para página de servidor com a camada de dados simulada) é `TESTE-ALTERADO` com tabela de paridade (cenário × asserção preservada), como nos PRs #596, #601 e #600. Cobertura 100% nas camadas, piso 90% global. Rollback da auditoria provado em `npm run test:integracao` (Postgres real) com **arquivo novo** `tests/integracao/<slug>-auditoria-transacional.integracao.ts`.
- **Medição.** Régua `linha-base.spec.ts` (régua de performance guardada no projeto no claude.ai; recriar a partir do ADR-074 se ausente) (copiar para `e2e/`, rodar com `playwright.prod.config.ts`, apagar). Colar no PR a tabela antes × depois: chamadas `/api` na carga, FCP, LCP, CLS, JS gz, dados prontos, nas larguras 360/390/768/1280 (CPU 4x, 1,6 Mbps). **Mobile first.** Hidratação e CSP sem erro novo (`console-limpo`).
- **Validação.** the-judge na thread de implementação; validação em **thread nova, contexto limpo** (Playwright no build local com seed, 4 larguras); quem edita não aprova. Falha vira issue com evidência, correção em outra thread.
- **Conflitos conhecidos (custaram gates).** Antes de rodar o gate e de marcar pronto, a thread faz `git merge origin/release/v0.4.0` e confere conflito. Os arquivos quentes são: (1) `.specs/archive/handoff-2026.md` (todo PR acrescenta ao fim: escrever a entrada só no último commit, depois do merge da release); (2) `scripts/server-first-allowlist.json` (remover só as próprias linhas); (3) `src/application/ports/transaction-manager.ts` + o gerenciador Drizzle (`TransactionScope`): quem precisa de repositório novo na transação acrescenta **uma linha** e avisa na descrição; (4) `src/lib/dto.ts`; (5) `docs/adr/` (números reservados abaixo).
- **ADR reservados nesta leva** (evita colisão de número; se não usar, não ocupa): 079 = #603, 080 = #552, 081 = #553, 082 = #546, 083 = #556. ADR não se edita; erro de ADR anterior vai em Errata, como o ADR-075.

---

## Brief 1 — #603 + #605: R4 e paciente alheio nas ações de consulta (um PR)

- **Branch/PR:** `fix/agenda-r4-acoes-de-consulta`, fecha #603 e #605 (fechar à mão depois: GitHub não fecha por merge na release).
- **Domínio:** agenda (+ acesso na doc). **Tam.:** P/M. **Prioridade:** alta (R4 é regra de LGPD; #605 suja a trilha).
- **Por que um PR só:** as duas mexem em `agenda-actions.ts` e nas mesmas rotas; separar custaria dois gates e um conflito certo.

### Objetivo
(a) O Profissional só age sobre consulta de paciente vinculado a ele; (b) o Profissional só agenda em seu próprio nome; (c) a série semanal com paciente inexistente ou de outra clínica falha como o agendamento avulso, sem auditar.

### Decisões já tomadas
1. **Confirmar, concluir, cancelar e marcar falta:** Profissional sem vínculo = **403** («Profissional só pode registrar para pacientes vinculados a ele», mesma mensagem de `assertPatientLinkedForProfessionalWrite`); consulta inexistente ou de outra clínica = **404** (o repositório escopado não a enxerga). Papéis que não são `profissional` passam direto. Decisão de PO do #603 (2026-10-25).
2. **Remarcar** entra na mesma regra (é ato sobre a consulta; deixar de fora recriaria o buraco). Decisão do planejamento; o coordenador pode vetar.
3. **Agendar e série (`schedule`, `recurring`), Profissional:** `professionalId` informado e diferente de `session.professionalId` = **403** («Profissional só pode agendar em seu próprio nome»). Hoje a ação concede vínculo ao *outro* profissional (`ensureLinkBestEffort`) a partir do ato de quem não é ele. `professionalId` ausente continua permitido (consulta sem profissional) e o vínculo por agendar com o próprio id continua sendo como o Profissional ganha paciente novo (RBAC-19/20). **Não** exigir vínculo prévio para agendar: isso impediria o Profissional de pegar paciente novo e é regra de produto que ninguém decidiu (regra 5). Registrar como pergunta aberta na doc.
4. **#605:** `ScheduleAppointment` ganha `assertPatient(patientId)` (paciente existe na empresa; inativo = `ValidationError`, como no avulso) e `ScheduleRecurringAppointments.execute` o chama **antes** do laço, ao lado de `assertProfessional`. Isso corrige a ação e a rota `POST /api/appointments/recurring`. Efeito de contrato (declarar no PR e na doc): série com paciente inexistente passa de `200` com tudo pulado para `404` («Paciente não encontrado(a)»). Paciente válido com tudo pulado por conflito segue `success` e audita com paciente real. A auditoria da série deixa de usar `resourceType: 'patient'` como fallback: sem sessão criada, `resourceType: 'appointment'` não se aplica, então fica `patient` com o paciente **validado**.
5. **Um só lugar para a regra:** `src/lib/server/appointment-authorization.ts` (`import 'server-only'`) com `authorizeAppointmentAct(session, scope, appointmentId)` (acha a consulta no escopo → `NotFoundError`; depois `assertPatientLinkedForProfessionalWrite`) e `assertProfessionalActsAsSelf(session, professionalId)`. A Server Action usa por `authorize:` do `defineAction` e a rota por chamada direta, igual ao padrão de `src/lib/server/follow-up-resolution.ts` (#597). Mesma regra nas duas entradas, sem duplicar.
6. A tentativa negada não grava mudança nem evento de auditoria (a guarda roda antes da transação).

### Arquivos tocados
`src/app/(staff)/agenda/agenda-actions.ts`; `src/app/api/appointments/[id]/route.ts`, `…/route.ts` (POST) e `…/recurring/route.ts`; **novo** `src/lib/server/appointment-authorization.ts`; `src/application/appointments/schedule-appointment.ts` e `schedule-recurring-appointments.ts`; docs `docs/domains/agenda/README.md` + `excecoes.md`, `docs/domains/acesso/README.md` (tabela R4); **novo** `docs/adr/079-r4-nas-acoes-de-consulta.md` (resolve a «pergunta aberta (PO)» do ADR-078; Errata de uma linha no ADR-078 apontando para ele); changeset (patch); handoff.
Testes novos (antes do patch): `tests/api/appointment-actions-r4-603.test.ts` (rota: 403/404 para as 4 + remarcar + `professionalId` alheio), `tests/app/agenda-actions-r4.test.ts` (ação: os mesmos casos, mais «paciente de outra clínica = 404»), `tests/application/schedule-recurring-patient-605.test.ts` (Given/When/Then, paciente inexistente, de outra empresa e inativo), `tests/integracao/agenda-r4-auditoria.integracao.ts` (negada não deixa evento nem mudança, em Postgres real). Os testes existentes de `agenda-actions.test.ts` e `appointment-tenant-isolation.test.ts` ficam intocados; se algum contrato mudar de verdade (série com paciente inexistente deixa de ser `200`), é `TESTE-ALTERADO` com o motivo.

### Pronto quando
- 403 sem vínculo e 404 de outra clínica provados nas 5 ações (confirmar, concluir, cancelar, falta, remarcar), na rota e na Server Action (10 testes + 2 de `professionalId`).
- `recurring` com `patientId: "nao-existe"` e com paciente da clínica A pela clínica B: `success: false` «Paciente não encontrado(a)», **0 evento de auditoria novo** (assert em `audit_events`).
- Evidência de o resultado do QA da #602 (guardado no projeto no claude.ai) reproduzida limpa: a trilha da clínica B não ganha `patient|<id da A>|série semanal…`.
- Specs verdes sem alteração: `agenda*.spec.ts`, `follow-up*`; cobertura 100% em application; `test:mutacao -- --mutate` nos dois arquivos de application, break 85.
- Sem queda de métrica da agenda (sem mudança de UI esperada; colar CLS e dados prontos de 360 só para provar que não regrediu).

### Dependências
Nenhuma aberta (#551 mergeado). **Bloqueia #556** (mesmo domínio, não rodam juntas). Não mexe em allowlist nem em `TransactionScope`: não conflita com as outras duas threads da leva.

---

## Brief 2 — #552: Ficha do paciente com dados no servidor (G, 2 PRs)

- **Branches/PRs:** `feat/ficha-paciente-servidor-leitura` (PR 1) e `feat/ficha-paciente-servidor-acoes` (PR 2, só depois do merge do 1). Como a agenda (#601, #602).
- **Domínio:** pacientes-prontuário. **ADR reservado:** 080.

### Objetivo
Tirar da `/pacientes/[id]` a cascata de 8 chamadas `/api` e o `'use client'` da página; as mutações clínicas viram Server Actions com auditoria transacional e R4.

### Decisões já tomadas
1. **Passo 0 (antes de codar):** rodar a régua na release e listar as 8 chamadas reais; cada uma vira uma função em `src/lib/server/data/` (nova, ex.: `patient-record.ts`; `patients.ts` de #549 já tem o R4 de lista). O Profissional sem vínculo recebe **404** na leitura (padrão de `assertPatientAccessibleToProfessional`, que já vale).
2. **PR 1 (leitura):** `page.tsx` Server Component com `requireStaffPageFor('/pacientes')` e `loadBlock` por seção, cada seção atrás de `<Suspense>` **só se couber** na regra «um Suspense único acima da dobra»: cabeçalho, anamnese e condições vêm no primeiro fluxo; plano de cuidados e pacotes, que ficam abaixo da dobra, podem ter Suspense próprio com fallback de **altura fixa** (CLS < 0,05 com dado real). As mutações seguem por `apiFetch` e chamam `router.refresh()` para reler o servidor (o estado local da ficha deixa de ser a fonte da verdade). Gráfico de cicatrização (`healing-chart.tsx`) por `next/dynamic` com fallback de tamanho fixo. `<a>` internos para `Link`; os de nova aba ficam com comentário.
3. **PR 2 (ações):** 21 mutações em `src/app/(staff)/pacientes/[id]/*-actions.ts` por `defineAction`, agrupadas por agregado (paciente/anamnese, condição/avaliação TIME, plano de cuidados/desfechos/intervenções, responsáveis e consentimento de parceiro). Cada uma tem `authorize` com `assertClinicalResourceAccessible` (como `decideTriage`), `audit` na mesma transação e os mesmos papéis da rota. `TransactionScope` hoje não tem avaliações, plano de cuidados, anamnese nem consentimento de parceiro: os que faltarem entram com **uma linha** cada, avisando na descrição. Upload de foto segue Route Handler.
4. **Clínica:** as regras já decididas valem sem mudança (ADR-062: infecção local ou pior gera alerta na triagem; percentual de tecido fora do PUSH; coerência nível × sinais vira aviso). Esta tarefa **não** altera regra clínica nem texto de protocolo TIME.
5. Quebrar `care-plans-section.tsx` (1 119 linhas) e `conditions-section.tsx` (907) em componentes por seção: regra 4 (função ≤ 320 linhas em `.tsx`).

### Arquivos tocados
`src/app/(staff)/pacientes/[id]/**`; novos `src/lib/server/data/patient-record.ts` (e vizinhos); `scripts/server-first-allowlist.json` (remove `pacientes/[id]`); `src/lib/dto.ts` (só se faltar DTO); `TransactionScope` (PR 2); docs `docs/domains/pacientes-prontuario/`; ADR-080; changesets; handoff. Testes de página que trocam de harness (`TESTE-ALTERADO` com tabela de paridade): `staff-paciente-detail`, `staff-paciente-care-plans`, `patient-record-role`, `guardian-panel`, `avaliacao-time-form`, `patient-draft-recovery`, `partner-consent` em `tests/pages/`. Testes novos: `tests/app/ficha-actions*.test.ts` (papéis, R4, zod), `tests/integracao/ficha-auditoria-transacional.integracao.ts`.

### Pronto quando
- PR 1: 0 chamadas `/api` na carga (salvo fotos); sem `'use client'` na página; dados prontos 360 ≤ FCP + 300 ms (hoje 3 199 ms); LCP 360 ≤ 2,5 s; CLS ≤ 0,1 (meta interna < 0,05); **JS gz ≤ 215 KB** (hoje 239 KB); R4 do Profissional preservado (404 sem vínculo) com teste.
- PR 2: 21 mutações por ação, 0 por `apiFetch` (fora upload); cada ação prova papel, R4, `zod` e rollback da trilha em Postgres real para ao menos uma ação de cada agregado.
- Verdes sem edição: `clinico.spec.ts`, `plano-cuidados.spec.ts`, `mobile-prontuario-portal.spec.ts`, `export-lgpd.spec.ts`.
- Risco G: se o PR 1 passar de ~1 500 linhas, cortar por seção (cabeçalho+anamnese+condições, depois plano+pacotes), nunca por camada.

### Dependências
#549 (mergeado, #600). Sem dependência aberta. **Destrava** a medição da rota mais pesada para #559. Não roda junto com #603/#605 (outro domínio, ok) nem com #550/#556 (não toca equipe nem estoque). Conflito provável apenas em `TransactionScope` e handoff.

---

## Brief 3 — #553: Portal do paciente com dados no servidor (G)

- **Branch/PR:** `feat/portal-servidor` (pode virar 2 PRs: casca + paciente, depois responsável + parceiro). **Domínio:** portal. **ADR reservado:** 081.

### Objetivo
`/portal` renderiza no servidor para paciente, responsável e parceiro, sem a cascata de 8 chamadas e sem salto de layout (CLS 0,26 em 360 e 0,33 em 390 hoje). Aceite de termo e cancelamento por Server Action.

### Decisões já tomadas
1. **Papel no servidor:** `requirePortalPage()` (já existe em `session.ts`) substitui `GET /api/portal/me`; a página escolhe `PatientPortalView`, `GuardianPortalView` ou `PartnerPortalView` pelo papel da sessão. Sessão expirada vira o redirecionamento da guarda para `/login?error=session_expired` (hoje é o card «Sua sessão expirou»; preservar a mensagem como cenário do teste).
2. **Dados:** a regra de `GET /api/portal/patient`, `…/guardian` e `…/partner` vai para `src/lib/server/data/portal.ts` (a rota passa a chamar a mesma função, como em `buildSidebarIdentity`). **A leitura do titular continua auditada** (`recordAudit` na rota de hoje): a função de dados mantém a trilha de leitura, porque o acesso do titular a dado de saúde é evento LGPD. Escopo de empresa por `sessionScope`; nada em cache compartilhado.
3. **Ações** (`access: { kind: 'portal' }`): aceite de termo/consentimento (`consent`), cancelamento de consulta, saída da lista de espera, pedido do titular (`data-requests`), acesso de responsável (`guardian-access`) e «agir em nome de» (`guardian/acting-for`). Auditoria na mesma transação. **Continuam Route Handler**: autoagendamento (`schedule-return`, `slots`), entrada na lista de espera, upload de foto e exportação (`export`), pelo limite estrito do Traefik e por serem arquivo. `acting-for` mexe em cookie: a revisão deve provar que `cookies().set` funciona na ação e que o proxy/`readSession` leem o valor novo na próxima renderização; se não, esse item fica Route Handler e vira nota no ADR-081.
4. **Rodapé:** `ReleaseVersion` do layout do portal lê a versão no servidor (`src/lib/server/data/version.ts` já existe); sem `fetch` de `/api/portal/version` na carga.
5. **CLS:** o aviso de urgência fixo já está no layout (PORT-05). Cada bloco que hoje aparece depois do fetch reserva altura; medir em 360/390 com dado real do seed e CPU 4x.
6. Regras de negócio do portal **não mudam**: autoagendamento só retorno (decisão 2026-10-23), «Li e concordo» (#481), termos v3, mesmas mensagens. Pergunta aberta de produto, se surgir, vai como pergunta (regra 5).

### Arquivos tocados
`src/app/portal/**` (`page.tsx`, `patient-view.tsx` 552 linhas, `consent-card.tsx` 438, `guardian-view.tsx`, `partner-view.tsx`, `change-appointment.tsx`, `data-rights.tsx`, `waitlist.tsx`, `condition-progress.tsx`, `layout.tsx`); novo `src/lib/server/data/portal.ts` e `src/app/portal/portal-actions.ts`; rotas `src/app/api/portal/{me,patient,guardian,partner}/route.ts` (passam a chamar a função de dados); `scripts/server-first-allowlist.json` (remove `portal/page.tsx`); docs `docs/domains/portal/`; ADR-081; changeset; handoff. `TESTE-ALTERADO` (troca de harness, paridade): `portal`, `portal-guardian`, `portal-minor`, `portal-aceite-explicito`, `portal-change-appointment`, `partner-consent`, `portal-parceiro-sem-crm`, `data-subject-rights-ui`, `privacy-ui`, `waitlist-late-cancel-ui`, `minor-representative-rights`, `condition-progress-medicoes` em `tests/pages|components/`. Testes novos: `tests/app/portal-actions.test.ts` (papel, isolamento entre pacientes, responsável só do menor autorizado), `tests/integracao/portal-auditoria-transacional.integracao.ts`.

### Pronto quando
- Página sem `'use client'`; 0 chamadas `/api` na carga inicial (fora fotos); dados prontos 360 ≤ FCP + 300 ms (hoje 3 167 ms); LCP 360 ≤ 2,5 s (hoje 3 068 ms); **CLS ≤ 0,1 em 360 e 390** (meta interna < 0,05); JS gz < 223 KB.
- Isolamento provado: paciente A nunca lê o B; responsável sem acesso ativo recebe o mesmo bloqueio de hoje; parceiro não vê CRM (`portal-parceiro-sem-crm`).
- A trilha de leitura do titular continua gravada (teste).
- Verdes sem edição: `portal-*.spec.ts` e `acessibilidade-portal-plataforma.spec.ts`.

### Dependências
#542 e #517 (fechadas). Sem dependência aberta. Fora do domínio das outras duas; conflito provável só em `dto.ts`, handoff e allowlist (linhas distantes).

---

## Brief 4 — #604: testes instáveis sob carga (reset-password-flow, staging-rebuild)

- **Branch/PR:** `fix/testes-instaveis-sob-carga`. **Domínio:** qualidade de testes (sem `src/`). **Tam.:** P/M (a investigação decide).

### Objetivo
Achar e eliminar a causa; **não** mascarar. Regra 8 inteira: proibido `skip`, aumento de `timeout`/`retries`, afrouxar asserção.

### Decisões já tomadas
1. **Reproduzir antes de teorizar.** Rodar `npx vitest run tests/api/reset-password-flow.test.ts tests/scripts/staging-rebuild.test.ts` com a máquina ocupada (dois `npm run test:coverage` em paralelo, ou `stress-ng --cpu $(nproc)` / `taskset` limitando CPUs) em loop de 20 corridas, e capturar a **mensagem exata** de cada falha (timeout de 20 s do teste, de 30 s do hook, asserção, `ENOENT`, `index.lock`…). O relato diz «passa isolado», o que aponta para tempo, não para ordem.
2. **Hipóteses a confirmar ou descartar** (em ordem de custo): (a) `staging-rebuild`: cada `it` cria 2 repositórios e roda ~12 comandos `git` + `rebuild.sh` (um `spawnSync` bloqueante) dentro do orçamento de 20 s; sob carga o orçamento estoura. Reduzir o **trabalho** do teste, não o rigor: montar o repositório-modelo uma vez (`beforeAll`) e clonar por teste, `GIT_CONFIG_GLOBAL=/dev/null`, `GIT_CONFIG_NOSYSTEM=1`, `core.fsync=false`, `gc.auto=0`, `commit.gpgsign=false`, `GIT_TERMINAL_PROMPT=0` (um `gpgsign` ou hook do usuário no WSL custa segundos). (b) `reset-password-flow`: mesma família do #606, efeito assíncrono lido logo após a resposta (`after()` roda sem await em `tests/setup.ts`; e-mail é fire-and-forget; auditoria). Procurar leituras de `audit_events`/e-mails sem `vi.waitFor`, `vi.useFakeTimers()` não restaurado (`afterEach` com `vi.useRealTimers()`), e o contador de IP `freshIp` que colide com o limitador compartilhado. (c) custo de hash de senha sob carga contra o orçamento do teste.
3. **Correção por causa.** Esperar a condição (`vi.waitFor` sobre o efeito, que já é o padrão do #606/#607), isolar o recurso compartilhado, ou diminuir o trabalho da fixture. Se o teste mudar, `TESTE-ALTERADO: <motivo>` com cenário e asserção iguais.
4. Varrer o resto da suíte pelo **mesmo padrão** (leitura de efeito assíncrono sem espera) com `grep` de `after()`/`audit_events`/`spyOnSentEmails` e listar achados no PR; corrigir só o que reproduzir.

### Arquivos tocados
`tests/api/reset-password-flow.test.ts`, `tests/scripts/staging-rebuild.test.ts`, possivelmente `tests/support/*` e `scripts/staging/rebuild.sh` (só se a causa estiver no script); handoff; sem changeset de usuário (`--empty` se tocar `scripts/` fora de `src/`: confirmar com `check:changeset`).

### Pronto quando
- 30 corridas seguidas dos dois arquivos **sob a carga que antes falhava** sem falha (anexar o log), e a causa descrita no PR com a mensagem original.
- Um `npm run test:coverage` completo verde, sem `timeout`/`retries` alterados (`npm run check:testes` verde).
- Lista dos testes com o mesmo padrão encontrados e do que foi feito.

### Dependências
Nenhuma. Independente de código de produto: pode entrar em qualquer vaga. **Prioridade operacional:** cada flake custa um gate completo (~22 min) para todos os PRs seguintes.

---

## Brief 5 — #546: Documentos imprimíveis no servidor (M)

- **Branch/PR:** `feat/documentos-servidor`. **Domínio:** documentos (prontuário + financeiro). **ADR reservado:** 082.

### Objetivo
As 6 páginas `/documentos/{atestado,consentimento,plano-cuidados,recibo,relatorio,repasse}/…` renderizam inteiras no servidor; só o botão Imprimir e a emissão são ilhas de cliente.

### Decisões já tomadas
1. **Emissão não acontece no render.** Emitir grava (número do documento e auditoria) e Server Component não grava em GET: o render pode repetir e a pré-busca do Next o dispararia. A página renderiza o conteúdo, e a **ilha `IssueDocument`** chama a Server Action `issueDocument` uma vez ao montar (`defineAction`, `access: staff`, mesmas regras de `POST /api/documents/issue`, incluindo o `ResolveReceipt` do recibo, FIN-RN-15), com guarda `useRef` contra duplo disparo do modo estrito. O número e a data entram em espaço de **tamanho fixo** (CLS 0). Reimprimir devolve o mesmo registro (idempotência atual). A regra de emissão vai para uma função única em `src/lib/server/` usada pela rota e pela ação; a rota continua existindo.
2. **Guardas no servidor:** clínica incompleta (`isClinicInfoComplete`), consulta não realizada, recibo sem CPF/CNPJ, documento de outra clínica (404): tudo decidido antes de renderizar; página bloqueada **não** monta a ilha de emissão (preserva #468 e `documentos-bloqueado-sem-emissao`).
3. `DocumentFrame` (hoje `'use client'`) vira componente de servidor; o botão Imprimir sai para `print-button.tsx` (ilha). `clinic-info` ganha `src/lib/server/data/clinic-info.ts`, e `GET /api/clinic-info` passa a chamá-la.
4. **Pergunta aberta (registrar, não decidir):** a emissão hoje é «achar ou criar» sem restrição única; duas abas simultâneas podem criar dois eventos. Não corrigir aqui (mudaria modelo de dados); abrir issue com a evidência.
5. **Recibo/repasse** reaproveitam as funções de `invoices.ts` e `payouts.ts` do #547; não alterar regra de valor. O recibo e o repasse impressos têm que sair com os mesmos valores do seed antes e depois (teste de paridade).

### Arquivos tocados
`src/app/documentos/**` (6 páginas), `src/components/document-frame.tsx`, novo `print-button.tsx` e `issue-document.tsx`, `src/lib/use-document-issuance.ts` (substituído pela ilha), novos `src/lib/server/data/{clinic-info,documents}.ts`, `src/app/api/documents/issue/route.ts` e `src/app/api/clinic-info/route.ts` (passam a chamar a função única), `scripts/server-first-allowlist.json` (remove as 6 linhas de `documentos/`, bloco contíguo), docs `docs/domains/pacientes-prontuario/` e `financeiro/`, ADR-082. `TESTE-ALTERADO` (paridade): `documentos-bloqueado-sem-emissao`, `documentos-fail-closed`, `declaracao-comparecimento-condicoes`, `documento-repasse`, `consentimento-representante`, `invoice-payments-ui`, `receipt-cpf-routes`. Testes novos: `tests/app/document-issue-action.test.ts`, integração de rollback da emissão.

### Pronto quando
- As 6 páginas sem `'use client'`; 0 GET `/api` na carga (a emissão é Server Action).
- FCP 360 ≤ 1 s (hoje 2 956 ms); LCP 360 ≤ 1,5 s; CLS 0 (número/data em espaço fixo).
- Impressão (emulação `print`) igual à linha de base em captura de tela, nas 6 páginas.
- `documentos.spec.ts` verde sem edição; recibo sem CPF/CNPJ continua sem emitir.

### Dependências
#547 (mergeado). Domínio exclusivo; **não toca** `/faturamento` nem `src/app/(staff)/pacientes`. Conflito provável só em handoff e allowlist (bloco `documentos/` está longe dos outros).

---

## Brief 6 — #556: Materiais e procedimentos no servidor (M, 2 PRs sequenciais)

- **Branches/PRs:** `feat/materiais-servidor` e `feat/procedimentos-servidor`, nessa ordem (`procedimentos` lê `supplies` para o kit). **Domínio:** estoque + catálogo (agenda). **ADR reservado:** 083.

### Objetivo
`/materiais` (945 linhas) e `/procedimentos` (625) como Server Components por seção; cadastro, entrada, baixa e kits por Server Action.

### Decisões já tomadas
1. **Camada de dados já pronta em parte:** `supplies.ts` e `procedures.ts` existem; falta `insights` (`GET /api/supplies/insights`) e movimentos/lotes. Cada função vira DTO e a rota chama a mesma.
2. **Ações:** `createSupply`, `updateSupply`, `registerStockMovement` (entrada/baixa, com lote), `createProcedure`, `updateProcedure`, `setProcedureKit`. Auditoria na mesma transação; `TransactionScope` (`src/application/ports/transaction-manager.ts`) **não** tem `supplies`, `stockMovements`, `supplyBatches` nem `procedureKits` hoje (tem `procedures`, `professionals`, `partners`, `guardians`, `conditions` e `professionalPatientLinks`): acrescentar os quatro no mesmo PR, com teste do gerenciador Drizzle, e avisar na descrição (ponto quente com #552 e #553, que também acrescentam repositórios; quem mergeia depois faz `git merge origin/release/v0.4.0` e resolve a união das linhas). A baixa automática do kit na conclusão da consulta **não muda** (é best-effort pós-commit, ADR-078).
3. Quebrar as páginas por seção (regra 4). Sem mudança de regra de estoque ou de preço (regra 5).
4. CLS: hoje 0,09/0,19 em `/materiais`, 0,08/0,19 em `/procedimentos`; reservar altura de KPI e tabela.

### Arquivos tocados
`src/app/(staff)/materiais/**`, `src/app/(staff)/procedimentos/**`, `src/lib/server/data/{supplies,procedures}.ts` (+ insights), `scripts/server-first-allowlist.json` (2 linhas), docs `docs/domains/estoque/` e `agenda/` (catálogo), ADR-083, changesets, handoff. `TESTE-ALTERADO` (paridade): `staff-materiais`, `staff-procedimentos` em `tests/pages/`. Novos: `tests/app/{materiais,procedimentos}-actions.test.ts`, integração de rollback da baixa de estoque.

### Pronto quando
- Páginas sem `'use client'`; 0 chamadas `/api` na carga; dados prontos 360 ≤ FCP + 300 ms; LCP 360 ≤ 2,5 s; CLS ≤ 0,1 nas 4 larguras.
- Saldo e lote idênticos antes/depois para o mesmo seed (teste de paridade); rollback da baixa provado em Postgres real.
- `inventario.spec.ts`, `materiais-ficha.spec.ts`, `procedimentos-*.spec.ts` verdes sem edição.

### Dependências
**#551 mergeado, mas só inicia depois de #603+#605 mergeados** (mesmo domínio agenda/catálogo; regra «nunca duas no mesmo domínio»). Conflito provável com #550 em `scripts/server-first-allowlist.json` (linhas vizinhas `materiais`/`procedimentos`/`parceiros`/`profissionais`): por isso #550 e #556 **não** rodam juntas.

---

## Brief 7 — #550: Profissionais e parceiros no servidor (P)

- **Branch/PR:** `feat/equipe-parceiros-servidor`. **Domínio:** equipe-parceiros. Sem ADR novo (segue 074/075).

### Objetivo
`/profissionais` (388 linhas + `availability-form.tsx` 159) e `/parceiros` (355) em Server Components; cadastro, edição, ativar/desativar e disponibilidade por Server Action.

### Decisões já tomadas
1. `listProfessionalOptions` (sem comissão) já existe; a lista completa com comissão e a disponibilidade são funções novas em `professionals.ts`; `listPartnersFor` já existe (#549). A rota `GET /api/professionals` chama a mesma função.
2. Ações: `createProfessional`, `updateProfessional`, `setProfessionalActive`, `saveAvailability`, `createPartner`, `updatePartner`, `setPartnerActive`, papéis e `zod` da rota. **Comissão é dado financeiro:** só `company_admin` lê e grava, como hoje; teste de papel. Profissional não vê comissão de outro (regra atual preservada).
3. `<a>` de contato do parceiro (`wa.me`, `mailto:`) mantidos com comentário (exceção ADR-069).
4. `availability-form` segue ilha de cliente (formulário de grade) com `useAction`.

### Arquivos tocados
`src/app/(staff)/{profissionais,parceiros}/**`, `src/lib/server/data/{professionals,partners}.ts`, `scripts/server-first-allowlist.json` (2 linhas), docs `docs/domains/equipe-parceiros/`, changeset, handoff. `TESTE-ALTERADO`: `staff-operations`, `schedule-availability-ui` em `tests/pages/` (paridade). Novos: `tests/app/equipe-actions.test.ts`, integração de rollback.

### Pronto quando
- Páginas sem `'use client'`; 0 chamadas `/api` na carga inicial; dados prontos 360 ≤ FCP + 300 ms (hoje 2 825 e 2 651 ms); LCP 360 ≤ 2,5 s; CLS ≤ 0,1.
- `equipe.spec.ts`, `ficha-parceiros-profissionais.spec.ts`, `portal-parceiro.spec.ts` verdes sem edição.

### Dependências
Nenhuma. Não roda junto com #556 (allowlist). Boa candidata a preencher vaga curta.

---

## Brief 8 — Ordem das próximas depois da leva

Ver a proposta no final de [`estado-v0.4.0.md`](estado-v0.4.0.md): 1) #604 quando a primeira vaga abrir, 2) #556 (depois de #603+#605), 3) #546, 4) #550, e a cadeia de acesso em série (#595 → #554 → #555 → #557 → #558) em paralelo assim que #594 for validado na staging.
