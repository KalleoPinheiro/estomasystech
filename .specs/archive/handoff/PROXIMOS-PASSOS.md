# Próximos passos (fila única de passagem de bastão, ADR-109)

Atualizada em 2026-11-23. É o **único** arquivo de passagem de bastão: quem chega lê, quem sai atualiza no mesmo
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
  #956 receituário em PDF (PRO-RN-40, sem migração; dependência nova `pdf-lib`), com a emissão concorrente corrigida (#998:
  conteúdo lido depois da trava do plano). Pergunta aberta ao dono: corpo livre
  além das intervenções do plano e envio do PDF ao paciente (portal ou e-mail).

- **Na `main`, fora da produção (cifra):** contração do e-mail de login (PR #990, migração `0091`, não aditiva). **Antes do
  deploy que a leva:** verificação de integridade com `sem indice cego=0` na linha `cifra_email_login`; senão `data:reencrypt`.
  Rollback = redeploy da tag anterior (ADR-111, "Contração feita").

- **Na `main`, fora da produção:** #955 critérios legíveis na avaliação de ferida (PRO-RN-41, só texto, sem migração).

1. **Contração da cifra no cadastro** (ADR-096, classe 3, #1005). **1ª etapa em PR:** o código para de ler e gravar
   `birth_date` (saiu do schema do Drizzle) e o `data:reencrypt` não converte mais o nascimento em claro. Antes do
   deploy que a leva: `nascimento=0` na linha `cifra_paciente` da verificação de integridade (`producao.md` § 3).
   **2ª etapa, na release seguinte:** migração com o `DROP COLUMN birth_date` e o drop dos índices GIN antigos do nome.
2. **#964**: proposta do Plano de acompanhamento em PDF.
3. **Depois:** #986 e #987 (autônoma que abre CNPJ, termo neutro), #959, #960, #962, #963 (avaliação, escalas e curativo),
   #973 e #971 em PR (telas). #961 espera a #376. #968 precisa de print e depende do EST-16. #974 e #975 precisam de print.
4. **Espera decisão do dono** (regra 5): RM-14 WhatsApp com template da Meta, RM-05 pagamento online (PSP) e RM-17 TISS.
5. **Abertas sem urgência:** #952 (E2E de série semanal reprova às sextas, P2), #933 (shard intermitente), #815, #651, #650, #862.

## Espera o dono

- **#376** (parecer jurídico, condição para paciente real), **#654** (rotina mensal de 2026-11)
  e EST-16 (credenciais do Google Agenda em produção).
- Atualizar o Traefik (3.7.15 para 3.7.16) em horário calmo e endurecer o SSH do VPS, conforme combinado (a #867 foi fechada em
  2026-11-15; reabrir se o endurecimento ainda não foi feito).
- P1 de segurança vem antes de tela, desempenho ou dívida. Mobile first. Cobertura: piso 90% global e 100% no
  núcleo. `Closes #N` fecha a issue no merge. Homologação no board EST quer dizer na `main` e ainda não em
  produção.
