#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# Delivery baseline — the four readings the CTO ruling of 2026-11-28 asks for, from a clean checkout.
#
# The ruling (notes/CTO每周例会/2026-11-28.md §十一) replaced the previous sole main goal with "a
# reproducible delivery baseline": from a clean checkout of HEAD, one command yields
#
#   (a) green CI on the three active repositories, with the JDK 25 leg recorded as unverified;
#   (b) a green `check:all` and a separate e2e run (offline ⇒ unverified, never red);
#   (c) a release-rehearsal artifact built from HEAD (no tag, no push);
#   (d) the machine audit-reader regression: twelve cells answered, `/audit/verify` valid, and the
#       second entry aligned on object / time / who.
#
# Every reading lands in one evidence directory with its command, exit code, log path, HEAD and
# environment. The run is marked non-human: evidence ceiling E3, no E4. A criterion that needs a real
# person or a new contract field is not met here — it is reported, not worked around.
#
# Usage:
#   scripts/delivery-baseline.sh --evidence <dir> [options]
#
#   --evidence DIR        where the logs and the summary are written (required)
#   --keelbase DIR        the clean KeelBase checkout (default: this script's repository)
#   --java DIR            the clean KeelBase4J checkout (default: ../KeelBase4J)
#   --vuepro DIR          the clean KeelBase-Vue-Pro checkout (default: ../KeelBase-Vue-Pro)
#   --steps LIST          comma list of ci,checks,e2e,rehearsal,audit (default: all)
#   --wait-ci SECONDS     wait up to this long for an in-progress CI run at the pinned commit
#   --keep-stack          leave the audit-reader Postgres/Redis/host running afterwards
#   --allow-dirty         take readings even when a checkout has uncommitted changes (recorded)
#
# Exit codes: 0 = every selected criterion passed; 1 = at least one failed; 2 = nothing failed but at
# least one reading could not be taken (unverified). Unverified is never printed as green.
#
# ---
#
# 交付基线 —— 2026-11-28 CTO 裁决要的四项读数，从干净检出出发。
#
# 裁决（`notes/CTO每周例会/2026-11-28.md` §十一）把上一版唯一主目标换成「可复现的交付基线」：
# 从 HEAD 干净检出出发，一条命令得到
#
#   （a）三个活跃仓 CI 绿，JDK 25 腿记为未核验；
#   （b）`check:all` 绿，且 e2e 单列跑绿（离线 ⇒ 记未核验，不判红）；
#   （c）从 HEAD 出发布彩排产物（不打 tag、不推）；
#   （d）机器审计读者回归：十二格逐格有答、`/audit/verify` valid、第二入口对象/时间/谁一致。
#
# 每项读数连同命令、退出码、日志路径、HEAD 与环境落进同一个证据目录。该运行明标「非真人」：
# 证据上限 E3、无 E4。需要真人或新契约字段的判据不在这里凑 —— 记下来、不绕过。
#
# 退出码：0 = 选中的判据全过；1 = 至少一条不成立；2 = 没有不成立，但至少一项取不到数（未核验）。
# 未核验绝不打印成绿。

set -uo pipefail

SELF_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SELF_DIR/.." && pwd)"

EVIDENCE=""
KEELBASE="$ROOT"
JAVA="$(dirname "$ROOT")/KeelBase4J"
VUEPRO="$(dirname "$ROOT")/KeelBase-Vue-Pro"
STEP_LIST="ci,checks,e2e,rehearsal,audit"
WAIT_CI_SECONDS=0
KEEP_STACK=0
ALLOW_DIRTY=0

usage() { sed -n '2,40p' "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 64; }

while [ $# -gt 0 ]; do
  case "$1" in
    --evidence) EVIDENCE="${2:-}"; shift 2 ;;
    --keelbase) KEELBASE="${2:-}"; shift 2 ;;
    --java) JAVA="${2:-}"; shift 2 ;;
    --vuepro) VUEPRO="${2:-}"; shift 2 ;;
    --steps) STEP_LIST="${2:-}"; shift 2 ;;
    --wait-ci) WAIT_CI_SECONDS="${2:-0}"; shift 2 ;;
    --keep-stack) KEEP_STACK=1; shift ;;
    --allow-dirty) ALLOW_DIRTY=1; shift ;;
    -h|--help) usage ;;
    *) echo "unknown argument: $1" >&2; usage ;;
  esac
