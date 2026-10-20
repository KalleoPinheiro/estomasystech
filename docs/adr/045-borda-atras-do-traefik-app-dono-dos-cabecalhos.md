---
title: "ADR 045 — Borda atrás do Traefik: o app é dono dos cabeçalhos; 1 salto provado"
status: frozen
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-20
related: [docs/adr/036-traefik-do-coolify-como-unico-proxy-de-entrada.md, docs/adr/014-observabilidade-sem-pii.md, docs/engineering/producao.md]
---

# ADR 045 — Borda atrás do Traefik: o app é dono dos cabeçalhos; 1 salto provado

- **Data:** 2026-10-20
- **Status:** aceito (fecha os itens de borda da [#381](https://github.com/KalleoPinheiro/estomasystech/issues/381); complementa o [ADR-036](036-traefik-do-coolify-como-unico-proxy-de-entrada.md))
- **Domínios afetados:** engenharia (proxy, cookies, rate limit, logs)

## Contexto

O app está no ar atrás do Traefik do Coolify. Faltava provar pela resposta quatro coisas: o
número de saltos do `x-forwarded-for`, os cabeçalhos sem duplicidade, os atributos dos cookies e
a ausência de dado pessoal nos logs.

## Decisão

1. **`TRUSTED_PROXY_HOPS=1` está correto.** Prova em produção (2026-10-20): 9 `POST /api/auth/login`
   com corpo vazio, cada um com um `x-forwarded-for` forjado diferente, respondem `401` cinco vezes e
   `429` (mensagem do app, não do Traefik) da sexta em diante. Se o app confiasse no início da
   cadeia, a chave mudaria a cada requisição e o limite por IP nunca dispararia.
2. **O app é o dono dos cabeçalhos de segurança.** `next.config.ts` envia HSTS, `X-Frame-Options`,
   `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy` e os `Cross-Origin-*`;
   `src/proxy.ts` envia a CSP com nonce. O roteador https do Traefik **não** referencia
   `security-headers@file`: o middleware só repetiria cabeçalhos que o app já manda e, se um dia
   definisse CSP, quebraria o nonce. Resposta de `/login` medida: cada cabeçalho aparece uma vez.
   O middleware segue definido no arquivo do proxy para uso futuro em recursos sem cabeçalhos próprios.
3. **Cookies.** Todo `Set-Cookie` de criação sai `Secure`, `HttpOnly` e `SameSite=Lax` quando
   `NODE_ENV=production`, sem depender de `x-forwarded-proto` (o Traefik termina o TLS e o HTTP
   redireciona `307` para HTTPS). Os cookies que **expiram** (logout, fim do fluxo OAuth, saída do
   paciente representado) saíam sem `Secure` e `SameSite`; agora usam os mesmos atributos
   (`expiredCookieOptions`), cobertos por `tests/lib/cookie-options.test.ts`.
4. **Logs e GlitchTip (ADR-014).** Auditoria do código: o único escritor em stdout é o
   `logger.ts` (JSON por linha); e-mail aparece só mascarado (`maskEmail`); o dry-run do
   `NullEmailGateway` nunca loga o corpo nem, em produção, o link de senha; o evento do GlitchTip é
   montado por lista do que pode sair (`buildEvent`) e `scrubEvent` remove `request`, `user`,
   `breadcrumbs`, `extra` e `contexts`. Nenhuma chamada de `logger.*` leva e-mail, telefone, CPF
   ou nome em campo.

## Consequências

- Nada de configuração nova no Coolify: os rótulos reais (lidos do container em 2026-10-20) já são
  `gzip,noindex,rate-limit-app@file` no https e `strict-<id>` com `rate-limit-strict@file`.
- Rota futura com Cloudflare na frente: repetir a prova de 1 com `TRUSTED_PROXY_HOPS=2` (ADR-036).
- **Não verificado em produção:** o conteúdo dos logs do container e os eventos do GlitchTip em
  execução (leitura de log de produção não foi liberada na sessão). A garantia é do código e dos
  testes; uma varredura por amostra fica com quem tem acesso (runbook § 9.6).
