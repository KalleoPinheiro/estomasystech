---
title: "ADR 086 — Web Vitals de campo no log estruturado: um envio por visita, só com sessão, sem identidade"
status: living
audience: [dev, agent, po]
owner: "@KalleoPinheiro"
last_reviewed: 2026-11-01
related:
  - docs/adr/060-redacao-central-de-pii-nos-logs.md
  - docs/adr/069-performance-front-linha-de-base.md
  - docs/adr/074-fundacao-server-first-sessao-dados-e-acoes.md
  - docs/engineering/producao.md
---

# ADR 086 — Web Vitals de campo no log estruturado: um envio por visita, só com sessão, sem identidade

- **Data:** 2026-11-01
- **Status:** aceito (decisão do orquestrador como PO e arquiteto, issue [#559](https://github.com/KalleoPinheiro/estomasystech/issues/559)).
- **Domínios afetados:** transversal (observabilidade e performance do front).

## Contexto

A frente de performance (ADR-069, ADR-074) mede em laboratório: Playwright no build local, CPU 4x, rede lenta. Isso diz se uma tela melhorou, mas não o que o celular de uma clínica sente. A #559 pede LCP, INP, CLS, TTFB e FCP de campo, lidos no log que o projeto já tem (ADR-060), sem serviço novo e sem dado pessoal.

## Decisão

1. **Coleta com `useReportWebVitals`** (`next/web-vitals`), no componente `WebVitalsReporter`, montado só nas áreas da equipe: casco da clínica e plataforma. Em `/login`, nas páginas públicas e no portal ele não existe: a rota exige sessão de equipe e a requisição recusada só sujaria o console.
2. **Um envio por visita, não cinco.** As medidas ficam num buffer (a última de cada métrica vale, porque CLS e INP se atualizam) e saem numa só requisição quando a aba é escondida ou fechada (`visibilitychange`/`pagehide`), por `navigator.sendBeacon`, com `fetch` `keepalive` de reserva. O limite geral da API é por conta (120/min) e o envio não pode disputá-lo com o trabalho da clínica.
3. **Endpoint `POST /api/me/web-vitals`**, sob o prefixo compartilhado `/api/me`: os quatro papéis de equipe enviam; sem sessão é 401, sem `AUTH_SECRET` é 503 (falha fechada, ADR-002) e paciente, responsável e parceiro recebem 403, porque a conformância de rotas (`route-guard-conformance`) exige que toda rota fora de `/api/portal` seja de equipe. Corpo `.strict()` validado com `zod`: rota, largura e de 1 a 5 medidas de `LCP|INP|CLS|TTFB|FCP`; qualquer campo a mais é 400. Responde 202.
4. **Sem identidade.** A rota perde ids (uuid, número, cadeia opaca), query e hash (`/pacientes/:id/avaliacoes`); a largura da janela é arredondada de 50 em 50 px; o log leva só métrica, valor, rating, rota, largura e papel. Nunca conta, empresa, paciente nem User-Agent. **O servidor normaliza de novo**: o corpo é entrada do cliente.
5. **Destino: o logger estruturado.** Uma linha `web-vital` por medida (ADR-060 redige tudo de qualquer forma). Sem tabela, sem serviço de terceiros; ler como em `producao.md` § 9.4.1.

## Decisão tomada: o portal fica fora por ora

O portal (paciente, responsável, parceiro), o público mais mobile, não mede campo nesta etapa. Decisão do orquestrador (2026-11-01): a rota é só da equipe e o portal segue na medição de laboratório. Medi-lo pede uma rota irmã em `/api/portal/` com a guarda do portal; acompanhado na issue [#643](https://github.com/KalleoPinheiro/estomasystech/issues/643).

## Alternativas descartadas

- **Endpoint público** (também no login): uma rota de escrita sem sessão pede limite próprio e abre o log a quem quiser. O ganho (medir o login) não paga isso; o login segue na medição de laboratório.
- **Um envio por métrica**: cinco chamadas por visita contra o limite por conta.
- **Serviço de analytics externo ou Vercel Analytics**: dado de visita da clínica fora do nosso controle; LGPD.

## Consequências

- O custo no cliente é um buffer em memória e dois ouvintes de evento.
- A leitura de campo depende do log chegar ao agregador; o roteiro está em `producao.md` § 9.4.1.
- Métricas de campo não substituem o gate de laboratório (CLS < 0,05 estrito no CI); somam o que o laboratório não vê.
