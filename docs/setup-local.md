# Setup local — VittaFlow

Guia detalhado pra configurar e rodar app local. Duas vias: Docker Compose (recomendado) ou Node direto contra Postgres do compose.

## Pré-requisitos

| Ferramenta | Versão | Obrigatório p/ |
|---|---|---|
| Docker + Docker Compose | atual | via A (tudo) e via B (só DB) |
| Node.js | 20+ (testado 24) | via B, scripts, testes |
| npm | vem com Node | install/build/test |
| openssl | qualquer | gerar `AUTH_SECRET` |
| gh CLI | opcional | baixar gitleaks (seção segurança) |

## Via A — Docker Compose (recomendado)

Sobe Postgres 16 + app numa tacada. Migrações Drizzle rodam sozinhas no boot (advisory lock, seguro com múltiplas réplicas).

```bash
cp .env.example .env
# edite .env e preencha, no mínimo:
#   AUTH_SECRET=$(openssl rand -hex 32)
#   VITTA_BOOTSTRAP_TOKEN=$(openssl rand -hex 24)
#   RESEND_API_KEY=...   EMAIL_FROM="VittaFlow <nao-responda@suaclinica.com>"
# o compose lê o .env sozinho, e o mesmo arquivo alimenta o curl abaixo
docker compose up -d --build
# primeira conta (instalação vazia): cria o Super Admin e envia o convite.
# o compose devolve o controle antes de o Next aceitar conexões — espere subir:
until curl -sf http://localhost:3000/api/auth/providers >/dev/null; do sleep 2; done
set -a; . ./.env; set +a   # valor com espaço (ex.: CLINIC_NAME) precisa aspas no .env, senão o shell quebra o source
curl -sX POST http://localhost:3000/api/auth/bootstrap \
  -H "Content-Type: application/json" \
  -H "x-bootstrap-token: $VITTA_BOOTSTRAP_TOKEN" \
  -d '{"email":"delivered@resend.dev"}'
# o link de convite chega por e-mail; se o envio falhar (ex.: chave de teste),
# a resposta traz `delivered: false` e `inviteUrl` para você abrir e definir a senha —
# confira sempre esses dois campos antes de assumir que o convite chegou
```

- App: http://localhost:3000 (login com o e-mail e a senha definidos pelo convite)
- Postgres: `localhost:5432` (user/pass `vitta`/`vitta`, db `vitta`)

Porta ocupada? Sobrescreve:

```bash
POSTGRES_PORT=5477 APP_PORT=3001 docker compose up -d --build   # demais valores vêm do .env
```

Parar: `docker compose down` (volume `pgdata` mantém dados). Apagar dados: `docker compose down -v`.

Rebuild após mudar código: repete o `docker compose up -d --build` (Dockerfile faz build multi-stage: deps → build → runner standalone).

## Via B — Node local + Postgres do compose

Só sobe o banco no container; app roda direto na máquina (hot reload do `next dev`).

```bash
docker compose up -d db          # só Postgres
cp .env.example .env             # DATABASE_URL já aponta pra localhost:5432
npm install
npm run dev                      # http://localhost:3000
```

Sem autenticação configurada (`AUTH_SECRET` vazio) e com `VITTA_ALLOW_OPEN_MODE=true`, fora de produção: app roda em **modo aberto** com aviso — ver seção Auth abaixo. Para exercitar o login real, define `AUTH_SECRET` + `VITTA_BOOTSTRAP_TOKEN` e faz o bootstrap.

### Migrações manuais (opcional)

Por padrão rodam no boot. Pra rodar à parte (ex.: deploy com step dedicado) e desligar o auto-run:

```bash
npm run db:migrate                    # aplica migrações pendentes em drizzle/
# .env: VITTA_MIGRATE_ON_BOOT=false
```

## Variáveis de ambiente

Copia `.env.example` → `.env` e ajusta. Referência completa:

