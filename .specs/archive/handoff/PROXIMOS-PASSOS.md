# Próximos passos (fila única de passagem de bastão, ADR-109)

Atualizada em 2026-11-15. É o **único** arquivo de passagem de bastão: quem chega lê, quem sai atualiza no mesmo
PR (tira o que entregou, move o que mudou, acrescenta o que surgiu). Curto, em lista, sem nome de fornecedor.
O remoto e as issues valem se divergirem; quem notar corrige aqui.

## Estado

- **Produção:** v0.7.0 (main `dfa897a`, tag `v0.7.0`), 25 issues do lote fechadas. #831 e #845 resolvidas.
- **Não há release aberta.** Fluxo novo (ADR-109): branch curta da `main`, PR para a `main`, CI como revisor,
  auto-merge, staging automática, produção em um clique do dono.
- #849 (achado do CodeQL em teste, P3) fica na fila abaixo.

## Fila (ordem)

1. **Funcionalidade, não processo.** Cifra do cadastro (P1, LGPD): **#735** abre (migração), depois **#736 a #741** e
   **#730**. Migração não aditiva e cifra são classe 3: um clique do dono por PR.
2. **#742** (e-mail de login em claro, P2): junto da cifra.
3. Apontamentos menores: **#744**, **#745**, **#802**, **#849** (P3), **#715**, **#750 a #752** (job de produção e
   rollback; dependem de #746 e #747, do dono).
4. Perf e backlog: v0.9.0 (#729, #557, #558, #815) e v0.10.0 (#615, #559, #541, #560, #651).

## Espera o dono

- **#747** (backup disparado pelo CI: Etapa 9 no VPS) e **#746** (spike da API do Coolify, depois do primeiro deploy
  da v0.7.0). **#376** (parecer jurídico).
- Tirar "Veredito do the-judge" do ruleset da `main` (hoje é uma casca que passa, ADR-109) e apagar
  `veredito-judge.yml`; opcional: marcar auto-merge como permitido nas configurações do repositório, se ainda não estiver.
- Baixa prioridade: mapeamento de estados da integração GitHub↔Linear (fechar a issue move a EST sozinha).
