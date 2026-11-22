# Próximos passos (fila única de passagem de bastão, ADR-109)

Atualizada em 2026-11-22. É o **único** arquivo de passagem de bastão: quem chega lê, quem sai atualiza no mesmo
PR (tira o que entregou, move o que mudou, acrescenta o que surgiu). Curto, em lista, sem nome de fornecedor.
O remoto e as issues valem se divergirem; quem notar corrige aqui.

## Estado

- **Produção:** v0.11.0, publicada em 2026-11-21 pelo *Release deploy* (staging verde em `f32c1f8`). Antes: v0.10.0.
- **O que entrou na v0.11.0:** profissional autônoma com CPF (#977, PR #981), diagnósticos SAE cadastrados pela profissional
  (#954, PRs #983 e #982), horas sem sobreposição na nova consulta e data de nascimento no celular (#969, #970, PR #980) e o
  ensaio do rollback sem anotação falsa (PR #950). Issues fechadas à mão: o `Closes #N` do squash não fecha; conferir a cada release.
- **Fluxo ADR-109:** branch curta da `main`, um PR para a `main` por sessão, CI como revisor, squash automático em PR comum com
  CI verde. Classe 3 espera o clique no Environment `aprovacao-classe-3`, com o link do job e só com o CI verde. Staging publica
  sozinha a cada merge na `main`. Produção sai pelo workflow *Release deploy*, com o clique no Environment `producao`.
- **Cobertura intermitente (#933):** um shard falhou e passou no rerun no #923 (3/4) e no #932 (2/4). O job agora loga o teste
  vermelho e sobe o blob mesmo com falha. Se repetir, ler o log e corrigir o teste de origem (sem retry nem timeout maior).

## Fila (ordem)

- **Na `main`, fora da produção:** #972 cadastro rápido na nova consulta (PRO-RN-38, migração `0090` só aditiva), #957
  ("Pacotes" virou "Plano de acompanhamento", só rótulo e texto; o modelo `SessionPackage` e `?aba=pacotes` não mudam) e #992
  (aviso de paciente repetido e nascimento no futuro recusado, PRO-RN-39, sem migração).
  #956 receituário em PDF (PRO-RN-40, sem migração; dependência nova `pdf-lib`). Pergunta aberta ao dono: corpo livre
  além das intervenções do plano e envio do PDF ao paciente (portal ou e-mail).

1. **Contração da cifra** (ADR-111, ADR-114, classe 3, P1 de segurança): no e-mail de login, `VALIDATE` da restrição `0086`,
   fim do ramo em claro e drop dos índices antigos; no cadastro, drop de `birth_date` e dos índices GIN antigos. Deixar o PR
   pronto esperando o clique em paralelo às telas.
2. **#955** (P1): critérios da avaliação de ferida legíveis na tela.
3. **#964**: proposta do Plano de acompanhamento em PDF.
4. **Depois:** #986 e #987 (autônoma que abre CNPJ, termo neutro), #959, #960, #962, #963 (avaliação, escalas e curativo),
   #973, #971 (telas). #961 espera a #376. #968 precisa de print e depende do EST-16. #974 e #975 precisam de print.
5. **Espera decisão do dono** (regra 5): RM-14 WhatsApp com template da Meta, RM-05 pagamento online (PSP) e RM-17 TISS.
6. **Abertas sem urgência:** #952 (E2E de série semanal reprova às sextas, P2), #933 (shard intermitente), #815, #651, #650, #862.

## Espera o dono

- **#376** (parecer jurídico, condição para paciente real), **#654** (rotina mensal de 2026-11)
  e EST-16 (credenciais do Google Agenda em produção).
- Atualizar o Traefik (3.7.15 para 3.7.16) em horário calmo e endurecer o SSH do VPS, conforme combinado (a #867 foi fechada em
  2026-11-15; reabrir se o endurecimento ainda não foi feito).
- P1 de segurança vem antes de tela, desempenho ou dívida. Mobile first. Cobertura: piso 90% global e 100% no
  núcleo. `Closes #N` fecha a issue no merge. Homologação no board EST quer dizer na `main` e ainda não em
  produção.
