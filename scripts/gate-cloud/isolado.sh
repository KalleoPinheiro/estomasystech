#!/usr/bin/env bash
# Roda um comando num namespace de rede e de montagem próprios (ADR-087), para o E2E de produção e o de dev
# andarem juntos na mesma máquina: cada um enxerga o seu `localhost:3000` e as suas pastas de estado
# (`e2e/.auth`, `test-results`, `playwright-report`, e o `.next` quando pedido). Os specs fixam a porta 3000 e as
# duas suítes gravam o mesmo estado, então sem isto elas se atropelam.
#
# Uso: isolado.sh <nome> [--next-proprio] -- <comando...>
#   --next-proprio  o `.next` do comando é uma pasta vazia só dele (o `next dev` não pisa no build de produção).
# Sai com 125 se a máquina não oferece `unshare -n -m` (quem chama roda em sequência nesse caso).
set -euo pipefail
nome="${1:?uso: isolado.sh <nome> [--next-proprio] -- <comando...>}"; shift
proprio=0
if [ "${1:-}" = "--next-proprio" ]; then proprio=1; shift; fi
[ "${1:-}" = "--" ] && shift
cd "$(dirname "$0")/../.."
raiz=$(pwd)

if [ "${ISOLADO_DENTRO:-}" != 1 ]; then
  command -v unshare >/dev/null && command -v python3 >/dev/null || exit 125
  unshare -n -m true 2>/dev/null || exit 125
  exec env ISOLADO_DENTRO=1 ISOLADO_NOME="$nome" ISOLADO_PROPRIO="$proprio" \
    unshare -n -m bash "$0" "$nome" -- "$@"
fi

# Dentro do namespace: loopback ligado (sem `ip` na imagem, ioctl direto) e pastas de estado privadas.
python3 - <<'PY'
import fcntl, socket, struct
s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
fl = struct.unpack('16sH', fcntl.ioctl(s, 0x8913, struct.pack('16sH', b'lo', 0)))[1]
fcntl.ioctl(s, 0x8914, struct.pack('16sH', b'lo', fl | 1))
PY
priv="$raiz/.gate/isolado-$nome"
rm -rf "$priv"
dirs=(e2e/.auth test-results playwright-report)
[ "${ISOLADO_PROPRIO:-0}" = 1 ] && dirs+=(.next)
for d in "${dirs[@]}"; do
  mkdir -p "$priv/$d" "$raiz/$d"
  mount --bind "$priv/$d" "$raiz/$d"
done
exec "$@"