done

[ -n "$EVIDENCE" ] || { echo "--evidence <dir> is required" >&2; exit 64; }
mkdir -p "$EVIDENCE/logs"
EVIDENCE="$(cd "$EVIDENCE" && pwd)"
LOGS="$EVIDENCE/logs"
RUN_LOG="$LOGS/driver.log"
: > "$RUN_LOG"
READINGS="$EVIDENCE/readings.txt"
: > "$READINGS"

# Bash 3.2 (the Git Bash default) has no associative arrays; parallel indexed arrays keep this portable.
CRIT_NAMES=(); CRIT_STATUS=(); CRIT_DETAIL=()
crit() { CRIT_NAMES+=("$1"); CRIT_STATUS+=("$2"); CRIT_DETAIL+=("${3:-}"); }

log() { printf '%s\n' "$*" | tee -a "$RUN_LOG"; }
section() { log ""; log "==== $* ===="; }

wants() { case ",$STEP_LIST," in *",$1,"*) return 0;; *) return 1;; esac; }

free_port() {
  node -e "const net=require('net');const s=net.createServer();s.listen(0,'127.0.0.1',()=>{console.log(s.address().port);s.close()})"
}

have() { command -v "$1" >/dev/null 2>&1; }

# ── environment and checkouts / 环境与检出 ───────────────────────────────────
section "environment / 环境"
{
  echo "date-utc: $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo "host: $(uname -srm)"
  echo "node: $(node --version 2>&1)"
  echo "npm: $(npm --version 2>&1)"
  echo "java: $(java -version 2>&1 | head -1)"
  echo "maven: $(mvn -v 2>&1 | head -1)"
  echo "docker: $(docker --version 2>&1)"
  echo "flutter: $(flutter --version 2>&1 | head -1)"
  echo "git-bash: $BASH_VERSION"
} | tee "$EVIDENCE/environment.txt" | tee -a "$RUN_LOG"

section "checkouts / 检出"
dirty_any=0
for pair in "KeelBase=$KEELBASE" "KeelBase4J=$JAVA" "KeelBase-Vue-Pro=$VUEPRO"; do
  name="${pair%%=*}"; dir="${pair#*=}"
  if [ ! -d "$dir/.git" ] && ! git -C "$dir" rev-parse --git-dir >/dev/null 2>&1; then
    echo "$name: not a git checkout ($dir)" | tee -a "$RUN_LOG"
    crit "checkout:$name" FAIL "not a git checkout: $dir"
    continue
  fi
  sha="$(git -C "$dir" rev-parse HEAD)"
  dirty="$(git -C "$dir" status --porcelain | head -5)"
  echo "$name: HEAD $sha" | tee -a "$RUN_LOG"
  if [ -n "$dirty" ]; then
    echo "  dirty:" | tee -a "$RUN_LOG"; printf '%s\n' "$dirty" | sed 's/^/    /' | tee -a "$RUN_LOG"
    dirty_any=1
  else
    echo "  clean" | tee -a "$RUN_LOG"
  fi
done
printf '%s\n' "dirty=$dirty_any" >> "$EVIDENCE/readings.txt"
if [ "$dirty_any" = 1 ] && [ "$ALLOW_DIRTY" = 0 ]; then
  crit "checkout:clean" FAIL "a checkout has uncommitted changes; the ruling asks for a clean checkout"
elif [ "$dirty_any" = 1 ]; then
  crit "checkout:clean" PASS "all three checkouts are at a recorded HEAD (dirty allowed by the caller)"
else
  crit "checkout:clean" PASS "all three checkouts are at a recorded HEAD and clean"
fi

