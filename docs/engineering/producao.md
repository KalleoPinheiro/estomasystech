---
title: "Runbook de produção"
status: living
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-09
---

# Runbook de produção

Como colocar e manter no ar o Vitta Flow com dado de saúde (LGPD). Alvo principal decidido pelo
dono do produto ([#206](https://github.com/KalleoPinheiro/vitta-flow/issues/206)): **Vercel +
Supabase**. Alternativa mantida pronta: **VPS + docker compose**. Desenvolvimento local fica em
[`onboarding.md`](onboarding.md); erros conhecidos, em [`troubleshooting.md`](troubleshooting.md).

## 1. Perguntas abertas (decisão do dono do produto)

Nada abaixo foi decidido; o runbook indica onde cada resposta entra.

| Pergunta | Onde impacta |
| --- | --- |
| RPO/RTO aceitáveis (quanto dado pode ser perdido; em quanto tempo o sistema volta) | § 5 — plano do Supabase (PITR), frequência de backup das fotos |
| Região do Supabase, do bucket e das funções da Vercel. Dado de saúde fora do Brasil exige base legal de transferência internacional (LGPD art. 33) | § 2 — recomendação técnica: `sa-east-1` (Supabase/S3) e `gru1` (Vercel) |
| Provedor do bucket de fotos (Supabase Storage via S3, AWS S3, Cloudflare R2) | § 2, § 6 (`S3_SSE`) |
| Quem opera o cron de lembretes e quem recebe alerta de falha | § 7 |
| Horário do envio diário dos lembretes (o `vercel.json` usa 08:00 de São Paulo como ponto de partida) | § 7 |
| Quem monitora e com qual ferramenta (ver [#212](https://github.com/KalleoPinheiro/vitta-flow/issues/212)) | § 9 |

## 2. Topologia

### Vercel + Supabase (alvo)

| Peça | Configuração |
| --- | --- |
| App | projeto Next.js na Vercel; região das funções próxima do banco |
| Banco | Supabase Postgres 16. App usa o **pooler em modo transação** (porta `6543`) — funções serverless abrem muitas conexões curtas. Migrações usam a conexão **direta/sessão** (porta `5432`): o advisory lock das migrações não funciona pelo pooler de transação |
| Fotos | **obrigatoriamente** bucket S3-compatível (`PHOTO_STORAGE=s3`): o disco das funções é efêmero, e a aplicação se recusa a montar o armazenamento local quando `VERCEL` está definido |
| E-mail | Resend (obrigatório em produção) |
| Cron | Vercel Cron (`vercel.json`) chamando `GET /api/reminders/run` com `Authorization: Bearer $CRON_SECRET` |
| Fuso | `TZ` é reservado na Vercel e as funções rodam em UTC: o app alinha o fuso do processo a `APP_TIMEZONE` na subida (`src/instrumentation.ts`) |

Variáveis específicas: `VITTA_MIGRATE_ON_BOOT=false` (migração é passo de deploy, § 4),
`PG_POOL_MAX=5` (cada instância abre poucas conexões; o pooler multiplexa), `TRUSTED_PROXY_HOPS=1`
(a borda da Vercel é o único proxy e preenche `x-forwarded-for`).

A verificar no primeiro deploy: o pooler de transação do Supabase aceitar o parâmetro de sessão
`statement_timeout` que o pool envia (`PG_STATEMENT_TIMEOUT_MS`). Se recusar, configure o timeout
no papel do banco (`ALTER ROLE ... SET statement_timeout = '15s'`) e remova a variável.

### VPS + docker compose (alternativa pronta)

| Peça | Configuração |
| --- | --- |
| App + banco | `docker compose up -d --build` na VPS; `docker-compose.yml` publica o Postgres só no loopback |
| TLS | proxy reverso na frente (Caddy ou Nginx) terminando HTTPS; o app escuta em `127.0.0.1:${APP_PORT}` |
| Fotos | volume `uploads` (uma réplica) ou bucket (`PHOTO_STORAGE=s3`, obrigatório com mais de uma réplica). O disco da VPS precisa de cifra em repouso (LUKS ou volume cifrado do provedor) |
| Cron | `crontab` do host ou systemd timer chamando `POST /api/reminders/run` com `x-cron-secret` |
| Fuso | a imagem já define `TZ=America/Sao_Paulo` |

Caddy mínimo (`/etc/caddy/Caddyfile`):

```text
clinica.exemplo.com.br {
  reverse_proxy 127.0.0.1:3000
}
```

Com Cloudflare na frente do Caddy/Nginx, use `TRUSTED_PROXY_HOPS=2`.

## 3. TLS e URL pública

- O cookie de sessão é `Secure` em produção: **login não funciona por HTTP** fora de `localhost`.
- `APP_URL` precisa ser `https://…` (compõe os links de convite/reset e o redirect da agenda).
- Vercel: domínio próprio em *Settings → Domains*; o certificado é automático.

## 4. Migrações

- **Vercel:** `VITTA_MIGRATE_ON_BOOT=false`. Rode `npm run db:migrate` de uma máquina com o
  repositório (ou de um job de CI) com `DATABASE_URL` apontando para a conexão **direta** do
  Supabase, **antes** de promover o deploy. Migrações precisam ser compatíveis com a versão
  anterior do código (a antiga continua servindo até a promoção).
- **VPS:** padrão é migrar no boot com advisory lock (seguro com réplicas). Para migrar como passo
  separado, `VITTA_MIGRATE_ON_BOOT=false` e `DATABASE_URL=postgres://vitta:…@127.0.0.1:5432/vitta npm run db:migrate`
  a partir de um checkout no host (a imagem standalone não tem `drizzle-kit`).
- **Rollback:** as migrações não têm `down`. Reverter é restaurar o backup anterior (§ 5) ou
  escrever uma migração nova que desfaça a mudança. Por isso, faça backup antes de migrar.
- **Depois das migrações deste lote:**
  1. `npm run db:portal-orphans` — lista contas de portal que a migração `0040` não conseguiu
     vincular ao cadastro pelo e-mail ([#196](https://github.com/KalleoPinheiro/vitta-flow/issues/196));
     recrie-as em */configuracoes* escolhendo o paciente/parceiro.
  2. `npm run data:reencrypt` — § 6.

## 5. Backup e restore

Guarda do prontuário: Lei 13.787/2018 e LGPD art. 46. **Sem restauração testada, não há backup.**

| O quê | Vercel + Supabase | VPS + compose |
| --- | --- | --- |
| Banco | backups diários do plano Supabase; PITR (point-in-time) se o RPO pedir menos de 24 h | `pg_dump -Fc` diário do container `db` para fora da VPS (outro provedor/região), cifrado (ex.: `age` ou `gpg`) |
| Fotos | versionamento + replicação do bucket, ou cópia diária para um segundo bucket | `tar` do volume `uploads` (ou bucket, § 2) junto com o dump |
| Chaves | `DATA_ENCRYPTION_KEY` (e as anteriores) no cofre de segredos, **fora** do backup do banco | idem |

Sem `DATA_ENCRYPTION_KEY` o backup do banco não serve: os textos clínicos estão cifrados com ela.

**Restore (teste periódico, mínimo trimestral):**

1. Suba um banco vazio isolado (projeto Supabase de teste ou `docker run postgres:16`).
2. Restaure: `pg_restore --no-owner -d "$URL_TESTE" backup.dump` (ou restore do painel Supabase para um projeto novo).
3. Aponte uma instância de teste para ele com a mesma `DATA_ENCRYPTION_KEY` e abra a ficha de um paciente com evolução, anamnese e foto.
4. Registre na ficha abaixo; se algo falhar, abra issue com o rótulo `bug`.

| Data | Backup de | Quem | Tempo até voltar | Resultado |
| --- | --- | --- | --- | --- |
| — | — | — | — | nenhum teste registrado ainda |

## 6. Segredos e rotação

Gere com `openssl rand -hex 32` (ou `-hex 24` onde indicado no `.env.example`). Na Vercel, marque
como *Sensitive*; na VPS, `.env` com permissão `600`, fora do repositório.

| Segredo | Rotação | Efeito |
| --- | --- | --- |
| `AUTH_SECRET` | incidente ou troca de pessoal | derruba **todas** as sessões (todos logam de novo). Não afeta o dado clínico ([ADR-006](../adr/006-chave-de-dados-clinicos.md)); mantenha o valor antigo só se ainda houver dado no formato legado (antes de rodar a recifra) |
| `DATA_ENCRYPTION_KEY` | anual ou incidente | 1) valor atual → `DATA_ENCRYPTION_KEY_PREVIOUS`; 2) novo valor em `DATA_ENCRYPTION_KEY`; 3) deploy; 4) `npm run data:reencrypt`; 5) quando o script reportar 0 pendências, remova o antigo de `_PREVIOUS` |
| `VITTA_BOOTSTRAP_TOKEN` | — | só serve enquanto não existe nenhuma conta; **remova** depois do primeiro acesso (§ 8) |
| `CRON_SECRET` | incidente | atualize junto no agendador |
| `RESEND_API_KEY`, credenciais S3/Google | conforme o provedor | troque no provedor e na plataforma |

`npm run data:reencrypt` (a partir de um checkout, com `DATABASE_URL`, `DATA_ENCRYPTION_KEY`,
`DATA_ENCRYPTION_KEY_PREVIOUS` e, se ainda houver dado legado, o `AUTH_SECRET` antigo) regrava
com a chave atual todo texto clínico em claro, no formato legado ou de uma chave anterior. É
idempotente: pode ser interrompido e rodado de novo.

`S3_SSE` define a cifra das fotos no bucket: `AES256` (padrão), `aws:kms`, ou `provider` quando o
provedor já cifra em repouso e rejeita o cabeçalho (confirme na documentação do provedor antes de
usar `provider`).

## 7. Cron de lembretes

- **Vercel:** `vercel.json` agenda `GET /api/reminders/run` às 11:00 UTC (08:00 em São Paulo). A
  Vercel envia `Authorization: Bearer $CRON_SECRET` sozinha quando a variável existe no projeto.
  No plano Hobby o cron roda no máximo uma vez por dia.
- **VPS:** `0 8 * * * curl -fsS -X POST -H "x-cron-secret: $CRON_SECRET" https://clinica.exemplo.com.br/api/reminders/run`.
- Sem `CRON_SECRET` a rota responde 503 (job desligado). Falha do job: ver logs da função
  (Vercel) ou do container; alerta depende da decisão do § 1.
- **Antes do primeiro disparo real:**
  - Nome da empresa em */configuracoes*: a empresa criada pela migração se chama "Clínica
    legada" e o nome vai no texto do e-mail e do `wa.me`.
  - Retornos `pending` antigos: na primeira execução, cada retorno vencido há 30 dias ou mais
    recebe de uma vez a 3ª tentativa (só a mais alta cabível — COM-RN-06). Conclua ou cancele
    os que não devem gerar e-mail. Contagem:
    `SELECT clinic_id, count(*) FROM follow_ups WHERE status = 'pending' AND due_date < now() GROUP BY 1;`
  - Teto do Resend Free: 100 e-mails/dia. Acima disso o envio conta `failed` no resumo, sem
    alarme, e é tentado de novo no dia seguinte.
- **Teste de fumaça:** paciente de teste com o seu e-mail e consulta `scheduled` amanhã; dispare
  o job manualmente e espere `channelEnabled: true`, `sent: 1` e nenhuma entrada com `error`.
  Disparar de novo no mesmo dia deve devolver `sent: 0`. Na agenda, **Enviar WhatsApp** abre o
  `wa.me` e passa a mostrar "enviado hoje às HH:MM".

## 8. Primeiro acesso

1. Configure todas as variáveis obrigatórias (`.env.example`), incluindo `VITTA_BOOTSTRAP_TOKEN`.
2. `curl -sX POST "$APP_URL/api/auth/bootstrap" -H "Content-Type: application/json" -H "x-bootstrap-token: $VITTA_BOOTSTRAP_TOKEN" -d '{"email":"responsavel@clinica.com.br"}'` — cria o Super Admin e envia o convite.
3. Defina a senha pelo link do e-mail e entre.
4. Remova `VITTA_BOOTSTRAP_TOKEN` do ambiente e refaça o deploy.
5. Em */configuracoes*: dados da clínica (CNPJ, responsável técnico), grade de horários, profissionais, contas da equipe.
6. Contas de portal: crie a partir do paciente/parceiro já cadastrado (o vínculo é obrigatório).

## 9. Monitoramento

Mínimo até a issue de observabilidade ([#212](https://github.com/KalleoPinheiro/vitta-flow/issues/212)):
healthcheck em `GET /api/auth/providers`, logs da Vercel (ou `docker compose logs app`),
alerta de uso de conexões e disco no painel do Supabase. Os logs não carregam dado pessoal
(`logError`, [#202](https://github.com/KalleoPinheiro/vitta-flow/issues/202)).

## 10. Recuperação de emergência do Super Admin

Quando o Super Admin perdeu **tudo** — a senha, o e-mail ou o autenticador **e** os códigos de
recuperação. Perdeu só o celular: entre com um código de recuperação, sem script
([ADR-008](../adr/008-segundo-fator-do-super-admin.md)). Não há rota pública para isto: quem
tem `DATABASE_URL` já tem o banco ([ADR-009](../adr/009-recuperacao-de-emergencia-do-super-admin.md)).

1. De um checkout do repositório (Vercel) ou do host (VPS), com `DATABASE_URL` (conexão direta)
   e `APP_URL` (a URL pública `https://`), simule:
   `npm run admin:recover -- --novo-email=novo@clinica.com.br`
   (sem `--novo-email` o e-mail não muda). A simulação mostra a conta, o e-mail novo e o que
   será feito, e não grava nada.
2. Confira e aplique: repita o comando com `--confirmar`. Numa única transação o script:
   - remove o segundo fator e os códigos de recuperação;
   - invalida a senha atual (nenhuma senha entra) e reativa a conta se estiver desativada;
   - troca o e-mail, se pedido;
   - incrementa `session_version`: toda sessão aberta cai em até 60 s, inclusive a de quem
     tomou a conta com o e-mail antigo;
   - invalida convites e links de reset pendentes e grava o evento `account-recovery` na
     auditoria (hoje na trilha da clínica legada, até a trilha de plataforma existir).
3. O script imprime o link de definir senha — **só no terminal, nunca por e-mail**. Ele vale
   **1 hora** e uma vez. Não cole o link em chat ou ticket; se a hora passar, rode de novo (o link
   anterior deixa de valer).
4. Abra o link, defina a senha, entre em `/login` e cadastre o autenticador de novo; guarde os 10
   códigos de recuperação.

| Saída | Significado |
| --- | --- |
| `0` | aplicado, ou simulado sem `--confirmar` |
| `2` | comando ou pré-condição: flag desconhecida, `APP_URL` ausente ou sem `https://`, e-mail inválido, e-mail já usado por outra conta, nenhum Super Admin (use o § 8). Nada foi gravado |
| `1` | falha inesperada. Banco não abriu (ex.: `DATABASE_URL` errada, banco fora do ar): `Falha ao conectar ao banco (confira DATABASE_URL): nada foi alterado.` — nenhuma transação chegou a existir. Erro no meio depois de o banco abrir: a transação foi desfeita, nada foi alterado. Em ambos os casos, corrija e rode de novo |
