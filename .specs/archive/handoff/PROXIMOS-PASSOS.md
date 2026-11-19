# Próximos passos (fila única de passagem de bastão, ADR-109)

Atualizada em 2026-11-19. É o **único** arquivo de passagem de bastão: quem chega lê, quem sai atualiza no mesmo
PR (tira o que entregou, move o que mudou, acrescenta o que surgiu). Curto, em lista, sem nome de fornecedor.
O remoto e as issues valem se divergirem; quem notar corrige aqui.

## Estado

- **Produção:** v0.9.1 (commit `62026276`), publicada em 2026-11-18 pelo *Release deploy* real (run 44217263061): migração `0084`
  aplicada pelo dono antes do deploy, fumaça verde, tag `v0.9.1`, sem rollback. Lista e busca de Pacientes conferidas pelo dono.
  Rollback = redeploy da tag anterior (`0084` só amplia); a `0072` (CPF único) segue não aditiva para voltar abaixo da v0.8.0.
- **A `main` não está à frente da produção em funcionalidade.** Tudo da v0.10.0 já está na v0.9.1: isolamento por clínica
  (45 tabelas com `FORCE ROW LEVEL SECURITY`, #870 a #874, #889, #894), e-mail de login cifrado (ADR-111, #742), login na
  trilha pelo id da conta (#887, ADR-112), Web Vitals de campo e medição final (#903 a #905), CLS da ficha (#906),
  comparação de fotos à escolha (#907), snapshot único em `findAll` (#855), RLS independente da ordem (#896), agenda
  sob demanda e índice `0084`. Issues e EST dessas entregas estão fechadas e em produção.
- **Cifra em produção conferida:** o script de integridade de 2026-11-17 provou 84 de 84 carimbos de migração, hashes `0074` a
  `0083` iguais aos do Drizzle e nenhum dado em claro (incluindo e-mail de login). O `data:reencrypt` já rodou; não há divergência
  de migração a conferir.
- **Release deploy** migra com o dono **antes** do deploy, trava se a migração falhar, reverte a imagem se a fumaça reprovar e
  ensaia a migração no `dry_run` (ADR-113, `producao.md` § 4.9); Auto Deploy do Coolify desligado, o preflight confere. Provado em
  produção na v0.9.1. A reversão automática é ensaiada em todo `dry_run` e publicação (#925: `ensaio-rollback.sh` contra simulador do Coolify, `producao.md` § 4.9);
  só a troca real de container não foi vista. **Não provado:** por que a produção já respondia 0.9.1 antes do redisparo.
- **Não há release aberta.** Fluxo ADR-109: branch curta da `main` (`feat/`, `fix/` ou `docs/`), um PR para a
  `main` por sessão, CI como revisor, squash automático em PR comum com CI verde. Classe 3 espera o clique no
  Environment `aprovacao-classe-3`, com o link do job e só com o CI verde. Staging publica sozinha a cada
  merge na `main`. Produção sai pelo workflow *Release deploy*, com o clique no Environment `producao`.
- **Aprendizado do incidente 11-17:** o minify do servidor apagava nomes de classe e o `instanceof` entre módulos falhava
  (#918, agora com teste no gate). Cobertura: um shard falhou e passou no rerun no #923 (3/4) e no #932 (2/4), #933. O log não dizia qual teste (só `blob`); o job agora loga o teste vermelho e sobe o blob mesmo com falha. Se repetir, ler o log e corrigir o teste de origem (sem retry nem timeout maior).
- **#560 (PPR e CSP por hash): rejeitado.** Nota em `.specs/spike-ppr-csp-hash-560.md`. Sem flag na `main` e sem ADR
  novo: a ADR-069 § 4 segue. O build com `cacheComponents` não gera casca; o TTFB da casca da equipe é 24 ms contra
  LCP 804 ms em 360 px (3%).

## Fila (ordem)

1. **v0.11.0 (tema: portões que falham abertos e prova do rollback).** Label e projeto `v0.11.0`.
   Sem P0 nem P1 abertos. Até três threads de código, nunca duas no mesmo domínio:
   1. ~~#820~~ o job `impacto` falha fechado (PR #927; na `main`, EST em Homologação).
   2. ~~#830~~ `protect-tests.sh` falha fechado (PR #931; na `main`, EST em Homologação).
   3. ~~#832~~ a regra 8 cobre opções do biome, ignores do Stryker e `if` de shard (PR #932; na `main`, EST em Homologação).
   4. #745, CodeQL do TS (P2). Próxima. Medido em 2026-11-18: o default setup roda verde (só 2 de 182 execuções falharam, ambas em 2026-11-08, HTTP 504 do bundle). Ver `docs/engineering/security-scan.md` § CodeQL.
   5. ~~#925~~ ensaio do rollback automático no `validar` (classe 3; PR aberto, espera o clique do dono).
2. **Contração da cifra** (drop de `birth_date` e dos índices GIN antigos; no e-mail de login, `email_hash` `NOT NULL`, fim do
   ramo em claro e drop dos índices antigos, ADR-111): decisão da #909 tomada no ADR-114 (anonimizada: `email_hash` NULL; ativa: obrigatório) e a restrição `NOT VALID` entra na `0085` (PR #939, classe 3, espera o clique do dono; fixtures já na main pelo PR #942). Falta: `VALIDATE`, fim do ramo em claro e drop dos índices antigos do e-mail.
3. **Fora da v0.11.0, por falta de urgência ou de insumo:** #815 (71 funções de complexidade, G), #651 e #650 (precisam de
   trace), #862 (a #828 entra no PR #937; a #802 e a #744 foram fechadas como obsoletas em 2026-11-19: o código que citavam saiu com o ADR-109).
   #560 está fora: a nota rejeitou o PPR.
4. **Decididas (ADR-114), prontas para implementar:** RM-16 (oferta de 2 h por e-mail) e RM-15 (relatório mensal por e-mail, sem dado clínico).
   **Espera decisão do dono** (regra 5, não inventar): RM-14 WhatsApp com template da Meta
   (a clínica aceita custo por mensagem?), RM-05 pagamento online (PSP) e RM-17 TISS.

## Espera o dono

- **#376** (parecer jurídico, condição para paciente real), **#654** (rotina mensal de 2026-11) e EST-16 (credenciais do
  Google Agenda em produção).
- Atualizar o Traefik (3.7.15 para 3.7.16) em horário calmo e endurecer o SSH do VPS, conforme combinado.
- P1 de segurança vem antes de tela, desempenho ou dívida. Mobile first. Cobertura: piso 90% global e 100% no
  núcleo. `Closes #N` fecha a issue no merge. Homologação no board EST quer dizer na `main` e ainda não em
  produção.