# ── (a) CI / CI 读数 ────────────────────────────────────────────────────────
ci_step() {
  section "(a) CI at the pinned commits / 钉住提交上的 CI"
  local args=() out="$LOGS/ci.txt" json="$EVIDENCE/ci.json"
  args+=(--keelbase "$(git -C "$KEELBASE" rev-parse HEAD)")
  args+=(--keelbase4j "$(git -C "$JAVA" rev-parse HEAD)")
  args+=(--keelbase-vue-pro "$(git -C "$VUEPRO" rev-parse HEAD)")
  local deadline=$(( $(date +%s) + WAIT_CI_SECONDS )) rc
  while :; do
    node "$ROOT/scripts/delivery-baseline-ci.mjs" "${args[@]}" --out "$json" > "$out" 2>&1
    rc=$?
    cat "$out" | tee -a "$RUN_LOG"
    if [ "$rc" = 2 ] && [ "$(date +%s)" -lt "$deadline" ]; then
      log "  CI reading unavailable — retrying (a transient API failure is not a verdict)"
      sleep 20; continue
    fi
    if [ "$rc" = 0 ] && grep -qE ': (in_progress|queued|requested)' "$out" && [ "$(date +%s)" -lt "$deadline" ]; then
      log "  a run is still in progress — waiting (the ruling asks for a finished reading)"
      sleep 30; continue
    fi
    break
  done
  case "$rc" in
    0) crit "ci" PASS "every required workflow is success at each pinned commit; JDK 25 legs reported, not counted" ;;
    1) crit "ci" FAIL "at least one required workflow is not success at its pinned commit (see logs/ci.txt)" ;;
    *) crit "ci" UNVERIFIED "the CI reading could not be taken (see logs/ci.txt)" ;;
  esac
}

# ── (b) check:all / check:all 读数 ─────────────────────────────────────────
checks_step() {
  section "(b1) check:all / check:all"
  local logf="$LOGS/check-all.log" rc
  ( cd "$KEELBASE" && npm run prereqs ) > "$LOGS/prereqs.log" 2>&1
  local prc=$?
  log "prereqs exit=$prc (logs/prereqs.log)"
  ( cd "$KEELBASE" && npm run check:all ) > "$logf" 2>&1
  rc=$?
  tail -n 12 "$logf" | sed 's/^/  /' | tee -a "$RUN_LOG"
  log "check:all exit=$rc (logs/check-all.log)"
  if grep -q '\[check-all\].*全过' "$logf"; then
    crit "check:all" PASS "exit 0; summary: $(grep -m1 '\[check-all\]' "$logf")"
  elif [ "$rc" = 0 ]; then
    crit "check:all" PASS "exit 0"
  else
    crit "check:all" FAIL "exit $rc (logs/check-all.log)"
  fi
}

e2e_step() {
  section "(b2) e2e, run on its own / e2e 单列跑"
  local logf="$LOGS/e2e.log" rc
  if ! curl -s -m 5 -o /dev/null -w '%{http_code}' https://registry.npmjs.org/ 2>/dev/null | grep -q '^[23]'; then
    log "offline: the e2e run depends on installed dependencies; recording it as unverified (N7 semantics)"
    crit "e2e" UNVERIFIED "offline — N7 semantics: unverified, not red"
    return
  fi
  ( cd "$KEELBASE/Server-NestJS" && NODE_ENV=test npm run test:e2e ) > "$logf" 2>&1
  rc=$?
  tail -n 25 "$logf" | sed 's/^/  /' | tee -a "$RUN_LOG"
  log "e2e exit=$rc (logs/e2e.log)"
  if [ "$rc" = 0 ]; then crit "e2e" PASS "exit 0 (logs/e2e.log)"; else crit "e2e" FAIL "exit $rc (logs/e2e.log)"; fi
}

# ── (c) release rehearsal / 发布彩排 ───────────────────────────────────────
rehearsal_step() {
  section "(c) release rehearsal from HEAD / 从 HEAD 出发布彩排产物"
  local logf="$LOGS/rehearsal.log" rc image="keelbase:delivery-baseline-$(date -u +%Y%m%d%H%M%S)"
  ( cd "$KEELBASE" && IMAGE="$image" bash scripts/docker-single.sh build ) > "$logf" 2>&1
  rc=$?
  tail -n 10 "$logf" | sed 's/^/  /' | tee -a "$RUN_LOG"
  log "rehearsal exit=$rc image=$image (logs/rehearsal.log)"
  if [ "$rc" = 0 ]; then
    local id size
    id="$(docker image inspect --format '{{.Id}}' "$image" 2>/dev/null)"
    size="$(docker image inspect --format '{{.Size}}' "$image" 2>/dev/null)"
    printf 'image: %s\nimage-id: %s\nsize-bytes: %s\n' "$image" "$id" "$size" >> "$EVIDENCE/readings.txt"
    log "  image id: ${id:-unreadable}; size: ${size:-unreadable}"
    # No tag and no push by construction: `docker build -t` is local, and this script never runs
    # `docker push` or `git tag`. Record the absence as a reading.
    local remotes; remotes="$(git -C "$KEELBASE" remote -v | awk '{print $2}' | sort -u | tr '\n' ' ')"
    printf 'pushed: no\ntagged: no\nimage-remotes: %s\n' "$remotes" >> "$EVIDENCE/readings.txt"
    crit "release-rehearsal" PASS "image built locally: $image ($id)"
  else
    crit "release-rehearsal" FAIL "exit $rc (logs/rehearsal.log)"
  fi
}

