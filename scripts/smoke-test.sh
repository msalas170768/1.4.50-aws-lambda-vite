#!/usr/bin/env bash
# Smoke test end-to-end de la API desplegada.
# Uso: scripts/smoke-test.sh [API_URL]   (por defecto: terraform output api_url)
set -uo pipefail

API="${1:-$(terraform -chdir="$(dirname "$0")/../terraform" output -raw api_url)}"
API="${API%/}"
FAILS=0
TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT

# req METHOD PATH [BODY] -> deja el status en $STATUS y el cuerpo en $TMP
req() {
  local args=(-s -o "$TMP" -w '%{http_code}' -X "$1" "$API$2")
  [[ $# -ge 3 ]] && args+=(-H 'Content-Type: application/json' -d "$3")
  STATUS="$(curl "${args[@]}")"
}

check() { # descripción, esperado
  if [[ "$STATUS" == "$2" ]]; then
    printf '  ok   %-45s %s\n' "$1" "$STATUS"
  else
    printf '  FAIL %-45s esperado %s, obtenido %s: %s\n' "$1" "$2" "$STATUS" "$(cat "$TMP")"
    FAILS=$((FAILS + 1))
  fi
}

json_field() { python3 -c "import json,sys; print(json.load(open('$TMP'))$1)"; }

echo "API: $API"
req GET /health;                                  check "GET /health" 200
req POST /tasks '{"title":"Smoke test"}';         check "POST /tasks" 201
ID="$(json_field "['id']" 2>/dev/null)"
req GET /tasks;                                   check "GET /tasks" 200
grep -q "$ID" "$TMP" || { echo "  FAIL la lista no contiene $ID"; FAILS=$((FAILS + 1)); }
req GET "/tasks/$ID";                             check "GET /tasks/{id}" 200
req PUT "/tasks/$ID" '{"completed":true}';        check "PUT completed=true" 200
[[ "$(json_field "['completed']")" == "True" ]] || { echo "  FAIL completed no es true"; FAILS=$((FAILS + 1)); }
req PUT "/tasks/$ID" '{"title":"Renombrada"}';    check "PUT title" 200
req POST /tasks '{"title":""}';                   check "POST título vacío" 400
req GET /tasks/no-existe;                         check "GET id inexistente" 404
req DELETE "/tasks/$ID";                          check "DELETE /tasks/{id}" 204
req DELETE "/tasks/$ID";                          check "DELETE repetido" 404

CORS="$(curl -s -o /dev/null -D - -X OPTIONS "$API/tasks" \
  -H 'Origin: http://localhost:5173' -H 'Access-Control-Request-Method: POST' \
  | grep -i '^access-control-allow-origin')"
if [[ -n "$CORS" ]]; then echo "  ok   preflight CORS -> ${CORS%$'\r'}"; else echo "  FAIL preflight CORS sin allow-origin"; FAILS=$((FAILS + 1)); fi

echo
if (( FAILS )); then echo "$FAILS comprobaciones fallidas"; exit 1; fi
echo "Todas las comprobaciones pasaron"
