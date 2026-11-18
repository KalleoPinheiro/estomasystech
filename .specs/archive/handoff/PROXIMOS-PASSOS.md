# Próximos passos (fila única de passagem de bastão, ADR-109)

Atualizada em 2026-11-18. É o **único** arquivo de passagem de bastão: quem chega lê, quem sai atualiza no mesmo
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
  produção na v0.9.1. **Não provado:** a reversão automática (só em teste) e por que a produção já respondia 0.9.1 antes do
  redisparo.
- **Não há release aberta.** Fluxo ADR-109: branch curta da `main` (`feat/`, `fix/` ou `docs/`), um PR para a
  `main` por sessão, CI como revisor, squash automático em PR comum com CI verde. Classe 3 espera o clique no
  Environment `aprovacao-classe-3`, com o link do job e só com o CI verde. Staging publica sozinha a cada
  merge na `main`. Produção sai pelo workflow *Release deploy*, com o clique no Environment `producao`.
- **Aprendizado do incidente 11-17:** o minify do servidor apagava nomes de classe e o `instanceof` entre módulos falhava
  (#918, agora com teste no gate). Cobertura do shard 3/4 falhou uma vez e passou no rerun: se repetir, abrir issue.

## Fila (ordem)

1. **v0.11.0 (tema: portões que falham abertos e prova do rollback; depois peso de JS).** Label e projeto `v0.11.0`.
   Sem P0 nem P1 abertos. Até três threads de código, nunca duas no mesmo domínio:
   1. #820, o job `impacto` pula a mutação se `impacto.ts --mutacao` falhar (P2, classe 3).
   2. #830, `protect-tests.sh` falha aberto sem `ROOT_DIR` ou `tsx` (P2, classe 3, regra 8).
   3. #832, a regra 8 não cobre opções do biome, ignores do Stryker nem `if: false` em shard (P2, classe 3).
   4. #745, CodeQL sem análise do TS por HTTP 504 (P2; migrar para advanced setup).
   5. #925, provar a reversão automática do Release deploy com a fumaça reprovando de propósito (P2, classe 3).
   6. #914, causa dos 2 a 15 KB gz a mais de JS na casca (P3, diagnóstico); depois #883 (pacote cliente do `@still-void/ui`),
      só se a causa apontar para a biblioteca. #541 fecha com a decisão.
   7. #560, spike de PPR e CSP por hash (P3), só se sobrar capacidade; nota em `.specs/`, sem merge de código.
2. **Contração da cifra** (drop de `birth_date` e dos índices GIN antigos; no e-mail de login, `email_hash` `NOT NULL`, fim do
   ramo em claro e drop dos índices antigos, ADR-111): espera só a decisão do dono na #909 (contas anonimizadas e `email_hash`).
3. **Fora da v0.11.0, por falta de urgência ou de insumo:** #815 (71 funções de complexidade, G), #651 e #650 (precisam de
   trace), #862, #849, #828, #802, #744.
4. **Funcionalidade que espera decisão do dono** (regra 5, não inventar): RM-14 WhatsApp com template da Meta
   (a clínica aceita custo por mensagem?), RM-16 oferta de vaga da lista de espera (prazo da oferta), RM-15
   relatório ao parceiro (cadência e canal), RM-05 pagamento online (PSP) e RM-17 TISS.

## Espera o dono

- **#909:** decidir como contas anonimizadas ficam com `email_hash` antes do `NOT NULL`.
- **#376** (parecer jurídico, condição para paciente real), **#654** (rotina mensal de 2026-11) e EST-16 (credenciais do
  Google Agenda em produção).
- Atualizar o Traefik (3.7.15 para 3.7.16) em horário calmo e endurecer o SSH do VPS, conforme combinado.
- P1 de segurança vem antes de tela, desempenho ou dívida. Mobile first. Cobertura: piso 90% global e 100% no
  núcleo. `Closes #N` fecha a issue no merge. Homologação no board EST quer dizer na `main` e ainda não em
  produção.