# ── (d) machine audit-reader regression / 机器审计读者回归 ─────────────────
HOST_PID=""
AUDIT_PG=""
AUDIT_REDIS=""

audit_cleanup() {
  if [ -n "$HOST_PID" ] && kill -0 "$HOST_PID" 2>/dev/null; then
    kill "$HOST_PID" 2>/dev/null || true
    sleep 2
  fi
  if [ "$KEEP_STACK" = 1 ]; then
    log "stack kept: PG=$AUDIT_PG REDIS=$AUDIT_REDIS host pid=${HOST_PID:-none}"
    return
  fi
  [ -n "$AUDIT_PG" ] && docker rm -f "$AUDIT_PG" >/dev/null 2>&1 || true
  [ -n "$AUDIT_REDIS" ] && docker rm -f "$AUDIT_REDIS" >/dev/null 2>&1 || true
}
trap audit_cleanup EXIT

audit_step() {
  section "(d) machine audit-reader regression / 机器审计读者回归"
  local tag="bl$(date -u +%m%d%H%M%S)"
  AUDIT_PG="delivery-baseline-pg-$tag"
  AUDIT_REDIS="delivery-baseline-redis-$tag"
  local db="delivery_baseline"
  local pg_port redis_port host_port
  pg_port="$(free_port)"; redis_port="$(free_port)"; host_port="$(free_port)"
  local host_url="http://127.0.0.1:$host_port"
  printf 'audit-pg: %s\n' "$AUDIT_PG" >> "$EVIDENCE/readings.txt"

  if ! have docker || ! docker info >/dev/null 2>&1; then
    crit "audit-reader" UNVERIFIED "docker is not available — the regression needs a live host and PostgreSQL"
    return
  fi

  log "starting PostgreSQL/Redis on $pg_port/$redis_port"
  docker run -d --name "$AUDIT_PG" -e POSTGRES_USER=root -e POSTGRES_PASSWORD=password \
    -e POSTGRES_DB="$db" -p "127.0.0.1:$pg_port:5432" pgvector/pgvector:pg17 >/dev/null || {
    crit "audit-reader" UNVERIFIED "could not start the PostgreSQL container"; return; }
  docker run -d --name "$AUDIT_REDIS" -p "127.0.0.1:$redis_port:6379" redis:7-alpine >/dev/null || {
    crit "audit-reader" UNVERIFIED "could not start the Redis container"; return; }
  local i ready=0
  for i in $(seq 1 60); do
    if docker exec "$AUDIT_PG" pg_isready -U root -d "$db" >/dev/null 2>&1; then ready=1; break; fi
    sleep 2
  done
  [ "$ready" = 1 ] || { crit "audit-reader" UNVERIFIED "PostgreSQL did not become ready"; return; }
  ready=0
  for i in $(seq 1 30); do
    if [ "$(docker exec "$AUDIT_REDIS" redis-cli ping 2>/dev/null)" = "PONG" ]; then ready=1; break; fi
    sleep 2
  done
  [ "$ready" = 1 ] || { crit "audit-reader" UNVERIFIED "Redis did not become ready"; return; }

  log "seeding the database (bootstrap-db.sh + bpm/fms)"
  ( cd "$VUEPRO" && PUBLIC_ORIGIN="$host_url" PG_CONTAINER="$AUDIT_PG" PG_DB="$db" PG_USER=root \
      bash deploy/demo-ecs/bootstrap-db.sh ) > "$LOGS/audit-seed.log" 2>&1 || {
    crit "audit-reader" UNVERIFIED "database seeding failed (logs/audit-seed.log)"; return; }
  for f in sql/keelbase-bpm.sql sql/keelbase-fms.sql; do
    docker exec -i "$AUDIT_PG" psql -U root -d "$db" -v ON_ERROR_STOP=1 -q < "$VUEPRO/$f" >> "$LOGS/audit-seed.log" 2>&1 || {
      crit "audit-reader" UNVERIFIED "loading $f failed (logs/audit-seed.log)"; return; }
  done

  log "building the host (Maven; this is the long step)"
  ( cd "$VUEPRO" && bash scripts/jdk25.sh mvn -B -ntp -pl yudao-server -am -DskipTests package ) \
    > "$LOGS/audit-build.log" 2>&1 || {
    crit "audit-reader" UNVERIFIED "host build failed (logs/audit-build.log)"; return; }

  log "starting the host on $host_url"
  ( cd "$VUEPRO" && PORT="$host_port" PG_HOST=127.0.0.1 PG_PORT="$pg_port" PG_DB="$db" \
      PG_USER=root PG_PASSWORD=password REDIS_HOST=127.0.0.1 REDIS_PORT="$redis_port" ACCESS_LOG=false \
      bash scripts/run-server.sh ) > "$LOGS/audit-host.log" 2>&1 &
  HOST_PID=$!
  ready=0
  for i in $(seq 1 150); do
    if [ "$(curl -s -o /dev/null -w '%{http_code}' "$host_url/app/capabilities" || true)" = "200" ]; then ready=1; break; fi
    if ! kill -0 "$HOST_PID" 2>/dev/null; then break; fi
    sleep 2
  done
  if [ "$ready" != 1 ]; then
    tail -n 80 "$LOGS/audit-host.log" | sed 's/^/  /' | tee -a "$RUN_LOG"
    crit "audit-reader" UNVERIFIED "the host did not answer /app/capabilities (logs/audit-host.log)"; return
  fi
  log "host is up"

  log "running the two-cases gate (twelve cells)"
  ( cd "$VUEPRO" && HOST_URL="$host_url" PG_CONTAINER="$AUDIT_PG" PG_DB="$db" PG_USER=root PG_PASSWORD=password \
      node scripts/run-audit-two-cases-scenarios.mjs ) > "$LOGS/audit-two-cases.log" 2>&1
  local two_rc=$?
  tail -n 40 "$LOGS/audit-two-cases.log" | sed 's/^/  /' | tee -a "$RUN_LOG"
  log "two-cases gate exit=$two_rc (logs/audit-two-cases.log)"

  # The update case — the twelve cells cannot supply the fourth question's before/after, and the
  # execution the two-cases gate leaves behind is a follow_up with no host operate-log mapping. The
  # 11-22 rehearsal's path is the machine case that carries Before/After and has a second entry: a
  # customer update under the approval policy, initiated by the walkthrough reader and approved by a
  # second administrator. It runs on the same stack, after the two-cases gate.
  # 更新档 —— 十二格给不出第 4 问的改前/改后，而两档门留下的执行是一条没有宿主操作日志映射的 follow_up。
  # 11-22 彩排的那条路才带「改前/改后」且第二入口对得上：走查读者发起、第二管理员批准的客户更新。
  # 同一套栈、两档门之后跑。
  local admin_pw='Admin@2026$KeelBase'
  local login_url="$host_url/admin-api/system/auth/login"
  login_token() {
    curl -s -X POST "$login_url" -H 'Content-Type: application/json' -H 'tenant-id: 1' \
      -d "{\"username\":\"$1\",\"password\":\"$2\"}" \
      | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s)?.data?.accessToken||'')}catch{console.log('')}})"
  }
  local initiator_tok audit_tok approver_tok admin_tok exec_id="" update_change_ok=0 reading_rc="skip"
  printf 'audit-host-url: %s\n' "$host_url" >> "$EVIDENCE/readings.txt"
  # `m7reader` initiates (the audit reader may not reach the AI execution entries); `m7audit` takes the
  # reading afterwards. One account cannot do both, and the gate's own guard says so.
  # `m7reader` 发起（审计读者碰不到 AI 执行入口）；`m7audit` 之后取数。一个账号做不了两件事，
  # 宿主自己的守卫已经说明了这一点。
  initiator_tok="$(login_token m7reader admin123)"
  audit_tok="$(login_token m7audit admin123)"
  admin_tok="$(login_token admin "$admin_pw")"
  [ -n "$admin_tok" ] || admin_tok="$(login_token admin admin123)"
  approver_tok="$(login_token auditapprover "$admin_pw")"
  [ -n "$approver_tok" ] || approver_tok="$(login_token auditapprover admin123)"
  printf 'update-case-logins: initiator=%s reader=%s admin=%s approver=%s\n' \
    "$([ -n "$initiator_tok" ] && echo ok || echo no)" "$([ -n "$audit_tok" ] && echo ok || echo no)" \
    "$([ -n "$admin_tok" ] && echo ok || echo no)" \
    "$([ -n "$approver_tok" ] && echo ok || echo no)" >> "$EVIDENCE/readings.txt"

  if [ -n "$initiator_tok" ] && [ -n "$audit_tok" ] && [ -n "$admin_tok" ] && [ -n "$approver_tok" ]; then
    log "update case: approval policy for update_crm_customer"
    curl -s -X PUT "$host_url/ai/governance/policy" -H "Authorization: Bearer $admin_tok" \
      -H 'Content-Type: application/json' -H 'tenant-id: 1' \
      -d '{"tools":{"update_crm_customer":{"mode":"approval"}},"audit":{"granularity":"all"}}' \
      > "$LOGS/audit-update-case.log" 2>&1
    local cid conv tok
    cid="$(docker exec -e PGPASSWORD=password "$AUDIT_PG" psql -U root -d "$db" -q -tAc \
      "insert into crm_customer (id,name,owner_user_id,creator,create_time,updater,update_time,deleted,tenant_id)
       values (nextval('crm_customer_seq'),'Delivery baseline customer','9001','9001',now(),'9001',now(),0,1)
       returning id" | tr -d '\r')"
    printf 'update-case-customer: %s\n' "${cid:-none}" >> "$EVIDENCE/readings.txt"
    # The message is the sentence the router maps to `update_crm_customer`; it is sent as JSON \u
    # escapes because a Chinese literal typed through this shell reached the host as mojibake (read
    # back from the host log on 2026-11-28). The escapes are ASCII on the wire and decode to the same
    # sentence server-side.
    # 这句是路由器映射到 `update_crm_customer` 的话；用 JSON 的 \u 转义发出，因为经本 shell 打出的中文
    # 字面量在宿主那里读成了乱码（2026-11-28 从宿主日志读回）。转义在线上是 ASCII，服务端解出同一句话。
    local chat_resp
    chat_resp="$(curl -s -X POST "$host_url/ai/chat" -H "Authorization: Bearer $initiator_tok" \
      -H 'Content-Type: application/json' -H 'tenant-id: 1' \
      -d "{\"message\":\"\\u4fee\\u6539\\u5ba2\\u6237\",\"targetId\":${cid:-0}}")"
    printf 'chat response: %s\n' "$chat_resp" >> "$LOGS/audit-update-case.log"
    conv="$(printf '%s' "$chat_resp" \
      | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{try{console.log(JSON.parse(s)?.data?.conversationId||'')}catch{console.log('')}})")"
    tok="$(docker exec -e PGPASSWORD=password "$AUDIT_PG" psql -U root -d "$db" -q -tAc \
      "select token from confirmation_requests where conversation_id='${conv}' order by id desc limit 1" | tr -d '\r')"
    printf 'update-case-conversation: %s token: %s\n' "${conv:-none}" "${tok:-none}" >> "$EVIDENCE/readings.txt"
    if [ -n "$tok" ]; then
      # The tenant header is required here: the approval guard loads the caller's roles from the host's
      # tenant-scoped tables, and without it that lookup throws and the caller is read as "not a manager"
      # (403 on 2026-11-28). The chat and policy calls keep it too, for the same reason.
      # 这里必须带租户头：审批守卫要从宿主的租户表读调用者角色，缺了它这次查询会抛、调用者被读成
      # 「不是管理员」（2026-11-28 实测 403）。对话与策略调用也一并带上，理由相同。
      curl -s -X POST "$host_url/ai/confirmations/$tok/approve-by" -H "Authorization: Bearer $approver_tok" \
        -H 'Content-Type: application/json' -H 'tenant-id: 1' \
        -d '{"decision":"approve"}' >> "$LOGS/audit-update-case.log" 2>&1
      exec_id="$(docker exec -e PGPASSWORD=password "$AUDIT_PG" psql -U root -d "$db" -q -tAc \
        "select coalesce(execution_id::text,'') from confirmation_requests where token='$tok'" | tr -d '\r')"
      if [ -z "$exec_id" ]; then
        exec_id="$(docker exec -e PGPASSWORD=password "$AUDIT_PG" psql -U root -d "$db" -q -tAc \
          "select coalesce(execution_id::text,'') from ai_audit_logs where conversation_id='$conv' and action='tool_call' and outcome='executed' order by id desc limit 1" | tr -d '\r')"
      fi
      printf 'update-case-execution: %s\n' "${exec_id:-none}" >> "$EVIDENCE/readings.txt"
    fi
  fi

  # The acceptance reading takes the criteria the two-cases gate does not: /audit/verify (R3) and the
  # second entry's object/time/who alignment (R4), as the audit reader, on the update execution.
  if [ -n "$exec_id" ] && [ -n "$audit_tok" ]; then
    ( cd "$VUEPRO" && node scripts/n5-acceptance-reading.mjs --execution "$exec_id" --host "$host_url" --token "$audit_tok" ) \
      > "$LOGS/audit-acceptance-reading.log" 2>&1
    reading_rc=$?
    tail -n 45 "$LOGS/audit-acceptance-reading.log" | sed 's/^/  /' | tee -a "$RUN_LOG"
    log "acceptance reading exit=$reading_rc (logs/audit-acceptance-reading.log)"
  else
    log "update case did not produce an execution — the acceptance reading was not taken"
  fi
  printf 'audit-acceptance-reading-exit: %s\n' "$reading_rc" >> "$EVIDENCE/readings.txt"

  # The fourth question: the two-cases gate's cells are answered, but neither carries a field
  # before/after (the blocked write changed nothing; escalate_customer writes a new record with no
  # before). The update case is where Before/After appears. Both facts are recorded; whether a boundary
  # sentence is product-approved is not this script's call.
  # 第 4 问：两档门的格都有答，但都不带改前/改后（被拦的写没有改动；escalate_customer 写新记录、无改前）。
  # 更新档才是出现「改前/改后」的地方。两个事实都记下；边界句是否经产品批准，不由本脚本裁定。
  local gate_change_ok=0
  local change_lines; change_lines="$(grep -E '^READING .*\.change ' "$LOGS/audit-two-cases.log" || true)"
  printf 'change-cells-two-cases:\n%s\n' "$change_lines" >> "$EVIDENCE/readings.txt"
  if printf '%s\n' "$change_lines" | grep -qE 'Before:|After:|改前|改后|→'; then gate_change_ok=1; fi
  if grep -qE '改前: |Before: ' "$LOGS/audit-acceptance-reading.log" 2>/dev/null; then update_change_ok=1; fi
  printf 'change-cell-two-cases-has-fields: %s\nchange-cell-update-case-has-fields: %s\n' \
    "$gate_change_ok" "$update_change_ok" >> "$EVIDENCE/readings.txt"

  local cells cells_ok=0
  cells="$(grep -oE 'READING [^ ]+\.cells [0-9]/6' "$LOGS/audit-two-cases.log" | tr '\n' '; ')"
  printf 'audit-cells: %s\n' "$cells" >> "$EVIDENCE/readings.txt"
  if grep -qE 'READING .*block\.cells 6/6' "$LOGS/audit-two-cases.log" && \
     grep -qE 'READING .*approve\.cells 6/6' "$LOGS/audit-two-cases.log"; then cells_ok=1; fi
  printf 'audit-twelve-cells-answered: %s\n' "$cells_ok" >> "$EVIDENCE/readings.txt"

  local verify_ok=0 second_ok=0
  if grep -qE 'R3.*(/audit/verify).*PASS' "$LOGS/audit-acceptance-reading.log" 2>/dev/null; then verify_ok=1; fi
  if grep -qE 'R4.*(第二入口|second entry).*PASS' "$LOGS/audit-acceptance-reading.log" 2>/dev/null; then second_ok=1; fi
  printf 'audit-verify-valid: %s\naudit-second-entry-aligned: %s\n' "$verify_ok" "$second_ok" >> "$EVIDENCE/readings.txt"

  if [ "$two_rc" != 0 ]; then
    crit "audit-reader" FAIL "the two-cases gate exited $two_rc (logs/audit-two-cases.log)"
  elif [ "$cells_ok" != 1 ]; then
    crit "audit-reader" FAIL "the twelve cells are not all answered (logs/audit-two-cases.log)"
  elif [ "$reading_rc" = "skip" ]; then
    crit "audit-reader" UNVERIFIED "acceptance reading not taken (no execution id / reader token)"
  elif [ "$reading_rc" != 0 ]; then
    crit "audit-reader" FAIL "acceptance reading exited $reading_rc (logs/audit-acceptance-reading.log)"
  elif [ "$verify_ok" != 1 ] || [ "$second_ok" != 1 ]; then
    crit "audit-reader" FAIL "/audit/verify or the second entry did not pass in the acceptance reading"
  elif [ "$update_change_ok" = 1 ]; then
    crit "audit-reader" PASS "met via the update case — twelve cells 6/6; the machine reading's fourth question carries Before/After (update case); /audit/verify valid; second entry aligned. The named gate's own fourth cells carry no fields; if the criterion requires them inside the twelve, a product-approved boundary sentence or a gate extension is needed (see readings.txt)"
  else
    crit "audit-reader" FAIL "the twelve cells are answered, but the fourth question carries no field before/after; a product-approved boundary sentence is a human decision (stop condition)"
  fi
}

