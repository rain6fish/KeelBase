#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# Self-test for scripts/image-smoke.sh: it drives the two failure paths the nightly review found
# never exercised and asserts that each one fails loudly instead of passing.
#   A. `openssl rand` yields an empty string -> the script must stop before the secret is used.
#   B. the health poll reaches its cap       -> the script must stop and print the wait and status.
#
# 自检 scripts/image-smoke.sh：驱动夜审指出「从未被跑到过」的两条失败路径，断言各自 fail-loud：
#   A. `openssl rand` 返回空串 —— 脚本必须在**用到密钥之前**停下。
#   B. 健康轮询走到封顶 —— 脚本必须停下，并打印已等待秒数与最后一次状态码。
#
# Usage / 用法: scripts/image-smoke.test.sh
#
# Environment / 环境变量:
#   SMOKE_TEST_IMAGE  image shared by both controls; must be present or pullable, must start and
#                     must NOT answer on container port 3000  (default: redis:7-alpine)
#   SMOKE_TEST_IMAGE  两条控制共用的镜像；须已存在或可拉取，能启动，且**不**应答容器 3000 端口
#                     （默认 redis:7-alpine）
set -uo pipefail

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
SCRIPT="$SCRIPT_DIR/image-smoke.sh"
IMAGE="${SMOKE_TEST_IMAGE:-redis:7-alpine}"

PASSED=0
FAILED=0
pass() { echo "PASS: $*"; PASSED=$((PASSED + 1)); }
fail() { echo "FAIL: $*" >&2; FAILED=$((FAILED + 1)); }

[ -f "$SCRIPT" ] || { echo "missing $SCRIPT" >&2; exit 2; }
docker image inspect "$IMAGE" >/dev/null 2>&1 || docker pull "$IMAGE" >/dev/null 2>&1 \
  || { echo "test image unavailable: $IMAGE (set SMOKE_TEST_IMAGE)" >&2; exit 2; }

# A. A stub `openssl` that exits 0 and prints nothing is exactly the hole the review named.
# A. 一个退出码 0、什么都不打印的 `openssl` 桩，正是评审点名的那处口子。
echo "== A: empty openssl rand output =="
stub_dir=$(mktemp -d)
printf '#!/bin/sh\nexit 0\n' > "$stub_dir/openssl"
chmod +x "$stub_dir/openssl"
out=$(PATH="$stub_dir:$PATH" bash "$SCRIPT" --image "$IMAGE" --skip-negative 2>&1)
rc=$?
rm -rf "$stub_dir"

echo "exit=$rc"
echo "$out"
if [ "$rc" -eq 0 ]; then
  fail "A: the script accepted an empty openssl output (exit 0)"
elif ! printf '%s\n' "$out" | grep -q 'JWT_SECRET: openssl rand -hex 32'; then
  fail "A: exited $rc but did not name the offending secret"
elif ! printf '%s\n' "$out" | grep -q 'expected 64'; then
  fail "A: exited $rc but did not report the expected length"
elif printf '%s\n' "$out" | grep -q 'image smoke: PASS'; then
  fail "A: exited $rc yet still printed the PASS banner"
else
  pass "A: empty openssl output stops the run before any secret is used"
fi

# B. `redis:7-alpine` starts and stays up, but listens on 6379, so container port 3000 never answers.
#    The poll must hit its 2 s cap and report both the wait and the last status code.
# B. `redis:7-alpine` 能起来且常驻，但监听 6379，容器 3000 端口永不应答；
#    轮询必须撞上 2 秒封顶，并同时报出等待时长与最后一次状态码。
echo "== B: health poll reaches the cap (SMOKE_WAIT_SECS=2) =="
port=$((20000 + RANDOM % 20000))
out=$(SMOKE_WAIT_SECS=2 bash "$SCRIPT" --image "$IMAGE" --port "$port" --skip-negative 2>&1)
rc=$?

echo "exit=$rc (port=$port)"
echo "$out"
waited=$(printf '%s\n' "$out" | sed -n 's/.*waited \([0-9][0-9]*\)s.*/\1/p' | tail -1)
status=$(printf '%s\n' "$out" | sed -n 's/.*last status \([0-9][0-9]*\)$/\1/p' | tail -1)
last_line=$(printf '%s\n' "$out" | grep -v '^[[:space:]]*$' | tail -1)

if [ "$rc" -eq 0 ]; then
  fail "B: the script passed although health never answered"
elif printf '%s\n' "$out" | grep -q 'docker run failed'; then
  fail "B: the container never started, so the poll was not exercised"
elif [ -z "$waited" ]; then
  fail "B: exited $rc without printing the waited seconds"
elif [ "$waited" -lt 2 ]; then
  fail "B: reported waited ${waited}s, which is short of the 2s cap"
elif [ -z "$status" ]; then
  fail "B: exited $rc without printing the last HTTP status code"
elif ! printf '%s\n' "$last_line" | grep -q '^FAIL: GET /api/v1/health never returned 200'; then
  fail "B: the failure message is not the last line (container log tail should precede it)"
elif printf '%s\n' "$out" | grep -q 'image smoke: PASS'; then
  fail "B: exited $rc yet still printed the PASS banner"
else
  pass "B: poll capped at ${waited}s and reported last status $status"
fi

echo "== summary: ${PASSED} passed, ${FAILED} failed =="
[ "$FAILED" -eq 0 ]
