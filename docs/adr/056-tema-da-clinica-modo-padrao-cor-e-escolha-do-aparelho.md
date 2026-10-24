---
title: "ADR 056 — Tema da clínica: modo padrão, cor da marca e escolha do aparelho"
status: frozen
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-21
related: [docs/adr/002-autorizacao-em-duas-camadas.md, docs/adr/055-logo-e-avatar-com-svg-sanitizado-e-raster-recodificado.md, docs/domains/acesso/README.md, .design/identidade-visual-e-tema.md]
---

# ADR 056 — Tema da clínica: modo padrão, cor da marca e escolha do aparelho

- **Data:** 2026-10-21
- **Status:** aceito (tema na configuração da clínica, cor só entre as 4 do Still Void e claro/escuro por
  aparelho decididos por @KalleoPinheiro em 2026-10-20/21; mapeamento de `system` e demais escolhas técnicas
  tomadas na implementação do #426, sob a autonomia dada em 2026-10-21).
- **Domínios afetados:** acesso (empresa), engenharia (renderização no servidor, tema do Still Void)

## Contexto

A fundação de tema (#425) deixou o app em claro + violeta fixos. A clínica quer a própria cor e um tema
padrão, definidos pelo Admin de Empresa para toda a equipe, sem tirar de cada pessoa o direito de usar
claro ou escuro no aparelho dela. O pacote `@still-void/ui` guarda `{ mode, accent }` no `localStorage` já na
montagem e o valor guardado vence o do servidor; o tipo `ThemeMode` só tem `light` e `dark`.

## Decisão

1. **Dados.** `clinics.theme_mode` (`light|dark|system`, padrão `system`) e `clinics.theme_accent`
   (`cyan|violet|mint|amber`, padrão `violet`), com `CHECK` no banco (migração `0068`). A regra e a lista
   fechada vivem em `src/domain/clinic/clinic-identity.ts`; cor livre (hex) não existe, porque só as quatro do
   Still Void têm contraste AA nos dois modos. Valor fora da lista cai no padrão em vez de quebrar a tela.
2. **API.** `PUT /api/settings/clinic-identity`, família administrativa (só o Admin de Empresa, ADR-002),
   com `clinicScope`/`writeClinicId` e auditoria (`clinic-theme`). O nome difere do `/api/clinic/identity` da
   issue pelo mesmo motivo do ADR-055: a família de rota é por caminho, e o teste de conformidade proíbe o
   handler de dar `403` a um papel que a família permite. A leitura vai em `identity.theme` de
   `GET /api/settings/clinic-info` (Admin) e em `clinicTheme` de `GET /api/auth/identity` (toda a equipe,
   só quando difere do padrão), para Atendente e Profissional verem sem editar.
3. **Renderização.** O layout raiz lê o cookie de sessão, busca o tema da clínica da sessão e escreve
   `data-theme`/`data-accent` no `<html>` (`src/lib/clinic-theme-server.ts`). Sem sessão (login), sem clínica
   (plataforma) ou com qualquer falha, vale o padrão `system` + `violet`: tema é cosmético e nunca derruba a
   página. Não confere revogação de sessão (o dado é só modo e cor; as rotas seguem barradas pelo proxy).
4. **Modo `system`.** O pacote não conhece `system`. O servidor o entrega como claro e um script inline (com
   nonce da CSP) resolve por `prefers-color-scheme` antes de pintar; depois, `ClinicThemeSync` acompanha a
   mudança do aparelho ao vivo. O script substitui o `ThemeScript` do pacote, que deixaria o valor guardado
   vencer a clínica.
5. **Cor da clínica sempre vence.** `ClinicThemeSync` chama `setAccent` com a cor da clínica em toda montagem
   (a cor guardada no aparelho pelo pacote é ignorada). Ao salvar em Configurações, um evento de janela troca o
   app na hora; para o resto da equipe a troca vale na próxima navegação.
6. **Modo por aparelho.** O botão claro/escuro grava a escolha numa chave própria
   (`estomasystech:modo-escolhido`), só depois de um clique, com cópia em memória se o `localStorage` estiver
   bloqueado. Sem escolha, vale o padrão da clínica. Não dá para usar a chave do pacote para isso: ela é
   gravada na montagem e faria o padrão da clínica parecer escolha do aparelho. Aparelhos que já tinham a
   chave antiga (#425) não ganham escolha por isso: seguem o padrão da clínica até o primeiro clique.

## Consequências

- Uma consulta a mais por renderização de página autenticada (a clínica da sessão), sem cache; aceitável no
  volume atual e isolada em `loadClinicTheme` para cachear depois.
- A cor fica na clínica, o modo no aparelho: duas fontes de verdade, com precedência documentada.
- Reversível: remover o tema é apagar duas colunas e o componente de sincronização.
