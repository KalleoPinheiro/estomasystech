# Próximos passos (fila única, ADR-107)

Atualizada em 2026-11-14 12:45 UTC. Leia junto de `reports/estado-release.md` (`npm run estado`) ao assumir. O estado
gerado diz o que está aberto agora; esta fila diz a **ordem** e o **porquê**. Se divergirem, o remoto e as issues
valem, e quem notar corrige esta fila no mesmo PR.

Regra de uso: todo PR que entrega uma issue e toda troca de agente atualiza este arquivo (tira o que entregou, move o
que mudou de posição, acrescenta o que surgiu). Curto, em lista, sem nome de fornecedor. Quem implementa **não**
mergeia; a revisora (the-judge) julga e mergeia.

## 1. Em voo na v0.7.0

1. **#761, PR #833** (mutação em `scripts/release/*-lib.ts`). Em revisão, rodada 1 com `REQUEST_CHANGES`; a
   implementadora corrige. Última pendência de código da v0.7.0. Classe 3 (toca `stryker.config.json` e
   `vitest.mutacao.config.mts`): o clique do Kalléo só depois do APPROVE no head final.
2. **#834** (esta fila e o ADR-107). Só `.md`.
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
