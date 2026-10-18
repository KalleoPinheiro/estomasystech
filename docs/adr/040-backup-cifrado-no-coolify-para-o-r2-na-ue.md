---
title: "ADR 040 — Backup cifrado no Coolify: timer do host, age e R2 na jurisdição UE"
status: frozen
audience: [dev, ops, agent]
owner: "@KalleoPinheiro"
last_reviewed: 2026-10-18
related: [docs/adr/018-transferencia-internacional-ue.md, docs/adr/015-servidor-sem-cifra-de-disco.md, docs/engineering/producao.md]
---

# ADR 040 — Backup cifrado no Coolify: timer do host, age e R2 na jurisdição UE

- **Data:** 2026-10-18
- **Status:** aceito. Substitui o destino do backup no item 1 do [ADR-018](./018-transferencia-internacional-ue.md)
  e no AD-033 (Storage Box); o resto do ADR-018 (base legal, cifra antes de sair) continua valendo.
- **Domínios afetados:** infraestrutura (backup, restore), pacientes-prontuario (fotos)

## Contexto

A produção entrou no ar em 2026-10-18 no Coolify v4 ([#381](https://github.com/KalleoPinheiro/estomasystech/issues/381)):
app pelo Dockerfile, Postgres 18 gerenciado pelo Coolify (sem porta pública) e as fotos de ferida
num volume montado em `/app/uploads`. O `scripts/backup.sh` foi escrito para o `docker compose` do
repositório (`docker compose exec db`, serviço `uploads-backup`) e não enxerga esses recursos.
O que existe hoje é o backup nativo do Coolify às 03:00 para o bucket R2 `estomasystech-backups`:
`pg_dump` **sem cifra** (o ADR-018 exige `age` antes de sair do servidor), sem restauração testada
e **sem as fotos**. As duas coisas bloqueiam cadastrar paciente real. Metas: RPO 24 h, RTO 4 h.

O AD-033 e o ADR-018 escolheram uma Hetzner Storage Box em outra localização da UE, mas a conta
que existe e já está ligada ao Coolify é a do Cloudflare R2. A retenção LGPD roda às 03:30 como
tarefa agendada do Coolify e apaga fotos; não há como compartilhar um `flock` com ela.

## Opções consideradas

| Opção | A favor | Contra |
| --- | --- | --- |
| A — Backup nativo do Coolify, como está | Já roda; painel mostra o histórico | Sem `age` (viola o ADR-018); não cobre o volume de fotos; a chave do S3 fica no Coolify |
| B — Timer do host + `docker exec pg_dump` + `tar` do volume + `age` + R2 (UE) | Reaproveita o `backup.sh`/`restore.sh` testados; dado em claro nunca toca disco nem rede; R2 já contratado; trava de objeto do R2 protege contra apagamento | Mais uma peça fora do painel do Coolify (systemd); Cloudflare é empresa dos EUA |
| C — Timer do host para a Storage Box (o plano do AD-033) | Hetzner, uma só base contratual; snapshots da caixa | Caixa ainda não existe; snapshots só por painel/API e `rsync --delete` espelha apagamentos |
| D — Fotos no R2 pela aplicação (`PHOTO_STORAGE=s3`) | Tira as fotos do disco da VPS | Fotos em claro num provedor externo (o app não as cifra); migração dos arquivos; ainda exige backup do bucket. Não resolve o problema de hoje |

## Decisão

**Opção B.** Um `systemd` timer no host roda, às **02:00 de São Paulo**, o `scripts/backup.sh`
adaptado: `pg_dump -Fc` por `docker exec` no container do Postgres do Coolify
(`BACKUP_DB_CONTAINER`) e `tar` do volume de fotos (`BACKUP_UPLOADS_VOLUME`) num container sem
rede e sem log, os dois direto para o `age -R` (chave pública no servidor, privada só no cofre do
operador). A pasta cifrada vai para um **bucket R2 novo, criado com jurisdição `eu`**, com
`rclone copy` (`BACKUP_RCLONE_DEST`) e um token que só lê e grava objetos daquele bucket.
O bucket tem **trava de objeto de 30 dias** (bucket lock) e regra de ciclo de vida que apaga com
35 dias. Falha do serviço manda e-mail ao operador por `msmtp` no SMTP do Resend (AD-033).
`scripts/restore.sh` restaura no mesmo alvo e **recusa** se houver conexão no banco: o app é
parado no Coolify antes e ligado depois.

Por que venceu:

- **A** não cumpre a regra que já estava decidida (cifra antes de sair) nem cobre as fotos.
- **C** era equivalente em segurança, mas exige contratar e configurar outra peça antes do
  primeiro paciente, e o `rsync --delete` dependia de snapshots para não propagar um apagamento.
  O R2 com trava de objeto dá a mesma proteção (nem o token do servidor apaga um backup de menos
  de 30 dias) sem espelho.
- **D** muda onde mora o dado clínico e continua precisando de backup; fica como evolução
  separada se a VPS virar mais de uma réplica.
- **Jurisdição UE**: com `eu`, o R2 guarda os objetos só na UE ("data location" da Cloudflare), o
  que mantém o "nunca fora da UE/EEE" do ADR-018. A empresa é dos EUA, mas recebe **só texto
  cifrado**, sem a chave: o mesmo raciocínio do ADR-018 para a Storage Box. O jurídico confere
  esse enquadramento junto com os demais subprocessadores ([#216](https://github.com/KalleoPinheiro/estomasystech/issues/216)).
- **02:00**: 1 h 30 antes da retenção (03:30), para o `tar` não ler o volume enquanto ela apaga
  fotos; `Persistent=true` roda o backup perdido quando o servidor volta.

O backup nativo do Coolify para o R2 é desligado **depois** do primeiro backup cifrado conferido e
da primeira restauração de teste; os dumps em claro já enviados ao bucket antigo são apagados pelo
operador nessa hora.

## Consequências

**Positivas**

- Banco e fotos, cifrados, fora do servidor, todo dia, com restauração reproduzível pelo mesmo
  script que o CI exercita (`scripts/backup-smoke.sh`).
- Nenhuma senha do banco passa pelo host: o `pg_dump` usa a conexão local do container.
- Os scripts não dependem de checkout na VPS: três arquivos em `/opt/estomasystech-backup/`.

**Negativas / custos aceitos**

- O agendamento do backup fica no host, não no painel do Coolify (o § 5 do runbook diz como ver:
  `systemctl list-timers`, `journalctl -u estomasystech-backup`).
- A ordem com a retenção é por horário, não por trava: um backup atrasado que cruze 03:30 pode
  falhar (o alerta avisa e o seguinte refaz).
- Cloudflare entra na lista de subprocessadores (só texto cifrado), pendente de conferência jurídica.
- O nome do container e do volume vêm do Coolify; recriar o recurso muda o nome e exige
  atualizar `/etc/estomasystech/backup.env` (o backup falha com saída 2 e avisa).

**O que esta decisão fecha:** mudar o destino para fora da jurisdição UE do R2, ou mandar ao
destino algo que não saia do `age`, exige ADR novo.

## Relacionado

- [ADR-018](./018-transferencia-internacional-ue.md), [ADR-015](./015-servidor-sem-cifra-de-disco.md),
  [ADR-013](./013-retencao-por-anonimizacao.md) (retenção e cópias antigas).
- Runbook: [`producao.md` § 5](../engineering/producao.md#5-backup-e-restore).
- [#206](https://github.com/KalleoPinheiro/estomasystech/issues/206), [#381](https://github.com/KalleoPinheiro/estomasystech/issues/381).
- Fontes: <https://developers.cloudflare.com/r2/reference/data-location/>,
  <https://developers.cloudflare.com/r2/buckets/bucket-locks/>.
