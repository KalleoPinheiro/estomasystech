# Revisão pré-produção — lote P0 + P1

Profile: `light` (AGENTS.md não declara `tlc-implement`) · handoff: `off` nesta execução (build contínuo num
agente só; recuperação por releitura deste arquivo + diff após compactação).

Sources:

- [#187](https://github.com/KalleoPinheiro/vitta-flow/issues/187) - P0 constraint anti-double-booking sem `clinic_id`
- [#191](https://github.com/KalleoPinheiro/vitta-flow/issues/191) - P0 compose/Dockerfile inseguros
- [#192](https://github.com/KalleoPinheiro/vitta-flow/issues/192) - P1 pagamento em dobro + lost update de estoque
- [#193](https://github.com/KalleoPinheiro/vitta-flow/issues/193) - P1 `getDb` cacheia Promise rejeitada
- [#197](https://github.com/KalleoPinheiro/vitta-flow/issues/197) - P1 seletores de paciente limitados a 100
- [#198](https://github.com/KalleoPinheiro/vitta-flow/issues/198) - P1 abas do prontuário se sobrepõem no celular
- [#199](https://github.com/KalleoPinheiro/vitta-flow/issues/199) - P1 navegação/dashboard ignoram o papel
- [#200](https://github.com/KalleoPinheiro/vitta-flow/issues/200) - P1 autoria forjável no plano de cuidados
- [#201](https://github.com/KalleoPinheiro/vitta-flow/issues/201) - P1 rate limit só por IP
- [#202](https://github.com/KalleoPinheiro/vitta-flow/issues/202) - P1 logs com dado pessoal (DrizzleQueryError)
- [#203](https://github.com/KalleoPinheiro/vitta-flow/issues/203) - P1 CI sem build de produção nem Docker
- [#205](https://github.com/KalleoPinheiro/vitta-flow/issues/205) - P1 fuso horário implícito (fatia mínima)
- Mapa pai: [#183](https://github.com/KalleoPinheiro/vitta-flow/issues/183)
- Sem design de tela vinculante: #197/#198/#199 ajustam telas existentes

## Out of scope

- Issues P2/P3 do mesmo mapa (#207, #208, #209, #211, #219, #221, #224) - próximo lote, outro PR
- Fuso **por empresa** (#205) - decisão de produto, fica na issue mono × multiempresa
- Fuso explícito em `schedule-availability`, séries recorrentes, `/api/summary`, `/api/reports` (#205) - a
  checagem de boot (C27) garante `TZ do processo = APP_TIMEZONE` em produção; só a fatia mínima da issue entra
- Endpoint de saúde dedicado (#191) - issue de observabilidade; HEALTHCHECK usa `/api/auth/providers`
- Admin registrar SAE "em nome de" outro profissional (#200) - decisão de produto; até lá, negado (autoria = sessão)
- Request-id / error tracking (#202) - issue própria do mapa
- Paginação da tela de Pacientes (#197) - já pagina por cursor; a varredura só cobre seletores

## Landing

Toca migrações Drizzle, `db.ts`, `api-response.ts` + novo `src/lib/log-error.ts`, rotas SAE + `src/lib/auth/`,
fatura (use cases + repositório + rota), insumo (repositório), `proxy.ts`/`client-ip.ts`, domínio de agenda e
lembretes (fuso), Dockerfile/compose/CI, e as telas Agenda, Faturamento, Auditoria, Ficha, Dashboard, sidebar.
Reaproveita `TransactionManager`, `withTenant`, `isAllowedForRole`, `/api/auth/identity`, `/api/patients?search=`.

| One-way door | Literal shape | Alternative rejected |
| --- | --- | --- |
| Constraint de agenda (#187) | migração `0038`: `appointments_no_overlap EXCLUDE USING gist (clinic_id WITH =, COALESCE(professional_id,'*any*') WITH =, tstzrange(starts_at, ends_at_buffered) WITH &&) WHERE status IN ('scheduled','confirmed')` | sentinel por empresa no COALESCE (`'*any*:'||clinic_id`) - mistura dois conceitos numa coluna e não serve de prefixo de índice |
| Serialização de fatura (#192) | `InvoiceRepository.findByIdForUpdate(id)` (`SELECT … FOR UPDATE`) usado pelos 4 use cases; a rota roda a ação em `transactions.run`; `save` grava fatura + pagamentos numa transação | coluna `version` + 409 otimista - migração nova e o cliente teria de reenviar; o lock já rejeita o 2º pagamento pelo saldo |
| Estoque só por `adjustStock` (#192) | `DrizzleSupplyRepository.save` exclui `stockQty` do `ON CONFLICT DO UPDATE SET` | manter e reler antes de gravar - ainda janela TOCTOU |
| Porta do Postgres no compose (#191) | `"127.0.0.1:${POSTGRES_PORT:-5432}:5432"` | sem `ports:` - quebra a Via B do onboarding (`npm run dev` local contra o banco do compose); a issue aceita as duas |
| Chave do rate limit (#201) | autenticado: `acct:<clinicId|system>:<subject>`; anônimo: `ip:<ip>`; mesmo teto `API_RATE_LIMIT_MAX` (120/min) | teto por empresa - uma recepção ocupada derrubaria o consultório |
| Fuso da aplicação (#205) | env `APP_TIMEZONE` (default `America/Sao_Paulo`) lido por `src/domain/shared/time-zone.ts` (`appTimeZone`, `zonedParts`, `startOfZonedDay`, `zonedDateKey` via `Intl`); `src/instrumentation.ts` → `src/lib/app-timezone.ts` compara com o fuso do processo: `throw` em produção, `console.error` fora | só `TZ` - não dá para testar "processo UTC, clínica SP" sem mudar o fuso do processo inteiro |
| Log de erro (#202) | `logError(context, error)` em `src/lib/log-error.ts`; teste de arquitetura proíbe `console.error` em `src/` fora dele | regra Biome `noConsole` - não distingue o helper e exigiria `biome-ignore` no próprio helper |
| Autoria SAE (#200) | `resolveSessionProfessionalId` em `src/lib/auth/session-professional.ts`; campo `professionalId` sai do schema zod (chave desconhecida é descartada, valor nunca lido) | 400 quando o corpo traz o campo - quebraria a tela atual sem ganho, o valor já não é lido |
| Seletor de paciente (#197) | componente `PatientPicker` (busca assíncrona em `/api/patients?search=&limit=20`) com `@still-void/ui` | carregar todas as páginas no cliente - O(n) e lento com volume real |
| Menu por papel (#199) | `NAV_ITEMS[].api` = rota de API que a tela exige; filtro via `isAllowedForRole(api, role)` da identidade | lista de papéis por item - duplicaria a matriz de `route-family.ts` |

- Nada mais aqui é difícil de reverter

## Checks

Proofs: `npx vitest run <arquivo> -t "<nome>"` (título do `it`), exceto onde indicado.

### S1 - Conflito de agenda por empresa (#187) · 4 files · ~4k

**C1** - Mesmo horário, sem profissional, em duas empresas: ambas `POST /api/appointments` → 200
Proof: `tests/api/appointment-overlap-per-clinic.test.ts` › "C1 mesmo horário sem profissional em duas empresas: ambas 200"

**C2** - Mesmo horário, sem profissional, na mesma empresa: segundo → 409
Proof: `tests/api/appointment-overlap-per-clinic.test.ts` › "C2 mesmo horário sem profissional na mesma empresa: 409"

**C3** - A constraint inclui `clinic_id` (INSERT direto no banco, contornando a aplicação, em outra empresa não viola)
Proof: `tests/api/appointment-overlap-per-clinic.test.ts` › "C3 constraint do banco aceita o mesmo horário em outra empresa"

### S2 - Compose/Dockerfile (#191) · 4 files · ~4k

**C4** - Porta do Postgres publicada só em `127.0.0.1` (nunca em todas as interfaces)
Proof: `tests/infrastructure/deploy-config.test.ts` › "C4 compose publica o Postgres só no loopback"

**C5** - Senha do Postgres obrigatória (`${POSTGRES_PASSWORD:?`) e usada no `DATABASE_URL`
Proof: `tests/infrastructure/deploy-config.test.ts` › "C5 senha do Postgres é obrigatória e entra no DATABASE_URL"

**C6** - Volume nomeado montado em `/app/uploads` no serviço `app`
Proof: `tests/infrastructure/deploy-config.test.ts` › "C6 app monta volume nomeado em /app/uploads"

**C7** - Dockerfile cria `/app/uploads` com dono `nextjs:nodejs` antes de `USER nextjs`
Proof: `tests/infrastructure/deploy-config.test.ts` › "C7 Dockerfile cria /app/uploads do nextjs antes do USER"

**C8** - Dockerfile define `ENV TZ=America/Sao_Paulo` e `ENV APP_TIMEZONE=America/Sao_Paulo`
Proof: `tests/infrastructure/deploy-config.test.ts` › "C8 Dockerfile define TZ e APP_TIMEZONE"

**C9** - Compose repassa `CRON_SECRET`, `TRUSTED_PROXY_HOPS`, `UPLOADS_DIR`, `API_RATE_LIMIT_MAX`, `PG_POOL_MAX`, `PG_CONNECT_TIMEOUT_MS`, `PG_IDLE_TIMEOUT_MS`, `PG_STATEMENT_TIMEOUT_MS`
Proof: `tests/infrastructure/deploy-config.test.ts` › "C9 compose repassa as variáveis opcionais"

**C10** - Serviço `app` com `healthcheck` em `/api/auth/providers`
Proof: `tests/infrastructure/deploy-config.test.ts` › "C10 app tem healthcheck em /api/auth/providers"

### S3 - `getDb` resiliente (#193) · 2 files · ~3k

**C11** - Primeira chamada rejeita; a seguinte cria nova tentativa e resolve
Proof: `tests/infrastructure/db-retry.test.ts` › "C11 falha na primeira conexão não fica em cache"

**C12** - Chamadas concorrentes compartilham uma única Promise (um só pool)
Proof: `tests/infrastructure/db-retry.test.ts` › "C12 chamadas concorrentes compartilham a mesma tentativa"

**C13** - Pool registra `pool.on('error', …)` que loga via `logError`
Proof: `tests/infrastructure/db-retry.test.ts` › "C13 pool registra listener de erro"

### S4 - Log sem dado pessoal (#202) · 18 files · ~15k

**C14** - `logError` de um `DrizzleQueryError` não contém `params` nem o texto da query; contém o SQLSTATE `code`
Proof: `tests/lib/log-error.test.ts` › "C14 DrizzleQueryError é logado sem params nem query"

**C15** - Erro de unicidade em `POST /api/patients` não loga e-mail nem nome
Proof: `tests/api/patient-error-log-redaction.test.ts` › "C15 erro de banco no cadastro de paciente não loga e-mail nem nome"

**C16** - Nenhum `console.error` em `src/` fora de `src/lib/log-error.ts`
Proof: `tests/lib/log-error-architecture.test.ts` › "C16 console.error só no helper de log"

### S5 - Autoria SAE pela sessão (#200) · 8 files · ~8k

**C17** - `POST /api/patients/:id/care-plans` como profissional A com `professionalId` de B → plano com `professionalId` = A
Proof: `tests/api/care-plan-authorship.test.ts` › "C17 abertura do plano usa o profissional da sessão"

**C18** - `POST /api/care-plan-interventions/:id/records` idem → registro com A
Proof: `tests/api/care-plan-authorship.test.ts` › "C18 execução de intervenção usa o profissional da sessão"

**C19** - `POST /api/care-plan-outcomes/:id/evaluations` idem → avaliação com A
Proof: `tests/api/care-plan-authorship.test.ts` › "C19 avaliação de resultado usa o profissional da sessão"

**C20** - A evolução SOAP usa a mesma função extraída (`resolveSessionProfessionalId`)
Proof: `tests/lib/session-professional.test.ts` › "C20 conta sem profissional vinculado resolve null"

### S6 - Concorrência de fatura e estoque (#192) · 10 files · ~12k

**C21** - Dois `PATCH pay_partial 10000` concorrentes numa fatura de 10000: exatamente um 200, o outro ≥ 400; 1 pagamento gravado; recebido = 10000
Proof: `tests/api/invoice-concurrent-payment.test.ts` › "C21 pagamentos concorrentes não duplicam o recebimento"

**C22** - Edição de insumo após `adjustStock` concorrente preserva o estoque baixado
Proof: `tests/infrastructure/drizzle-supply-stock.test.ts` › "C22 save de insumo não sobrescreve stock_qty"

**C23** - Botões de pagamento desabilitados durante a requisição
Proof: `tests/pages/invoice-payment-in-flight.test.tsx` › "C23 botão de registrar pagamento fica desabilitado em voo"

### S7 - Rate limit por conta (#201) · 5 files · ~6k

**C24** - Dois usuários autenticados do mesmo IP não dividem o balde
Proof: `tests/proxy.test.ts` › "C24 contas diferentes no mesmo IP têm baldes separados"

**C25** - Anônimos seguem por IP (mesmo IP → mesmo balde)
Proof: `tests/proxy.test.ts` › "C25 anônimos do mesmo IP dividem o balde"

**C26** - Produção sem `x-forwarded-for` loga aviso uma única vez
Proof: `tests/lib/client-ip.test.ts` › "C26 produção sem x-forwarded-for avisa uma vez"

### S8 - Fuso explícito (#205) · 8 files · ~8k

**C27** - Boot em produção com fuso do processo ≠ `APP_TIMEZONE` lança erro; fora de produção só loga
Proof: `tests/lib/app-timezone.test.ts` › "C27 produção com fuso divergente falha na inicialização"
Proof: `tests/lib/app-timezone.test.ts` › "C27 fora de produção fuso divergente só loga"

**C28** - Processo em UTC com `APP_TIMEZONE=America/Sao_Paulo`: 12:00Z (09:00 BRT) aceito, 21:30Z→22:30Z (18:30 BRT) rejeitado pela grade 08–18
Proof: `tests/domain/business-hours-timezone.test.ts` › "C28 grade avaliada no fuso da aplicação, não do processo"

**C29** - E-mail de lembrete de consulta às 12:00Z traz `09:00` com `APP_TIMEZONE=America/Sao_Paulo`
Proof: `tests/domain/reminder-content.test.ts` › "C29 horário do lembrete no fuso da aplicação"

**C30** - "Amanhã" do lembrete calculado no fuso da aplicação: `now` = 02:00Z (23:00 BRT do dia D) pega consultas de D+1 BRT
Proof: `tests/application/send-reminders.test.ts` › "C30 amanhã calculado no fuso da aplicação"

**C31** - Documento impresso formata a data de emissão com `timeZone` da aplicação
Proof: `tests/components/document-frame.test.tsx` › "C31 data de emissão no fuso da aplicação"

### S9 - Seletor de paciente por busca (#197) · 6 files · ~20k

**C32** - `PatientPicker` busca `/api/patients?search=<termo>&limit=20` e seleciona o resultado
Proof: `tests/components/patient-picker.test.tsx` › "C32 busca assíncrona e seleção"

**C33** - Com 150 pacientes, o 150º (fora dos 100 primeiros) é encontrado pela busca e agendável
Proof: `tests/api/patient-search-beyond-first-page.test.ts` › "C33 paciente 150 é encontrado pela busca e agendado"

**C34** - Agenda, Faturamento e Auditoria não chamam `/api/patients` sem `search`
Proof: `tests/pages/patient-selectors-sweep.test.ts` › "C34 telas não usam a listagem paginada como lista completa"

### S10 - Abas do prontuário no celular (#198) · 3 files · ~10k

**C35** - Nenhum gatilho de aba com `scrollWidth > clientWidth` em 360, 390 e 768 px
Proof: `npx playwright test e2e/layout-mobile-first.spec.ts -g "prontuário: nenhum gatilho de aba corta o rótulo"`

### S11 - Navegação e dashboard por papel (#199) · 10 files · ~30k

**C36** - Menu do Atendente não mostra Faturamento, Procedimentos, Materiais, Relatórios, Repasses, Auditoria, Profissionais, Configurações, Triagem
Proof: `tests/pages/staff-nav-role.test.tsx` › "C36 atendente vê só itens permitidos"

**C37** - Menu do Profissional mostra Triagem e não mostra itens administrativos
Proof: `tests/pages/staff-nav-role.test.tsx` › "C37 profissional vê triagem e não vê administrativos"

**C38** - Dashboard do Atendente não renderiza alerta de erro quando `/api/summary` responde 403; mostra consultas do dia e retornos
Proof: `tests/pages/dashboard-role.test.tsx` › "C38 atendente vê consultas do dia e retornos sem alerta"

**C39** - Ficha do paciente para o Atendente não mostra abas clínicas nem chama as rotas clínicas
Proof: `tests/pages/patient-record-role.test.tsx` › "C39 atendente não vê abas clínicas"

**C40** - Proxy responde `ROLE_FAMILY_DENIED_MESSAGE` a staff autenticado sem acesso à família
Proof: `tests/proxy.test.ts` › "C40 staff sem acesso à família recebe mensagem de papel"

**C41** - Página proibida para o papel mostra estado "sem permissão" amigável, sem alerta de erro de API
Proof: `tests/pages/role-page-guard.test.tsx` › "C41 página proibida mostra sem permissão"

**C42** - E-mail da sidebar sem `truncate` (quebra de linha)
Proof: `tests/pages/staff-layout-client.test.tsx` › "C42 e-mail da sidebar quebra linha em vez de truncar"

### S12 - CI de produção (#203) · 4 files · ~6k

**C43** - Workflow roda `npm run build` bloqueante
Proof: `tests/infrastructure/ci-workflow.test.ts` › "C43 CI roda npm run build"

**C44** - Workflow roda `docker build` e smoke (`/api/auth/providers` 200 + escrita em `/app/uploads`)
Proof: `tests/infrastructure/ci-workflow.test.ts` › "C44 CI constrói a imagem e faz smoke"

**C45** - Subconjunto E2E (login, agenda, prontuário, portal) contra `next build && next start`, falhando em violação de CSP
Proof: `tests/infrastructure/ci-workflow.test.ts` › "C45 CI roda E2E de produção com checagem de CSP"

## Swept

- validation: C17-C19 (campo do corpo ignorado); C5 (senha obrigatória)
- failure modes: C11, C27; C14 (erro de banco logado sem dado)
- idempotency: C21 (retry/duplo clique na fatura)
- authorization: C17-C19, C36-C41; C1-C3 (isolamento entre empresas)
- concurrency: C12, C21, C22
- data lifecycle: C6 (fotos persistem em volume)
- dependency failure: C11 (banco fora no boot), C13 (erro de cliente ocioso)
- state transitions: C21 (fatura paga não aceita 2º pagamento — regra de domínio existente)
- observability: C14-C16, C26, C27

## Coverage

- Claims naming a status code, route or response shape: C1, C2, C15, C17-C19, C21, C24, C25, C40 - cada um com
  proof que atravessa a rota/proxy