| Variável | Obrigatória | Descrição |
|---|---|---|
| `DATABASE_URL` | Sim (fora do compose) | `postgres://vitta:vitta@localhost:5432/vitta` |
| `AUTH_SECRET` | Sim em produção | Assina sessão + cifra credenciais — `openssl rand -hex 32` |
| `APP_URL` | Sim em produção | URL pública — links de convite/reset e redirect do OAuth da agenda |
| `RESEND_API_KEY` / `EMAIL_FROM` | Sim em produção | E-mail transacional (convite/reset). Faltando em produção, a inicialização falha |
| `VITTA_BOOTSTRAP_TOKEN` | P/ primeira conta | Header `x-bootstrap-token` em `POST /api/auth/bootstrap` |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | P/ Google Agenda | OAuth client (Web) — integração de agenda, nunca login |
| `TZ` | Recomendada | Fuso da clínica (horário comercial validado em hora local) |
| `CRON_SECRET` | P/ lembretes | Header `x-cron-secret` em `POST /api/reminders/run`; sem ele rota fica 503 |
| `API_RATE_LIMIT_MAX` | Não | Req/min por IP em `/api/*` (padrão 120) |
| `VITTA_ALLOW_OPEN_MODE` | Não | `true` roda sem auth (só fora de produção) |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_PRIVATE_KEY` / `GOOGLE_CALENDAR_ID` | Não | Calendar via service account (alternativa ao OAuth) |
| `PG_POOL_MAX` / `PG_CONNECT_TIMEOUT_MS` / `PG_IDLE_TIMEOUT_MS` / `PG_STATEMENT_TIMEOUT_MS` | Não | Tuning do pool Postgres |
| `UPLOADS_DIR` | Não | Diretório de fotos de evolução (fora de `public/`) |
| `PHOTO_STORAGE` / `S3_BUCKET` / `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY` / `S3_REGION` / `S3_ENDPOINT` / `S3_FORCE_PATH_STYLE` | Não | `PHOTO_STORAGE=s3` guarda as fotos num bucket S3-compatível privado (necessário com várias réplicas); faltando variável, falha na inicialização |
| `CLINIC_NAME` / `CLINIC_CNPJ` / `CLINIC_ADDRESS` / `CLINIC_CITY` / `CLINIC_PROFESSIONAL_NAME` / `CLINIC_PROFESSIONAL_REGISTRY` | Não | Cabeçalho/assinatura de documentos clínicos |
| `WHATSAPP_TOKEN` / `WHATSAPP_PHONE_NUMBER_ID` | Não | Lembretes via WhatsApp (Meta Cloud API); sem elas roda em dry-run |

Existe um único método de login: e-mail + senha da própria conta (ADR-004). Produção sem `AUTH_SECRET`: 503 fail-closed. A primeira conta de uma instalação vazia sai de `POST /api/auth/bootstrap` (header `x-bootstrap-token`); depois disso a rota responde 403 para sempre.

### Modo aberto (dev/demo sem login)

Sem auth configurada e sem `VITTA_ALLOW_OPEN_MODE`: app responde **503 em todas as rotas**, mesmo em dev (fail-closed por padrão). Pra rodar sem login:

```bash
# .env
VITTA_ALLOW_OPEN_MODE=true
```

Ignorada quando `NODE_ENV=production` — nunca dá pra rodar produção sem auth. Auditoria registra ator `anonymous`.

### Google Agenda via OAuth (opcional, recomendado)

1. Google Cloud Console → APIs & Services → Credentials → **OAuth client ID** (tipo Web application).
2. Redirect URI: `{APP_URL}/api/integrations/google-calendar/callback`.
3. Habilita **Google Calendar API** no projeto.
4. Preenche `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `APP_URL`.

Resultado: em **Configurações → Google Agenda**, uma conta de equipe já logada clica em "Conectar Google Agenda". O fluxo pede só o escopo `calendar.events` e não toca na sessão; o refresh token fica cifrado AES-256-GCM e os eventos sincronizam no calendário `primary` da conta conectada (sobrescrevível via `GOOGLE_CALENDAR_ID`).

### Google Calendar via service account (alternativa)

Sem OAuth, só sincronização de agenda:

1. Cria service account no Google Cloud, habilita Calendar API.
2. Compartilha o calendário-alvo com o email da service account, permissão "Fazer alterações em eventos".
3. Preenche `GOOGLE_SERVICE_ACCOUNT_EMAIL`, `GOOGLE_PRIVATE_KEY`, `GOOGLE_CALENDAR_ID`.

Usada só quando nenhuma conta Google está conectada via OAuth. Sem nenhuma das duas: agenda funciona normal, sem sync.

## Scripts úteis

```bash
npm run dev              # dev server, http://localhost:3000
npm run build            # build produção (heap fixado 4GB, ver nota abaixo)
npm run start            # roda build de produção
npm run typecheck         # tsc --noEmit
npm run lint              # ESLint
npm run db:migrate        # aplica migrações Drizzle pendentes
npm run import-taxonomy   # tsx scripts/import-taxonomy.ts
npm run check:sv          # gate de adoção do design system @still-void/ui
```

Nota sobre `npm run build`: fixa heap do Node em 4GB (`--max-old-space-size=4096`) porque o build usa ~2,5GB de pico (React Compiler + geração estática de 52 rotas); em host de ~8GB o heap padrão do V8 fica em ~2,2GB e o worker morre com `Ineffective mark-compacts near heap limit`. Se o pico subir, ajusta o valor em `package.json`.

## Testes

```bash
npm test                 # 191 testes: domínio, aplicação, integração Postgres via PGlite, API
npm run test:watch       # modo watch
npm run test:coverage    # cobertura mínima 90% imposta (limiar em vitest.config.ts)
npm run test:e2e         # Playwright — primeira execução (ou após bump do @playwright/test): npx playwright install
npm run test:e2e:ui      # Playwright modo UI
```

