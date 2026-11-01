---
title: "Integração: Google Calendar"
status: living
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-17
---

# Google Calendar

## Propósito

Espelha as consultas da [agenda](../../domains/agenda/README.md) num calendário Google: agendar
cria o evento, remarcar atualiza, cancelar/falta remove. Quando o paciente é anonimizado pela
[retenção](retencao.md) (#311), o job também apaga os eventos dele (`purgeEvent`, que propaga a falha
para a próxima execução tentar de novo; AGE-RN-16). **É integração, não login**
([ADR-004](../../adr/004-remocao-google-oauth-autenticacao.md)): conectar nunca cria nem troca sessão.

| Campo | Valor |
| --- | --- |
| Direção | saída |
| Obrigatória? | não — sem ela a agenda funciona sem sincronizar |
| Gateway | `src/infrastructure/calendar/google-calendar-gateway.ts` (resolvido de forma preguiçosa por `LazyCalendarGateway`) |
| Porta | `src/application/ports/calendar-gateway.ts` (`NullCalendarGateway` quando nada está configurado) |
| Rotas | `GET /api/integrations/google-calendar` (inicia OAuth) · `GET /api/integrations/google-calendar/callback` |
| Doc oficial | https://developers.google.com/calendar/api/v3/reference/events |

## Credenciais

Dois modos; o OAuth tem precedência quando há uma conta conectada.

| Credencial | Modo | Onde obter |
| --- | --- | --- |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth (recomendado) | Google Cloud Console → Credentials → OAuth client ID (Web). Redirect URI: `{APP_URL}/api/integrations/google-calendar/callback`. Habilite a Google Calendar API |
| `APP_URL` | OAuth | URL pública do app (compõe o redirect) |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` / `GOOGLE_PRIVATE_KEY` / `GOOGLE_CALENDAR_ID` | service account | crie a service account, compartilhe o calendário com ela ("Fazer alterações em eventos"); a chave aceita `\n` escapado |

O refresh token do OAuth fica cifrado (AES-256-GCM, chave derivada de `AUTH_SECRET`) em
`google_accounts`, escopado por clínica.

## Contrato

- Escopo pedido: só `calendar.events`, com `access_type=offline` e `prompt=consent` (garante o refresh token).
- Calendário destino: `primary` da conta conectada; `GOOGLE_CALENDAR_ID` sobrescreve.
- O id do evento é persistido em `appointments.google_event_id`.
- A sincronização roda depois da resposta (`after()`), fora do caminho da requisição.

## O que vai para o Google (#217, AGE-RN-18)

O calendário é de terceiro (conta de quem conectou; pode ser pessoal ou sincronizada no celular) e o
envio é transferência internacional ([ADR-018](../../adr/018-transferencia-internacional-ue.md)).
Por **minimização de dado** (LGPD art. 6º III; o procedimento revela condição de saúde, art. 5º II / 11)
o evento leva só:

| Campo | Conteúdo |
| --- | --- |
| Título | `Consulta · J.S.` — iniciais do paciente (primeira e última, sem partículas); sem paciente, `Consulta` |
| Horário | início e fim da consulta |
| Descrição | `Abrir no EstomaSysTech: <APP_URL>/agenda?consulta=<id>&em=<início ISO>` (vazia se `APP_URL` ausente ou não for http/https) |

**Nunca** vão nome completo, telefone, procedimento nem observações. Criação e remarcação usam o mesmo
conteúdo (`eventContent` em `sync-appointment-calendar.ts`). O link só abre os detalhes para quem está
logado na clínica; o Google guarda um identificador opaco, não dado clínico. Base legal: execução do
contrato/procedimentos de saúde (art. 7º V / 11 II "f") com o dado reduzido ao mínimo para a equipe
reconhecer a consulta.

- **Eventos antigos:** reescritos em lote pelo script descrito em [Reescrita em lote](#reescrita-em-lote-dos-eventos-antigos-339-age-rn-19), ou na remarcação (que reescreve o evento) ou cancelamento/anonimização (que o apaga).
- **Conta conectada:** recomenda-se uma conta Google **da clínica** (Workspace), não pessoal. Não é
  imposto em código (OAuth com `calendar.events` não lê o domínio da conta); com o conteúdo reduzido a
  iniciais, o risco de uma conta pessoal é baixo ([ADR-020](../../adr/020-evento-do-google-agenda-so-com-iniciais.md)).

## Reescrita em lote dos eventos antigos (#339, AGE-RN-19)

Os eventos criados antes da #217 levavam nome, telefone e procedimento. O script
`npm run calendar:minimize -- [--confirmar] [--desde=AAAA-MM-DD] [--empresa=<id>]` reescreve cada um
com o mesmo conteúdo mínimo da tabela acima (`eventContent`). Roteiro de execução:
[`producao.md` § 7.2](../producao.md#72-reescrita-dos-eventos-antigos-do-google-agenda-339).

| Ponto | Comportamento |
| --- | --- |
| Janela | **todas** as consultas com evento, sem corte (o dado velho num calendário de terceiro é o mesmo risco); ordem das mais futuras/recentes para as mais antigas. `--desde` restringe, se alguém precisar priorizar |
| Operação | `events.patch` de título/descrição/horário via `CalendarGateway.rewriteEvent`; **nunca** `delete`. Evento que já não existe (404/410) conta como feito |
| Idempotência | `appointments.calendar_minimized_at` (migração `0056`); só é gravado depois do `patch` ter dado certo. Eventos criados/remarcados desde a #338 também são marcados |
| Falha parcial | erro de um evento é logado (só o id da consulta) e contado em `falhas`; o lote segue e o evento volta na próxima execução |
| Cota do Google | rajadas de 10 eventos, 1 s entre rajadas; 429/403 `rateLimitExceeded` repete até 4 vezes com espera de 2, 4 e 8 s; persistindo, o lote para e o resto fica pendente |
| Tamanho | até 500 consultas por empresa por execução; repita até `pendentes=0` |
| Auditoria | um evento `calendar-minimization` por empresa e execução, só com `rewritten`, `failed`, `rateLimited` e `since` |
| Escopo | uma empresa por vez (`clinicScope`), com o gateway/credencial da própria empresa. Paciente anonimizado ou ausente sai como `Consulta` (a retenção apaga o evento) |

## Modos de falha

| Situação | Comportamento | Visível para |
| --- | --- | --- |
| OAuth não configurado (#658) | `GET /api/settings/calendar-integration` devolve `configured: false` e a tela de Configurações desabilita «Conectar Google Agenda» com a mensagem de não configurado; `GET /api/integrations/google-calendar` (link direto) redireciona para `/configuracoes?calendar=erro&reason=nao_configurado`, nunca JSON cru | quem tenta conectar |
| nenhuma credencial | `NullCalendarGateway`: nenhuma consulta a `google_accounts`, nenhuma chamada | ninguém |
| Google fora do ar / token revogado | a operação na agenda **não** falha; o evento fica dessincronizado | log |

## Teste local

Preencha `GOOGLE_CLIENT_ID`/`SECRET` e `APP_URL=http://localhost:3000`, entre com uma conta de
equipe e use **Configurações → Google Agenda → Conectar**. O gateway real fica fora da cobertura
de unit test (`vitest.config.mts`); o comportamento da agenda é testado com o gateway nulo/fake.
