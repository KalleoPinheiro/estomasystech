---
title: "ADR 055 — Logo e avatar: SVG sanitizado, raster recodificado, mesmo armazenamento das fotos"
status: frozen
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-21
related: [docs/adr/001-multi-tenancy.md, docs/adr/002-autorizacao-em-duas-camadas.md, docs/adr/045-borda-atras-do-traefik-app-dono-dos-cabecalhos.md, docs/domains/acesso/README.md, .design/identidade-visual-e-tema.md]
---

# ADR 055 — Logo e avatar: SVG sanitizado, raster recodificado, mesmo armazenamento das fotos

- **Data:** 2026-10-21
- **Status:** aceito (formatos e SVG decididos por @KalleoPinheiro em 2026-10-20; demais escolhas técnicas
  tomadas na implementação do #427, sob a autonomia dada em 2026-10-21).
- **Domínios afetados:** acesso (empresa e conta), engenharia (armazenamento, borda)

## Contexto

A clínica pediu logo própria e a equipe, avatar (`.design/identidade-visual-e-tema.md`). Arquivo enviado
por usuário é a superfície mais sensível do bloco: SVG é XML que executa script, foto de celular carrega
GPS da casa de quem tirou, e o avatar é foto de rosto (dado pessoal, LGPD). O armazenamento das fotos
clínicas já é privado, cifrado e isolado por clínica (ADR-001).

## Opções consideradas

| Opção | A favor | Contra |
| --- | --- | --- |
| A — guardar o SVG como veio e confiar na CSP | simples | um só erro de cabeçalho vira XSS armazenado |
| B — converter SVG em PNG no envio | zero risco de script | perde o vetor (logo borrada em tela grande); exige rasterizar no servidor |
| C — sanitizar o SVG por allowlist, **reconstruir** o arquivo e ainda servir isolado | mantém o vetor; defesa em três pontos | sanitizador próprio precisa de testes de payload |
| D — biblioteca de sanitização (DOMPurify + jsdom) | mantida por terceiros | puxa DOM inteiro para o servidor; superfície e peso maiores |

## Decisão

**Opção C**, com três barreiras independentes:

1. **Envio.** `src/domain/clinic/svg-sanitizer.ts` lê o XML com um tokenizador estrito e escreve o arquivo a
   partir de uma allowlist de elementos e atributos (o texto original nunca é gravado). Conteúdo ativo
   **rejeita o envio com erro claro** (`script`, `foreignObject`, `iframe`, `image`, `animate`/`set`,
   atributos `on*`, `javascript:`/`data:`, `href` que não seja `#fragmento`, `url()` externo, `<style>` com
   `@`, entidade e `DOCTYPE` com subconjunto interno, profundidade acima de 64, mais de 5 000 elementos).
   Sobra inofensiva de editor (metadata, `sodipodi:*`, comentário, `<?xml?>`) é descartada em silêncio.
   Referência numérica de caractere é decodificada antes de conferir (`&#106;avascript:` não escapa).
2. **Entrega.** `GET` responde `Content-Type` do formato guardado, `X-Content-Type-Options: nosniff` e
   `Content-Security-Policy: default-src 'none'; style-src 'unsafe-inline'; sandbox`. O proxy aplica essa CSP
   nessas duas rotas em vez da CSP da página (senão a do proxy poderia sobrescrever a da rota).
3. **Exibição.** Só por `<img>` (`IdentityImage`), nunca SVG inline.

**Raster** (PNG, JPEG, WebP, GIF, AVIF): recodificado em **WebP** com `sharp` (orientação do EXIF aplicada,
lado maior 512 px, sem nenhum metadado, 1.º quadro do GIF, teto de 40 Mpx contra bomba de descompressão).
Tipo vem dos bytes, nunca do `Content-Type`. Entrada até 5 MB (cabe no corpo do proxy), arquivo guardado até
1 MB. O limite de 1 MB do SVG vale para o arquivo reconstruído.

**Armazenamento.** Mesmo `PhotoStorage` das fotos clínicas (S3/R2 cifrado, ou disco local), chaves
`logo-<uuid>-<webp|svg>` e `avatar-<uuid>-<webp|svg>` em `clinics.logo_key` e `user_accounts.avatar_key`
(migração `0067`). A chave nova a cada envio troca o endereço (`?v=<chave>`) e evita cache velho; o arquivo
antigo é apagado depois de gravar a chave nova. Sem bucket na Vercel, o envio responde `503` claro e a
tela desabilita o campo com aviso. Escrita atrás de `writeScope`/escopo da clínica; logo só pelo Admin de
Empresa, avatar só pela própria conta da equipe; avatar nunca para paciente (#376).

**HEIC (spike).** O `sharp` pré-compilado **não decodifica HEIC** (o libvips dele traz AVIF, não HEVC).
Em vez de adicionar um decodificador em WASM (peso, tempo de CPU e memória por foto, licença LGPL), o
servidor reconhece HEIC pelos bytes e responde com orientação ("no iPhone, escolha a foto pela galeria; ela
converte para JPEG"), e o `accept` do campo omite HEIC: o Safari do iOS converte para JPEG no próprio
seletor. Reversível: se aparecer queixa real, entra `heic-convert` atrás do mesmo `ImageProcessor`.

**Retenção.** Conta anonimizada perde `avatar_key` na mesma instrução (foto de rosto é dado pessoal) e a API
não entrega avatar de conta inativa ou anonimizada. O arquivo sem referência fica no bucket até uma varredura
de órfãos (pendência registrada no handoff; o nome é um UUID e o bucket é privado).

**Limite de envio.** 10 por minuto por conta (avatar) ou clínica (logo): recodificar imagem custa CPU.

## Consequências

- Uma dependência nova direta, `sharp` (já vinha de `next`, agora declarada e sem ser opcional).
- O sanitizador é código de segurança nosso: qualquer payload novo ganha caso em
  `tests/domain/svg-sanitizer.test.ts` antes de qualquer ajuste.
- Logo e avatar saem sempre como WebP ou SVG: o arquivo original não é recuperável.
- Reversibilidade: trocar SVG por PNG (opção B) é barato (só o `ImageProcessor`); apagar o campo é uma
  migração de coluna nula.
