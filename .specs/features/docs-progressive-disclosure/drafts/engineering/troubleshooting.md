---
title: "Troubleshooting"
status: living
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: YYYY-MM-DD
---

<!-- Destino: docs/engineering/troubleshooting.md. Uma linha por sintoma; procure pelo texto literal do erro. -->

# Troubleshooting

**Formato de cada linha:** sintoma *literal* (o que aparece na tela/log) → causa → ação. Resolveu
algo que não está aqui? Adicione a linha no mesmo PR.

## Boot e autenticação

| Sintoma | Causa provável | Ação |
| --- | --- | --- |
| `503` em toda rota | sem `AUTH_SECRET` nem `VITTA_ALLOW_OPEN_MODE` | defina `AUTH_SECRET`, ou `VITTA_ALLOW_OPEN_MODE=true` fora de produção |
| bootstrap responde `403` | já existe conta, ou `x-bootstrap-token` ≠ `VITTA_BOOTSTRAP_TOKEN` | instalação com contas: use "esqueci minha senha" |
| convite/reset não chega | fora de produção sem `RESEND_API_KEY`/`EMAIL_FROM` o gateway é dry-run | o link está no log: `[e-mail desativado] …` |
| app não sobe em produção citando `RESEND_API_KEY` | falha proposital na construção do gateway | defina `RESEND_API_KEY` e `EMAIL_FROM` |

## Ambiente e build

| Sintoma | Causa provável | Ação |
| --- | --- | --- |
| porta `5432`/`3000` ocupada | outro serviço na porta | `POSTGRES_PORT=`/`APP_PORT=` no compose, ou ajuste `DATABASE_URL` na Via B |
| build morre com `Ineffective mark-compacts near heap limit` | heap padrão do V8 | já mitigado por `--max-old-space-size=4096`; se persistir, suba o valor em `package.json` — nunca remova |

## Regras de negócio que parecem bug

| Sintoma | Causa provável | Ação |
| --- | --- | --- |
| consulta rejeitada com `400` | fora do horário comercial (seg–sex 08h–18h, `TZ`) | ajuste o horário ou o `TZ` |
| consulta rejeitada com `409` | conflito de agenda (folga mínima de 15 min) | escolha outro horário |

## Testes

| Sintoma | Causa provável | Ação |
| --- | --- | --- |
| E2E falha só ao reaproveitar `npm run dev` | `E2E_AUTH_SECRET`/`E2E_BOOTSTRAP_TOKEN` diferentes de `AUTH_SECRET`/`VITTA_BOOTSTRAP_TOKEN` do servidor | use os mesmos valores, ou deixe a suíte subir o próprio servidor |
| `check:sv` falha com `sv-gap órfão` | comentário `// sv-gap: <slug>` sem seção em `docs/still-void-gaps.md` | adicione a seção ou troque pelo componente `@still-void/ui` |
| `check:docs` falha com `file:line -> target` | link relativo para arquivo que não existe | corrija o caminho; se o arquivo mudou de lugar, atualize todos os links vivos |
