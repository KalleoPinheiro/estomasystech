---
title: "Análise de Segurança, Escalabilidade e Performance — VittaFlow"
status: frozen
audience: [dev, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-23
---

# Análise de Segurança, Escalabilidade e Performance — VittaFlow

- **Data:** 2026-07-16
- **Escopo:** todo o código até o commit `225f084` (módulo clínico)
- **Referências:** OWASP Top 10 2021, OWASP API Security Top 10, LGPD (art. 11 — dados sensíveis de saúde)

Cada achado tem severidade (**CRÍTICO / ALTO / MÉDIO / BAIXO**) e status (**✅ corrigido nesta rodada / 🗓 planejado P1/P2**).

---

## 1. Segurança

### 1.1 CRÍTICO — Ausência total de autenticação/autorização (OWASP A01, A07; API1/API2)
Toda a API e todas as páginas eram públicas: qualquer pessoa com acesso à URL lia **prontuário completo** (dado sensível LGPD art. 11), alterava faturas (`pay`/`cancel` sem controle = fraude financeira trivial) e apagava estoque.
**Correção (✅):** autenticação de sessão single-tenant:
- Senha via `AUTH_PASSWORD` + segredo de assinatura `AUTH_SECRET` (env, nunca em código).
- Login com comparação em tempo constante (`timingSafeEqual`) — evita timing attack.
- Cookie de sessão `HttpOnly` + `SameSite=Lax` + `Secure` em produção, assinado com HMAC-SHA256 e expiração de 12h — não é possível forjar sem o segredo.
- `src/proxy.ts` protege **todas** as rotas e páginas (deny-by-default; allowlist declarada em `PUBLIC_PATHS` de `src/lib/auth/access-policy.ts`: `/login`, os endpoints de login/OAuth em `/api/auth/*` e `/api/reminders/run`, que autentica por `x-cron-secret`). No Next.js 16 o `middleware.ts` passou a se chamar `proxy.ts` — o arquivo sempre existiu, só mudou de nome.
- **Segunda camada (✅, Issue #4):** guarda dentro de cada route handler (`requireStaffSession`/`requirePortalSession`), porque a doc do Next 16 é explícita que o proxy é uma checagem otimista de borda e não deve ser a única barreira. Política única em `src/lib/auth/access-policy.ts`, consumida pelas duas camadas. Ver [ADR 002](../adr/002-autorizacao-em-duas-camadas.md).
- **Conformidade automática:** `tests/api/route-guard-conformance.test.ts` varre `src/app/api/**/route.ts` e quebra o build se um handler novo nascer sem guarda.
- **Fail-closed em produção e em desenvolvimento**: sem `AUTH_PASSWORD`/`AUTH_SECRET` configurados o app responde 503 em todas as rotas. Rodar sem autenticação exige o opt-in explícito `VITTA_ALLOW_OPEN_MODE=true`, ignorado quando `NODE_ENV=production` (antes bastava não estar em produção para liberar tudo).
- Rate limit no login (5 tentativas/min/IP) — mitiga força bruta (A07).
- Logout limpa o cookie.

### 1.2 ALTO — Sem rate limiting em nenhum endpoint (API4 Unrestricted Resource Consumption)

Scripts podiam criar pacientes/consultas ilimitados e derrubar o banco.
**Correção (✅):** rate limit em memória no proxy (janela fixa por IP, 120 req/min para API; 5/min no login). Limitação conhecida: memória é por instância — para múltiplas réplicas, mover para Redis (**🗓 P1**).

### 1.3 ALTO — Race condition no agendamento (TOCTOU) → double-booking (fraude/integridade)
`findConflicting` + `save` não são atômicos: duas requisições simultâneas no mesmo horário passavam ambas na checagem e gravavam duas consultas sobrepostas. Em cenário multi-instância seria rotina.
**Correção (✅):** defesa em profundidade no banco — constraint de exclusão Postgres:
```sql
EXCLUDE USING gist (tstzrange("starts_at", "ends_at" + interval '15 minutes') WITH &&)
WHERE (status IN ('scheduled','confirmed'))
```
O range estendido em +15min no fim garante a folga mínima entre consultas **no nível do banco**, mesmo sob concorrência. Violação (código `23P01`) é mapeada para `SchedulingConflictError` → HTTP 409. Coberto por teste de integração.

### 1.4 MÉDIO — Inputs sem limite de tamanho (DoS por payload/armazenamento)
Schemas zod validavam formato mas não tamanho: `notes` de 100 MB era aceito.
**Correção (✅):** `.max()` em todos os campos string de todas as rotas (nomes 200, textos clínicos 5.000, demais 500), quantidades com teto (`1e6`), preços com teto (`1e9` centavos).

### 1.5 MÉDIO — Sem headers de segurança (A05 Security Misconfiguration)
**Correção (✅):** headers globais via `next.config.ts`: `Content-Security-Policy` (self + inline necessário ao Next), `X-Frame-Options: DENY` (clickjacking), `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (câmera/microfone/geolocalização negados), `Strict-Transport-Security`. CSP estrita com nonce fica para **🗓 P1**.

### 1.6 Pontos já corretos (mantidos)
- **SQL injection (A03):** 100% das queries via Drizzle parametrizado; zero concatenação de SQL.
- **XSS (A03):** React escapa por padrão; nenhum `dangerouslySetInnerHTML`.
- **Mass assignment (API6):** rotas montam objetos campo a campo a partir do zod; entidades validam de novo no domínio (dupla camada).
- **Segredos:** nenhum hardcoded; tudo via env (`.env.example` documenta).
- **Erros não vazam stack** (`handleRequest` retorna mensagem controlada; 500 genérico).
- **IDs UUID aleatórios** — enumeração de recursos impraticável (mitiga IDOR enquanto single-tenant).
- **Fraude financeira:** `Money` inteiro em centavos (sem float), máquina de estados impede pagar/cancelar 2×, fatura por consulta é idempotente, estoque nunca negativo, movimentações com histórico auditável imutável.
- **CSRF:** cookie `SameSite=Lax` + ausência de formulários cross-origin; API só aceita JSON. Token anti-CSRF dedicado fica para **🗓 P2** se surgir integração de terceiros.

### 1.7 🗓 Planejado (P1/P2) — segurança
| Item | Prioridade | Nota |
|------|-----------|------|
| Multiusuário + RBAC (enfermeira × recepção) com senha por usuário (bcrypt/argon2) | P1 | Hoje single-tenant de senha única |
| Trilha de auditoria (quem fez o quê, quando) p/ eventos financeiros e clínicos | P1 | Exigência comum em auditoria de clínica |
| Rate limit distribuído (Redis) | P1 | Necessário só com >1 réplica |
| Criptografia em repouso dos campos clínicos (pgcrypto/KMS) + política de backup | P1 | LGPD art. 11/46 |
| CSP estrita com nonce | P1 | Requer ajuste no bootstrap do Next |
| 2FA (TOTP) | P2 | |
| Assinatura digital do prontuário (ICP-Brasil) | P2 | Já no roadmap do PRD |

---

## 2. Escalabilidade

### 2.1 ALTO — N+1 lógico: enriquecimento de nomes carregava TODOS os pacientes
`ListAppointments`, `ListInvoices` e `ListFollowUps` faziam `patients.findAll()` para montar `patientName`. Com 10 mil pacientes, cada GET da agenda carregaria a tabela inteira.
**Correção (✅):** novo método `findByIds(ids)` no `PatientRepository` (SQL `IN`, deduplica ids) usado pelos três use cases — custo proporcional ao resultado, não à base.

### 2.2 MÉDIO — Listagens sem limite (unbounded queries)
`findAll` de pacientes/faturas/insumos/retornos sem `LIMIT`.
**Correção (✅):** teto de 500 linhas nos repositórios Drizzle (constante `MAX_ROWS`). Paginação real (cursor + `?page`) fica para **🗓 P1** junto com UI.

### 2.3 Estado atual favorável
- **Stateless** (sessão em cookie assinado, não em memória) → app escala horizontalmente; os únicos pontos por-instância são o rate limiter (P1: Redis) e o cache de `getDb`.
- **Pool de conexões** node-postgres com limites explícitos (`max=10`, timeouts) — evita esgotar conexões do Postgres com múltiplas réplicas.
- **Migrações idempotentes** no boot; para N réplicas, mover `migrate()` para step de deploy (**🗓 P1**).
- **Google Calendar é best-effort** — indisponibilidade externa não bloqueia nem enfileira (fila/retry com outbox: **🗓 P2**).

### 2.4 🗓 Planejado (P1/P2) — escalabilidade
| Item | Prioridade |
|------|-----------|
| Paginação cursor em pacientes/faturas/retornos (API + UI) | P1 |
| `migrate` como job de deploy (não no boot) | P1 |
| Outbox/fila para eventos de calendário (retry) | P2 |
| Read replicas / particionamento por data em `appointments` | P2 (só com volume real) |

---

## 3. Performance

### 3.1 Já correto
- Índices cobrindo as queries quentes: `appointments(starts_at)`, `appointments(patient_id)`, `invoices(status)`, `invoices(issued_at)`, `follow_ups(status/due_date)`, e índice GiST novo cobre a checagem de conflito.
- Consulta de conflito e de período usam `starts_at < X AND ends_at > Y` — sargable com os índices.
- `better-sqlite3`→Postgres removeu serialização síncrona; PGlite mantém testes rápidos (~s).
- Frontend: bundle enxuto (sem lib de calendário/estado externas), React Compiler ativo, `useApiQuery` com refresh explícito (sem polling).

### 3.2 MÉDIO — `/api/summary` e `/api/reports` fazem múltiplas queries sequenciais
Aceitável no volume atual (< 10 ms cada); consolidar em agregação SQL (`GROUP BY status`, `SUM`) quando houver dezenas de milhares de linhas (**🗓 P1**).

### 3.3 BAIXO — Sem cache HTTP
Dados operacionais mudam a cada ação; `no-store` é correto para consistência. Cache fino (ETag em relatórios fechados de meses anteriores) é **🗓 P2**.

---

## 4. Qualidade estrutural / complexidade ciclomática

**Correção (✅):** regras impostas no ESLint (falham o build):
- `complexity: max 10` — complexidade ciclomática baixa garantida por lint em todo o código.
- `max-depth: 4` — sem aninhamento profundo.
- `max-lines-per-function: 120` (funções de componente React isentas via override de `*.tsx` mantendo teto 200 p/ JSX declarativo).

Estado verificado: **zero violações** após ajustes. Somado ao que já existia: arquivos pequenos (1 caso de uso por arquivo), entidades imutáveis, DIP via interfaces de repositório, 191+ testes BDD, cobertura mínima de 80% imposta.

---

## 4.1 Auditoria de validação (2026-07-16, pós-RBAC/portais)

Revalidação completa das regras de negócio (232 testes BDD verdes, cobertura ≥80%, complexidade ≤10 imposta) e caça a violações de segurança/LGPD no código dos portais e OAuth. **4 violações reais encontradas e corrigidas na hora:**

| # | Severidade | Violação | Correção |
|---|-----------|----------|----------|
| V1 | ALTO (LGPD art. 6º III) | Portal do parceiro reutilizava DTOs completos: vazava `notes` clínicas internas, email/telefone/nascimento do paciente e **preço das consultas** | DTOs de portal dedicados: parceiro vê só `{id, fullName}` do paciente e consultas sem preço/anotações |
| V2 | MÉDIO (LGPD) | Portal do paciente expunha `notes` internas da equipe (perfil e consultas) | `PortalPatientProfileDto` e `PortalAppointmentDto` sem campos internos |
| V3 | ALTO (LGPD minimização) | OAuth pedia escopo `calendar.events` + `prompt=consent` de **todos** — paciente concedia escrita na própria agenda sem uso algum | Escopo padrão mínimo (openid+email, `access_type=online`); agenda só via link explícito da equipe (`?connect=calendar`) |
| V4 | MÉDIO (regra de negócio) | `referredByPartnerId` inexistente/inativo caía na FK do banco → 500 genérico | `assertValidReferrer` nos use cases → 400 com mensagem clara; coberto por teste |

**Conferido e já correto:** escopo por sessão revalidado no servidor em todas as rotas de portal; papel assinado no cookie (não forjável sem `AUTH_SECRET`); paciente/parceiro desativado perde acesso na resolução; refresh token só persiste para admin; portais não expõem anamnese nem evolução SOAP; direito de acesso do titular atendido pelo portal (art. 18); histórico do portal limitado a 24 meses.

**Riscos residuais aceitos/documentados:** `X-Forwarded-For` spoofável no rate limit quando sem proxy reverso confiável (P1: configurar trust proxy no deploy); `console.error` pode logar objetos de erro do Google (P1: logger estruturado com redação); criptografia em repouso dos campos clínicos segue P1.

## 4.2 Revisão estrutural de arquitetura (2026-07-16)

Varredura por violações de camada, duplicação de regra e consistência. **7 problemas corrigidos:**

| # | Problema | Correção |
|---|----------|----------|
| A1 | Camada de aplicação importava `UserRole` de `src/lib` (infra web) — dependência invertida | Tipo movido para `domain/auth/user-role.ts`; `lib` re-exporta |
| A2 | Callback OAuth instanciava repositórios Drizzle direto (`getDb` + 3 repos) — segunda raiz de composição | Callback consome o container (`getRepositories`), que ganhou `googleAccounts` |
| A3 | `CompleteAppointment` sem transação: falha entre salvar consulta e criar fatura deixava estado irreparável (re-concluir → 409, fatura nunca nasce) | Use case **idempotente-reparador**: re-executar sobre consulta concluída garante a fatura sem duplicar nada (retorno só na 1ª conclusão); coberto por teste de falha parcial |
| A4 | Validação nome/email/telefone duplicada em `Patient` e `Partner` | `domain/shared/person-validation.ts` única |
| A5 | Regra de disponibilidade (horário comercial + folga) duplicada em Schedule/Reschedule | `assertSlotAvailable` única na aplicação |
| A6 | `assertValidReferrer` definido dentro de `create-patient.ts` e importado por `update-patient` | Arquivo próprio `assert-valid-referrer.ts` |
| A7 | Atributos do cookie de sessão duplicados em login e callback | `sessionCookieOptions()` única em `lib/auth/session` |

**Avaliado e mantido conscientemente:** container como service locator simples (adequado a route handlers; DI framework seria overhead); UI importando tipos/constantes do domínio (domínio é a camada mais interna e sem dependências — importável por todos); repositórios recriados por request (wrappers stateless, custo zero). **P1:** unit-of-work/transação real entre agregados; quebrar `lib/dto.ts` por contexto quando ultrapassar 800 linhas.

## 5. Plano de ação consolidado

### Executado nesta rodada (P0) ✅
1. Autenticação de sessão fail-closed + login com rate limit + logout.
2. Headers de segurança globais (CSP, XFO, nosniff, HSTS, Permissions-Policy).
3. Rate limiting de API por IP no proxy (`src/proxy.ts`).
4. Constraint de exclusão no Postgres eliminando double-booking sob concorrência (+ mapeamento 23P01 → 409).
5. `.max()`/tetos em todos os inputs zod (anti-DoS).
6. `findByIds` eliminando N+1 de enriquecimento; teto de 500 linhas nas listagens.
7. Pool do Postgres com limites e timeouts explícitos.
8. Regras de complexidade ciclomática no ESLint (max 10) + max-depth 4.

### Próxima iteração (P1) 🗓
1. Multiusuário + RBAC + trilha de auditoria (pré-requisito para convênios/fiscalização).
2. Paginação cursor nas listagens (API + UI).
3. Rate limit em Redis; `migrate` no deploy; CSP com nonce.
4. Criptografia em repouso de campos clínicos + rotina de backup testada (LGPD).
5. Agregações SQL para relatórios.

### Backlog (P2) 🗓
2FA · outbox p/ Google Calendar · ETag em relatórios históricos · particionamento · assinatura ICP-Brasil.
