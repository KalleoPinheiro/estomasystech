---
"estomasystech": patch
---

Segunda barreira de isolamento entre clínicas no banco, agora também nos dados de pacientes, prontuário, agenda, estoque e financeiro: o Postgres passa a recusar linha de outra clínica mesmo que a aplicação erre o filtro. Nada muda para quem usa o sistema hoje; a barreira só passa a valer quando o dono trocar o usuário do banco, num passo separado.
