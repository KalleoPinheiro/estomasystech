# Próximos passos (fila única, ADR-107)

Atualizada em 2026-11-14 13:30 UTC (triagem do quadro, ADR-108). Leia junto de `reports/estado-release.md` (`npm run estado`) ao assumir. O estado
gerado diz o que está aberto agora; esta fila diz a **ordem** e o **porquê**. Se divergirem, o remoto e as issues
valem, e quem notar corrige esta fila no mesmo PR.

Regra de uso: todo PR que entrega uma issue e toda troca de agente atualiza este arquivo (tira o que entregou, move o
que mudou de posição, acrescenta o que surgiu). Curto, em lista, sem nome de fornecedor. Quem implementa **não**
mergeia; a revisora (the-judge) julga e mergeia.

## 1. Em voo na v0.7.0

1. **#761, PR #833** (mutação em `scripts/release/*-lib.ts`). Em revisão, rodada 1 com `REQUEST_CHANGES`; a
   implementadora corrige. Última pendência de código da v0.7.0. Classe 3 (toca `stryker.config.json` e
   `vitest.mutacao.config.mts`): o clique do Kalléo só depois do APPROVE no head final.
2. **#837** (ADR-108: sincronia issue, EST e fila; triagem de 2026-11-14). Só `.md`. A #834 (ADR-107) já está na release.
3. Em seguida: homologação da staging, marca `homologacao/v0.7.0` e `release:cut` (ADR-071). Depende de 1 e do
   Kalléo na homologação. Release por lote de valor, no máximo quinzenal (ADR-104).

## 2. Sem esperar o corte

4. **#819** (implementar o ADR-105: classe 3A automática e 3B humana). Vem na frente por prioridade do Kalléo
   (2026-11-14): depender menos dos cliques dele. Pelo ADR-105 a fase 1 elimina pouco clique e a própria #819 leva
   clique; o ganho vem do lote único por release (3B) nos PRs de cifra e autenticação da v0.8.0, por isso ela entra
   antes deles. A chave `CLASSE_3A_AUTOMATICA` segue `false` até lá; ligar pede clique do Kalléo.

## 3. v0.8.0 (ordem sugerida)

5. **#830** (hook de `scripts/gate/` falha aberto na nuvem): fecha a brecha da regra 8, então vem antes do que mexe no
   gate.
6. **#832**, **#831**, **#820**, **#828** (lacunas do gate, consolidação do `GATE-ALTERADO:`, `rodar_mutacao` falha
   aberta, endurecer `staging.yml`): lote do gate; um domínio por vez.
7. **#835** (check que barra PR sem atualizar esta fila). Depende do ADR-107.
8. **#750**, **#751**, **#752** (job `producao`, rollback, docs de release): dependem do #746 e do #747, que são do
   Kalléo (seção 4).
9. Cifra do cadastro: **#735** a **#741** e **#730** (P1, LGPD). Ordem pela numeração; #735 abre (migração 0071), os
   demais dependem dela. Migração não aditiva é classe 3B.
10. **#744**, **#745**, **#802** (apontamentos menores, CodeQL, check do the-judge): preenchem folga.
11. **#715** (v0.8.0): guarda-chuva de #750–#752, acompanha o item 8. **#742** (e-mail de login em claro, P2, sem label de versão): fica junto da cifra (item 9) até o Kalléo definir a versão.

Depois: v0.9.0 (#729, #557, #558, #815) e v0.10.0 (#615, #559, #541, #560, #651).

## 4. Espera o Kalléo

- **#747** (backup): Etapa 9 no VPS (chave SSH restrita e sudoers mínimo).
- **#764** e **#783** (the-judge por OIDC): `VEREDITO_JUDGE_ATIVO` e a configuração do lado dele.
- **#746** (decisão do deploy pelo Coolify).
- **#376** (parecer jurídico).
- Clique de classe 3: um por PR no portão, scripts de gate e produção; um por release na 3B-lote (ADR-105).

## 5. Triagem de 2026-11-14 (ADR-108)

Prioridade pelo critério do ADR-108 § 6. Toda issue aberta tem EST, versão e prioridade. Estado estável de entregue
na release: issue **aberta** + EST "Na release" (fecham no `release:publish`).

- **P1 (LGPD, v0.8.0):** #730, #735 a #741 (#735 é a única `pronta`; #736 a #741 ficam bloqueadas por ela na EST).
- **P1 (humano):** #376 (jurídico).
- **P2 (infra de entrega):** #819 (primeira da v0.8.0), #820, #830, #831, #832, #835, #750, #751, #715, #745, #761
  (em voo), #746, #747, #764, #783 (esperam o Kalléo). **P2 produto:** #777 (feito, na release), #741.
- **P3:** #828, #802, #744, #752, #815 (v0.9.0).
- Perf (`perf-next`): #557 P2 e #558 P3 em v0.9.0; #615 P2, #559 P2, #541 P2, #560 P3, #651 P3 em v0.10.0. #773 é espelho
  de #541 (mesma EST-84). EST-85 e EST-86 eram duplicatas de EST-8 e EST-9 e foram marcadas como tal.
- Dependências registradas na EST: #736 a #741 bloqueadas por #735; #751 por #750; #752 por #750 e #751; #750 por #746.

### Decisões que esperam o Kalléo (recomendação entre parênteses)

- Cifra do cadastro (#730, #735 a #741) em **P1** como está ou **P0**? (P1: já há ordem na v0.8.0 e não há vetor
  de exposição novo; P0 só se ele entender o dado em claro hoje como risco ativo.)
- #742 (e-mail de login em claro) segue P2 e v0.8.0 junto da cifra? (sim, depois de #735.)
- #812 (regra 8 e o #780): a exceção "estabilizar espera de teste com `TESTE-ALTERADO`" vale? (pergunta de produto/processo
  dele; a #829 não a respondeu.)
- Corrigir na origem o defeito da integração "Em produção" (automação do Linear)? (sim, quando ele puder; até lá vale o
  passo do ADR-108 § 5.)
