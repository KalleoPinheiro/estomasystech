# Spike #560 — Cache Components, PPR e CSP por hash

Retrato de 2026-11-18 na `main` @ `ac18e52` (Next.js 16.4.5). Não é decisão de produto nova: a [ADR-069](../docs/adr/069-dados-no-servidor-e-politica-de-cache.md) § 4 continua valendo. Flags experimentais não entram na `main`.

> **Recomendação: rejeitar.** Ligar `cacheComponents`, `partialPrefetching` e `experimental.sri` não produz casca estática (o build para em `/_not-found`) e o ganho medido de LCP/TTFB é **0 ms**. O teto, se o servidor deixasse de renderizar, é o TTFB: **24 ms**, **3%** do LCP de **804 ms** em 360 px. O elemento de LCP é o conteúdo da tela (título, paciente, vazio da agenda), que já vem no HTML `no-store`. A CSP por hash do guia do Next bloqueia o script de tema: com o aparelho em escuro, a página permanece clara.

Comparação com a [medição final](../docs/engineering/performance-front-medicao-final-2026-11.md) (main @ `9df8b9f`): TTFB local 21 a 25 ms e LCP mediano 868 ms em 360 px, com LCP igual ao FCP. Este retrato, na mesma régua e numa máquina diferente, fica na mesma faixa (TTFB 24 ms, LCP 804 ms). Staging e produção continuam sem medição de TTFB/LCP, como já diz o § 5 daquele documento.

## 1. O que foi ligado, e onde

Branch descartável, em cima de `ac18e52`, sem commit. Três mudanças, as da issue mais o passo que o guia de migração do Next 16.4.5 exige para o flag fazer alguma coisa:

- `cacheComponents: true`
- `partialPrefetching: true` (a doc diz que sem `cacheComponents` o build recusa a config)
- `experimental.sri: { algorithm: 'sha256' }`
- remoção de `export const dynamic = 'force-dynamic'` no layout raiz (`src/app/layout.tsx`). Sem isso a página continua inteira dinâmica, que é o comportamento atual, e não há casca para medir.

O build de controle, sem essas mudanças, marca **todas as rotas de página como dinâmicas** (`ƒ`). O único prerender estático é `/manifest.webmanifest`.

O build do spike compilou e morreu na geração estática:

```text
Error: Route "/_not-found": Next.js encountered uncached or runtime data during prerendering.
`fetch(...)`, `cookies()`, `headers()`, `params`, `searchParams`, or `connection()` accessed outside of `<Suspense>`
Export encountered an error on /_not-found/page, exiting the build.
```

A causa é o layout raiz, que toda rota herda, inclusive o 404: `headers()` para o nonce e `loadClinicTheme()` (`cookies()` + leitura da clínica). O guia de migração diz que essa leitura fora de `<Suspense>` impede o prerender. Não há casca das telas da equipe para servir, então não há número de LCP “com PPR”. O ganho medido é 0 ms.

No mesmo build o prerender chegou a abrir o cliente de banco (`DATABASE_URL não configurada` no log de readiness). O build dinâmico de controle não faz isso. A mensagem de erro oferece `"use cache"` como um dos consertos. Esse caminho gravaria a leitura no cache compartilhado do servidor. Não vale para `loadClinicTheme` nem para `loadStaffShell`: os dois leem o cookie da sessão; o casco ainda lê o nome da clínica, o e-mail da conta e a contagem da triagem ([ADR-069](../docs/adr/069-dados-no-servidor-e-politica-de-cache.md) § 3).

## 2. Régua

Mesma da medição final, § 1: build de produção (`next start`, Next.js 16.4.5), PGlite com a semente do `global-setup`, Admin de Empresa, Chromium, uma visita de aquecimento e a carga medida sem cache HTTP.

| Largura | CPU | Rede |
| --- | --- | --- |
| 360 × 740 | 4x | 1,6 Mbps, 150 ms |
| 1280 × 800 | sem limite | sem limite |

Rotas: as da casca da equipe na tabela do § 3 da medição final (painel, agenda, pacientes, ficha, triagem, faturamento, repasses, materiais, procedimentos, profissionais, parceiros, relatórios, auditoria, pedidos do titular, configurações, minha conta, mais). 390 e 768 px não foram refeitas: no retrato o LCP delas acompanha o de 360 e o de 1280, e a pergunta é o teto da casca.

