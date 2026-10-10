# C4 — `/plataforma` organizado: navegação, status do canal e taxonomia

> Build this with **tlc-implement**.
> Every criterion below becomes a check with a proof, referenced by its number. Nothing under
> `Unresolved` gets settled while building.

## Intent

Hoje o `/plataforma` é só um `Header` com logout (`src/app/plataforma/layout.tsx`). A auditoria e o
cadastro de clínica aparecem como botões na lista. A importação do catálogo de taxonomia existe só
como API (`POST /api/platform/taxonomy/import`), e nenhuma tela a chama. Depois da C1, o super admin
também não tem como saber quais clínicas estão sem canal de e-mail, que é o sinal precoce de que a
aposta do design doc está indo mal (`.design/canal-por-clinica.md`, Success).

Com esta task, o `/plataforma` ganha uma navegação fixa (Clínicas · Auditoria · Taxonomia). A lista
e o detalhe da clínica mostram o status do canal de e-mail, sem segredo, e uma tela de Taxonomia
importa o catálogo curado e mostra o resultado.

9 critérios em 3 fatias · 1 porta sem volta · 1 em aberto, 0 bloqueiam

## Criteria

### Navegação

1. Dada sessão `super_admin`, em qualquer página de `/plataforma`, então o topo mostra os links "Clínicas" (`/plataforma`), "Auditoria" (`/plataforma/auditoria`) e "Taxonomia" (`/plataforma/taxonomia`), com o link da seção atual marcado (`aria-current="page"`).

### Status do canal por clínica

2. Quando o super admin abre `/plataforma`, então cada clínica da lista mostra um `StatusBadge`: "E-mail: configurado" (último teste ok), "E-mail: falhando" (`last_status = 'failed'`), "E-mail: não testado" (canal sem teste) ou "E-mail: sem canal".
3. Quando ele abre `/plataforma/clinicas/[id]`, então vê o mesmo status mais o provedor e a data do último teste ("Último teste: <data e hora>" ou "Nunca testado").
4. Sempre, `GET /api/platform/clinics` e `GET /api/platform/clinics/[id]` trazem `emailChannel: { configured, provider, lastStatus, lastStatusAt }` e nunca `sender`, `secretLast4`, `lastError` nem a chave.

### Taxonomia

5. Quando ele abre `/plataforma/taxonomia`, então vê o texto "Importa o catálogo curado de estomaterapia (NANDA-I, NOC, NIC e ligações). Pode ser repetido: itens existentes não são duplicados. O catálogo licenciado completo é importado por `scripts/import-taxonomy.ts`." e o botão "Importar catálogo de estomaterapia".
6. Quando ele confirma a importação (`ConfirmAction`: "Importar o catálogo de estomaterapia para todas as clínicas?"), então `POST /api/platform/taxonomy/import` é chamado e a tela mostra as contagens devolvidas pela API (diagnósticos, resultados, intervenções, ligações).
7. Se a importação falha, então `ErrorAlert` com a mensagem da API, e o botão volta a ficar disponível.
8. Enquanto a importação roda, o botão fica desabilitado com `LoadingIndicator`.
9. Dada sessão que não é `super_admin`, quando ela abre `/plataforma/taxonomia`, então o proxy nega como nas demais páginas da família `platform` (comportamento atual, mantido).

## Out of scope

- Upload do catálogo licenciado pela tela — design doc, Decisions: Taxonomia.
- Configurar o canal de uma clínica pela plataforma — só o `company_admin` (C3).
- Mostrar `last_error` ao super admin — design doc, Decisions: Status na plataforma.

## Observable

| Surface | Decision | Landing |
| --- | --- | --- |
| screen `/plataforma` layout | navegação | 1 |
| screen `/plataforma` lista | status do canal | 2 |
| screen `/plataforma` lista | lista vazia | existing - `EmptyState` da página |
| screen `/plataforma/clinicas/[id]` | status do canal | 3 |
| screen `/plataforma/taxonomia` | estado inicial | 5 |
| screen `/plataforma/taxonomia` | loading | 8 |
| screen `/plataforma/taxonomia` | error | 7 |
| screen `/plataforma/taxonomia` | unauthorised | 9 |
| screen `/plataforma/taxonomia` | ação confirmada | 6 |
| API `GET /api/platform/clinics[/id]` | campo novo | 4 |
| API `POST /api/platform/taxonomy/import` | formato da resposta | existing - contagens de `importTaxonomyCatalog` |

## Swept

- validation: n/a - nenhuma entrada do usuário nova; a importação não recebe corpo
- failure modes: 7
- idempotency and retry: existing - `importTaxonomyCatalog` é idempotente (comentário da rota)
- authorization: 9
- concurrency and ordering: Unresolved 1
- data lifecycle: n/a - nada novo é guardado
- external-dependency failure: n/a - sem serviço externo
- state transitions: n/a - o status do canal é escrito pela C3; aqui só é lido
- observability: 2, 3, 4

## Impact

| Front | What changes |
|---|---|
| domain | existing term: `PlatformClinicDto` ganha `emailChannel` — `src/app/plataforma/page.tsx` e `clinicas/[id]/page.tsx` o consomem |
| ui | `src/app/plataforma/layout.tsx` ganha a navegação; os botões "Auditoria" da lista saem, porque ficam redundantes |
| stored data | nada a migrar |

## Decided

| Decision | Shape | Alternative rejected |
|---|---|---|
| Status visível ao super admin | `emailChannel: { configured: boolean; provider: 'resend' \| null; lastStatus: 'ok' \| 'failed' \| null; lastStatusAt: string \| null }` | Incluir `sender`/`lastError` — dado operacional da clínica que o super admin não precisa (ADR-007) |

## Sources

- `.design/canal-por-clinica.md` — Decisions: Status na plataforma, Taxonomia; Success.
- Conversa de discovery, 2026-10-10: "Config. de plataforma, Organização do que existe"; "Importar taxonomia, Status integrações".

This task is the record of decision. If a linked document diverges, ask before building.

## Unresolved

| # | Kind | Question | Until answered |
|---|---|---|---|
| 1 | open | Dois cliques simultâneos em importar | Botão desabilitado durante a chamada (8); o servidor já é idempotente |
