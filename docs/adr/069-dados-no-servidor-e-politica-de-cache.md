---
title: "ADR 069 — Telas carregam dados no servidor e nenhum dado de clínica entra em cache compartilhado"
status: frozen
audience: [dev, agent, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-25
related:
  - docs/engineering/performance-front-linha-de-base-2026-10.md
  - docs/adr/001-multi-tenancy.md
  - docs/adr/002-autorizacao-em-duas-camadas.md
  - docs/engineering/architecture.md
---

# ADR 069 — Telas carregam dados no servidor e nenhum dado de clínica entra em cache compartilhado

- **Data:** 2026-10-24
- **Status:** aceito em 2026-10-25 pelo orquestrador como Product Owner, ao implementar a fundação ([#544](https://github.com/KalleoPinheiro/estomasystech/issues/544), [ADR-074](074-fundacao-server-first-sessao-dados-e-acoes.md)).
- **Domínios afetados:** todos os que têm tela (agenda, pacientes-prontuario, financeiro, estoque, equipe-parceiros, relatorios, acesso, portal)

## Contexto

A linha de base de 2026-10-24 ([`performance-front-linha-de-base-2026-10.md`](../engineering/performance-front-linha-de-base-2026-10.md)) mostrou que o app usa o Next.js 16.4 como um SPA:

- **33 de 34 páginas são `'use client'`** e buscam os dados no navegador depois da hidratação (`useApiQuery` → `/api/*`). Não há nenhuma Server Action, nenhum `loading.tsx`, `error.tsx` ou `not-found.tsx`.
- No celular (CPU 4x, 1,6 Mbps), o primeiro pixel sai em ~0,8 s, mas o dado só chega em **~2,9 s** (mediana) e **18 de 28 rotas** passam de 2,5 s de LCP. Telas fazem até **13 chamadas `/api`** em cascata depois da hidratação.
- **CLS ruim**: Hoje 0,81, Configurações 1,10, Portal 0,33; no desktop, 18 de 28 rotas ficam em ~0,18 (conteúdo que aparece depois do esqueleto).
- **Fotos clínicas passam pelo otimizador de imagem** (`next/image` sem `unoptimized` apontando para `/api/photos/:id`). O otimizador busca a foto internamente **sem o cookie da sessão** (`fetchInternalImage` monta a requisição com `headers: {}`), então a foto volta 401 e a miniatura não aparece. Se algum dia a rota aceitasse a busca, o resultado ficaria no cache em disco do otimizador (`.next/cache/images`), **compartilhado entre todos os usuários e clínicas**.

O produto trata dado de saúde sob LGPD ("segurança do dado vem antes de crescimento"), é multiempresa ([ADR-001](001-multi-tenancy.md)) e usa CSP estrita com nonce por requisição (issue #76), que obriga renderização dinâmica de todas as páginas.

Recursos do Next 16.4 avaliados (documentação em `node_modules/next/dist/docs/`): Server Components, Server Actions (`refresh`, `revalidatePath`, `revalidateTag`, `updateTag`), Cache Components (`cacheComponents`, `use cache`, `use cache: private`, `use cache: remote`, `cacheLife`, `cacheTag`), Partial Prefetching/PPR, `loading.tsx`/`error.tsx`/`not-found.tsx`/`forbidden.tsx`, streaming com `<Suspense>`, `next/link`, `next/image`, `next/font`, `next/dynamic`, `after()`, `useReportWebVitals`, `next analyze` (Turbopack), `optimizePackageImports`, `experimental.sri`.

## Opções consideradas

| Opção | A favor | Contra |
| --- | --- | --- |
| A — Manter o SPA e só enxugar o bundle | Nenhuma reescrita | Não resolve a cascata de `/api` nem o CLS; o dado continua chegando depois da hidratação |
| B — Cache Components + PPR (`cacheComponents: true`) | Casca estática instantânea, `use cache` com tags | **Incompatível com CSP por nonce** (a casca estática não tem o nonce; docs § "Static vs Dynamic Rendering with CSP"); `use cache` guarda no servidor entre requisições, risco direto de vazar dado entre clínicas por erro de chave |
| C — Server Components com dado por requisição, Server Actions, streaming, sem cache compartilhado de dado de clínica | Mantém a CSP com nonce; dado chega no HTML; zero risco de cache entre clínicas; reaproveita os casos de uso de `src/application` | Reescrita tela a tela; exige guarda de sessão por `cookies()` além da de `NextRequest` |

## Decisão

**Opção C**, com estas regras:

### 1. Onde o dado é lido

- Toda tela carrega o dado inicial num **Server Component** por uma camada de acesso a dados (`src/lib/server/*`, com `import 'server-only'`) que chama os casos de uso de `src/application` com `sessionScope`/`writeScope` (regra 1 do AGENTS.md). A sessão vem de `cookies()` e é deduplicada por requisição com `React.cache()`.
- A página continua dinâmica (CSP com nonce). Partes lentas ficam atrás de `<Suspense>` com fallback do Still Void, para o resto da tela sair antes (streaming). Cada grupo de rotas tem `loading.tsx`, `error.tsx` e `not-found.tsx`.
- Componente cliente só para interatividade (formulário, sheet, filtro, gráfico). Ele recebe o dado por props, já serializado como DTO (`src/lib/dto`), nunca a entidade de domínio.
- **Route Handlers ficam** para: integrações e cron, download/stream de arquivo e foto, upload de foto, paginação incremental ("carregar mais") e buscas digitadas, e o que outro cliente além das telas consome. Rota de leitura que só servia uma tela é removida quando a tela migra.

### 2. Como a tela escreve

- Mutação disparada pela tela vira **Server Action** com o mesmo contrato das rotas: guarda de sessão e papel dentro da ação (ação é endpoint público), `zod` na entrada, `writeScope`, auditoria e o envelope `{ success, data, error }`. Depois de gravar, `refresh()` (ou `revalidatePath` da rota afetada) atualiza a tela; não há `router.refresh()` manual nem refetch no cliente.
- Upload de foto continua em Route Handler (corpo de até 6 MB e streaming para o S3).
- **Rotas com limite de taxa próprio no Traefik continuam Route Handlers**: login, esqueci a senha, definir senha, segundo fator, agendamento e lista de espera do portal (`rate-limit-strict`, ver [`producao.md`](../engineering/producao.md)). Uma Server Action faz `POST` no caminho da página, fora desses caminhos, e escaparia do limite.
- O limite por IP que o `src/proxy.ts` aplica a `/api/*` passa a valer também para o `POST` de Server Action (requisição com cabeçalho `Next-Action`), antes da primeira ação entrar em produção.

### 3. Política de cache (LGPD)

| Dado | Cache permitido | Mecanismo |
| --- | --- | --- |
| Qualquer dado de paciente, prontuário, foto, agenda, financeiro, estoque, auditoria, conta ou sessão | **Nenhum cache compartilhado.** Só deduplicação dentro da mesma requisição | `React.cache()`; resposta `Cache-Control: private, no-store` |
| Configuração da clínica (catálogo de procedimentos, grade, tema, identidade) | **Nenhum cache compartilhado** nesta fase (é dado da empresa; o ganho não paga o risco de chave errada) | `React.cache()` por requisição |
| Dado global sem empresa e sem pessoa (textos legais, taxonomia global, versão do sistema) | Permitido | constante no bundle, ou `unstable_cache` com tag global e `revalidateTag` na escrita |
| Imagem estática pública (marca, favicon) | Permitido | `next/image` com `images.localPatterns` restrito a esses caminhos |
| Foto clínica, logo e avatar servidos por rota autenticada | **Nunca** pelo otimizador | `next/image` com `unoptimized` (ou `<img>`), resposta da rota com `Cache-Control: private, no-store` |
| Cache do roteador no navegador | Padrão do Next (páginas dinâmicas com `staleTimes.dynamic = 0`); não aumentar | — |
| Cache de `fetch` para serviços externos (Resend, Google) | Nenhum | `cache: 'no-store'` explícito e `AbortSignal.timeout` |

`use cache`, `use cache: remote`, `use cache: private` e `cacheComponents` **não entram** nesta fase (ver item 4). O cache em memória de relatório de mês fechado (`src/lib/report-cache.ts`, chave com a empresa) fica como está, por ser por processo e já chaveado por `clinicId`.

### 4. Cache Components e PPR

Não habilitar agora: a documentação do Next 16.4 diz que PPR é incompatível com CSP por nonce, e trocar o nonce por hash/SRI (`experimental.sri`) é experimental e exige revalidar a CSP do script de tema. Reavaliar num spike isolado (sem merge) quando o SRI sair de experimental, medindo contra esta linha de base.

### 5. Hidratação

Zero erro ou aviso de hidratação em qualquer rota, largura, tema e fuso. Datas e horas renderizadas no servidor e no cliente usam fuso e locale explícitos (os mesmos nos dois lados); nada de `Date.now()`, `window`, `localStorage` ou `Math.random()` no render; IDs por `useId`. Estilo injetado em tempo de execução (ex.: bloqueio de rolagem dos diálogos) recebe o nonce da requisição; a CSP não ganha `'unsafe-inline'`. Uma suíte E2E permanente falha em qualquer mensagem de hidratação ou de violação de CSP no console.

### 6. Navegação e assets

Link interno é `next/link` (prefetch padrão); `<a>` só para link externo (`wa.me`, `mailto:`), âncora na mesma página ou documento aberto em nova aba, com comentário. Fontes seguem por `next/font/local` (já adotado). Componente pesado e raro (gráfico, QR, leitor de arquivo) entra por `next/dynamic`.

## Consequências

**Positivas**

- O dado chega no HTML: some a cascata de `/api` depois da hidratação e o salto de layout do esqueleto.
- Menos JavaScript por rota à medida que as páginas deixam de ser `'use client'`.
- Nenhuma superfície nova de vazamento entre clínicas: não existe cache de servidor com dado de empresa.
- Mutações ganham proteção nativa de origem das Server Actions e revalidação sem código no cliente.

**Negativas / custos aceitos**

- Toda página continua renderizada por requisição (o custo da CSP com nonce); o ganho vem de cortar a ida e volta do cliente, não de cache.
- Migração tela a tela, com testes de componente e E2E reescritos onde o requisito não muda só no "como" (regra 8: teste novo é livre; teste existente só muda com `TESTE-ALTERADO`).
- Duas guardas de sessão convivem (por `NextRequest` nas rotas e por `cookies()` nas páginas e ações), ambas sobre `verifySessionToken`.

**O que esta decisão fecha:** cache de servidor com dado de clínica. Reabrir exige ADR novo com análise de chave por empresa e teste de isolamento entre clínicas.

## Relacionado

- Linha de base: [`performance-front-linha-de-base-2026-10.md`](../engineering/performance-front-linha-de-base-2026-10.md)
- [ADR-001](001-multi-tenancy.md) (escopo de empresa), [ADR-002](002-autorizacao-em-duas-camadas.md) (autorização em duas camadas)
- Issue-mãe: [#541](https://github.com/KalleoPinheiro/estomasystech/issues/541) (sub-issues #542 a #560)
