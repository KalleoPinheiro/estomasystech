# Próximos passos (fila única de passagem de bastão, ADR-109)

Atualizada em 2026-11-20. É o **único** arquivo de passagem de bastão: quem chega lê, quem sai atualiza no mesmo
PR (tira o que entregou, move o que mudou, acrescenta o que surgiu). Curto, em lista, sem nome de fornecedor.
O remoto e as issues valem se divergirem; quem notar corrige aqui.

## Estado

- **Produção:** v0.10.0 (commit `402c41e6`), publicada em 2026-11-20 09:55 UTC pelo *Release deploy* real (run 44713700869):
  88 migrações (até a `0087`), fumaça verde, tag `v0.10.0`, sem rollback, verificação de integridade com 0 falhas.
  Antes: v0.9.1 (2026-11-18). Rollback = redeploy da tag `v0.9.1` (`0085` a `0087` só ampliam; a `0086` entra `NOT VALID`).
- **O que entrou na v0.10.0:** RM-16 (oferta da vaga cancelada por e-mail, 2 h), RM-15 (relatório mensal por e-mail ao
  parceiro, sem dado clínico), #909 (`email_hash` obrigatório na conta ativa, NULL só na anonimizada) e toda a esteira que
  estava planejada como "v0.11.0" (#820, #830, #832, #745, #925, #828, #914, #883). **Não existe v0.11.0 pendente:** era só
  nome de planejamento; o projeto do board foi cancelado e a label saiu das issues.
- **A `main` está igual à produção** (nenhum commit depois de `402c41e6`).
- **Release deploy** migra com o dono **antes** do deploy, trava se a migração falhar, reverte a imagem se a fumaça reprovar e
  ensaia o rollback no `validar` de todo `dry_run` e publicação (ADR-113, `producao.md` § 4.9). Resíduo: o ensaio imprime
  `::error` das versões falsas 0.0.2/0.0.1 e o resumo do run mostra "rollback executado" sem ter havido; a correção é o
  PR #950 (classe 3, espera o clique do dono). Só a troca real de container na reversão ainda não foi vista.
- **Fluxo ADR-109:** branch curta da `main`, um PR para a `main` por sessão, CI como revisor, squash automático em PR comum com
  CI verde. Classe 3 espera o clique no Environment `aprovacao-classe-3`, com o link do job e só com o CI verde. Staging publica
  sozinha a cada merge na `main`. Produção sai pelo workflow *Release deploy*, com o clique no Environment `producao`.
- **Cobertura intermitente (#933):** um shard falhou e passou no rerun no #923 (3/4) e no #932 (2/4). O job agora loga o teste
  vermelho e sobe o blob mesmo com falha. Se repetir, ler o log e corrigir o teste de origem (sem retry nem timeout maior).

## Fila (ordem)

- **Na `main`, fora da produção:** #972 cadastro rápido na nova consulta (PRO-RN-38, migração `0090` só aditiva).
  Próximos do dono, nesta ordem: Plano de acompanhamento, receituário e termos por cliente. Novas: #986 (P3) e #987 (P2,
  espera o dono escolher o termo neutro).

1. **#954** (P1, classe 3 por RLS e cifra): catálogo de diagnósticos da clínica, CSV, diagnóstico «sem código» e tipo
   síndrome na SAE (migração 0089, PRO-RN-37). PR #982 aberto; antes dele, o #983 tira o número fixo de 45 tabelas do teste
   de FORCE. Espera o clique do dono quando o CI estiver verde.
2. **#950** (classe 3): ensaio do rollback sem anotação falsa. Pronto, espera o clique do dono.
3. **Contração da cifra** (ADR-111, ADR-114): no e-mail de login, `VALIDATE` da restrição `0086`, fim do ramo em claro e drop dos
   índices antigos; no cadastro, drop de `birth_date` e dos índices GIN antigos. Migração não aditiva: classe 3.
4. **Espera decisão do dono** (regra 5, não inventar): RM-14 WhatsApp com template da Meta (a clínica aceita custo por mensagem?),
   RM-05 pagamento online (PSP) e RM-17 TISS.
5. **Abertas sem urgência:** #933 (shard intermitente, só volta se falhar de novo), #815 (71 funções de complexidade, G),
   #651 e #650 (precisam de trace), #862 (E2E de produção a frio).

## Espera o dono

- **#950** (clique de classe 3), **#376** (parecer jurídico, condição para paciente real), **#654** (rotina mensal de 2026-11)
  e EST-16 (credenciais do Google Agenda em produção).
- Atualizar o Traefik (3.7.15 para 3.7.16) em horário calmo e endurecer o SSH do VPS, conforme combinado (a #867 foi fechada em
  2026-11-15; reabrir se o endurecimento ainda não foi feito).
- P1 de segurança vem antes de tela, desempenho ou dívida. Mobile first. Cobertura: piso 90% global e 100% no
  núcleo. `Closes #N` fecha a issue no merge. Homologação no board EST quer dizer na `main` e ainda não em
  produção.
