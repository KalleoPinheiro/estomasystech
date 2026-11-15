---
"estomasystech": minor
---

O cadastro do paciente (nome, e-mail, telefone e data de nascimento) passa a ficar cifrado no banco, como já ficavam o CPF e o texto do prontuário. Depois que a recifra roda no banco, quem ler o disco ou um backup novo não identifica mais o paciente (backups feitos antes continuam como estavam). A busca por nome continua achando por trecho, sem diferenciar acento ou maiúscula; CPF, telefone e e-mail passam a ser achados pelo valor completo.