O beacon `web-vital` do próprio app registrou LCP igual ao FCP em todas as cargas medidas. O `performance.getEntriesByType('largest-contentful-paint')` deste Chromium voltou vazio; o FCP da Navigation Timing bate com o beacon, e o elemento veio do `PerformanceObserver`. O TTFB abaixo é o `responseStart` da Navigation Timing. Como no retrato, a latência emulada de 150 ms não aparece nesse número (o TTFB em 360 ficou em dezenas de milissegundos, não em 150+).

## 3. Números em 360 px, contra o retrato

| | Retrato `9df8b9f` | `ac18e52`, casca da equipe |
| --- | ---: | ---: |
| Rotas | 28 (o app inteiro) | 17 (casca da equipe, com a ficha) |
| TTFB mediano | 21 a 25 ms | **24 ms** (12 a 38) |
| LCP mediano | 868 ms | **804 ms** |
| LCP pior | 940 ms | **844 ms** (`/agenda`) |
| LCP = FCP | sim | sim, 17/17 |
| HTML | — | gzip 6 a 9 KB; `responseEnd` mediano **199 ms** |
| `Cache-Control` | — | `private, no-cache, no-store, max-age=0, must-revalidate` em 17/17 |

O miolo do LCP não é o servidor. O HTML termina por volta de 199 ms e o LCP sai aos 804 ms: cerca de **600 ms** são o JS e o CSS sob CPU 4x e 1,6 Mbps. Uma casca estática não tira esse JS. Tirar os 24 ms de TTFB deixaria o LCP em ~780 ms, ainda na mesma faixa do retrato.

| Rota | TTFB (ms) | LCP (ms) | Elemento de LCP |
| --- | ---: | ---: | --- |
| `/` | 30 | 832 | título «Consultas de hoje» |
| `/agenda` | 33 | 844 | vazio «Nenhuma consulta agendada neste mês.» |
| `/pacientes` | 20 | 800 | e-mail do paciente semeado |
| `/pacientes/[id]` | 29 | 804 | nome do paciente semeado |
| `/triagem` | 23 | 776 | título «Triagem de fotos» |
| `/faturamento` | 21 | 816 | título «Faturamento» |
| `/repasses` | 27 | 832 | texto do fechamento do mês |
| `/materiais` | 25 | 808 | título «Materiais e estoque» |
| `/procedimentos` | 24 | 800 | texto do catálogo |
| `/profissionais` | 38 | 784 | título «Profissionais» |
| `/parceiros` | 12 | 812 | texto dos parceiros |
| `/relatorios` | 22 | 804 | título «Relatório gerencial» |
| `/auditoria` | 25 | 792 | texto da trilha |
| `/pedidos-titular` | 15 | 792 | texto dos pedidos |
| `/configuracoes` | 20 | 804 | texto da razão social |
| `/minha-conta` | 24 | 792 | texto da senha e do segundo fator |
| `/mais` | 25 | 788 | marca «EstomaSysTech» |

Em 1280 px, sem limite, o beacon deu LCP igual ao FCP: painel 80 ms, agenda 104 ms, lista de pacientes 72 ms, ficha 116 ms. A mediana de 1280 no retrato, nas 28 rotas, é 84 ms.

O nome da clínica semeada está no HTML das 17 rotas. O nome do paciente semeado está em `/pacientes`, na ficha e na auditoria. Esse HTML é a resposta `no-store` de uma sessão. Não é candidato a casca compartilhada: o elemento que o LCP mede está nele.

## 4. O que quebra no script de tema

O script é `clinicThemeScript` (`src/lib/theme.ts`), inline no `<head>` do layout raiz, com `nonce` lido de `x-nonce`. O corpo embute o modo e a cor da clínica. São 3 modos × 4 cores = **12 corpos, 12 SHA-256 distintos**. O padrão `system`/`violet` é `sha256-NMYzni1TprRhrgI2GVQnjKjDflFnPvOtPCWKKCBEs8Y=`.

