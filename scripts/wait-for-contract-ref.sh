#!/usr/bin/env bash
# SPDX-License-Identifier: Apache-2.0
#
# Wait, within a fixed budget, for a contract ref to become visible on its remote.
#
# Cross-repository CI is a race: the consumer's run can start while the contract repository is still
# receiving the push that carries the tag. A gate that reads tags at that instant sees the previous
# release and reports drift that is only lateness. This script buys that push a bounded window; the
# gate that follows stays exactly as strict — this script never decides pass or fail on its own.
#
# 跨仓 CI 天生是一场竞态：消费方的 run 可能早于契约仓收到携带 tag 的那次推送。此刻读 tag 的门禁看到的是
# 上一个版本，于是把「来晚了」报成漂移。本脚本只给那次推送一段**有界**的等待窗口；其后的门禁判据**一字
# 不改** —— 本脚本从不自己判定通过或失败。
#
# Usage / 用法:
#   scripts/wait-for-contract-ref.sh --ref refs/tags/v1.14.0 [options]
#
# Options / 选项:
#   --ref <ref>            Required. Fully-qualified ref to wait for. 必填：要等的完整 ref。
#   --repo <dir>           Repository whose remote is polled. Default: `.`.
#                          用哪个仓的 remote 来探测。默认 `.`。
#   --remote <name|url>    Remote name or URL. Default: `origin`.
#                          remote 名或 URL。默认 `origin`。
#   --attempts <n>         Maximum probes. Default: 6. 最多探测次数。默认 6。
#   --interval <seconds>   Pause between probes. Default: 10. 两次探测间隔秒数。默认 10。
#   --max-seconds <n>      Wall-clock cap, independent of attempts. Default: 90.
#                          墙钟总时长上限（与次数各自封顶）。默认 90 秒。
#   --git <cmd>            git executable; a seam for tests. Default: `git`.
#                          git 可执行文件；供测试注入。默认 `git`。
#
# Exit codes / 退出码:
#   0  the ref is visible (at least one probe saw it). / ref 可见（至少一次探测看到）。
#   1  gave up: the budget ran out and the ref is still not visible. / 预算用尽仍不可见。
#   2  usage error. / 用法错误。

set -u

ref=''
repo='.'
remote='origin'
attempts=6
interval=10
max_seconds=90
git_cmd='git'

usage() {
  echo "usage: $0 --ref <ref> [--repo <dir>] [--remote <name|url>] [--attempts <n>] [--interval <s>] [--max-seconds <n>] [--git <cmd>]" >&2
  exit 2
}

is_uint() {
  case "$1" in
    '' | *[!0-9]*) return 1 ;;
    *) return 0 ;;
  esac
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --ref)
      [ "$#" -ge 2 ] || usage
      ref=$2
      shift 2
      ;;
    --repo)
      [ "$#" -ge 2 ] || usage
      repo=$2
      shift 2
      ;;
    --remote)
      [ "$#" -ge 2 ] || usage
      remote=$2
      shift 2
      ;;
    --attempts)
      [ "$#" -ge 2 ] || usage
      attempts=$2
      shift 2
      ;;
    --interval)
      [ "$#" -ge 2 ] || usage
      interval=$2
      shift 2
      ;;
    --max-seconds)
      [ "$#" -ge 2 ] || usage
      max_seconds=$2
      shift 2
      ;;
    --git)
      [ "$#" -ge 2 ] || usage
      git_cmd=$2
      shift 2
      ;;
    *)
      echo "unknown argument: $1" >&2
      usage
      ;;
  esac
done

[ -n "$ref" ] || usage
for value in "$attempts" "$interval" "$max_seconds"; do
  is_uint "$value" || usage
done
[ "$attempts" -ge 1 ] || usage

started=$(date +%s)
attempt=1

while :; do
  # A failed probe (network error, unknown remote) is "not visible yet", not fatal: the loop is
  # already bounded, and the gate that follows reports the real verdict.
  # 探测失败（网络错误、remote 不认识）视为「还不可见」，不算致命：循环本身有界，真正的判据由随后的门禁给出。
  seen=$("$git_cmd" -C "$repo" ls-remote "$remote" "$ref" 2>/dev/null)
  if [ -n "$seen" ]; then
    printf '%s is visible on %s (probe %s)\n' "$ref" "$remote" "$attempt"
    printf '  %s\n' "$seen"
    exit 0
  fi

  elapsed=$(($(date +%s) - started))
  if [ "$attempt" -ge "$attempts" ] || [ "$elapsed" -ge "$max_seconds" ]; then
    printf '%s is still not visible on %s after %s probe(s) and %ss — giving up\n' \
      "$ref" "$remote" "$attempt" "$elapsed" >&2
    exit 1
  fi

  pause=$interval
  remaining=$((max_seconds - elapsed))
  if [ "$pause" -gt "$remaining" ]; then
    pause=$remaining
  fi
  if [ "$pause" -gt 0 ]; then
    sleep "$pause"
  fi
  attempt=$((attempt + 1))
done
