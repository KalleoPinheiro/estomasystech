#!/usr/bin/env bash
# Baseline leve na produção: só GET sem autenticação, 8 req/s (abaixo dos 20/s do rate-limit-app),
# 60 s por rota, de madrugada. Não escreve nada, não cria sessão, não usa dado clínico.
# Rode com: bash scripts/load/prod-baseline.sh   (a rota /api/health/ready usa o banco; /login renderiza a página)
set -euo pipefail
U="${U:-https://estomasystech.kalleopinheiro.com.br}"
RATE=8        # req/s
SECS=60

probe() {
  local path="$1" out; out="$(mktemp)"
  for i in $(seq 1 $((RATE * SECS))); do
    curl -s -o /dev/null -w '%{http_code} %{time_total}\n' "$U$path" >>"$out" &
    # espaça as requisições: RATE por segundo
    sleep "$(awk "BEGIN{print 1/$RATE}")"
  done
  wait
  echo "== $path =="
  awk '{c[$1]++; t[NR]=$2*1000} END{n=NR; asort(t); printf "n=%d p50=%.0fms p95=%.0fms p99=%.0fms max=%.0fms\n", n, t[int(n*0.5)], t[int(n*0.95)], t[int(n*0.99)], t[n]; for (k in c) printf "  http %s: %d\n", k, c[k]}' "$out"
  rm -f "$out"
}

probe /api/health
probe /api/health/ready
probe /login
echo "Esperado: 0 respostas 429 (8/s < 20/s). Cole a saída aqui."
