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

1. **Cifra do cadastro (P1, LGPD): código pronto, falta rodar em produção.** Épico #730 fechado: #735 a #741 e #860
   estão na `main` e a staging do `0b93990` está verde (migrações `0071` a `0073`, todas aditivas; o #860 era
   `instanceof ValidationError` entre cópias do módulo no build de produção). A revalidação limpa passou em 8 rodadas.
   **Depois do próximo deploy** (dono): backup, `npm run data:reencrypt` com `BLIND_INDEX_PEPPER` até a saída dizer
   «Nada pendente» ([`producao.md`](../../../docs/engineering/producao.md) § 6). A contração (drop de `birth_date` e dos
   índices GIN) é release seguinte. Pendente à parte: **#862** (E2E de produção a frio em processo dedicado, P2, classe 3).
2. **#742** (e-mail de login em claro, P2): junto da cifra.
3. Apontamentos menores: **#744**, **#745**, **#802**, **#849** (P3), **#715**, **#750 a #752** (job de produção e
   rollback; #746 (spike) e #747 (backup) já estão fechadas). **Próximo passo de entrega:** job de deploy com backup
   antes (#750, com #851: só tagear o SHA validado pela staging). Spike do Coolify: plano A (ADR-095). Faltam os
   secrets `VPS_KNOWN_HOSTS` e `COOLIFY_*` no Environment `producao` (do dono).
4. Perf e backlog: v0.9.0 (#729, #557, #558, #815) e v0.10.0 (#615, #559, #541, #560, #651).

## Espera o dono

- Secrets `VPS_KNOWN_HOSTS` e `COOLIFY_*` no Environment `producao`. **#376** (parecer jurídico).
- O check "Veredito do the-judge" já saiu do ruleset da `main` e o `veredito-judge.yml` foi apagado (ADR-109). Auto-merge está habilitado no repositório.
- Baixa prioridade: mapeamento de estados da integração GitHub↔Linear (fechar a issue move a EST sozinha).
