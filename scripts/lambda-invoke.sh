#!/usr/bin/env bash
# Invoca la Lambda directamente (sin API Gateway) con un evento HTTP API v2 de GET /health.
set -euo pipefail
FN="${1:-$(terraform -chdir="$(dirname "$0")/../terraform" output -raw lambda_function_name)}"
OUT="$(mktemp)"
aws lambda invoke --function-name "$FN" --cli-binary-format raw-in-base64-out \
  --payload '{"rawPath":"/health","requestContext":{"http":{"method":"GET"}}}' "$OUT" >/dev/null
cat "$OUT"; echo
grep -q '"statusCode": 200' "$OUT"