Suíte E2E sobe os próprios servidores Next e gera credenciais a cada execução — nada fica hardcoded, nada a configurar no fluxo normal. Pra reaproveitar um `npm run dev` já rodando: `webServer.env` do Playwright não se aplica, então `E2E_AUTH_SECRET`/`E2E_BOOTSTRAP_TOKEN` (suíte) e `AUTH_SECRET`/`VITTA_BOOTSTRAP_TOKEN` (servidor) precisam ter os mesmos valores. O `globalSetup` cria o Super Admin pelo fluxo real: bootstrap → convite → definir senha → login.

## Estrutura do projeto (DDD em camadas)

```
src/
├── domain/            # Entidades, value objects, erros, contratos de repositório
├── application/       # Casos de uso (um por arquivo) + ports (CalendarGateway)
├── infrastructure/     # Repositórios Drizzle/Postgres + in-memory, Google Calendar, container
├── app/               # Next.js: páginas + api/ (route handlers, envelope {success,data,error})
├── components/        # UI compartilhada
└── lib/               # DTOs, fetch client, formatação pt-BR, hooks
```

Migrações Drizzle: `drizzle/`. Schema fonte: `src/infrastructure/persistence/drizzle/schema.ts` (`drizzle.config.ts`).

## Varredura de segurança (opcional, sob demanda)

`npm audit` é a fonte da verdade pra dependências:

```bash
npm audit
```

Gitleaks e Semgrep não vêm no `package.json` — instala sob demanda:

```bash
mkdir -p /tmp/gl && gh release download v8.30.1 --repo gitleaks/gitleaks --pattern 'gitleaks_8.30.1_linux_x64.tar.gz' --dir /tmp/gl --clobber && tar -xzf /tmp/gl/gitleaks_8.30.1_linux_x64.tar.gz -C /tmp/gl gitleaks
uv tool install 'semgrep==1.174.0'
```

Escaneia árvore de commit específico (não working dir, pra ficar fora `node_modules`/build):

```bash
rm -rf /tmp/scan && mkdir -p /tmp/scan && git archive <commit> | tar -x -C /tmp/scan
cd /tmp/scan && /tmp/gl/gitleaks dir . --no-banner
cd /tmp/scan && semgrep scan --config=p/nodejsscan --config=r/javascript.lang.security.audit.detect-non-literal-regexp --metrics=off src e2e tests scripts
```

Detalhes completos (por que reproduzir local, divergência de scanner hospedado, AD-011/AD-013) em [README.md](../README.md#varredura-de-segurança).

## Troubleshooting

| Sintoma | Causa provável | Ação |
|---|---|---|
| 503 em toda rota | Sem `AUTH_SECRET` nem `VITTA_ALLOW_OPEN_MODE` | Define `AUTH_SECRET` ou `VITTA_ALLOW_OPEN_MODE=true` (fora de produção) |
| Porta 5432/3000 ocupada | Outro serviço na porta | `POSTGRES_PORT=`/`APP_PORT=` no compose, ou ajusta `DATABASE_URL` na via B |
| Build mata processo (`Ineffective mark-compacts`) | Heap V8 padrão baixo pra máquina | Já mitigado via `--max-old-space-size=4096`; se persistir, sobe o valor em `package.json` |
| Bootstrap responde 403 | Já existe conta, ou `x-bootstrap-token` não bate com `VITTA_BOOTSTRAP_TOKEN` | Use "esqueci minha senha" se a instalação já tem contas |
| Convite/reset não chega | Sem `RESEND_API_KEY`/`EMAIL_FROM` fora de produção, o gateway é dry-run | O link sai no log do servidor (`[e-mail desativado] …`) |
| Consulta rejeitada com 400 | Fora do horário comercial (seg-sex 08h-18h, `TZ`) | Ajusta horário ou `TZ` |
| Consulta rejeitada com 409 | Conflito de agenda (folga mínima 15min) | Escolhe outro horário |
| E2E falha só ao reaproveitar `npm run dev` | `E2E_AUTH_SECRET`/`E2E_BOOTSTRAP_TOKEN` divergentes dos do servidor | Usa os mesmos valores nos dois pares, ou deixa a suíte subir seu próprio servidor |

## Referências

- [README.md](../README.md) — funcionalidades, API, arquitetura, stack
- [prd-fase-1.md](product/prd-fase-1.md), [prd-fase-2.md](product/prd-fase-2.md), [prd-fase-3.md](product/prd-fase-3.md) — requisitos por fase
- [analise-seguranca-escalabilidade.md](audits/analise-seguranca-escalabilidade.md) — análise de segurança/escalabilidade
- [.env.example](../.env.example) — todas as variáveis com comentários inline