# ── run the selected steps / 跑选中的步骤 ──────────────────────────────────
wants ci && ci_step
wants checks && checks_step
wants e2e && e2e_step
wants rehearsal && rehearsal_step
wants audit && audit_step

# ── (e) the evidence itself / 证据本身 ────────────────────────────────────
section "summary / 汇总"
missing=""
for f in environment.txt readings.txt; do [ -s "$EVIDENCE/$f" ] || missing="$missing $f"; done
[ -n "$missing" ] && crit "evidence" FAIL "empty evidence file(s):$missing" || crit "evidence" PASS "evidence directory: $EVIDENCE"

fails=0; unverified=0; passes=0
{
  printf '%-22s %-11s %s\n' "criterion / 判据" "status" "detail"
  i=0
  while [ $i -lt ${#CRIT_NAMES[@]} ]; do
    printf '%-22s %-11s %s\n' "${CRIT_NAMES[$i]}" "${CRIT_STATUS[$i]}" "${CRIT_DETAIL[$i]}"
    i=$((i+1))
  done
} > "$EVIDENCE/summary.txt"
i=0
while [ $i -lt ${#CRIT_NAMES[@]} ]; do
  case "${CRIT_STATUS[$i]}" in
    FAIL) fails=$((fails+1)) ;;
    UNVERIFIED) unverified=$((unverified+1)) ;;
    PASS) passes=$((passes+1)) ;;
  esac
  i=$((i+1))
done
cat "$EVIDENCE/summary.txt" | tee -a "$RUN_LOG"

# Bilingual summary: English block first, then the Chinese block; the table is data and stays one.
{
  echo "# Delivery baseline — $(date -u +%Y-%m-%dT%H:%M:%SZ)"
  echo
  echo "Non-human run; evidence ceiling E3, no E4. ${passes} passed, ${fails} failed, ${unverified} unverified."
  echo
  echo '```'
  cat "$EVIDENCE/summary.txt"
  echo '```'
  echo
  echo "Commands, exit codes and log paths are under \`logs/\`; each reading is in \`readings.txt\`."
  echo
  echo "## 中文"
  echo
  echo "非真人运行；证据上限 E3、无 E4。通过 ${passes} 项、不成立 ${fails} 项、未核验 ${unverified} 项。"
  echo
  echo '```'
  cat "$EVIDENCE/summary.txt"
  echo '```'
  echo
  echo "命令、退出码与日志路径在 \`logs/\` 下；逐项读数在 \`readings.txt\`。"
} > "$EVIDENCE/SUMMARY.md"
log "summary written: $EVIDENCE/SUMMARY.md"

if [ "$fails" -gt 0 ]; then exit 1; fi
if [ "$unverified" -gt 0 ]; then exit 2; fi
exit 0
