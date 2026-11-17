---
"estomasystech": patch
---

A trilha de auditoria do login deixa de guardar o e-mail. Quando a entrada identifica uma conta, o evento usa o id dessa conta. Quando o e-mail não identifica uma conta (desconhecido, senha errada ou a mesma senha em mais de uma empresa), o id fica em branco.
