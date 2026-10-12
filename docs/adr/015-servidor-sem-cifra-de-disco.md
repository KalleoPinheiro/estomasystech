---
title: "ADR 015 — Servidor de produção sem cifra de disco (LUKS)"
status: frozen
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-12
related: [docs/adr/006-chave-de-dados-clinicos.md, docs/engineering/producao.md]
---

# ADR 015 — Servidor de produção sem cifra de disco (LUKS)

- **Data:** 2026-10-12
- **Status:** aceito (decisão do dono do produto na [#313](https://github.com/KalleoPinheiro/vitta-flow/issues/313), 2026-10-12)
- **Domínios afetados:** pacientes-prontuario (fotos), operação (runbook de produção)
- **Ajusta:** [ADR-006](./006-chave-de-dados-clinicos.md) — a linha "Disco local (VPS) conta com a
  cifra do volume" deixa de valer; vale este ADR.

## Contexto

O ADR-006 cifra na aplicação o texto clínico livre, mas as **fotos** em volume local (`uploads`,
`PHOTO_STORAGE` vazio) dependiam da cifra do disco do host, "documentada no runbook". O runbook
([`producao.md`](../engineering/producao.md) § 1) deixou a cifra do disco como pergunta aberta:
LUKS exige desbloqueio a cada boot (manual ou com chave remota), o que pesa no RTO de 4 h. O dono
decidiu que o servidor volta sozinho após um reboot. A VPS fica na Hetzner, Alemanha (UE).

## Opções consideradas

| Opção | A favor | Contra |
| --- | --- | --- |
| A — LUKS no disco da VPS | fotos cifradas em repouso no host | desbloqueio a cada boot (manual ou chave remota); servidor não volta sozinho; pesa no RTO |
| B — Sem LUKS, fotos em claro no disco | servidor volta sozinho após reboot; nada a operar | foto legível por quem tiver o disco ou um snapshot do volume |
| C — Sem LUKS, fotos cifradas na aplicação | volta sozinho **e** foto cifrada em repouso | código novo (chave, rotação, backup, leitura); fora do escopo da #313 |

## Decisão

**Opção B.** O servidor de produção **não usa LUKS**: as fotos ficam **em claro** no volume
`uploads` do disco da VPS. A proteção que resta é a lista de mitigações abaixo.

O que desqualificou A: o desbloqueio a cada boot tira do servidor a propriedade de voltar sozinho,
que o dono priorizou. C não foi pedida; fica registrada como o caminho para reabrir.

## Consequências

**Risco aceito**

- Acesso físico ao equipamento do provedor ou snapshot do volume feito pelo provedor expõem as
  fotos em claro.
- Disco descartado ou devolvido pelo provedor leva as fotos em claro.

**Mitigações que restam**

- Campos clínicos de texto cifrados na aplicação com `DATA_ENCRYPTION_KEY` ([ADR-006](./006-chave-de-dados-clinicos.md)).
- Backups cifrados com `age` antes de sair do servidor; a chave privada fica fora dele
  ([`producao.md`](../engineering/producao.md) § 5).
- Provedor na UE (Hetzner, Alemanha).
- Acesso SSH só por chave, sem senha, com Cloud Firewall ([`producao.md`](../engineering/producao.md) § 2).

**O que esta decisão fecha:** nada que não possa ser reaberto. **Para reabrir:** cifrar as fotos
na aplicação (opção C), num ADR novo que substitua este. Isso exige chave, rotação e entrada no
backup, nos moldes do ADR-006. O bucket S3 (`PHOTO_STORAGE=s3`) continua cifrando conforme `S3_SSE`.

## Relacionado

- [ADR-006](./006-chave-de-dados-clinicos.md) · [`producao.md`](../engineering/producao.md) § 1 e § 2
- Issues [#313](https://github.com/KalleoPinheiro/vitta-flow/issues/313) e
  [#216](https://github.com/KalleoPinheiro/vitta-flow/issues/216) (base legal da transferência para a UE)
- `.specs/STATE.md` AD-033