A doc do Next 16.4.5 (`content-security-policy.md`, seção Subresource Integrity) ainda marca `experimental.sri` como experimental e diz que o hash é gerado no build para os arquivos JS, com a limitação «Build-time only: Cannot handle dynamically generated scripts». O `experimental.sri` deste pacote grava um manifesto de integridade dos arquivos do build. Não emite hash de script inline.

Prova no HTML de produção de `/`, com o aparelho em `prefers-color-scheme: dark` (a clínica semeada segue o aparelho; o servidor, sem essa informação, manda claro):

| CSP de `script-src` | `data-theme` depois da carga | Violações |
| --- | --- | --- |
| A de hoje: `'self'`, nonce da requisição, `'strict-dynamic'` | `dark` | 0 |
| A do exemplo de SRI no guia: só `'self'` | `light` (o script não rodou) | 4 scripts inline bloqueados |

O Chrome nomeou o hash que aceitaria o script de tema: o de `system`/`violet`, acima. A mesma resposta exigiu outros três hashes, de scripts inline do próprio Next, que hoje passam porque o framework carimba o nonce. Um hash só não libera a página. Uma lista estática com os 12 hashes do tema ainda deixaria os três do framework de fora, e o corpo certo continua dependendo da clínica da requisição: a casca prerenderizada não tem como escolher qual dos 12 escrever.

`strict-dynamic` com nonce, que é a CSP atual (`src/proxy.ts`), faz o navegador ignorar `'self'` para script. Trocar o nonce por SRI sem tirar `strict-dynamic` não é o exemplo do guia; o exemplo tira os dois e, como a tabela mostra, bloqueia o inline.

O nonce de estilo fica de fora do SRI. O `<style>` do bloqueio de rolagem dos diálogos depende de `setNonce` (`src/app/providers.tsx`, issue #562). Sem nonce em `style-src-elem`, esse estilo volta a ser bloqueado, ou a CSP ganharia `'unsafe-inline'`, o que a ADR-069 § 5 não aceita. Isso não foi reexecutado no navegador neste spike; é o contrato do código e do teste `e2e/modal-csp.spec.ts`.

## 5. Dado de clínica no cache

Hoje a resposta das 17 rotas é `private, no-store`. Não há `use cache` em `src/`. O cache de relatório de mês fechado continua o de processo, com a empresa na chave, como a ADR-069 deixou.

Ligar o flag não cria sozinho um cache compartilhado: o build quebra antes. O risco é o conserto que a mensagem do Next oferece, e o que a própria doc descreve quando a rota lê `cookies()`:

- `"use cache"` na leitura do tema ou do casco gravaria, no cache do servidor, modo e cor, nome da clínica, e-mail da conta e contagem da triagem. A doc de autenticação com Cache Components diz que `use cache: private` usa o perfil `default`, com `stale` de 5 minutos, se ninguém escolher outro.
- A doc de `partialPrefetching` diz que rota que lê `cookies()` ou `headers()` produz um App Shell com o dado da sessão, em cache no cliente por sessão, não no cache compartilhado do servidor. O casco da equipe é exatamente essa leitura (`loadStaffShell` → `requireStaffPage`). Seria dado da clínica (nome, conta, triagem) num cache de prefetch, em cima de uma resposta que hoje é `no-store`. A ADR-069 § 3 manda não aumentar o cache do roteador nas páginas dinâmicas.

Nenhum desses dois caches foi observado em execução: o build não terminou. São o comportamento que a doc do Next 16.4.5 descreve para o arranjo que destravaria a casca.

## 6. Por que não adiar

Adiar até o SRI sair de experimental não muda o resultado. O SRI do 16.4.5 não cobre script inline, o script de tema muda com a clínica, o LCP é o conteúdo dessa clínica, e o TTFB já é 3% desse LCP. A incompatibilidade que a ADR-069 § 4 citou (PPR incompatível com CSP por nonce, na seção «Static vs Dynamic Rendering with CSP») segue escrita na doc do 16.4.5.

Reabrir só faria sentido se o Next passasse a autorizar o script inline de tema sem nonce por requisição e sem colocar nome, conta, triagem ou prontuário num cache compartilhado ou de prefetch. Isso não está neste pacote. Sem isso, não há ADR novo.
