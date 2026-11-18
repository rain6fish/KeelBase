#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# Smoke-test a published single-container image: its configuration must carry no secret keys, it must
# serve /api/v1/health when started with generated secrets, and it must refuse to start without them.
#
# 冒烟测试已发布的单容器镜像：镜像配置不得携带密钥；注入随机密钥后必须能拉起并响应
# /api/v1/health；不提供密钥时必须拒绝启动。
#
# Usage / 用法: scripts/image-smoke.sh --image <ref> [--port 18089] [--skip-negative]
set -uo pipefail

IMAGE=""
PORT="${SMOKE_PORT:-18089}"
NEGATIVE=1
while [ $# -gt 0 ]; do
  case "$1" in
    --image)         IMAGE="$2"; shift 2 ;;
    --port)          PORT="$2"; shift 2 ;;
    --skip-negative) NEGATIVE=0; shift ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
done
[ -n "$IMAGE" ] || { echo "usage: $0 --image <ref> [--port N] [--skip-negative]" >&2; exit 2; }

fatal() { echo "FAIL: $*" >&2; exit 1; }
ok()    { echo "OK: $*"; }

NAME="kb-image-smoke-$$"
cleanup() { docker rm -f "$NAME" >/dev/null 2>&1 || true; }
trap cleanup EXIT

# 1. The image configuration must not carry a secret key.
ENVS=$(docker image inspect "$IMAGE" --format '{{json .Config.Env}}' 2>/dev/null) \
  || fatal "cannot inspect $IMAGE"
for key in JWT_SECRET JWT_REFRESH_SECRET ENCRYPTION_KEY DELEGATION_SECRET AUDIT_HMAC_KEY; do
  case "$ENVS" in
    *"\"$key="*) fatal "$key is present in the image's Config.Env" ;;
  esac
done
ok "image Config.Env carries no secret keys"

# 2. Positive path: generated secrets, health 200, runtime keys equal the injected values.
JWT_SECRET=$(openssl rand -hex 32)
JWT_REFRESH_SECRET=$(openssl rand -hex 32)
ENCRYPTION_KEY=$(openssl rand -hex 32)
docker run -d --name "$NAME" -p "127.0.0.1:$PORT:3000" \
  -e JWT_SECRET="$JWT_SECRET" -e JWT_REFRESH_SECRET="$JWT_REFRESH_SECRET" -e ENCRYPTION_KEY="$ENCRYPTION_KEY" \
  "$IMAGE" >/dev/null || fatal "docker run failed"
code=000
for _ in $(seq 1 60); do
  code=$(curl -s -o /tmp/kb-image-smoke-health.json -w '%{http_code}' "http://127.0.0.1:$PORT/api/v1/health" 2>/dev/null || true)
  [ "$code" = "200" ] && break
  sleep 2
done
[ "$code" = "200" ] || { docker logs --tail 30 "$NAME" >&2 || true; fatal "GET /api/v1/health returned $code"; }
ok "GET /api/v1/health returned 200"
[ "$(docker exec "$NAME" printenv JWT_SECRET 2>/dev/null)" = "$JWT_SECRET" ] \
  || fatal "runtime JWT_SECRET differs from the injected value"
[ "$(docker exec "$NAME" printenv JWT_REFRESH_SECRET 2>/dev/null)" = "$JWT_REFRESH_SECRET" ] \
  || fatal "runtime JWT_REFRESH_SECRET differs from the injected value"
[ "$(docker exec "$NAME" printenv ENCRYPTION_KEY 2>/dev/null)" = "$ENCRYPTION_KEY" ] \
  || fatal "runtime ENCRYPTION_KEY differs from the injected value"
if docker exec "$NAME" env | grep -qiE 'keelbase-single-container|change-me|your-secret|dev-secret'; then
  fatal "container env holds a known-public default string"
fi
ok "runtime secrets equal the injected values; no known-public default in env"
docker rm -f "$NAME" >/dev/null 2>&1 || true

# 3. Negative control: without secrets the process must exit non-zero and say why.
if [ "$NEGATIVE" = "1" ]; then
  if command -v timeout >/dev/null 2>&1; then
    OUT=$(timeout 120 docker run --rm --name "${NAME}-neg" "$IMAGE" 2>&1)
  else
    OUT=$(docker run --rm --name "${NAME}-neg" "$IMAGE" 2>&1)
  fi
  rc=$?
  [ "$rc" -ne 0 ] || fatal "the image started with no secrets (exit 0)"
  case "$OUT" in
    *"环境变量校验失败"*|*"refuses to start"*|*"Missing required"*) : ;;
    *) echo "$OUT" | tail -20 >&2; fatal "no-secret run exited $rc without the validation refusal" ;;
  esac
  ok "without secrets the container exits $rc and prints the validation refusal"
fi

echo "image smoke: PASS ($IMAGE)"
