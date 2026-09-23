---
title: "ADR 002 — Autorização em duas camadas (proxy + guarda por rota)"
status: frozen
audience: [dev, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-09-23
---

# ADR 002 — Autorização em duas camadas (proxy + guarda por rota)

- **Status:** Aceito (implementado)
- **Data:** 2026-08-02
- **Contexto:** Issue #4

## Contexto

A Issue #4 relatava que **nenhuma rota `/api/*` exigia sessão válida**, com base na
observação de que "não existe `middleware.ts` no repositório".

**A premissa estava incorreta.** No Next.js 16 o `middleware.ts` foi renomeado para
`proxy.ts` (ver <https://nextjs.org/docs/app/getting-started/proxy>, Next.js 16:
*"Starting with Next.js 16, Middleware is now called Proxy to better reflect its
purpose"*). O arquivo existe em
`src/proxy.ts` e já fazia deny-by-default em todas as rotas, verificação HMAC do
cookie, RBAC por papel e rate limit. `curl -X POST /api/patients` sem cookie já
respondia 401 antes desta mudança — a exposição relatada não existia.

O que **era** problema real:

1. **Camada única.** A própria doc do Next 16 diz: *"it should not be used as a full
   session management or authorization solution"* — é uma checagem otimista
   de borda. Se o `matcher` fosse editado sem cuidado, se uma rota fosse servida fora
   do pipeline do proxy, ou se um handler nascesse num grupo liberado pela allowlist,
   não havia segunda barreira. As rotas de equipe não sabiam quem era o chamador — 21
   delas nem para auditoria (`recordAudit` gravava ator `anonymous`).
2. **`src/proxy.ts` sem nenhum teste unitário** e fora do `coverage.include` — o
   arquivo mais crítico de segurança era o único sem rede de proteção.
3. **Modo aberto fail-open por `NODE_ENV`.** Bastava `NODE_ENV !== "production"` e auth
   não configurada para liberar o prontuário inteiro. Num self-hosted onde alguém
   esquecesse `NODE_ENV=production`, tudo ficava aberto.
4. **Nada impedia esquecer uma rota nova.**

## Opções consideradas

| Opção | Prós | Contras |
|---|---|---|
| **A. Proxy + guarda por handler** | Defesa em profundidade; é o que a doc do Next 16 recomenda; auditoria com ator real | Duas linhas a mais por handler (~83 handlers) |
| B. Só o proxy (status quo) | Zero mudança | Camada única; nada impede rota nova desprotegida; auditoria anônima |
| C. Só guarda por handler (remover o proxy) | Uma fonte de verdade | Perde o redirect de páginas e o rate limit de borda; I/O antes de barrar |
| D. Wrapper `withAuth(handler)` | Impossível esquecer | Esconde a assinatura do handler, atrapalha os tipos do Next e o `params` tipado |

## Decisão

**Opção A — duas camadas, com a política declarada num módulo único.**

- **Camada 1, borda (`src/proxy.ts`)**: checagem otimista. Barra tráfego não
  autenticado cedo, redireciona páginas, aplica rate limit.
- **Camada 2, handler (`src/lib/auth/require-session.ts`)**: autorização efetiva.
  `requireStaffSession` / `requirePortalSession` são a **primeira instrução** de cada
  handler, antes de ler `params` ou tocar o banco — nada de I/O antes de autorizar.
- **Fonte da verdade única (`src/lib/auth/access-policy.ts`)**: módulo puro (só
  `pathname` + env, sem `next/server`) consumido pelas duas camadas. Allowlists
  divergentes entre camadas seriam pior do que ter uma só.
- **Modo aberto fail-closed**: exige `VITTA_ALLOW_OPEN_MODE=true` **e** fora de
  produção. Sem a variável, auth não configurada responde 503 em vez de liberar.
- **Conformidade automática** (`tests/api/route-guard-conformance.test.ts`): varre
  `src/app/api/**/route.ts` via `fs` e exige 401 sem cookie / 403 com papel de
  paciente. Rota nova sem guarda quebra o build.

Sem guarda, por decisão explícita: `api/auth/*` (precisa ser alcançável por quem ainda
não tem sessão) e `api/reminders/run` (autentica por `x-cron-secret`). Ambas estão na
`PUBLIC_PATHS`, e o teste de conformidade trava a divergência entre as duas listas.

## Consequências

**Positivas**
- Uma falha de configuração do proxy deixa de ser suficiente para expor prontuário.
- Auditoria passa a registrar o ator real em vez de `anonymous`.
- A suíte de `tests/api/` passou a rodar autenticada, exercitando o caminho que existe
  em produção em vez de um caminho sem sessão que não existe.
- `src/proxy.ts` entrou no `coverage.include` e ganhou testes unitários.

**Negativas / custos aceitos**
- Duas linhas por handler. Mitigado pelo teste de conformidade, que torna o
  esquecimento um erro de build em vez de uma vulnerabilidade silenciosa.
- A política vive em dois pontos de consumo. Mitigado por serem o mesmo módulo.

**Risco residual (fora do escopo, declarado na issue)**
- ~~Autorização por **escopo de paciente** dentro do papel `admin`: hoje qualquer conta
  de equipe lê qualquer paciente. Exige mudança no modelo de papéis.~~ Endereçado por
  [ADR-003](./003-modelo-de-papeis-multi-empresa.md): o papel `admin` monolítico é
  substituído por um catálogo de seis papéis, com Atendente restrito a dados
  operacionais e Profissional escopado dinamicamente por vínculo de agendamento/evolução.
- Rate limit é por instância (memória) — múltiplas réplicas pedem Redis.

## Relacionado

- [ADR-003: Modelo de papéis multi-empresa](./003-modelo-de-papeis-multi-empresa.md) — resolve o risco residual de escopo por paciente citado acima.
- [ADR-004: Remoção do Google OAuth como autenticação](./004-remocao-google-oauth-autenticacao.md) — muda como a sessão que este documento autoriza é estabelecida.
