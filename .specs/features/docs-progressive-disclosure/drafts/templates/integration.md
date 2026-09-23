---
title: "Integração: <Serviço>"
status: living
audience: [dev, agent]
owner: "@<github-user>"
last_reviewed: YYYY-MM-DD
---

<!-- Salve em docs/engineering/integrations/<servico>.md. Uma integração por arquivo. -->

# <Serviço>

## Propósito

<Para que o Vitta Flow usa este serviço, em uma frase. Qual domínio depende dele.>

| Campo | Valor |
| --- | --- |
| Direção | saída (nós chamamos) · entrada (webhook/cron nos chama) |
| Obrigatória? | sim em produção · opcional |
| Gateway | `src/infrastructure/<pasta>/<arquivo>.ts` |
| Porta (interface) | `src/application/ports/<arquivo>.ts` |
| Doc oficial | <URL> |

## Credenciais

| Variável | Obrigatória | Onde obter | Formato |
| --- | --- | --- | --- |
| `<VAR>` | produção | <console → caminho> | <ex.: `re_…`> |

- **Nunca** commitar valor real; `.env.example` só com placeholder comentado.
- Rotação: <como trocar sem downtime, ou "reiniciar o app">.

## Contrato

**Saída** (o que enviamos):

```http
POST <endpoint>
Authorization: Bearer $<VAR>
Content-Type: application/json

{ "<campo>": "<valor>" }
```

**Resposta esperada:** `<status>` `{ "<campo>": … }` — campos que lemos: `<campo>`.

**Entrada** (webhook/cron, se houver): rota, header de autenticação, payload, status que devolvemos.

## Modos de falha

| Situação | Comportamento do Vitta Flow | Visível para |
| --- | --- | --- |
| credencial ausente em produção | <falha na construção do gateway / 503 / desativa> | log de boot |
| credencial ausente fora de produção | <dry-run: loga em vez de enviar> | log |
| serviço fora do ar / timeout | <bloqueia a operação? tenta de novo? ignora?> | <usuário / log> |
| resposta inesperada | <…> | <…> |

## Teste local

```bash
# sem credenciais (dry-run)
<comando>
# com credenciais de teste
<comando>
```

Testes automatizados: `<caminho do teste do gateway ou do fake em in-memory>`.
