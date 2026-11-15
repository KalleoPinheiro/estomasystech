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

1. **Cifra do cadastro (P1, LGPD), em andamento.** **#735 + #736 + #737** já estão na `main` (PR #854: migração `0071`
   aditiva, nome/e-mail/telefone/nascimento cifrados, busca em memória, cursor sem nome, anonimização e
   `data:reencrypt` estendido). **#738** (CPF único, migração `0072`) também está na `main`. **#739** (responsável
   cifrado: migração `0073` aditiva, `phone_hash` e `email_hash`, busca no mesmo desenho, `data:reencrypt` cobre
   `guardians`) também está na `main`. **#740** (medição com 5 mil: p95 abaixo de 200 ms, ADR-074) também está na `main`. A validação limpa do **#741** achou **#860** (P1: busca dá 500 depois de cadastrar como primeira ação no build de produção; `instanceof ValidationError` entre cópias do módulo), corrigido em PR; depois do merge e da staging, nova validação limpa só desse ponto. Faltam, uma por PR: **#741** (validação
   ponta a ponta) e **#730** (fecha o épico). **Depois do deploy**: backup, `npm run data:reencrypt` pelo dono
   (exige `BLIND_INDEX_PEPPER`), conferir 0 pendências; a contração (drop de `birth_date`, dos índices GIN) é release seguinte.
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
