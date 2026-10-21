---
title: "ADR 057 — Instalar na tela inicial: manifesto com a marca da plataforma, sem service worker"
status: frozen
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-21
related: [docs/adr/055-logo-e-avatar-com-svg-sanitizado-e-raster-recodificado.md, docs/adr/056-tema-da-clinica-modo-padrao-cor-e-escolha-do-aparelho.md, docs/domains/acesso/README.md, .design/identidade-visual-e-tema.md]
---

# ADR 057 — Instalar na tela inicial: manifesto com a marca da plataforma, sem service worker

- **Data:** 2026-10-21
- **Status:** aceito (escolhas técnicas do #430, sob a autonomia dada em 2026-10-21).
- **Domínios afetados:** acesso (identidade visual), engenharia (proxy, metadados)

## Contexto

O #430 pede que a equipe instale o sistema na tela inicial do celular e que a logo da clínica apareça nos
documentos. Dado de saúde pesa mais que conveniência: um service worker que guarda respostas em cache pode
deixar prontuário no aparelho depois do logout.

## Decisão

1. **Manifesto sem service worker.** `src/app/manifest.ts` (`/manifest.webmanifest`) com `display:
   standalone`, `lang: pt-BR`, `start_url: /`. Sem service worker, não há cache de resposta nem modo
   offline: instalar só dá atalho e janela própria. Offline é decisão de produto e de LGPD, à parte.
2. **Marca da plataforma, igual para todas as clínicas.** O manifesto e os ícones são públicos (o navegador
   os busca sem cookie) e não sabem de qual clínica o pedido vem; servir a logo da clínica ali vazaria
   identidade entre empresas ou exigiria um identificador na URL. Os ícones (192, 512, maskable e o do iOS)
   saem de `scripts/brand/generate-icons.ts`, com os tokens do Still Void (fundo escuro e círculo da cor
   violeta, o padrão do sistema), e ficam em `public/`.
3. **Caminhos públicos por correspondência exata** em `PUBLIC_PATHS`: manifesto e os quatro PNG.
4. **Logo nos documentos.** `ClinicInfoDto.logoUrl` (opcional, só com logo enviada) alimenta o cabeçalho de
   `DocumentFrame` via `IdentityImage`. Sem logo, o papel sai só com texto, sem iniciais.

## Fora do escopo (perguntas abertas, sem regra inventada)

- **Logo no login:** antes de entrar não se sabe a clínica. Mostrar exige um identificador público
  (subdomínio ou caminho por clínica) e expõe que aquela empresa usa o sistema. Decisão de produto.
- **Logo em e-mail:** precisa de URL pública e estável da imagem (os clientes de e-mail não enviam cookie);
  a rota da logo exige sessão. Decisão de produto e de privacidade.
- **Logo em PDF gerado no servidor:** os documentos de hoje são impressos pelo navegador, então já levam a logo.

## Consequências

- Instalar no Android e no iOS funciona; as páginas continuam exigindo conexão e sessão.
- Trocar a cor padrão da marca exige regenerar os ícones (`npx tsx scripts/brand/generate-icons.ts`).
- Reversibilidade: remover `manifest.ts` e as entradas públicas desfaz tudo.
