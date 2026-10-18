---
title: "ADR 036 — Traefik do Coolify como único proxy de entrada (sem Caddy)"
status: frozen
audience: [dev, po, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-18
related: [docs/engineering/producao.md, docs/adr/015-servidor-sem-cifra-de-disco.md]
---

# ADR 036 — Traefik do Coolify como único proxy de entrada (sem Caddy)

- **Data:** 2026-10-18
- **Status:** aceito. Substitui o Caddy da decisão do #206 (2026-10-11).
- **Domínios afetados:** engenharia (deploy, proxy, rate limit)

## Contexto

A VPS Hetzner roda o Coolify v4, cujo Traefik já ocupa 80/443 e emite os certificados Let's
Encrypt. O `docker-compose.prod.yml` subia um Caddy nas mesmas portas: conflito, e dois
terminadores de TLS para operar. @KalleoPinheiro pediu o Traefik do Coolify como único porteiro e
nenhuma indicação de Caddy no repositório.

## Decisão

- Remover o serviço `caddy`, os volumes `caddy_*`, `APP_DOMAIN` e `deploy/Caddyfile`.
- O Traefik do Coolify termina o TLS. Atrás dele (sem Cloudflare) há **um salto**:
  `TRUSTED_PROXY_HOPS=1`.
- Formato recomendado: Dockerfile do app + Postgres gerenciado pelo Coolify. O compose de produção
  continua funcionando atrás do Traefik: app e banco sem porta no host, domínio por
  `SERVICE_FQDN_APP_3000` e middlewares `@file` (`rate-limit-app`, `rate-limit-strict`,
  `security-headers`) pela label `coolify.traefik.middlewares`.

## Consequências

- Um só ponto de entrada e de certificados, gerido pelo Coolify.
- Cloudflare na frente exige configurar `forwardedHeaders.trustedIPs` no Traefik antes de usar
  `TRUSTED_PROXY_HOPS=2`.
- Pergunta aberta (do dono): Dockerfile ou compose no Coolify; o repositório suporta os dois.
